/**
 * ===========================================================================
 *  THE STORE'S SALES, THE WAY SHOPIFY'S ANALYTICS ADDS THEM UP
 * ===========================================================================
 * Pure, so the route and the tests use the same arithmetic. Every amount is
 * already in the store's currency (lib/money/report-currency-server), each
 * order at its own day's rate.
 *
 *   Gross sales     the items at their list price (unit price x quantity),
 *                   before discounts, without tax, shipping or tips
 *   Discounts       list price minus what the items were charged
 *   Returns         money refunded
 *   Net sales       gross - discounts - returns
 *   Shipping        shipping charged
 *   Taxes           tax charged (added on top or included in the price)
 *   Tips            tips
 *   Total sales     net + shipping + taxes + tips, which is exactly what
 *                   buyers paid less what was refunded
 *
 * A basket is one order: its lines share a payment (stripe_session_id).
 * Average order value is (gross - discounts) / orders. The returning
 * customer rate is customers with two or more orders in the period over all
 * customers in it. Channels come from where each order was placed.
 */
import { decodeOrigin } from "@/lib/orders/order-source"
import { counts, orderProperty, type PropertySelector } from "@/lib/analytics/properties"
import { bucketIndex, bucketStarts, grainFor, type Grain } from "@/lib/analytics/buckets"

export interface CommerceOrderRow {
  id: string
  amount_cents?: number | null
  tip_cents?: number | null
  tax_cents?: number | null
  tax_included?: boolean | null
  shipping_cents?: number | null
  unit_price_cents?: number | null
  quantity?: number | null
  status?: string | null
  refund_amount_cents?: number | null
  created_at: string
  source?: string | null
  source_detail?: string | null
  stripe_session_id?: string | null
  buyer_email?: string | null
  customer_email?: string | null
  product_id?: string | null
  property_type?: string | null
  property_id?: string | null
  /** The shipped order this line is part of (commerce_checkouts), for how long it took to ship. */
  checkout_id?: string | null
}

/**
 * Whether one order line belongs in this report. A chosen product keeps only
 * its own lines. A chosen place uses the same rule as the rest of Analytics
 * (lib/analytics/properties counts). All keeps every line.
 */
export function commerceRowCounts(
  row: CommerceOrderRow,
  opts: { productId: string | null; property: PropertySelector; defaultWebsite: string | null },
): boolean {
  if (opts.productId && row.product_id !== opts.productId) return false
  if (opts.property.type === "all") return true
  const placed = orderProperty({
    lines: [{ property_type: row.property_type, property_id: row.property_id, source: row.source, source_detail: decodeOrigin(row.source_detail) }],
    source: row.source,
    sourceDetail: decodeOrigin(row.source_detail),
  })
  return counts(opts.property, placed, opts.defaultWebsite)
}

export interface SalesBreakdown {
  gross: number
  discounts: number
  returns: number
  net: number
  shipping: number
  taxes: number
  tips: number
  total: number
  orders: number
  aov: number
  customers: number
  returningCustomers: number
  returningRate: number
}

export type Channel = "website" | "storelib" | "onepage" | "link" | "manual"

export const CHANNEL_LABEL: Record<Channel, string> = {
  website: "Online store",
  storelib: "Storelib marketplace",
  onepage: "OnePage",
  link: "Checkout links",
  manual: "Manual",
}

const SALE = new Set(["completed", "refunded", "partially_refunded"])

export function isCommerceSale(r: CommerceOrderRow): boolean {
  return SALE.has(String(r.status ?? "").toLowerCase())
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)

/** One line's money, broken down. */
export function lineBreakdown(r: CommerceOrderRow) {
  const total = n(r.amount_cents)
  const tip = Math.min(total, n(r.tip_cents))
  const shipping = Math.min(total - tip, n(r.shipping_cents))
  const tax = Math.min(total - tip - shipping, n(r.tax_cents))
  const itemsCharged = Math.max(0, total - tip - shipping - tax)
  const qty = Math.max(1, n(r.quantity) || 1)
  const unit = n(r.unit_price_cents)
  /* The list price, without tax when the price included it; never below what was charged. */
  const list = unit > 0 ? Math.max(0, unit * qty - (r.tax_included ? tax : 0)) : itemsCharged
  const gross = Math.max(list, itemsCharged)
  const discounts = gross - itemsCharged
  let returns = 0
  const status = String(r.status ?? "").toLowerCase()
  if (status === "refunded" || status === "partially_refunded") {
    const recorded = n(r.refund_amount_cents)
    returns = recorded > 0 ? Math.min(recorded, total) : total
  }
  return { gross, discounts, returns, shipping, taxes: tax, tips: tip, total }
}

export function channelOf(r: CommerceOrderRow): Channel {
  if (String(r.source ?? "").toLowerCase() === "website") return "website"
  const surface = decodeOrigin(r.source_detail)?.surface
  if (surface === "onepage") return "onepage"
  if (surface === "link") return "link"
  if (surface === "admin") return "manual"
  if (surface === "website") return "website"
  return "storelib"
}

const paymentKey = (r: CommerceOrderRow) => r.stripe_session_id || r.id
const customerKey = (r: CommerceOrderRow) => (r.buyer_email || r.customer_email || "").trim().toLowerCase()

export function breakdownOf(rows: CommerceOrderRow[]): SalesBreakdown {
  const sales = rows.filter(isCommerceSale)
  const out = { gross: 0, discounts: 0, returns: 0, shipping: 0, taxes: 0, tips: 0 }
  for (const r of sales) {
    const b = lineBreakdown(r)
    out.gross += b.gross
    out.discounts += b.discounts
    out.returns += b.returns
    out.shipping += b.shipping
    out.taxes += b.taxes
    out.tips += b.tips
  }
  const net = out.gross - out.discounts - out.returns
  const orders = new Set(sales.map(paymentKey)).size
  const perCustomer = new Map<string, Set<string>>()
  for (const r of sales) {
    const c = customerKey(r)
    if (!c) continue
    if (!perCustomer.has(c)) perCustomer.set(c, new Set())
    perCustomer.get(c)!.add(paymentKey(r))
  }
  const customers = perCustomer.size
  const returningCustomers = [...perCustomer.values()].filter((s) => s.size >= 2).length
  return {
    ...out,
    net,
    total: net + out.shipping + out.taxes + out.tips,
    orders,
    aov: orders ? Math.round((out.gross - out.discounts) / orders) : 0,
    customers,
    returningCustomers,
    returningRate: customers ? returningCustomers / customers : 0,
  }
}

export interface CommercePoint {
  /** The bucket's start, ms. */
  t: number
  total: number
  orders: number
  aov: number
}

/**
 * THE SAME BUCKETS AS THE CHART ABOVE (lib/analytics/buckets): hours for a
 * day or two, days up to three months, then months, each starting at the
 * seller's own midnight in their time zone. These were UTC days, so in
 * Bucharest an order at 01:30 landed on the day before, and Today was
 * drawn as days.
 */
export { grainFor }

export function seriesOf(rows: CommerceOrderRow[], span: { start: number; end: number }, timeZone = "UTC", grain: Grain = grainFor(span)): CommercePoint[] {
  const starts = bucketStarts(span, grain, timeZone)
  const lists: CommerceOrderRow[][] = starts.map(() => [])
  for (const r of rows) {
    const at = Date.parse(r.created_at)
    if (!(at >= span.start && at < span.end)) continue
    const i = bucketIndex(starts, at)
    if (i >= 0) lists[i].push(r)
  }
  return starts.map((t, i) => {
    const b = breakdownOf(lists[i])
    return { t, total: b.total, orders: b.orders, aov: b.aov }
  })
}

export function channelsOf(rows: CommerceOrderRow[]): Array<{ channel: Channel; label: string; total: number; orders: number }> {
  const by = new Map<Channel, CommerceOrderRow[]>()
  for (const r of rows.filter(isCommerceSale)) {
    const c = channelOf(r)
    if (!by.has(c)) by.set(c, [])
    by.get(c)!.push(r)
  }
  return [...by.entries()]
    .map(([channel, list]) => {
      const b = breakdownOf(list)
      return { channel, label: CHANNEL_LABEL[channel], total: b.total, orders: b.orders }
    })
    .sort((a, b) => b.total - a.total)
}
