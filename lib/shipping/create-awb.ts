import { createOrder, getLabelLink, type EawbShipmentInput } from "@/lib/eawb"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  BOOK THE COURIER FOR A PAID ORDER
 * ===========================================================================
 *
 * THE ONLY PLACE IN THE CODEBASE THAT CREATES AN AWB.
 *
 * Three callers reach this — an admin pressing retry, the seller pressing
 * "generate the label", and the automatic trigger when a buyer chooses their
 * locker — and it matters enormously that they share one implementation rather
 * than three that drifted. Creating an AWB books a real courier and charges the
 * account, and the provider offers NO idempotency key: a second call is a
 * second shipment, and a second shipment is a real van arriving for a parcel
 * that is not there.
 *
 * ---------------------------------------------------------------------------
 * The three guards, each catching what the one before it cannot
 * ---------------------------------------------------------------------------
 *  1. READ FIRST. An order that already carries an `awb_number` returns it and
 *     stops. Catches the ordinary repeat — a webhook redelivered a minute later,
 *     a double tap.
 *
 *  2. CLAIM BEFORE CALLING. A conditional update sets `shipping_status` to
 *     'creating' only `.is("awb_number", null)`. Two concurrent callers both
 *     pass guard 1; only one can win this update, because Postgres serialises
 *     it. The loser returns without calling the courier. This is the guard that
 *     makes two simultaneous webhook deliveries safe, which guard 1 alone is
 *     not.
 *
 *  3. A UNIQUE INDEX on `awb_number` (supabase/sql/RUN_SHIPPING.sql) — the last
 *     word, in the only place application code cannot race.
 *
 * On failure the order stays paid, is marked `shipping_creation_failed`, and
 * the claim is released so a retry is possible. Nothing is refunded and nothing
 * is charged twice.
 */

/**
 * LOCKERS, NOT DOORS. Sameday (6) runs the easybox network and service 4 is
 * locker→locker — priced live at 19.89 RON Bucharest→Cluj against 22.26 for
 * door-to-door. Env-overridable so one order can go door-to-door without a
 * deploy if a buyer has no locker near them.
 */
const DEFAULT_CARRIER_ID = Number(process.env.EAWB_DEFAULT_CARRIER_ID || 6)
const DEFAULT_SERVICE_ID = Number(process.env.EAWB_DEFAULT_SERVICE_ID || 4)
const DEFAULT_WEIGHT_KG = Number(process.env.EAWB_DEFAULT_WEIGHT_KG || 1)

/**
 * THE CARRIER THE WHOLE PLATFORM SHIPS ON, and why there is only one.
 *
 * A locker→locker shipment needs BOTH lockers on the same courier's network:
 * DPD cannot collect from a Sameday easybox, and Sameday cannot deliver to a
 * FANbox. The seller drops parcels at one fixed locker
 * (`EAWB_SENDER_LOCKER_ID`), and that locker belongs to exactly one carrier —
 * so every buyer must choose from that same network.
 *
 * This is enforced in two places that must agree:
 *   - the buyer's picker only lists this carrier's lockers, and
 *   - /api/shipping/address refuses a locker from any other carrier.
 *
 * Changing carrier means changing the sender locker too, which is why they are
 * read from the same configuration and never guessed independently.
 */
export function senderCarrierId(): number {
  return Number(process.env.EAWB_SENDER_CARRIER_ID || process.env.EAWB_DEFAULT_CARRIER_ID || 6)
}

/**
 * The order row this needs, spelled out.
 *
 * The generated Supabase types come from the CURRENT database and the shipping
 * columns arrive with the migration, so until that has been run the typed
 * client resolves this select to `GenericStringError` and every field is a type
 * error. Declaring the shape keeps the file honest about what it expects and
 * lets it be written before the migration is applied — which is the order these
 * two things necessarily happen in.
 */
export type ShippableOrder = {
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
  /** Set when the buyer chose their locker — the network that locker is on. */
  shipping_carrier_id: number | null
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

const SELECT =
  "id, status, amount_cents, buyer_first_name, buyer_last_name, buyer_email, " +
  "awb_number, tracking_number, shipping_status, shipping_label_url, shipping_carrier_id, " +
  "ship_contact, ship_phone, ship_country_code, ship_county, ship_locality, " +
  "ship_street, ship_street_no, ship_details, ship_postal_code, ship_fixed_location_id"

/** Every way this can end, as one discriminated result. No throwing: each of
 *  these is an outcome a caller must render differently, not an exception. */
export type CreateAwbResult =
  | {
      ok: true
      idempotent: boolean
      awb: string
      trackingNumber: string
      labelUrl: string | null
      carrier: string | null
      shippingStatus: string
    }
  /** Another request holds the claim. Not an error — the shipment is happening. */
  | { ok: true; idempotent: true; inProgress: true; message: string }
  | {
      ok: false
      code:
        | "not_found"
        | "not_paid"
        | "missing_delivery_address"
        | "db_unavailable"
        | "schema_missing"
        | "save_failed"
        /** OUR OWN check refused the payload. Nothing was sent to the courier. */
        | "invalid_shipment"
        /** The prepaid eAWB wallet cannot cover this. Top up, then retry. */
        | "insufficient_funds"
        | "provider_error"
      message: string
      /** Present on save_failed: the courier IS booked and this must not be lost. */
      awb?: string | null
      labelUrl?: string | null
      retryable: boolean
    }

/** The seller's pickup address. One account ships everything for now — when
 *  sellers get their own, this is the function that changes. */
function senderAddress() {
  return {
    // The seller's DROP-OFF locker. Required for services 2 and 4, and it does
    // NOT replace the street below — the provider validates both, and sending
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

/**
 * Is automatic booking switched on?
 *
 * DEFAULTS TO OFF, deliberately. Every AWB spends real money from a prepaid
 * wallet, and an integration that starts booking couriers the moment it is
 * deployed — before anyone has watched a single label come out correctly — is
 * the kind of thing that is discovered from a balance, not from a log. The flag
 * is the operator's statement that they have verified one shipment end to end
 * and funded the account.
 */
export function autoAwbEnabled(): boolean {
  return process.env.SHIPPING_AUTO_AWB === "1"
}

export async function createAwbForOrder(
  orderId: string,
  opts: { carrierId?: number; serviceId?: number; weightKg?: number; contents?: string } = {},
): Promise<CreateAwbResult> {
  let supabase
  try {
    supabase = createAdminClient()
  } catch (e) {
    return { ok: false, code: "db_unavailable", message: (e as Error)?.message ?? "no database", retryable: true }
  }

  const { data: orderRow, error: readErr } = await supabase
    .from("orders")
    .select(SELECT)
    .eq("id", orderId)
    .maybeSingle()

  if (readErr) {
    // The shipping columns do not exist yet. That is a configuration state, not
    // a fault, and it must not read as "the courier refused".
    if (/could not find the '.*' column|column .* does not exist/i.test(readErr.message ?? "")) {
      return {
        ok: false,
        code: "schema_missing",
        message: "Shipping columns are missing — run supabase/sql/RUN_SHIPPING.sql.",
        retryable: false,
      }
    }
    return { ok: false, code: "db_unavailable", message: readErr.message, retryable: true }
  }
  if (!orderRow) return { ok: false, code: "not_found", message: "Order not found", retryable: false }
  const order = orderRow as unknown as ShippableOrder

  // ── GUARD 1: already shipped ────────────────────────────────────────────────
  if (order.awb_number) {
    return {
      ok: true,
      idempotent: true,
      awb: order.awb_number,
      trackingNumber: order.tracking_number ?? order.awb_number,
      labelUrl: order.shipping_label_url,
      carrier: null,
      shippingStatus: order.shipping_status ?? "awb_created",
    }
  }

  // Only a paid order may be shipped. Booking a courier for something never paid
  // for costs money and cannot be undone by refunding anything.
  const paid = ["completed", "paid", "succeeded"].includes(String(order.status || "").toLowerCase())
  if (!paid) {
    return { ok: false, code: "not_paid", message: `Order status is "${order.status}" — not shippable.`, retryable: false }
  }

  // The address is the one thing that cannot be defaulted. An order without one
  // stops here — loudly, and without charging anything — rather than by sending
  // a parcel nowhere.
  const missing = (["ship_contact", "ship_phone", "ship_locality"] as const).filter((k) => !order[k])
  if (missing.length && !order.ship_fixed_location_id) {
    return {
      ok: false,
      code: "missing_delivery_address",
      message: `Order has no delivery address (missing: ${missing.join(", ")}).`,
      retryable: false,
    }
  }

  // ── GUARD 2: claim it ───────────────────────────────────────────────────────
  const { data: claimed, error: claimErr } = await supabase
    .from("orders")
    .update({ shipping_status: "creating", shipping_error: null })
    .eq("id", orderId)
    .is("awb_number", null)
    .neq("shipping_status", "creating")
    .select("id")
  if (claimErr) return { ok: false, code: "db_unavailable", message: claimErr.message, retryable: true }
  if (!claimed || claimed.length === 0) {
    return { ok: true, idempotent: true, inProgress: true, message: "Another request is already creating this shipment." }
  }

  const weight = Number(opts.weightKg) > 0 ? Number(opts.weightKg) : DEFAULT_WEIGHT_KG
  const shipment: EawbShipmentInput = {
    // The carrier recorded when the buyer chose their locker wins over the
    // default. Booking a different carrier than the one that owns the
    // destination locker is the failure this ordering exists to prevent.
    carrier_id:
      Number(opts.carrierId) > 0
        ? Number(opts.carrierId)
        : Number(order.shipping_carrier_id) > 0
          ? Number(order.shipping_carrier_id)
          : DEFAULT_CARRIER_ID,
    service_id: Number(opts.serviceId) > 0 ? Number(opts.serviceId) : DEFAULT_SERVICE_ID,
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
    parcel_content: opts.contents || "Articol Storelib",
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
      // outcome worth shouting about: the AWB is in the result so it is not
      // lost, but nothing will find it again automatically.
      console.error("[shipping] AWB created but not saved", { orderId, awb: result.awb, error: saveErr.message })
      return { ok: false, code: "save_failed", message: saveErr.message, awb: result.awb, labelUrl, retryable: false }
    }

    return {
      ok: true,
      idempotent: false,
      awb: result.awb,
      trackingNumber: result.awb,
      labelUrl,
      carrier: result.carrier,
      shippingStatus: "awb_created",
    }
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

    // Our own pre-flight refusal is NOT a provider failure, and must not be
    // reported as one. "The courier rejected this" sends someone to look at the
    // courier; the truth is usually that EAWB_SENDER_LOCKER_ID is unset, which
    // is a configuration fix on our side. Nothing was sent, so nothing is
    // pending — but retrying unchanged cannot help either.
    if (e?.code === "validation") {
      return { ok: false, code: "invalid_shipment", message: e.message, retryable: false }
    }

    // An empty wallet is neither our bug nor the courier's. It is retryable, but
    // only after somebody adds money — so it says that, instead of inviting an
    // immediate retry that cannot possibly behave differently.
    if (e?.code === "insufficient_funds") {
      return { ok: false, code: "insufficient_funds", message: e.message, retryable: true }
    }

    return {
      ok: false,
      code: "provider_error",
      message: e?.message ?? "Could not create the shipment",
      retryable: true,
    }
  }
}
