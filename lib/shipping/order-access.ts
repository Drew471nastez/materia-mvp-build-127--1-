import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  WHO MAY SEE OR TOUCH AN ORDER'S SHIPPING
 * ===========================================================================
 *
 * Every shipping route asks the same question first — "is this caller the
 * buyer or the seller of this order?" — so it is answered in exactly one
 * place. A tracking number, a locker address and a label PDF are all things
 * only those two people may see, and the check that decides it should not be
 * re-typed (and re-reasoned about) in five route handlers.
 *
 * ---------------------------------------------------------------------------
 * Why this uses the admin client, and why that is not a hole
 * ---------------------------------------------------------------------------
 * An order row belongs to the BUYER under RLS. A seller therefore cannot read
 * the order for their own sale on their own client at all — which is why every
 * seller-facing order read in this codebase already goes through the admin
 * client. So RLS cannot be the access check here, and something has to be.
 *
 * That something is this function, and it only works if the caller's id is
 * trustworthy. The service role bypasses RLS entirely, so the id IS the
 * credential the moment it is handed to the admin client — a locally-read
 * session cookie is not good enough. Callers must pass an id from
 * `requireVerifiedUser()` (a real round trip to the auth server), never from
 * `readSessionAuth()`. The parameter is named `verifiedUserId` so that a call
 * site passing the cheap one reads as wrong.
 *
 * The ownership chain for a seller is products.creator_id → creators.user_id,
 * and it is walked here rather than trusted from the request.
 */

/** Which side of the transaction the caller is on. */
export type OrderParty = "buyer" | "seller"

/** The shipping-relevant shape of an order, as the UI and the routes need it. */
export interface OrderShipping {
  id: string
  status: string | null
  product_id: string | null
  buyer_id: string | null
  buyer_email: string | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  amount_cents: number | null
  created_at: string | null
  // Everything below exists only after supabase/sql/RUN_SHIPPING.sql has run.
  awb_number?: string | null
  tracking_number?: string | null
  shipping_status?: string | null
  shipping_carrier?: string | null
  shipping_label_url?: string | null
  shipping_raw_status?: string | null
  shipping_error?: string | null
  shipping_created_at?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  /** When the carrier was last asked. The refresh rate limit reads this, and it
   *  lives in the database precisely because serverless instances share no
   *  memory — an in-process timer would rate-limit nothing. */
  shipping_last_checked_at?: string | null
  ship_contact?: string | null
  ship_phone?: string | null
  ship_country_code?: string | null
  ship_county?: string | null
  ship_locality?: string | null
  ship_street?: string | null
  ship_street_no?: string | null
  ship_details?: string | null
  ship_postal_code?: string | null
  ship_fixed_location_id?: number | null
}

/** The columns that only exist post-migration, as one selectable string. */
const SHIPPING_COLUMNS =
  "awb_number, tracking_number, shipping_status, shipping_carrier, shipping_label_url, " +
  "shipping_raw_status, shipping_error, shipping_created_at, shipped_at, delivered_at, " +
  "shipping_last_checked_at, " +
  "ship_contact, ship_phone, ship_country_code, ship_county, ship_locality, " +
  "ship_street, ship_street_no, ship_details, ship_postal_code, ship_fixed_location_id"

/** The columns that exist on every deployment, migration or not. */
const BASE_COLUMNS =
  "id, status, product_id, buyer_id, buyer_email, buyer_first_name, buyer_last_name, amount_cents, created_at"

/**
 * Postgres "undefined column". PostgREST passes it through as `code`.
 *
 * This is the difference between "the operator has not run the SQL yet" and
 * "something is broken", and the whole codebase treats it as the former: the
 * migration is the user's to run, and until they do, shipping is simply a
 * feature that is not switched on. A 500 on the orders page would be a much
 * worse answer than a page that renders without a shipping section.
 */
const UNDEFINED_COLUMN = "42703"

export function isMissingShippingSchema(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === UNDEFINED_COLUMN) return true
  // PostgREST's schema cache answers before Postgres does, with its own wording
  // and no SQLSTATE — "Could not find the 'awb_number' column of 'orders'".
  return /could not find the '.*' column|column .* does not exist/i.test(err.message ?? "")
}

/** What a shipping read found: the row, whether the columns exist, and — only
 *  when the read genuinely failed — why. A null `order` with no `message` means
 *  "no such order", which is not an error. */
export interface ShippingReadResult {
  order: OrderShipping | null
  schema: "ready" | "absent"
  message?: string
}

/**
 * Read an order with its shipping fields, falling back to the base columns
 * when the migration has not been run.
 *
 * Two queries in the worst case, one in the normal one. The fallback is only
 * taken on the specific "undefined column" failure — any other error is still
 * an error, because silently degrading on, say, a connection fault would hide
 * a real outage behind an empty shipping panel.
 */
export async function readOrderShipping(
  admin: SupabaseClient,
  orderId: string,
): Promise<ShippingReadResult> {
  const full = await admin
    .from("orders")
    .select(`${BASE_COLUMNS}, ${SHIPPING_COLUMNS}`)
    .eq("id", orderId)
    .maybeSingle()

  if (!full.error) {
    if (!full.data) return { order: null, schema: "ready" }
    return { order: full.data as unknown as OrderShipping, schema: "ready" }
  }

  if (!isMissingShippingSchema(full.error)) {
    return { order: null, schema: "ready", message: full.error.message }
  }

  const base = await admin.from("orders").select(BASE_COLUMNS).eq("id", orderId).maybeSingle()
  if (base.error) return { order: null, schema: "ready", message: base.error.message }
  if (!base.data) return { order: null, schema: "ready" }
  return { order: base.data as unknown as OrderShipping, schema: "absent" }
}

/**
 * Resolve the caller's relationship to an order.
 *
 * `verifiedUserId` MUST come from `requireVerifiedUser()` — see the header.
 *
 * Returns "forbidden" for a real order the caller has nothing to do with, and
 * "not_found" only when no such order exists. Those are deliberately distinct
 * here because the caller decides what to disclose; the routes in this feature
 * collapse both to 404 so that probing order ids reveals nothing.
 */
export async function resolveOrderParty(
  orderId: string,
  verifiedUserId: string,
): Promise<
  | { ok: true; party: OrderParty; order: OrderShipping; schema: "ready" | "absent" }
  | { ok: false; reason: "not_found" | "forbidden" | "error"; message?: string }
> {
  let admin: SupabaseClient
  try {
    admin = createAdminClient()
  } catch (e) {
    return { ok: false, reason: "error", message: (e as Error)?.message }
  }

  const read = await readOrderShipping(admin, orderId)
  if (!read.order) {
    return read.message ? { ok: false, reason: "error", message: read.message } : { ok: false, reason: "not_found" }
  }
  const order = read.order

  if (order.buyer_id && order.buyer_id === verifiedUserId) {
    return { ok: true, party: "buyer", order, schema: read.schema }
  }

  // Seller: products.creator_id → creators.user_id. Walked, never trusted from
  // the request. Two small reads rather than a join so that a missing creator
  // row is "not the seller" instead of a query error.
  if (order.product_id) {
    const { data: product } = await admin
      .from("products")
      .select("creator_id")
      .eq("id", order.product_id)
      .maybeSingle()
    if (product?.creator_id) {
      const { data: creator } = await admin
        .from("creators")
        .select("user_id")
        .eq("id", product.creator_id)
        .maybeSingle()
      if (creator?.user_id && creator.user_id === verifiedUserId) {
        return { ok: true, party: "seller", order, schema: read.schema }
      }
    }
  }

  return { ok: false, reason: "forbidden" }
}
