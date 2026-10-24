import "server-only"

import type { OrderRow } from "./order-view"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"
import { imagesOnly } from "@/lib/media/video"
import { currencyCode } from "@/lib/markets/money"
import { orderCurrency } from "./money"

/**
 * AN ORDER ROW AS THE ORDERS PAGE READS IT, AND EVERY ONE AT ONCE
 *
 * toOrderRow, the products and the checkouts are what every read of the
 * Orders page shares. The page itself reads one page of orders at a time
 * (lib/orders/paged.ts); readCreatorOrders, every row at once, is left for
 * an export of every order, where all of them are wanted. Both number the
 * orders the same way: lib/orders/paged.ts buildIndex counts what
 * order-view groupOrders counts.
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
    /* Who took the payment: a sale paid through Airwallex before it was removed shows it, and offers no Refund (lib/payments/past-provider). */
    provider: order.provider ?? null,
    provider_payment_id: order.provider_payment_id ?? null,
    currency: orderCurrency(order.currency),
    refund_reason: order.refund_reason ?? null,
    refund_amount_cents: order.refund_amount_cents ?? null,
    refunded_at: order.refunded_at ?? null,
    buyer_notified_at: order.buyer_notified_at ?? null,
    buyer_email_last_error: order.buyer_email_last_error ?? null,
    variant_name: order.variant_name ?? null,
    /* Opened yet (SQL part 224): kept absent where the column is not there, so an older database reads every order as seen. */
    ...("seller_seen_at" in order ? { seller_seen_at: order.seller_seen_at ?? null } : {}),
    source: order.source ?? null,
    source_detail: order.source_detail ?? null,
    /* Settings › Taxes: the tax in the amount (parts 110 and 129), absent on an older database. */
    tax_cents: Number(order.tax_cents) || 0,
    tax_included: order.tax_included === true,
    tax_label: typeof order.tax_label === "string" && order.tax_label.trim() ? order.tax_label.trim().slice(0, 80) : null,
    product: product ? { id: product.id, title: product.title, type: product.type, thumbnail_url: product.thumbnail_url } : null,
    /* A physical line: its share of delivery, and of its tax (added on top, or inside the price with tax_included), which it keeps in its snapshot (the checkout holds the order's), not in the column. */
    ...(order.checkout_id
      ? {
          checkout_id: order.checkout_id as string,
          quantity: (order.quantity as number) ?? 1,
          shipping_cents: Number(order.shipping_cents) || 0,
          tax_cents: Number(order.tax_cents) || Number(order.product_snapshot?.tax_cents) || 0,
          tax_included: order.tax_included === true || order.product_snapshot?.tax_included === true,
          tax_label: typeof order.tax_label === "string" && order.tax_label.trim() ? order.tax_label.trim().slice(0, 80) : typeof order.product_snapshot?.tax_label === "string" && order.product_snapshot.tax_label.trim() ? order.product_snapshot.tax_label.trim().slice(0, 80) : null,
        }
      : {}),
  }
}

/*
  A page at a time: a query returns at most 1,000 rows, and a creator
  with more orders than that would otherwise lose the oldest ones from
  the list without a word.
*/
function readOrderRows(admin: any, creatorId: string): Promise<any[]> {
  return byCreator(async (scope) => {
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
  /*
    The products and the orders are asked at once: the orders are found by
    their creator (or through their product, byCreator), never by the ids
    read here, which only name each row's product. One round trip fewer
    before Orders is drawn (lib/perf/optimizations.ts).
  */
  const productsRead = Promise.resolve(admin.from("products").select("*").eq("creator_id", creatorId))
  const ordersRead = readOrderRows(admin, creatorId)
  /* Both settle before either answer is used, so a failure of one is never left unhandled. */
  const [{ data: productsData, error: productsError }, ordersData] = await Promise.all([productsRead, ordersRead])
  if (productsError) throw new OrdersReadError(`Orders: could not read products (${productsError.message})`)
  const products = productsOf(productsData)

  const byId = new Map(products.map((p) => [p.id, p]))
  const rows = ordersData.map((order) => toOrderRow(order, byId.get(order.product_id)))
  await attachCheckouts(admin, creatorId, rows)
  return { products, rows }
}

/** The creator's products, every column (see readCreatorOrders), as the Orders page names them. */
export async function readCreatorProducts(admin: any, creatorId: string): Promise<CreatorProduct[]> {
  const { data, error: productsError } = await Promise.resolve(admin.from("products").select("*").eq("creator_id", creatorId))
  if (productsError) throw new OrdersReadError(`Orders: could not read products (${productsError.message})`)
  return productsOf(data)
}

function productsOf(productsData: any[] | null): CreatorProduct[] {
  return (productsData || []).map((p: any) => ({
    id: p.id as string,
    title: (p.title as string) || "Untitled product",
    type: (p.type as string) || null,
    thumbnail_url: (p.thumbnail_url as string) || imagesOnly(p.gallery_urls ?? [])[0] || p.gallery_images?.[0] || null,
  }))
}

/**
 * WHERE EACH PHYSICAL ORDER IS, written onto its rows in place: its stage,
 * returns and delivery, a parcel in trouble, cash still to collect, and the
 * currency and tax its checkout charged. For any set of rows: every order
 * (readCreatorOrders, the export of everything) or one page of them
 * (lib/orders/paged.ts).
 */
export async function attachCheckouts(admin: any, creatorId: string, rows: OrderRow[]): Promise<void> {
  /* A physical order is fulfilled when it has shipped (lib/physical), not when it is paid: its stage, returns and delivery come from its checkout. */
  const checkoutIds = [...new Set(rows.map((r) => r.checkout_id).filter((id): id is string => !!id))]
  if (checkoutIds.length) {
    type Checkout = { id: string; fulfillment_status: string; return_status: string | null; delivery_method: string | null; tax_cents?: number | null; shipping_rate: { name?: string; tax_label?: string; tax_included?: boolean } | null; provider?: string | null; cod_collected_at?: string | null; currency?: string | null }
    const byCheckout = new Map<string, Checkout>()
    const problems = new Set<string>()
    /* The carrier of each order's latest parcel, for its logo on the list (components/physical/carrier-logo). */
    const carriers = new Map<string, string>()
    for (let i = 0; i < checkoutIds.length; i += 500) {
      const slice = checkoutIds.slice(i, i + 500)
      const [{ data }, parcels] = await Promise.all([
        /* The provider, for cash on delivery: whether its cash is in is asked for below, for those orders only. */
        admin.from("commerce_checkouts").select("id, fulfillment_status, return_status, delivery_method, tax_cents, shipping_rate, provider, currency").eq("creator_id", creatorId).in("id", slice),
        /* Every parcel that is not cancelled, oldest first: one the carrier (or the seller) marked as a delivery problem says so on the list, as the buyer's page does, and the last one with a carrier names it. */
        Promise.resolve(admin.from("fulfillments").select("checkout_id, status, carrier").in("checkout_id", slice).neq("status", "cancelled").order("created_at", { ascending: true })).then(
          (r: { data: { checkout_id: string; status: string; carrier: string | null }[] | null }) => r.data ?? [],
          () => [] as { checkout_id: string; status: string; carrier: string | null }[],
        ),
      ])
      for (const c of (data ?? []) as Checkout[]) byCheckout.set(c.id, c)
      for (const f of parcels) {
        if (f.status === "failed") problems.add(f.checkout_id)
        if (f.carrier?.trim()) carriers.set(f.checkout_id, f.carrier.trim())
      }
    }
    /* Cash on delivery: whether the cash is in, read only for those orders (the column is SQL part 174's; no such order exists before it). */
    const cashIds = [...byCheckout.values()].filter((c) => c.provider === "cod").map((c) => c.id)
    for (let i = 0; i < cashIds.length; i += 500) {
      const { data: cash } = await admin.from("commerce_checkouts").select("id, cod_collected_at").eq("creator_id", creatorId).in("id", cashIds.slice(i, i + 500))
      for (const c of (cash ?? []) as { id: string; cod_collected_at: string | null }[]) {
        const had = byCheckout.get(c.id)
        if (had) had.cod_collected_at = c.cod_collected_at
      }
    }
    for (const r of rows) {
      const c = r.checkout_id ? byCheckout.get(r.checkout_id) : undefined
      if (!c) continue
      r.physical_fulfillment = c.fulfillment_status ?? null
      r.physical_return = c.return_status ?? null
      r.physical_pickup = c.delivery_method === "pickup"
      r.physical_method = typeof c.shipping_rate?.name === "string" ? c.shipping_rate.name : null
      r.physical_problem = problems.has(c.id)
      r.physical_carrier = carriers.get(c.id) ?? null
      r.physical_cash_due = c.provider === "cod" && !c.cod_collected_at
      /* The checkout's currency is what was charged (an order line can say "usd" from before lines kept it). */
      if (currencyCode(c.currency)) r.currency = orderCurrency(c.currency)
      /* The tax's name as the physical checkout charged it ("VAT 19%"). */
      if (typeof c.shipping_rate?.tax_label === "string" && c.shipping_rate.tax_label.trim()) r.tax_label = c.shipping_rate.tax_label.trim().slice(0, 80)
    }
    /*
      An order paid before its lines kept tax inside the price (lib/physical/checkout-server.ts): its checkout still
      holds the tax and that it was included, so the order shows its "Includes" row too. Put on the order's first line,
      since the order adds its lines' tax up.
    */
    for (const c of byCheckout.values()) {
      const tax = Math.max(0, Number(c.tax_cents) || 0)
      if (!c.shipping_rate?.tax_included || tax <= 0) continue
      const own = rows.filter((r) => r.checkout_id === c.id)
      if (own.length === 0 || own.some((r) => (r.tax_cents || 0) > 0)) continue
      own.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      own[0].tax_cents = tax
      for (const r of own) r.tax_included = true
    }
  }
}
