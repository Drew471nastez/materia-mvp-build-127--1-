import { NextResponse, type NextRequest } from "next/server"

import { requireVerifiedUser } from "@/lib/auth/current-user"
import { trackByAwb } from "@/lib/eawb"
import { senderCarrierId } from "@/lib/shipping/create-awb"
import { resolveOrderParty, type OrderShipping } from "@/lib/shipping/order-access"
import { applyPreferenceToOrder, readPreference } from "@/lib/shipping/preference"
import {
  extractLatestStatus,
  isTerminal,
  mapCarrierStatus,
  shouldAdvance,
  type ShippingState,
} from "@/lib/shipping/status"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * ===========================================================================
 *  ONE ORDER'S SHIPPING STATE — for the buyer and the seller
 * ===========================================================================
 *   GET /api/shipping/order/<uuid>
 *
 * Both sides poll this; each gets a view shaped for them. The difference is not
 * cosmetic — the buyer must never receive the seller's address or the label
 * link, and the seller has no business seeing the buyer's phone number until
 * there is a parcel to deliver (and even then the courier handles it, not us).
 * So the response is ASSEMBLED PER PARTY rather than filtered from a shared
 * object, because a filter is a list of things to remember and an assembly is
 * a list of things to include.
 *
 * ---------------------------------------------------------------------------
 * Refreshing from the carrier
 * ---------------------------------------------------------------------------
 * A poll may refresh the carrier's status, but only when there is an AWB, the
 * shipment is not already in a terminal state, and the last check was more than
 * REFRESH_AFTER_MS ago. Those three conditions exist so that a page left open,
 * or two people watching the same order, cannot turn into a stream of requests
 * to the provider — the timestamp lives in the database, so the rate limit
 * holds across serverless instances that share no memory.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Couriers scan a parcel a handful of times a day. Minutes, not seconds. */
const REFRESH_AFTER_MS = 10 * 60 * 1000

/** The buyer's view: where it is, and where it is going. Never the label. */
function buyerView(o: OrderShipping) {
  return {
    id: o.id,
    status: o.status,
    amountCents: o.amount_cents,
    createdAt: o.created_at,
    shippingStatus: (o.shipping_status as ShippingState | null) ?? null,
    trackingNumber: o.tracking_number ?? o.awb_number ?? null,
    carrier: o.shipping_carrier ?? null,
    rawStatus: o.shipping_raw_status ?? null,
    shippedAt: o.shipped_at ?? null,
    deliveredAt: o.delivered_at ?? null,
    // Their own delivery point, so they can check it before it ships.
    destination: o.ship_fixed_location_id
      ? {
          lockerId: o.ship_fixed_location_id,
          name: o.ship_details ?? null,
          street: [o.ship_street, o.ship_street_no].filter(Boolean).join(" ") || null,
          locality: o.ship_locality ?? null,
          county: o.ship_county ?? null,
        }
      : null,
    contact: o.ship_contact ?? null,
    phone: o.ship_phone ?? null,
    needsAddress: !o.ship_fixed_location_id && !o.awb_number,
    // The only network the buyer may pick from: a locker→locker shipment needs
    // both ends on one carrier, and the seller's drop-off point fixes which.
    // Sent so the picker filters rather than letting someone choose a locker
    // the server will then refuse.
    carrierId: senderCarrierId(),
  }
}

/** The seller's view: what they must do, and the label to do it with. */
function sellerView(o: OrderShipping) {
  return {
    id: o.id,
    status: o.status,
    amountCents: o.amount_cents,
    createdAt: o.created_at,
    shippingStatus: (o.shipping_status as ShippingState | null) ?? null,
    awb: o.awb_number ?? null,
    trackingNumber: o.tracking_number ?? o.awb_number ?? null,
    carrier: o.shipping_carrier ?? null,
    rawStatus: o.shipping_raw_status ?? null,
    shippedAt: o.shipped_at ?? null,
    deliveredAt: o.delivered_at ?? null,
    /** Served through our own route, never the provider's URL. */
    labelUrl: o.awb_number ? `/api/shipping/label/${o.id}` : null,
    hasLabel: Boolean(o.shipping_label_url),
    error: o.shipping_error ?? null,
    // The buyer's town is enough to set expectations; the exact locker and the
    // phone number are the courier's business, and they are on the label.
    destinationLocality: o.ship_locality ?? null,
    buyerReady: Boolean(o.ship_fixed_location_id),
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ ok: false, code: "bad_order_id" }, { status: 400 })
  }

  const supabase = await createClient()
  const userId = await requireVerifiedUser(supabase)
  if (!userId) return NextResponse.json({ ok: false, code: "auth_required" }, { status: 401 })

  const resolved = await resolveOrderParty(orderId, userId)
  if (!resolved.ok) {
    if (resolved.reason === "error") return NextResponse.json({ ok: false, code: "error" }, { status: 500 })
    // Forbidden and missing are the same answer, so ids cannot be probed.
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 })
  }

  // The migration has not been run. Not an error — the feature is simply not
  // switched on, and the UI renders nothing rather than an error state.
  if (resolved.schema === "absent") {
    return NextResponse.json({ ok: true, configured: false, party: resolved.party, shipping: null })
  }

  let order = resolved.order

  // ── ATTACH THE PRE-PAYMENT CHOICE ──────────────────────────────────────────
  //
  // The buyer picked a locker before paying, but the order did not exist yet.
  // This is where the two meet.
  //
  // A READ that writes, which deserves justifying. The alternative is a hook in
  // the payment flow, and there are four separate places that insert an order
  // (checkout/process, confirm-payment, complete-free, the Stripe webhook),
  // each with a full-then-minimal insert fallback — so editing them would mean
  // four chances to break payment, and a failed full insert would silently
  // degrade to an order with no delivery address at all.
  //
  // Doing it here instead is safe because `applyPreferenceToOrder` only writes
  // when `ship_fixed_location_id` is null AND no AWB exists. Running it on every
  // poll, from either party, is therefore idempotent: the first look attaches
  // the address and every later one is a no-op.
  if (!order.ship_fixed_location_id && !order.awb_number) {
    order = await attachPreference(order)
  }

  if (req.nextUrl.searchParams.get("refresh") === "1") {
    order = await maybeRefresh(order)
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    party: resolved.party,
    shipping: resolved.party === "buyer" ? buyerView(order) : sellerView(order),
  })
}

/**
 * Copy the buyer's pre-payment delivery choice onto this order.
 *
 * Matched on the order's own buyer — `buyer_id` for a member, `buyer_email` for
 * a guest — never on anything from the request. Never throws: an order page
 * that fails to render because a preference lookup blipped would be a worse
 * outcome than an order that still asks for an address.
 */
async function attachPreference(order: OrderShipping): Promise<OrderShipping> {
  try {
    const admin = createAdminClient()
    const pref = await readPreference(admin, { userId: order.buyer_id, email: order.buyer_email })
    if (!pref) return order
    const applied = await applyPreferenceToOrder(admin, order.id, pref)
    if (!applied) return order
    return {
      ...order,
      ship_contact: pref.contact,
      ship_phone: pref.phone,
      ship_country_code: pref.countryCode,
      ship_county: pref.county,
      ship_locality: pref.locality,
      ship_street: pref.street,
      ship_street_no: pref.streetNo,
      ship_details: pref.details,
      ship_fixed_location_id: pref.lockerId,
      shipping_status: order.shipping_status ?? "awaiting_shipment",
    }
  } catch {
    return order
  }
}

/**
 * Ask the carrier where the parcel is, if it is worth asking.
 *
 * Never throws: a tracking refresh is a nicety on top of state we already hold,
 * and a provider outage must not take the order page down with it. On any
 * failure the order is returned exactly as it was read.
 */
async function maybeRefresh(order: OrderShipping): Promise<OrderShipping> {
  if (!order.awb_number) return order
  const current = (order.shipping_status as ShippingState | null) ?? null
  if (isTerminal(current)) return order

  try {
    const admin = createAdminClient()

    // Claim the refresh before doing it, conditionally on the timestamp we
    // read. Two concurrent pollers both pass a plain "is it stale" check; only
    // one wins this update, so only one calls the provider.
    const cutoff = new Date(Date.now() - REFRESH_AFTER_MS).toISOString()
    const claim = admin
      .from("orders")
      .update({ shipping_last_checked_at: new Date().toISOString() })
      .eq("id", order.id)
    const { data: claimed } = await (order.shipping_last_checked_at
      ? claim.lt("shipping_last_checked_at", cutoff)
      : claim.is("shipping_last_checked_at", null)
    ).select("id")
    if (!claimed || claimed.length === 0) return order

    const raw = await trackByAwb(order.awb_number)
    const latest = extractLatestStatus(raw)
    if (!latest) return order

    const next = mapCarrierStatus(latest.text)
    const patch: Record<string, unknown> = { shipping_raw_status: latest.text }

    // The mapping may be null — an unrecognised status. The raw string is still
    // stored, so the state is visible in the data instead of being collapsed
    // into a guess.
    if (next && shouldAdvance(current, next)) {
      patch.shipping_status = next
      if (next === "shipped" && !order.shipped_at) patch.shipped_at = new Date().toISOString()
      if (next === "delivered" && !order.delivered_at) patch.delivered_at = new Date().toISOString()
    }

    await admin.from("orders").update(patch).eq("id", order.id)
    return { ...order, ...(patch as Partial<OrderShipping>) }
  } catch {
    return order
  }
}
