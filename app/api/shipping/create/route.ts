import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOrder, getLabelLink, type EawbShipmentInput } from "@/lib/eawb"

/**
 * ===========================================================================
 *  CREATE THE SHIPMENT FOR A PAID ORDER
 * ===========================================================================
 *   POST /api/shipping/create   { "orderId": "<uuid>" }
 *
 * Called from the SERVER — the payment webhook, an admin action, a retry — and
 * never from the buyer's browser. That is the whole point of it being here: if
 * the buyer closes the tab the moment their card clears, the parcel still gets
 * booked, because nothing about booking it depends on a page staying open.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENCY, which is the entire reason this file is careful
 * ---------------------------------------------------------------------------
 * Creating an AWB books a real courier and charges the account, and the
 * provider offers NO idempotency key. A second POST is a second shipment. The
 * things that will call this are exactly the things that retry: Stripe
 * webhooks retry, serverless invocations retry, a person double-clicks.
 *
 * So there are three guards, and each catches what the one before it cannot:
 *
 *  1. READ FIRST. If the order already has an `awb_number`, return it and stop.
 *     Catches the ordinary repeat — a webhook redelivered a minute later.
 *
 *  2. CLAIM BEFORE CALLING. A conditional update sets `shipping_status` to
 *     'creating' only `.is("awb_number", null)`. Two concurrent requests both
 *     pass step 1; only one can win this update, because Postgres serialises
 *     it. The loser stops without calling the courier. This is what makes two
 *     simultaneous webhook deliveries safe, which step 1 alone is not.
 *
 *  3. A UNIQUE INDEX on `awb_number` (supabase/sql/RUN_SHIPPING.sql). The last
 *     word, in the only place that cannot be raced by application code.
 *
 * If the booking fails, the order stays paid and is marked
 * `shipping_creation_failed` — never rolled back, never re-charged, and safe to
 * retry because the claim is released on the way out.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * LOCKERS, NOT DOORS. Storelib ships parcel-machine to parcel-machine.
 *
 * Sameday (6) runs the easybox network, and service 4 is locker→locker —
 * priced live at 19.89 RON Bucharest→Cluj, against 22.26 for door-to-door.
 * Cheaper, and neither party has to be home, which is the whole reason a
 * second-hand marketplace uses them.
 *
 * Both env-overridable, so a single order can be sent door-to-door without a
 * deploy if a buyer has no locker near them.
 */
const DEFAULT_CARRIER_ID = Number(process.env.EAWB_DEFAULT_CARRIER_ID || 6) // Sameday
const DEFAULT_SERVICE_ID = Number(process.env.EAWB_DEFAULT_SERVICE_ID || 4) // locker to locker
const DEFAULT_WEIGHT_KG = Number(process.env.EAWB_DEFAULT_WEIGHT_KG || 1)

/**
 * The order row this route needs, spelled out.
 *
 * The generated Supabase types are produced from the CURRENT database, and the
 * shipping columns arrive with supabase/sql/RUN_SHIPPING.sql — so until that has
 * been run, the typed client resolves this select to `GenericStringError` and
 * every field below is a type error. Declaring the shape here keeps the file
 * honest about what it expects and lets it be written before the migration is
 * applied, which is the order these two things necessarily happen in.
 */
type ShippableOrder = {
  id: string
  status: string | null
  amount_cents: number | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  buyer_email: string | null
  awb_number: string | null
  tracking_number: string | null
  shipping_status: string | null
  shipping_label_url: string | null
  ship_contact: string | null
  ship_phone: string | null
  ship_country_code: string | null
  ship_county: string | null
  ship_locality: string | null
  ship_street: string | null
  ship_street_no: string | null
  ship_details: string | null
  ship_postal_code: string | null
  ship_fixed_location_id: number | null
}

function keyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

/** The seller's pickup address. One account ships everything for now — when
 *  sellers get their own, this is the function that changes. */
function senderAddress() {
  return {
    // The seller's DROP-OFF locker. Required for services 2 and 4, and it does
    // not replace the street below — the provider validates both, and sending
    // only the id fails with "street_name field is required".
    fixed_location_id: Number(process.env.EAWB_SENDER_LOCKER_ID || 0) || undefined,
    contact: process.env.EAWB_SENDER_CONTACT || "Storelib",
    phone: process.env.EAWB_SENDER_PHONE || "",
    email: process.env.EAWB_SENDER_EMAIL || "",
    country_code: process.env.EAWB_SENDER_COUNTRY || "RO",
    county_name: process.env.EAWB_SENDER_COUNTY || "",
    locality_name: process.env.EAWB_SENDER_LOCALITY || "",
    street_name: process.env.EAWB_SENDER_STREET || "",
    street_number: process.env.EAWB_SENDER_STREET_NO || "",
  }
}

export async function POST(req: NextRequest) {
  // Two ways in, both server-side. The shared secret is for the payment webhook
  // and any automation; the admin session is for a human pressing Retry.
  const bySession = await isAdminAuthenticated()
  if (!bySession) {
    const expected = process.env.STORELIB_ADMIN_KEY
    const provided = req.headers.get("x-storelib-admin-key") ?? ""
    if (!expected || !provided || !keyMatches(provided, expected)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  let body: { orderId?: string; carrierId?: number; serviceId?: number; weightKg?: number } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  const orderId = body.orderId
  if (!orderId || !UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "orderId must be a uuid" }, { status: 400 })
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: "Database unavailable", detail: (e as Error)?.message }, { status: 503 })
  }

  const { data: orderRow, error: readErr } = await supabase
    .from("orders")
    .select(
      "id, status, amount_cents, buyer_first_name, buyer_last_name, buyer_email, " +
        "awb_number, tracking_number, shipping_status, shipping_label_url, " +
        "ship_contact, ship_phone, ship_country_code, ship_county, ship_locality, " +
        "ship_street, ship_street_no, ship_details, ship_postal_code, ship_fixed_location_id",
    )
    .eq("id", orderId)
    .maybeSingle()

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!orderRow) return NextResponse.json({ error: "Order not found" }, { status: 404 })
  const order = orderRow as unknown as ShippableOrder

  // ── GUARD 1: already shipped ──────────────────────────────────────────────
  if (order.awb_number) {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      message: "This order already has an AWB. Nothing was created.",
      awb: order.awb_number,
      trackingNumber: order.tracking_number ?? order.awb_number,
      labelUrl: order.shipping_label_url,
      shippingStatus: order.shipping_status,
    })
  }

  // Only a paid order may be shipped. Booking a courier for something that was
  // never paid for costs money and cannot be undone by refunding anything.
  const paid = ["completed", "paid", "succeeded"].includes(String(order.status || "").toLowerCase())
  if (!paid) {
    return NextResponse.json(
      { ok: false, code: "not_paid", message: `Order status is "${order.status}" — not shippable.` },
      { status: 409 },
    )
  }

  // The address is the one thing that cannot be defaulted. Checkout does not
  // collect it yet, so this is where an order without one stops — loudly, and
  // without charging anything, rather than by sending a parcel nowhere.
  const missing = (["ship_contact", "ship_phone", "ship_locality"] as const).filter((k) => !order[k])
  if (missing.length && !order.ship_fixed_location_id) {
    return NextResponse.json(
      {
        ok: false,
        code: "missing_delivery_address",
        message: `Order has no delivery address (missing: ${missing.join(", ")}).`,
      },
      { status: 422 },
    )
  }

  // ── GUARD 2: claim it ─────────────────────────────────────────────────────
  // Conditional on awb_number still being null, so of two concurrent callers
  // exactly one proceeds. `select` makes it a returning update: zero rows back
  // means somebody else won.
  const { data: claimed, error: claimErr } = await supabase
    .from("orders")
    .update({ shipping_status: "creating", shipping_error: null })
    .eq("id", orderId)
    .is("awb_number", null)
    .neq("shipping_status", "creating")
    .select("id")
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      message: "Another request is already creating this shipment.",
    })
  }

  const weight = Number(body.weightKg) > 0 ? Number(body.weightKg) : DEFAULT_WEIGHT_KG
  const shipment: EawbShipmentInput = {
    carrier_id: Number(body.carrierId) > 0 ? Number(body.carrierId) : DEFAULT_CARRIER_ID,
    service_id: Number(body.serviceId) > 0 ? Number(body.serviceId) : DEFAULT_SERVICE_ID,
    billing_address_id: Number(process.env.EAWB_BILLING_ADDRESS_ID || 0),
    address_from: senderAddress(),
    address_to: {
      contact: order.ship_contact || `${order.buyer_first_name ?? ""} ${order.buyer_last_name ?? ""}`.trim(),
      phone: order.ship_phone || undefined,
      email: order.buyer_email || undefined,
      country_code: order.ship_country_code || "RO",
      county_name: order.ship_county || undefined,
      locality_name: order.ship_locality || undefined,
      street_name: order.ship_street || undefined,
      street_number: order.ship_street_no || undefined,
      street_details: order.ship_details || undefined,
      postal_code: order.ship_postal_code || undefined,
      fixed_location_id: order.ship_fixed_location_id || undefined,
    },
    total_weight: weight,
    parcels: [{ sequence_no: 1, size: { weight, width: 25, height: 10, length: 35 } }],
    parcel_content: "Articol Storelib",
    internal_identifier: String(orderId).slice(0, 60),
  }

  try {
    const result = await createOrder(shipment)
    if (!result.awb) throw new Error("Provider accepted the order but returned no AWB")

    let labelUrl = result.labelUrl
    if (!labelUrl) {
      // Best effort: a shipment without a retrievable label is still a booked
      // shipment, and losing the AWB because the label call failed would be the
      // expensive mistake.
      try {
        labelUrl = (await getLabelLink(result.awb)).url
      } catch {
        labelUrl = null
      }
    }

    const { error: saveErr } = await supabase
      .from("orders")
      .update({
        awb_number: result.awb,
        tracking_number: result.awb,
        shipping_provider: "eawb",
        shipping_carrier: result.carrier,
        shipping_carrier_id: shipment.carrier_id,
        shipping_service_id: shipment.service_id,
        shipping_provider_order_id: result.orderId ? String(result.orderId) : null,
        shipping_label_url: labelUrl,
        shipping_status: "awb_created",
        shipping_created_at: new Date().toISOString(),
        shipping_error: null,
      })
      .eq("id", orderId)

    if (saveErr) {
      // The courier is booked and we could not record it. That is the one
      // outcome worth shouting about: the AWB is in the response so it is not
      // lost, but nothing will find it again automatically.
      console.error("[shipping] AWB created but not saved", { orderId, awb: result.awb, error: saveErr.message })
      return NextResponse.json(
        { ok: false, code: "saved_failed", message: saveErr.message, awb: result.awb, labelUrl },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      idempotent: false,
      awb: result.awb,
      trackingNumber: result.awb,
      labelUrl,
      carrier: result.carrier,
      shippingStatus: "awb_created",
    })
  } catch (err) {
    const e = err as Error & { code?: string; upstreamStatus?: number }
    // Release the claim so a retry is possible, and record why. The order stays
    // paid — the buyer is not charged again and no duplicate order is made.
    await supabase
      .from("orders")
      .update({
        shipping_status: "shipping_creation_failed",
        shipping_error: (e?.message ?? "unknown").slice(0, 500),
      })
      .eq("id", orderId)
      .is("awb_number", null)

    return NextResponse.json(
      {
        ok: false,
        code: e?.code ?? "provider_error",
        message: e?.message ?? "Could not create the shipment",
        upstreamStatus: e?.upstreamStatus ?? null,
        retryable: true,
      },
      { status: 200 },
    )
  }
}
