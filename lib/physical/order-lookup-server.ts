import "server-only"

/**
 * ===========================================================================
 *  TRACK YOUR ORDER, WITHOUT AN ACCOUNT
 * ===========================================================================
 * On a store's website (https://<site host>/checkout/track, the page in
 * app/checkout/site/track), a buyer types the order number from their email
 * and the email they ordered with. When both are one of THIS store's orders,
 * the link to it is emailed to that address; the page says the same thing
 * either way ("if they match, it's on its way"), so the form never tells
 * anybody whether an order or an email exists. Counted per visitor and per
 * address emailed (app/api/checkout/site/track).
 *
 * Physical orders (commerce_checkouts, numbered by the checkout) open their
 * order page; anything else (a download, a course) its receipt, numbered by
 * its first order row, as the account page numbers it.
 */
import { orderNumber } from "./status"
import { isOrderNumberOf, orderPagePath } from "./order-link"
import { likeExact, orderDate } from "@/lib/site-accounts/account-data"
import { isPlausibleToken } from "@/lib/receipts/rules"
import { fulfillmentLabel } from "./status"
import type { DeliveryMethod, FulfillmentStatus } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface FoundOrder {
  /** "#3F2A9C1B". */
  number: string
  date: string
  /** A path on the store's website: the order page, or the receipt. */
  path: string
  status: string | null
}

const PAID = ["paid", "refunded", "partially_refunded"]
const SHOWN = ["completed", "refunded", "partially_refunded", "disputed"]

/** This store's order with that number, placed with that email, or null. Never another store's, never another address's. */
export async function findOrderFor(db: Db, input: { creatorId: string; email: string; number: string }): Promise<FoundOrder | null> {
  const email = input.email.trim().toLowerCase()
  if (!input.creatorId || !email || !/^[0-9A-F]{8}$/.test(input.number)) return null
  try {
    const { data } = await db
      .from("commerce_checkouts")
      .select("id, creator_id, receipt_token, status, paid_at, created_at, fulfillment_status, delivery_method, cancelled_at, buyer_email")
      .eq("creator_id", input.creatorId)
      .ilike("buyer_email", likeExact(email))
      .in("status", PAID)
      .order("created_at", { ascending: false })
      .limit(200)
    for (const co of (Array.isArray(data) ? data : []) as Record<string, any>[]) {
      if (co.creator_id !== input.creatorId || String(co.buyer_email ?? "").toLowerCase() !== email || !isOrderNumberOf(co.id, input.number)) continue
      const path = orderPagePath(co.receipt_token)
      if (!path) continue
      const status = co.cancelled_at ? "Cancelled" : fulfillmentLabel((co.fulfillment_status ?? "unfulfilled") as FulfillmentStatus, (co.delivery_method ?? "ship") as DeliveryMethod).label
      return { number: orderNumber(co.id), date: orderDate(co.paid_at ?? co.created_at), path, status: status === "Unfulfilled" ? "Confirmed" : status }
    }
  } catch {
    /* Before physical commerce's tables: the order rows below. */
  }
  try {
    const { data } = await db
      .from("orders")
      .select("id, creator_id, receipt_token, status, created_at, buyer_email")
      .eq("creator_id", input.creatorId)
      .ilike("buyer_email", likeExact(email))
      .in("status", SHOWN)
      .order("created_at", { ascending: false })
      .limit(200)
    for (const o of (Array.isArray(data) ? data : []) as Record<string, any>[]) {
      if (o.creator_id !== input.creatorId || String(o.buyer_email ?? "").toLowerCase() !== email || !isOrderNumberOf(o.id, input.number)) continue
      if (!isPlausibleToken(o.receipt_token)) continue
      /* A receipt for something that ships sends the buyer on to its order page (lib/receipts/physical-order). */
      return { number: `#${input.number}`, date: orderDate(o.created_at), path: `/receipt/${encodeURIComponent(o.receipt_token)}`, status: null }
    }
  } catch {
    /* Nothing found is what the page says anyway. */
  }
  return null
}
