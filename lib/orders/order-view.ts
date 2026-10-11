/**
 * THE ORDERS PAGE, AS DATA
 *
 * Everything the Orders list and an order's page show is worked out here,
 * from the rows the server read, with no React and no clock of its own: the
 * page passes `now` and a time zone in. That is what lets the server and the
 * browser render the same thing, and what lets tests/orders-view.test.ts check
 * the numbers without a browser.
 *
 * ONE PAYMENT IS ONE ORDER. A row in `orders` is one product. A basket on a
 * website is paid once and writes a row per product under the same Stripe
 * session, so rows are grouped by that session: the creator sees one order
 * with three items, which is what the buyer did.
 */

import { cleanOrigin, type OrderOrigin, type OrderSource } from "./order-source"
import { midnightOf, todayIn } from "../date-range/range"

export interface OrderRow {
  id: string
  product_id: string
  amount_cents: number
  fee_cents?: number | null
  tip_cents?: number | null
  status: string
  created_at: string
  payment_method?: string | null
  card_brand?: string | null
  card_last4?: string | null
  paypal_email?: string | null
  buyer_email?: string | null
  buyer_first_name?: string | null
  buyer_last_name?: string | null
  buyer_country?: string | null
  buyer_country_code?: string | null
  buyer_device_type?: string | null
  buyer_os?: string | null
  buyer_browser?: string | null
  receipt_token?: string | null
  stripe_session_id?: string | null
  stripe_payment_intent_id?: string | null
  refund_reason?: string | null
  refund_amount_cents?: number | null
  refunded_at?: string | null
  buyer_notified_at?: string | null
  buyer_email_last_error?: string | null
  variant_name?: string | null
  source?: string | null
  /** Where the checkout began (lib/orders/order-source), as the row holds it. */
  source_detail?: unknown
  /** A physical order's checkout (lib/physical), its units on this line, and how far it has shipped. */
  checkout_id?: string | null
  quantity?: number | null
  physical_fulfillment?: string | null
  /** The checkout's return status (lib/physical/status returnStatusOf). */
  physical_return?: string | null
  /** The delivery the buyer chose: the rate's name ("Standard"), and whether they collect it. */
  physical_method?: string | null
  physical_pickup?: boolean | null
  /** A parcel of this order is marked as a delivery problem (a fulfillment with status failed). */
  physical_problem?: boolean | null
  /** This line's share of what the buyer paid for delivery, inside `amount_cents` (lib/physical/checkout-server). */
  shipping_cents?: number | null
  /** Which of the creator's places sold it (supabase/sql/run-now part 60); absent on an older database. */
  property_type?: string | null
  property_id?: string | null
  /** Settings › Taxes: the tax inside `amount_cents`, and whether it was part of the price or added on top. */
  tax_cents?: number | null
  tax_included?: boolean | null
  /** "VAT 19%", as the checkout named the tax (SQL part 153; a physical order's from its checkout). */
  tax_label?: string | null
  product?: {
    id: string
    title: string
    type?: string | null
    thumbnail_url?: string | null
  } | null
}

export type PaymentStatus = "paid" | "pending" | "refunded" | "partially_refunded" | "failed" | "disputed"
export type FulfillmentStatus = "fulfilled" | "unfulfilled"
export type DeliveryStatus = "delivered" | "failed" | null

/**
 * ===========================================================================
 *  WHERE A PHYSICAL ORDER IS, IN ONE WORD
 * ===========================================================================
 * Only for an order with something that ships. A download is fulfilled the
 * moment it is paid and keeps its own two words; a parcel goes through
 * these. Read from the checkout's stored statuses (lib/physical/status
 * recomputes them after every change): a return outranks delivery, since a
 * returned parcel was delivered first.
 */
export type ShipStage = "unfulfilled" | "partially_fulfilled" | "fulfilled" | "delivered" | "partially_returned" | "returned" | "cancelled"

export interface Shipping {
  stage: ShipStage
  /** The rate the buyer chose, "Standard" or "Express"; null when none is recorded. */
  method: string | null
  pickup: boolean
  /** A parcel ran into a delivery problem: the badge says so instead of Fulfilled, as the buyer's order page does. */
  problem?: boolean
}

/** Whether a stage still shows a delivery problem: only while the parcel is out (not delivered, returned or cancelled). */
export function showsProblem(stage: ShipStage, problem: boolean | null | undefined): boolean {
  return !!problem && (stage === "fulfilled" || stage === "partially_fulfilled")
}

export const SHIP_STAGE_LABEL: Record<ShipStage, string> = {
  unfulfilled: "Unfulfilled",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
  delivered: "Delivered",
  partially_returned: "Partially returned",
  returned: "Returned",
  cancelled: "Cancelled",
}

/** Null when nothing in the order ships (or the checkout was never read). Processing is still unfulfilled: nothing has left. */
export function shipStageOf(fulfillment: string | null | undefined, returnStatus?: string | null): ShipStage | null {
  if (!fulfillment || fulfillment === "not_required") return null
  if (fulfillment === "cancelled") return "cancelled"
  if (returnStatus === "returned") return "returned"
  if (returnStatus === "partially_returned") return "partially_returned"
  if (fulfillment === "delivered") return "delivered"
  if (fulfillment === "fulfilled") return "fulfilled"
  if (fulfillment === "partially_fulfilled") return "partially_fulfilled"
  return "unfulfilled"
}

/** The list's Fulfillment filter: the five words a shop looks for. */
export type ShipFilter = "unfulfilled" | "partially_fulfilled" | "fulfilled" | "delivered" | "returned"

export const SHIP_FILTERS: Array<{ value: ShipFilter; label: string }> = [
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "partially_fulfilled", label: "Partially fulfilled" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
]

export function isShipFilter(value: unknown): value is ShipFilter {
  return SHIP_FILTERS.some((f) => f.value === value)
}

export function inShipFilter(order: Pick<Order, "shipping">, filter: ShipFilter | "any"): boolean {
  if (filter === "any") return true
  const stage = order.shipping?.stage
  if (!stage) return false
  return filter === "returned" ? stage === "returned" || stage === "partially_returned" : stage === filter
}

export interface Order {
  /** The first row's id. The address of the order's page. */
  id: string
  number: number
  createdAt: string
  lines: OrderRow[]
  customerName: string | null
  customerEmail: string | null
  source: OrderSource | null
  /** Which page and where the visit came from; null when nothing was recorded. */
  sourceDetail: OrderOrigin | null
  subtotalCents: number
  tipCents: number
  /** The tax in the total: added on top unless `taxIncluded`. */
  taxCents: number
  taxIncluded: boolean
  /** "VAT 19%" when the order's lines agree on one; "Tax" otherwise. */
  taxLabel: string
  /** What the buyer paid for delivery, inside the total; 0 for an order that ships nothing. */
  shippingCents: number
  totalCents: number
  feeCents: number
  refundedCents: number
  itemCount: number
  payment: PaymentStatus
  fulfillment: FulfillmentStatus
  delivery: DeliveryStatus
  deliveredAt: string | null
  /** An order with something to ship: where it is and how it goes. Null for downloads, courses and memberships. */
  shipping: Shipping | null
}

/** Shopify starts at #1001, and so does everything a creator will compare this with. */
export const FIRST_ORDER_NUMBER = 1001
export const PAGE_SIZE = 50

function refundedCentsOf(row: OrderRow): number {
  if (row.status !== "refunded") return 0
  const whole = row.amount_cents || 0
  const recorded = row.refund_amount_cents
  return typeof recorded === "number" && recorded > 0 ? Math.min(recorded, whole) : whole
}

function nameOf(row: OrderRow): string | null {
  const name = [row.buyer_first_name, row.buyer_last_name]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ")
  return name || null
}

function sourceOf(rows: OrderRow[]): OrderSource | null {
  for (const row of rows) {
    if (row.source === "website" || row.source === "storelib") return row.source
  }
  /* A basket is only filled on a website, whether or not the column exists
     yet to say so. */
  if (rows.length > 1) return "website"
  return null
}

function sourceDetailOf(rows: OrderRow[]): OrderOrigin | null {
  for (const row of rows) {
    const detail = cleanOrigin(row.source_detail ?? null)
    if (detail) return detail
  }
  return null
}

function paymentOf(rows: OrderRow[], totalCents: number, refundedCents: number): PaymentStatus {
  if (rows.every((r) => r.status === "failed")) return "failed"
  if (rows.some((r) => r.status === "pending")) return "pending"
  /* The buyer's bank has taken the money back while it decides
     (app/api/stripe/webhook, charge.dispute.*). It read as "Paid", and so as
     a sale in every figure, including after a dispute was lost: a lost
     dispute stays "disputed" for good. A won one goes back to "completed". */
  if (rows.some((r) => r.status === "disputed")) return "disputed"
  if (refundedCents > 0) {
    return totalCents > 0 && refundedCents < totalCents ? "partially_refunded" : "refunded"
  }
  return "paid"
}

/**
 * ===========================================================================
 *  WHICH ORDERS ARE SALES
 * ===========================================================================
 * The one test every figure uses: Home, Analytics, the Orders page's own
 * figures and a website's performance. A failed or unfinished payment is no
 * sale, and neither is one in dispute, whose money the bank is holding and
 * may never give back. Each page had its own copy of this, and the copies
 * disagreed about disputes: Analytics counted a disputed order as a full
 * sale in Total sales while leaving it out of Sales by product, so the two
 * cards did not add up.
 */
export function isSale(order: Pick<Order, "payment">): boolean {
  return order.payment !== "failed" && order.payment !== "pending" && order.payment !== "disputed"
}

/**
 * Rows in, orders out, newest first. Numbers are given oldest first, so an
 * order keeps its number as newer ones arrive.
 */
export function groupOrders(rows: OrderRow[]): Order[] {
  const groups = new Map<string, OrderRow[]>()
  for (const row of rows) {
    const key = row.stripe_session_id ? `s:${row.stripe_session_id}` : `o:${row.id}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const orders: Order[] = []
  for (const lines of groups.values()) {
    lines.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    const first = lines[0]
    /* `amount_cents` is what was charged, the tip already inside it (the
       PaymentIntent's amount), so the tip is taken out for the subtotal and
       not added again for the total. */
    const tipCents = lines.reduce((n, r) => n + (r.tip_cents || 0), 0)
    const totalCents = lines.reduce((n, r) => n + (r.amount_cents || 0), 0)
    const taxCents = lines.reduce((n, r) => n + Math.max(0, r.tax_cents || 0), 0)
    const taxIncluded = taxCents > 0 && lines.filter((r) => (r.tax_cents || 0) > 0).every((r) => r.tax_included === true)
    const taxLabels = [...new Set(lines.filter((r) => (r.tax_cents || 0) > 0).map((r) => (r.tax_label || "").trim()).filter(Boolean))]
    /* Delivery paid on a physical order is in the amount too, shared over its lines. */
    const shippingCents = lines.reduce((n, r) => n + Math.max(0, r.shipping_cents || 0), 0)
    /* Tax added on top is in the amount too: the subtotal is the items, the tax and delivery their own rows. */
    const subtotalCents = Math.max(0, totalCents - tipCents - (taxIncluded ? 0 : taxCents) - shippingCents)
    const shipped = lines.find((r) => r.physical_fulfillment)
    const stage = shipped ? shipStageOf(shipped.physical_fulfillment, shipped.physical_return) : null
    const refundedCents = lines.reduce((n, r) => n + refundedCentsOf(r), 0)
    const delivered = lines.map((r) => r.buyer_notified_at).filter((d): d is string => !!d).sort()
    const emailFailed = lines.some((r) => !r.buyer_notified_at && (r.buyer_email_last_error || "").trim())
    const payment = paymentOf(lines, totalCents, refundedCents)

    orders.push({
      id: first.id,
      number: 0,
      createdAt: first.created_at,
      lines,
      customerName: lines.map(nameOf).find(Boolean) ?? null,
      customerEmail: lines.map((r) => (r.buyer_email || "").trim()).find(Boolean) || null,
      source: sourceOf(lines),
      sourceDetail: sourceDetailOf(lines),
      subtotalCents,
      tipCents,
      taxCents,
      taxIncluded,
      taxLabel: taxLabels.length === 1 ? taxLabels[0] : "Tax",
      shippingCents,
      totalCents,
      feeCents: lines.reduce((n, r) => n + (r.fee_cents || 0), 0),
      refundedCents,
      itemCount: lines.reduce((n, r) => n + Math.max(1, r.quantity ?? 1), 0),
      payment,
      /* Something to ship: fulfilled once it has all shipped or arrived (or needs no shipping, or was cancelled). */
      fulfillment: lines.some((r) => r.physical_fulfillment)
        ? lines.every((r) => !r.physical_fulfillment || r.physical_fulfillment === "fulfilled" || r.physical_fulfillment === "delivered" || r.physical_fulfillment === "cancelled" || r.physical_fulfillment === "not_required")
          ? "fulfilled"
          : "unfulfilled"
        : lines.some((r) => r.status === "completed" || r.status === "refunded")
          ? "fulfilled"
          : "unfulfilled",
      delivery: delivered.length > 0 ? "delivered" : emailFailed ? "failed" : null,
      deliveredAt: delivered.at(-1) ?? null,
      shipping: stage && shipped ? { stage, method: shipped.physical_method ?? null, pickup: shipped.physical_pickup === true, problem: lines.some((r) => r.physical_problem === true) } : null,
    })
  }

  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  orders.forEach((order, i) => {
    order.number = FIRST_ORDER_NUMBER + i
  })
  return orders.reverse()
}

/* ─── Time, in the creator's zone ─────────────────────────────────────── */

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Milliseconds since that zone's midnight, for the instant `ms`. */
function sinceMidnight(ms: number, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(ms))
  } catch {
    return sinceMidnight(ms, "UTC")
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second")) * 1000 + (ms % 1000)
}

/**
 * The instant the day `ms` falls on began, on that zone's clock. Not `ms`
 * less the clock's time since midnight: on the two days a year the clocks
 * change, the clock is an hour off the time that has passed, and each chart
 * cut its day an hour wrong (Los Angeles' 1 November began at 1 am, its
 * first hour counted on 31 October). lib/date-range/range midnightOf is
 * right on those days.
 */
export function startOfDay(ms: number, timeZone: string): number {
  const midnight = midnightOf(todayIn(timeZone, ms), timeZone)
  return Number.isFinite(midnight) && midnight <= ms ? midnight : ms - sinceMidnight(ms, timeZone)
}

/* ─── The list: views, search, filters, pages ─────────────────────────── */

export type View = "all" | "unfulfilled" | "paid" | "pending" | "refunded"

export const VIEWS: Array<{ value: View; label: string }> = [
  { value: "all", label: "All" },
  /* Shopify's own second tab: what is still to send. Shown only to a shop with something to ship (the list hides empty views). */
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Payment pending" },
  { value: "refunded", label: "Refunded" },
]

export function isView(value: unknown): value is View {
  return VIEWS.some((v) => v.value === value)
}

export function inView(order: Order, view: View): boolean {
  switch (view) {
    case "all":
      return true
    case "unfulfilled":
      return (order.shipping?.stage === "unfulfilled" || order.shipping?.stage === "partially_fulfilled") && order.payment !== "refunded" && isSale(order)
    case "paid":
      return order.payment === "paid"
    case "pending":
      return order.payment === "pending"
    case "refunded":
      return order.payment === "refunded" || order.payment === "partially_refunded"
  }
}

export type Sort = "newest" | "oldest" | "total_desc" | "total_asc"

export const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "total_desc", label: "Highest total" },
  { value: "total_asc", label: "Lowest total" },
]

export function isSort(value: unknown): value is Sort {
  return SORTS.some((s) => s.value === value)
}

export interface ListQuery {
  view: View
  q: string
  source: OrderSource | "any"
  product: string
  /** Physical orders only: where they are (SHIP_FILTERS). */
  fulfillment?: ShipFilter | "any"
  sort: Sort
  page: number
}

export const DEFAULT_QUERY: ListQuery = { view: "all", q: "", source: "any", product: "", fulfillment: "any", sort: "newest", page: 1 }

export function matchesSearch(order: Order, q: string): boolean {
  const needle = q.trim().toLowerCase().replace(/^#/, "")
  if (!needle) return true
  if (String(order.number).startsWith(needle)) return true
  if (order.id.toLowerCase().startsWith(needle)) return true
  const haystack = [
    order.customerName,
    order.customerEmail,
    ...order.lines.map((l) => l.product?.title),
  ]
  return haystack.some((s) => (s || "").toLowerCase().includes(needle))
}

/**
 * The orders the table shows: inside the page's date range (when there is
 * one), in the open view, through the filters and the search, in the order
 * asked for. Newest first unless told otherwise.
 */
export function filterOrders(orders: Order[], query: ListQuery, within?: { start: number; end: number } | null): Order[] {
  const list = orders.filter((o) => {
    if (within) {
      const at = Date.parse(o.createdAt)
      if (!(at >= within.start && at < within.end)) return false
    }
    return (
      inView(o, query.view) &&
      (query.source === "any" || o.source === query.source) &&
      (!query.product || o.lines.some((l) => l.product_id === query.product)) &&
      inShipFilter(o, query.fulfillment ?? "any") &&
      matchesSearch(o, query.q)
    )
  })
  const byDate = (a: Order, b: Order) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number
  switch (query.sort) {
    case "oldest":
      return list.sort((a, b) => -byDate(a, b))
    case "total_desc":
      return list.sort((a, b) => b.totalCents - a.totalCents || byDate(a, b))
    case "total_asc":
      return list.sort((a, b) => a.totalCents - b.totalCents || byDate(a, b))
    default:
      return list.sort(byDate)
  }
}

export function pageOf<T>(items: T[], page: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const fromIndex = (current - 1) * PAGE_SIZE
  const slice = items.slice(fromIndex, fromIndex + PAGE_SIZE)
  return {
    items: slice,
    page: current,
    pages,
    from: slice.length ? fromIndex + 1 : 0,
    to: fromIndex + slice.length,
  }
}

/** The list's state lives in the address, so a reload or a shared link lands on the same rows. */
export function queryFromParams(params: { get(name: string): string | null }): ListQuery {
  const view = params.get("view")
  const source = params.get("source")
  const fulfillment = params.get("fulfillment")
  return {
    view: isView(view) ? view : "all",
    q: (params.get("q") || "").slice(0, 200),
    source: source === "website" || source === "storelib" ? source : "any",
    product: params.get("product") || "",
    /* Only when one is chosen: an address without it reads as it always did. */
    ...(isShipFilter(fulfillment) ? { fulfillment } : {}),
    sort: isSort(params.get("sort")) ? (params.get("sort") as Sort) : "newest",
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
  }
}

export function paramsFromQuery(query: ListQuery, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base)
  const set = (name: string, value: string, fallback: string) => {
    if (value && value !== fallback) params.set(name, value)
    else params.delete(name)
  }
  set("view", query.view, "all")
  set("q", query.q.trim(), "")
  set("source", query.source, "any")
  set("product", query.product, "")
  set("fulfillment", query.fulfillment ?? "any", "any")
  set("sort", query.sort, "newest")
  set("page", String(query.page), "1")
  return params
}

/* ─── Columns ─────────────────────────────────────────────────────────── */

export type ColumnKey =
  | "date"
  | "customer"
  | "source"
  | "total"
  | "payment"
  | "fulfillment"
  | "items"
  | "delivery"
  | "method"

export const COLUMNS: Array<{ key: ColumnKey; label: string; align?: "right" }> = [
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "source", label: "Source" },
  { key: "total", label: "Total", align: "right" },
  { key: "payment", label: "Payment status" },
  { key: "fulfillment", label: "Fulfillment status" },
  { key: "items", label: "Items" },
  { key: "delivery", label: "Delivery status" },
  { key: "method", label: "Delivery method" },
]

/** Hidden columns are kept in a cookie so the server renders the table the creator left. */
export const COLUMNS_COOKIE = "storelib_order_columns"

export function hiddenColumnsFrom(cookie: string | undefined | null): ColumnKey[] {
  if (!cookie) return []
  const known = new Set(COLUMNS.map((c) => c.key))
  return cookie
    .split(".")
    .filter((k): k is ColumnKey => known.has(k as ColumnKey))
}

/* ─── Words ───────────────────────────────────────────────────────────── */

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  pending: "Payment pending",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  failed: "Failed",
  disputed: "Disputed",
}

export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  fulfilled: "Fulfilled",
  unfulfilled: "Unfulfilled",
}

export const SOURCE_LABEL: Record<OrderSource, string> = {
  storelib: "Storelib",
  website: "Website",
}

export function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`
}

/* ─── Dates ───────────────────────────────────────────────────────────── */

function formatIn(ms: number, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(new Date(ms))
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(ms))
  }
}

function clock(ms: number, timeZone: string): string {
  return formatIn(ms, timeZone, { hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm")
}

/** "Today at 9:40 am", "Yesterday at 6:02 pm", "Apr 7 at 9:40 am", "Apr 7, 2024". */
export function listDate(iso: string, now: number, timeZone: string): string {
  const ms = Date.parse(iso)
  const today = startOfDay(now, timeZone)
  if (ms >= today) return `Today at ${clock(ms, timeZone)}`
  if (ms >= today - DAY) return `Yesterday at ${clock(ms, timeZone)}`
  const sameYear = formatIn(ms, timeZone, { year: "numeric" }) === formatIn(now, timeZone, { year: "numeric" })
  if (sameYear) return `${formatIn(ms, timeZone, { month: "short", day: "numeric" })} at ${clock(ms, timeZone)}`
  return formatIn(ms, timeZone, { month: "short", day: "numeric", year: "numeric" })
}

/** "April 7, 2025 at 9:40 am". */
export function fullDate(iso: string, timeZone: string): string {
  const ms = Date.parse(iso)
  return `${formatIn(ms, timeZone, { month: "long", day: "numeric", year: "numeric" })} at ${clock(ms, timeZone)}`
}

/** "9:40 am". */
export function timeOfDay(iso: string, timeZone: string): string {
  return clock(Date.parse(iso), timeZone)
}

/** "Today", "Yesterday", "April 7", "April 7, 2024": a heading for a day's events. */
export function dayHeading(iso: string, now: number, timeZone: string): string {
  const ms = Date.parse(iso)
  const today = startOfDay(now, timeZone)
  if (ms >= today && ms < today + DAY) return "Today"
  if (ms >= today - DAY && ms < today) return "Yesterday"
  const sameYear = formatIn(ms, timeZone, { year: "numeric" }) === formatIn(now, timeZone, { year: "numeric" })
  return formatIn(ms, timeZone, sameYear ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" })
}
