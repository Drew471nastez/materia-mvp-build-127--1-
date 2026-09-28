import "server-only"

import type { OrderRow } from "./order-view"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"

/**
 * EVERY ORDER A CREATOR HAS, AS THE ORDERS PAGE READS THEM
 *
 * The Orders page (app/app/orders/sales/page.tsx) and the app's export link
 * (app/api/app/orders/export/route.ts) both need the same rows: the export
 * names orders by number, and a number is only the same number if it is
 * counted over the same rows. So there is one reader.
 *
 * Read with the service role and scoped by the order's own creator
 * (orders.creator_id, run-now part 32), as Analytics reads them, so a sale
 * of a product the creator has since deleted stays on this page and in the
 * export, with no product, and the two pages count the same orders. Until
 * that part has run the orders are read through their product instead. The
 * creator id always comes from the session, or from a link the server signed
 * for that session, never from the request.
 */

export interface CreatorProduct {
  id: string
  title: string
  type: string | null
  thumbnail_url: string | null
}

export class OrdersReadError extends Error {}

/** One row as the page sees it: only the columns it draws or needs to act on. */
export function toOrderRow(order: any, product: CreatorProduct | undefined): OrderRow {
  return {
    id: order.id,
    product_id: order.product_id,
    amount_cents: order.amount_cents || 0,
    fee_cents: order.fee_cents ?? null,
    tip_cents: order.tip_cents ?? null,
    status: order.status || "pending",
    created_at: order.created_at,
    payment_method: order.payment_method ?? null,
    card_brand: order.card_brand ?? null,
    card_last4: order.card_last4 ?? null,
    paypal_email: order.paypal_email ?? null,
    buyer_email: order.buyer_email ?? order.customer_email ?? null,
    buyer_first_name: order.buyer_first_name ?? null,
    buyer_last_name: order.buyer_last_name ?? null,
    buyer_country: order.buyer_country ?? null,
    buyer_country_code: order.buyer_country_code ?? null,
    buyer_device_type: order.buyer_device_type ?? null,
    buyer_os: order.buyer_os ?? null,
    buyer_browser: order.buyer_browser ?? null,
    receipt_token: order.receipt_token ?? null,
    stripe_session_id: order.stripe_session_id ?? null,
    stripe_payment_intent_id: order.stripe_payment_intent_id ?? null,
    refund_reason: order.refund_reason ?? null,
    refund_amount_cents: order.refund_amount_cents ?? null,
    refunded_at: order.refunded_at ?? null,
    buyer_notified_at: order.buyer_notified_at ?? null,
    buyer_email_last_error: order.buyer_email_last_error ?? null,
    variant_name: order.variant_name ?? null,
    source: order.source ?? null,
    source_detail: order.source_detail ?? null,
    product: product ? { id: product.id, title: product.title, type: product.type, thumbnail_url: product.thumbnail_url } : null,
  }
}

export async function readCreatorOrders(admin: any, creatorId: string): Promise<{ products: CreatorProduct[]; rows: OrderRow[] }> {
  /*
    EVERY COLUMN, NOT A LIST OF THEM. This named `gallery_images`, a column
    the products table does not have (it is `gallery_urls`), and PostgREST
    answers a query naming a missing column with an error, not with the
    columns it does have. The error was not looked at, so the page read "no
    products", then "no orders", and a creator with a year of sales was told
    they had none. `*` cannot name a column that is not there, and a failed
    read now stops the page instead of drawing an empty one.
  */
  const { data: productsData, error: productsError } = await admin.from("products").select("*").eq("creator_id", creatorId)
  if (productsError) throw new OrdersReadError(`Orders: could not read products (${productsError.message})`)
  const products: CreatorProduct[] = (productsData || []).map((p: any) => ({
    id: p.id as string,
    title: (p.title as string) || "Untitled product",
    type: (p.type as string) || null,
    thumbnail_url: (p.thumbnail_url as string) || p.gallery_urls?.[0] || p.gallery_images?.[0] || null,
  }))
  /*
    A page at a time: a query returns at most 1,000 rows, and a creator
    with more orders than that would otherwise lose the oldest ones from
    the list without a word.
  */
  const ordersData = await byCreator(async (scope) => {
    const rows: any[] = []
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error: ordersError } = await scopedOrders(admin, "*", scope, creatorId, null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + 999)
      if (ordersError) throw new OrdersReadError(`Orders: could not read orders (${ordersError.message})`)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    return ownRows(rows)
  })

  const byId = new Map(products.map((p) => [p.id, p]))
  return { products, rows: ordersData.map((order) => toOrderRow(order, byId.get(order.product_id))) }
}
