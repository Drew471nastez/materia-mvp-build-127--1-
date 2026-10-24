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
import { counts, orderProperty, propertyName, type CreatorProperties, type PropertySelector } from "@/lib/analytics/properties"
import { bucketIndex, bucketStarts, grainFor, type Grain } from "@/lib/analytics/buckets"
import { groupOrders, isSale, type Order, type OrderRow } from "@/lib/orders/order-view"
import { lineInMode, type SalesMode } from "@/lib/analytics/sections"
import { refundsIn } from "@/lib/analytics/refund-dates"

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
  /** When the refund was made: returns are dated by it (lib/analytics/refund-dates). */
  refunded_at?: string | null
  /** unit_price_cents x quantity, set before a conversion so it is converted as one amount (withListTotal). */
  list_total_cents?: number | null
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
  /* The line's list total, converted as one amount when the order was in another currency (withListTotal). */
  const listed = n(r.list_total_cents) || n(r.unit_price_cents) * qty
  /* The list price, without tax when the price included it; never below what was charged. */
  const list = listed > 0 ? Math.max(0, listed - (r.tax_included ? tax : 0)) : itemsCharged
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

/**
 * Each line with its list total (unit price x quantity) beside it, before the
 * lines are converted to the store's currency (lib/money/report-currency
 * converts it as one amount), so a converted line is never listed a few
 * minor units above what it was charged. Copies; the rows are not changed.
 */
export function withListTotal<T extends { unit_price_cents?: number | null; quantity?: number | null }>(rows: T[]): Array<T & { list_total_cents?: number | null }> {
  return rows.map((r) => {
    const unit = n(r.unit_price_cents)
    return unit > 0 ? { ...r, list_total_cents: unit * Math.max(1, n(r.quantity) || 1) } : r
  })
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

/* ═══════════════════════════════════════════════════════════════════════════
 *  THE SALES REPORTS, COUNTED AS EVERY OTHER FIGURE ON THE PAGE COUNTS ORDERS
 * ═══════════════════════════════════════════════════════════════════════════
 * breakdownOf above adds up order lines as they come. The page's tabs
 * (lib/analytics/reports) count payments: every line of one payment is one
 * order, placed in time and in a place by its first line, a sale or not by
 * lib/orders/order-view isSale. Counting lines on their own disagreed with
 * the tabs in four ways, each measured on tests/analytics-accuracy.test.ts's
 * fixture:
 *
 *   a basket whose lines straddle the end of a period was an order in both
 *   a basket without a place of its own (before part 60) was the creator
 *     page's here and the website's on the tabs
 *   a payment still pending on one line was a sale on its other lines
 *   a returning customer was one with two orders inside the period only,
 *     so somebody who bought last month and again today was new
 *
 * commerceReport counts payments by the tabs' rules, so Total sales here is
 * Revenue on the tab, to the cent, for every place, product and switch.
 */

export type Span = { start: number; end: number }

/** One payment's money, from its lines (lineBreakdown), so the parts add up to what was paid less refunds. */
export function orderBreakdown(o: Pick<Order, "lines">) {
  const out = { gross: 0, discounts: 0, returns: 0, shipping: 0, taxes: 0, tips: 0, total: 0 }
  for (const line of o.lines) {
    const b = lineBreakdown(line as unknown as CommerceOrderRow)
    out.gross += b.gross
    out.discounts += b.discounts
    out.returns += b.returns
    out.shipping += b.shipping
    out.taxes += b.taxes
    out.tips += b.tips
    out.total += b.total
  }
  /* `charged`: what the buyer paid; `total`: that less what this payment's lines had refunded, whenever. */
  return { ...out, charged: out.total, total: out.total - out.returns }
}

/** A line's refunded money, by lineBreakdown: the same returns the breakdown adds up. */
export const lineReturns = (line: Order["lines"][number]) => lineBreakdown(line as unknown as CommerceOrderRow).returns

const emailOf = (o: Pick<Order, "lines">) => o.lines.map((l) => (l.buyer_email || "").trim().toLowerCase()).find(Boolean) ?? ""

/**
 * The breakdown of a list of payments. `earlier`: the customers who had a
 * sale before the period began; one of them buying again is returning, as
 * Shopify counts it (more than one order in their lifetime).
 */
export function breakdownOfOrders(orders: Array<Pick<Order, "lines">>, earlier: ReadonlySet<string> = new Set(), returns?: number): SalesBreakdown {
  const out = { gross: 0, discounts: 0, returns: 0, shipping: 0, taxes: 0, tips: 0 }
  const perCustomer = new Map<string, number>()
  for (const o of orders) {
    const b = orderBreakdown(o)
    out.gross += b.gross
    out.discounts += b.discounts
    out.returns += b.returns
    out.shipping += b.shipping
    out.taxes += b.taxes
    out.tips += b.tips
    const c = emailOf(o)
    if (c) perCustomer.set(c, (perCustomer.get(c) ?? 0) + 1)
  }
  /* Returns dated by the refund (lib/analytics/refund-dates): the caller's refunds of the period, of whichever orders. */
  if (returns !== undefined) out.returns = returns
  const net = out.gross - out.discounts - out.returns
  const count = orders.length
  const customers = perCustomer.size
  const returningCustomers = [...perCustomer.entries()].filter(([c, k]) => k >= 2 || earlier.has(c)).length
  return {
    ...out,
    net,
    total: net + out.shipping + out.taxes + out.tips,
    orders: count,
    aov: count ? Math.round((out.gross - out.discounts) / count) : 0,
    customers,
    returningCustomers,
    returningRate: customers ? returningCustomers / customers : 0,
  }
}

/** A sales channel: where the order was placed, one row per place and per way in. */
export interface ChannelRow {
  key: string
  label: string
  total: number
  orders: number
}

/**
 * Where a payment was placed, as a channel: each website by its name, the
 * OnePage, and on the creator's Storelib pages the way in (Explore, a
 * checkout link opened on its own, a test sale made by Storelib's admin)
 * or the creator page itself.
 */
export function channelOfOrder(o: Order, properties: CreatorProperties): { key: string; label: string } {
  const place = orderProperty(o)
  if (place.type === "website") {
    const id = place.id ?? properties.defaultWebsite
    const site = properties.websites.find((w) => w.id === id)
    return { key: `website:${id ?? ""}`, label: site?.name || (properties.websites.length <= 1 ? "Online store" : propertyName(place, properties)) }
  }
  if (place.type === "onepage") return { key: "onepage", label: "OnePage" }
  const surface = (o.sourceDetail as { surface?: string } | null)?.surface ?? o.lines.map((l) => decodeOrigin(l.source_detail)?.surface).find(Boolean)
  if (surface === "explore") return { key: "explore", label: "Storelib Explore" }
  if (surface === "link") return { key: "link", label: "Checkout links" }
  if (surface === "admin") return { key: "admin", label: "Test sales" }
  return { key: "creator_page", label: "Creator page" }
}

export interface FulfillmentFigures {
  /** Physical orders of the period (with a checkout to ship), fulfilled or not. */
  orders: number
  fulfilled: number
  /** fulfilled / orders; null with no physical order. */
  rate: number | null
}

export interface CommerceReport {
  breakdown: SalesBreakdown
  previous: SalesBreakdown
  series: CommercePoint[]
  previousSeries: CommercePoint[]
  channels: ChannelRow[]
  fulfillmentRate: FulfillmentFigures
  fulfillmentRateBefore: FulfillmentFigures
  /**
   * With the sales of every kind counted together (mode All), the same
   * breakdown for each kind: the Total sales breakdown's Digital and
   * Physical columns. Null under one kind or one product.
   */
  kinds: { digital: SalesBreakdown; physical: SalesBreakdown } | null
  /** The period's payments, newest first, for the export. */
  orders: Order[]
}

/**
 * What a chosen product keeps of the order lines, before they are grouped:
 * the tabs read only that product's lines (report-read readOrders), so this
 * does too.
 */
export function linesFor(rows: OrderRow[], opts: { productId: string | null }): OrderRow[] {
  return opts.productId ? rows.filter((r) => r.product_id === opts.productId) : rows
}

/**
 * The payments that are sales, placed under the property asked for (the
 * tabs' own rule), and with the switch on Digital or Physical only that
 * kind's lines of each. Grouped before the switch, so a basket is a sale or
 * not as a whole.
 */
export function salesOf(rows: OrderRow[], selector: PropertySelector, defaultWebsite: string | null, mode: SalesMode = "all", productTypes: Record<string, string | null> = {}): Order[] {
  const sales = groupOrders(rows)
    .filter(isSale)
    .filter((o) => counts(selector, orderProperty(o), defaultWebsite))
  if (mode === "all") return sales
  return sales.map((o) => ({ ...o, lines: o.lines.filter((l) => lineInMode(productTypes[l.product_id], mode)) })).filter((o) => o.lines.length > 0)
}

const orderInSpan = (o: Pick<Order, "createdAt">, s: Span) => {
  const t = Date.parse(o.createdAt)
  return t >= s.start && t < s.end
}

/** A checkout that has gone out to the buyer. */
export const SHIPPED_STATUSES: readonly string[] = ["fulfilled", "shipped", "delivered"]

/**
 * Of the period's payments with something to ship, how many are fulfilled.
 * `checkouts` is each checkout's fulfillment_status (commerce_checkouts);
 * a payment counts once, fulfilled when every checkout it has is. A payment
 * refunded in full was not shipped and is not waiting to be.
 */
export function fulfillmentOf(orders: Order[], checkouts: Record<string, string | null | undefined>): FulfillmentFigures {
  let total = 0
  let fulfilled = 0
  for (const o of orders) {
    const ids = [...new Set(o.lines.map((l) => l.checkout_id).filter((c): c is string => !!c && c in checkouts))]
    if (ids.length === 0) continue
    if (o.payment === "refunded") continue
    total++
    if (ids.every((id) => SHIPPED_STATUSES.includes(String(checkouts[id] ?? "").toLowerCase()))) fulfilled++
  }
  return { orders: total, fulfilled, rate: total ? fulfilled / total : null }
}

/**
 * EVERY SALES FIGURE FOR ONE QUESTION. `rows` are the creator's order lines
 * in the store's currency, read a day either side of both periods so a
 * basket is whole; `previous` null is no comparison.
 */
export function commerceReport(input: {
  rows: OrderRow[]
  span: Span
  previous: Span | null
  timeZone: string
  selector: PropertySelector
  properties: CreatorProperties
  productId: string | null
  mode: SalesMode
  productTypes: Record<string, string | null>
  /** Customers (email, lower case) with a sale before each period began. */
  earlier?: { now: ReadonlySet<string>; before: ReadonlySet<string> }
  /** fulfillment_status of each checkout the period's lines name. */
  checkouts?: Record<string, string | null | undefined>
}): CommerceReport {
  const sales = salesOf(linesFor(input.rows, input), input.selector, input.properties.defaultWebsite, input.mode, input.productTypes)
  const now = sales.filter((o) => orderInSpan(o, input.span))
  const before = input.previous ? sales.filter((o) => orderInSpan(o, input.previous!)) : []
  /* Returns on the day of the refund, of any sale the reads found (lib/analytics/refund-dates). */
  const refundsNow = refundsIn(sales, input.span, lineReturns)
  const refundsBefore = input.previous ? refundsIn(sales, input.previous, lineReturns) : []
  const cents = (xs: Array<{ cents: number }>) => xs.reduce((a, e) => a + e.cents, 0)
  const grain = grainFor(input.span)
  const seriesFor = (list: Order[], refunds: typeof refundsNow, span: Span): CommercePoint[] => {
    const starts = bucketStarts(span, grain, input.timeZone)
    const buckets: Order[][] = starts.map(() => [])
    const returned = starts.map(() => 0)
    for (const o of list) {
      const i = bucketIndex(starts, Date.parse(o.createdAt))
      if (i >= 0) buckets[i].push(o)
    }
    for (const e of refunds) {
      const i = bucketIndex(starts, e.at)
      if (i >= 0) returned[i] += e.cents
    }
    return starts.map((t, i) => {
      const b = breakdownOfOrders(buckets[i], undefined, returned[i])
      return { t, total: b.total, orders: b.orders, aov: b.aov }
    })
  }
  const channels = new Map<string, ChannelRow>()
  const channelRow = (o: Order) => {
    const c = channelOfOrder(o, input.properties)
    const row = channels.get(c.key) ?? { key: c.key, label: c.label, total: 0, orders: 0 }
    channels.set(c.key, row)
    return row
  }
  for (const o of now) {
    const row = channelRow(o)
    row.total += orderBreakdown(o).charged
    row.orders += 1
  }
  for (const e of refundsNow) channelRow(e.order).total -= e.cents
  const checkouts = input.checkouts ?? {}
  /* One kind's lines of each payment, its refunds on their own day: the two columns add up to the whole. */
  const kindBreakdown = (kind: "digital" | "physical") => {
    const mine = salesOf(linesFor(input.rows, input), input.selector, input.properties.defaultWebsite, kind, input.productTypes)
    return breakdownOfOrders(mine.filter((o) => orderInSpan(o, input.span)), input.earlier?.now, cents(refundsIn(mine, input.span, lineReturns)))
  }
  return {
    breakdown: breakdownOfOrders(now, input.earlier?.now, cents(refundsNow)),
    previous: breakdownOfOrders(before, input.earlier?.before, cents(refundsBefore)),
    series: seriesFor(now, refundsNow, input.span),
    previousSeries: input.previous ? seriesFor(before, refundsBefore, input.previous) : [],
    channels: [...channels.values()].sort((a, b) => b.total - a.total || b.orders - a.orders || a.label.localeCompare(b.label)),
    fulfillmentRate: fulfillmentOf(now, checkouts),
    fulfillmentRateBefore: fulfillmentOf(before, checkouts),
    kinds: input.mode === "all" && !input.productId ? { digital: kindBreakdown("digital"), physical: kindBreakdown("physical") } : null,
    orders: now,
  }
}

/** The customers of a list of payments, for asking which of them bought before. */
export function customersOf(orders: Array<Pick<Order, "lines">>): string[] {
  return [...new Set(orders.map(emailOf).filter(Boolean))]
}
