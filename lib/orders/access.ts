import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  WHO IS ALLOWED TO LOOK AT AN ORDER
 * ===========================================================================
 *
 * This lived in lib/shipping/order-access.ts, which was the wrong home for it
 * even before the marketplace was removed: an order has a buyer and a seller
 * whether or not anything is posted, and a downloadable font needs this check
 * exactly as much as a parcel did. It moved here rather than being deleted with
 * the rest of the shipping module.
 *
 * What did NOT come with it: readOrderShipping, which selected delivery mode,
 * locker id, county, AWB number and courier status, and isMissingShippingSchema,
 * which existed so the app could survive a database where those columns had
 * never been added. Both described a parcel. The read below is the same query
 * with the postage columns dropped.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE
 * ---------------------------------------------------------------------------
 * `verifiedUserId` MUST come from requireVerifiedUser(). Nothing here re-checks
 * the session, so passing an id taken from a request body would hand any caller
 * anybody's order. The seller side is WALKED rather than trusted --
 * products.creator_id then creators.user_id -- and it is two small reads rather
 * than a join so that a missing creator row reads as "not the seller" instead
 * of failing the whole query.
 */

export type OrderParty = "buyer" | "seller"

export type OrderRow = {
  id: string
  buyer_id: string | null
  product_id: string | null
  status: string | null
  created_at: string | null
}

const ORDER_COLUMNS = "id, buyer_id, product_id, status, created_at"

async function readOrder(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ order: OrderRow | null; message?: string }> {
  const { data, error } = await admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle()
  if (error) return { order: null, message: error.message }
  return { order: (data as OrderRow) ?? null }
}

/**
 * Resolve the caller's relationship to an order.
 *
 * Returns "forbidden" for a real order the caller has nothing to do with, and
 * "not_found" only when no such order exists. Those stay distinct here because
 * the caller decides what to disclose; the pages in this app collapse both to a
 * 404 so that probing order ids reveals nothing.
 */
export async function resolveOrderParty(
  orderId: string,
  verifiedUserId: string,
): Promise<
  | { ok: true; party: OrderParty; order: OrderRow }
  | { ok: false; reason: "not_found" | "forbidden" | "error"; message?: string }
> {
  let admin: SupabaseClient
  try {
    admin = createAdminClient()
  } catch (e) {
    return { ok: false, reason: "error", message: (e as Error)?.message }
  }

  const read = await readOrder(admin, orderId)
  if (!read.order) {
    return read.message
      ? { ok: false, reason: "error", message: read.message }
      : { ok: false, reason: "not_found" }
  }
  const order = read.order

  if (order.buyer_id && order.buyer_id === verifiedUserId) {
    return { ok: true, party: "buyer", order }
  }

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
        return { ok: true, party: "seller", order }
      }
    }
  }

  return { ok: false, reason: "forbidden" }
}
