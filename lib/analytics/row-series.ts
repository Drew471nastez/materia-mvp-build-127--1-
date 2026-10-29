/**
 * ===========================================================================
 *  EACH ROW'S OWN LINE, FOR A REPORT THAT IS OPENED
 * ===========================================================================
 * A report's drill-down (app/app/analytics/report-detail) draws every row
 * with a small line of that row over the period: a page's views, a link's
 * clicks, a source's or a country's visits, a product's sales. Asked for
 * only when a report is opened (app/api/analytics/rows), never with the
 * page's own answer, which stays the size it was.
 *
 * COUNTED THE WAY THE ROW IS. Each line is the row's own number split over
 * the chart's buckets, by the rule that counted the row (lib/analytics/
 * reports.ts): a page's views at the moment of each view, a link's clicks
 * likewise, a breakdown's visits where each visit began (its first page, on
 * its 15 minute slot, a visit begun again after a gap of more than a UTC
 * day), a product's sales on the order's day less its refunds on the
 * refund's day. So a line adds up to its row, and the database's count
 * (analytics_row_series, supabase/sql/run-now part 331) and this file's,
 * from the rows, give the same numbers (tests/analytics-row-series.test.ts).
 *
 * The stored keys are folded into the row's own keys here, by the very
 * function the cards fold them with (reports.ts breakdownKeyer), so a
 * referrer's line is its company's, whichever of its addresses sent it.
 */
import { bucketIndex, type Span } from "./buckets"
import { breakdownKeyer, lineMoney, periodsOf, salesFor, type BreakdownKind, type StepRow, type ViewRow } from "./reports"
import { counts, type PropertySelector } from "./properties"
import { lineInMode, type SalesMode } from "./sections"
import { refundsIn } from "./refund-dates"
import type { OrderRow } from "@/lib/orders/order-view"

/** What a row's line can be of: the rows of the reports that have one. */
export const ROW_DIMS = ["page", "link", "nav", "product", "source", "social", "referrer", "campaign", "country", "device", "browser"] as const
export type RowDim = (typeof ROW_DIMS)[number]

export function isRowDim(v: unknown): v is RowDim {
  return typeof v === "string" && (ROW_DIMS as readonly string[]).includes(v)
}

/** What the database counts for a row dimension: Social is the sources, folded by network. */
export type StoredDim = Exclude<RowDim, "social" | "product">
export function storedDimOf(dim: Exclude<RowDim, "product">): StoredDim {
  return dim === "social" ? "source" : dim
}

/** A line per key, one number per bucket of the chart. */
export type SeriesMap = Record<string, number[]>

/** The most rows given a line in one answer: the busiest first. More than any report lists. */
export const ROW_SERIES_MAX = 100

const DAY = 86_400_000
const SLOT = 15 * 60_000
const utcDay = (ms: number) => Math.floor(ms / DAY) * DAY

/** A page's key, as Top pages keys it (reports.ts topPages). */
export const pageKey = (pt: string | null | undefined, pid: string | null | undefined, path: string | null | undefined) => `${pt ?? ""}|${pid ?? ""}|${path ?? ""}`
/** A link's key, as Top links keys it (reports.ts topLinks). */
export const linkKey = (pt: string | null | undefined, pid: string | null | undefined, link: string) => `${pt ?? ""}|${pid ?? ""}|${link}`
/** An internal click's key: the place, the page it was on, the page it led to and the button's words (lib/analytics/site-clicks). */
export const navKey = (pt: string | null | undefined, pid: string | null | undefined, from: string | null | undefined, to: string | null | undefined, label: string | null | undefined) =>
  `${pt ?? ""}|${pid ?? ""}|${from ?? ""}|${to ?? ""}|${label ?? ""}`

/** The busiest `max` keys, the rest dropped; ties by key, as the SQL orders them. */
export function topSeries(m: SeriesMap, max = ROW_SERIES_MAX): SeriesMap {
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const keys = Object.keys(m).sort((a, b) => total(m[b]) - total(m[a]) || (a < b ? -1 : a > b ? 1 : 0))
  return Object.fromEntries(keys.slice(0, max).map((k) => [k, m[k]]))
}

/**
 * THE STORED KEYS' LINES, COUNTED FROM THE ROWS: what analytics_row_series
 * answers, for a database without it and for the tests. `views` from a day
 * before the period (a visit that runs into it began there) to its end;
 * `steps` the period's link_click and nav_click rows.
 */
export function storedRowSeries(input: {
  views: ViewRow[]
  steps: Array<StepRow & { path?: string | null; link_label?: string | null }>
  window: Span
  timeZone: string
  selector: PropertySelector
  defaultWebsite: string | null
  product: string | null
  dim: StoredDim
}): SeriesMap {
  const { window: w, dim, product } = input
  const { starts } = periodsOf(w, null, input.timeZone)
  const n = starts.length
  const out: SeriesMap = {}
  if (n === 0) return out
  const bump = (key: string, at: number) => {
    const b = bucketIndex(starts, at)
    if (b < 0 || b >= n) return
    ;(out[key] ??= Array.from({ length: n }, () => 0))[b]++
  }
  const placed = (r: { property_type?: string | null; property_id?: string | null }) =>
    !!r.property_type && counts(input.selector, { type: r.property_type as never, id: r.property_id ?? null }, input.defaultWebsite)
  const inside = (at: number) => at >= w.start && at < w.end

  if (dim === "link" || dim === "nav") {
    /* A product chosen has no link clicks (reports.ts wireFromRows): a click is not of a product. */
    if (product) return out
    for (const s of input.steps) {
      if (s.event_type !== (dim === "link" ? "link_click" : "nav_click") || !placed(s)) continue
      const at = Date.parse(s.created_at)
      if (!inside(at)) continue
      bump(dim === "link" ? linkKey(s.property_type, s.property_id, s.link_id || s.link_url || "") : navKey(s.property_type, s.property_id, s.path, s.link_url, s.link_label), at)
    }
    return topSeries(out)
  }

  const views = input.views
    .filter((v) => placed(v) && (!product || v.product_id === product))
    .map((v) => ({ v, at: Date.parse(v.created_at) }))
    .sort((a, b) => a.at - b.at || String(a.v.id ?? "").localeCompare(String(b.v.id ?? "")))

  if (dim === "page") {
    for (const { v, at } of views) if (inside(at)) bump(pageKey(v.property_type, v.property_id, v.path), at)
    return topSeries(out)
  }

  /* A visit begins at its first page, or again after more than the previous UTC day without one (reports.ts wireFromRows). */
  const lastAt = new Map<string, number>()
  for (const { v, at } of views) {
    const visit = v.session_id ? v.session_id : v.visitor_id ? `v:${v.visitor_id}:${new Date(at).toISOString().slice(0, 10)}` : `e:${v.id ?? v.created_at}`
    const key = `${v.property_type}:${v.property_id ?? ""}|${visit}`
    const before = lastAt.get(key)
    lastAt.set(key, at)
    if (before !== undefined && before >= utcDay(at) - DAY) continue
    if (!inside(at)) continue
    const k = storedKeyOf(v, dim)
    if (k !== null) bump(k, Math.floor(at / SLOT) * SLOT)
  }
  return topSeries(out)
}

/** A visit's first page's key for a breakdown, exactly as analytics_property_counts writes it (reports.ts dimsOf). */
function storedKeyOf(r: ViewRow, dim: Exclude<StoredDim, "page" | "link" | "nav">): string | null {
  switch (dim) {
    case "source":
      return r.source_category || "direct"
    case "referrer":
      return (r.referrer_domain || "").replace(/^www\./, "").toLowerCase() || "direct"
    case "campaign":
      return r.utm_campaign || null
    case "device":
      return (r.device_type || "").toLowerCase() || "unknown"
    case "country":
      return (r.country_code || "").toUpperCase() || "unknown"
    case "browser":
      return (r.browser || "").toLowerCase() || "unknown"
  }
}

/**
 * THE ROWS' OWN LINES: the stored keys' lines folded into the keys the
 * report's rows have. A page, a link and an internal click are their own
 * keys; a breakdown's keys are folded by its card's own keyer, and a key the
 * card leaves out (Direct among the referrers, a visit with no country) has
 * no line either.
 */
export function rowSeriesOf(dim: Exclude<RowDim, "product">, stored: SeriesMap, mainDomain: string): SeriesMap {
  if (dim === "page" || dim === "link" || dim === "nav") return stored
  const keyer = breakdownKeyer(dim as BreakdownKind, mainDomain)
  const out: SeriesMap = {}
  for (const [k, xs] of Object.entries(stored)) {
    const row = keyer(k)
    if (!row) continue
    const into = (out[row.key] ??= Array.from({ length: xs.length }, () => 0))
    xs.forEach((x, i) => (into[i] += Number(x) || 0))
  }
  return out
}

/**
 * EACH PRODUCT'S SALES OVER THE PERIOD, as Top products counts them
 * (reports.ts topProducts): each line's charge on the day of its order, less
 * each refund on the day it was made, of the orders the page counts (sales
 * only, for the place chosen, of the kind the switch keeps). A deleted
 * product is the "removed" row.
 */
export function productSalesSeries(input: {
  orders: OrderRow[]
  window: Span
  timeZone: string
  selector: PropertySelector
  defaultWebsite: string | null
  productTitles: Record<string, string>
  productTypes?: Record<string, string | null>
  mode?: SalesMode
  removedKey: string
}): SeriesMap {
  const { window: w } = input
  const { starts } = periodsOf(w, null, input.timeZone)
  const n = starts.length
  const out: SeriesMap = {}
  if (n === 0) return out
  const mode = input.mode ?? "all"
  const sales = salesFor(input.orders, input.selector, input.defaultWebsite)
    .map((o) => (mode === "all" ? o : { ...o, lines: o.lines.filter((l) => lineInMode((input.productTypes ?? {})[l.product_id], mode)) }))
    .filter((o) => o.lines.length > 0)
  const keyOf = (id: string | null | undefined) => (id && input.productTitles[id] ? id : input.removedKey)
  const add = (key: string, at: number, cents: number) => {
    if (!(at >= w.start && at < w.end)) return
    const b = bucketIndex(starts, at)
    if (b < 0 || b >= n) return
    ;(out[key] ??= Array.from({ length: n }, () => 0))[b] += cents
  }
  for (const o of sales) {
    const at = Date.parse(o.createdAt)
    for (const line of o.lines) add(keyOf(line.product_id), at, lineMoney(line).gross)
  }
  for (const e of refundsIn(sales, w, (l) => lineMoney(l).refunded)) add(keyOf(e.line.product_id), e.at, -e.cents)
  return topSeries(out)
}
