/**
 * ===========================================================================
 *  ANALYTICS AS ONE CSV FILE
 * ===========================================================================
 * Every report the page shows for the period, place and switch chosen, one
 * section after another in a single file: a title line, a header row, the
 * rows, an empty line. Opens in Numbers, Excel and Google Sheets as it is.
 * Pure, so the route (app/api/analytics/export) and the tests build the same
 * file from the same answers.
 *
 * Amounts are in the store's currency, in major units with the currency's
 * own decimals (12.50, or 2500 for yen), with the code in the column's name.
 * Dates are the store's days in the time zone the file names at the top.
 * A rate is a percentage with one decimal. Nothing is rounded twice: each
 * figure is the very number the page draws.
 */
import type { Reports, BreakdownRow, Series } from "./reports"
import type { SalesBreakdown, ChannelRow, CommercePoint, FulfillmentFigures } from "./commerce"
import type { Sections } from "./sections"
import { minorUnits } from "@/lib/markets/money"
import { bucketLabel, type Grain } from "./buckets"

export interface ExportMeta {
  store: string
  /** "2026-10-01" to "2026-10-07", the store's days. */
  from: string
  to: string
  /** The days compared with, or null for none. */
  comparedFrom: string | null
  comparedTo: string | null
  timeZone: string
  place: string
  /** "All", "Digital" or "Physical". */
  sales: string
  currency: string
  /** When the file was made, ISO. */
  madeAt: string
}

export interface ExportCommerce {
  breakdown: SalesBreakdown
  previous: SalesBreakdown
  series: CommercePoint[]
  previousSeries: CommercePoint[]
  channels: ChannelRow[]
  fulfillmentRate: FulfillmentFigures
  fulfillment: { hours: number | null; shipped: number }
  grain: Grain
  truncated?: boolean
}

/** One cell: quoted when it holds a comma, a quote or a line break; a leading = + - @ is kept as text, never run as a formula. */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return ""
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v)
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number" && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const line = (xs: unknown[]) => xs.map(cell).join(",")

/** Minor units as major, with the currency's decimals: 1250 USD is 12.50, 2500 JPY is 2500. */
export function major(minor: number, currency: string): string {
  const d = minorUnits(currency)
  return (Math.round(minor) / 10 ** d).toFixed(d)
}

const pct = (f: number | null | undefined) => (f === null || f === undefined || !Number.isFinite(f) ? "" : (f * 100).toFixed(1))

export function analyticsCsv(input: { meta: ExportMeta; reports: Reports; commerce: ExportCommerce | null; sections: Sections; timeZone: string }): string {
  const { meta, reports: r, commerce: c, sections } = input
  const ccy = meta.currency
  const money = (n: number) => major(n, ccy)
  const out: string[] = []
  const section = (title: string, header: string[], rows: unknown[][]) => {
    out.push(line([title]))
    out.push(line(header))
    for (const row of rows) out.push(line(row))
    out.push("")
  }
  const compared = r.compared

  out.push(line(["Storelib analytics"]))
  out.push(line(["Store", meta.store]))
  out.push(line(["Period", `${meta.from} to ${meta.to}`]))
  out.push(line(["Compared with", meta.comparedFrom && meta.comparedTo ? `${meta.comparedFrom} to ${meta.comparedTo}` : "Nothing"]))
  out.push(line(["Time zone", meta.timeZone]))
  out.push(line(["Place", meta.place]))
  out.push(line(["Sales", meta.sales]))
  out.push(line(["Currency", `${ccy}, amounts in ${ccy} with ${minorUnits(ccy)} decimals`]))
  out.push(line(["Made", meta.madeAt]))
  out.push("")

  const before = (h: { previous: number }) => (compared ? h.previous : "")
  section("Summary", ["Metric", "This period", "Previous period"], [
    ["Visitors", r.visitors.value, before(r.visitors)],
    ["Page views", r.views.value, before(r.views)],
    ["Visits", r.sessions.value, before(r.sessions)],
    ["Link clicks", r.linkClicks.value, compared ? sum(r.linkClicks.series.previous) : ""],
    ["Orders", r.orders.value, before(r.orders)],
    [`Total sales (${ccy})`, money(r.sales.value), compared ? money(r.sales.previous) : ""],
    ["Conversion rate (%)", pct(r.conversion.value), compared ? pct(r.conversion.previous) : ""],
    ["Refunded orders", sum(r.refunds.series.current), compared ? sum(r.refunds.series.previous) : ""],
  ])

  const over = (s: Series) => s.current
  section("Over time", ["Date", "Visitors", "Page views", "Visits", "Link clicks", "Orders", `Total sales (${ccy})`], r.visitors.series.labels.map((label, i) => [
    label,
    over(r.visitors.series)[i] ?? 0,
    over(r.views.series)[i] ?? 0,
    over(r.sessions.series)[i] ?? 0,
    over(r.linkClicks.series)[i] ?? 0,
    over(r.orders.series)[i] ?? 0,
    money(over(r.sales.series)[i] ?? 0),
  ]))

  if (c && sections.sales) {
    const b = c.breakdown
    const p = c.previous
    const rows: Array<[string, keyof SalesBreakdown]> = [
      ["Gross sales", "gross"],
      ["Discounts", "discounts"],
      ["Returns", "returns"],
      ["Net sales", "net"],
      ...(sections.shipping ? ([["Shipping charges", "shipping"]] as Array<[string, keyof SalesBreakdown]>) : []),
      ["Taxes", "taxes"],
      ["Tips", "tips"],
      ["Total sales", "total"],
    ]
    const signed = (k: keyof SalesBreakdown, v: number) => (k === "discounts" || k === "returns" ? money(-v) : money(v))
    section("Total sales breakdown", ["Line", `This period (${ccy})`, `Previous period (${ccy})`], rows.map(([label, k]) => [label, signed(k, b[k] as number), compared ? signed(k, p[k] as number) : ""]))

    section("Total sales over time", ["Date", `Total sales (${ccy})`, "Orders", `Average order value (${ccy})`, ...(compared ? [`Previous total sales (${ccy})`, "Previous orders"] : [])], c.series.map((pt, i) => [
      bucketLabel(pt.t, c.grain, input.timeZone),
      money(pt.total),
      pt.orders,
      money(pt.aov),
      ...(compared ? [money(c.previousSeries[i]?.total ?? 0), c.previousSeries[i]?.orders ?? 0] : []),
    ]))

    section("Total sales by channel", ["Channel", `Total sales (${ccy})`, "Orders"], c.channels.map((ch) => [ch.label, money(ch.total), ch.orders]))

    const figures: unknown[][] = [
      [`Average order value (${ccy})`, money(b.aov), compared ? money(p.aov) : ""],
      ["Returning customer rate (%)", pct(b.returningRate), compared ? pct(p.returningRate) : ""],
      ["Customers", b.customers, compared ? p.customers : ""],
      ["Returning customers", b.returningCustomers, compared ? p.returningCustomers : ""],
    ]
    if (sections.fulfillment) {
      figures.push(["Order fulfillment rate (%)", pct(c.fulfillmentRate.rate), ""])
      figures.push(["Physical orders", c.fulfillmentRate.orders, ""])
      figures.push(["Fulfilled", c.fulfillmentRate.fulfilled, ""])
      figures.push(["Average hours to ship", c.fulfillment.hours === null ? "" : c.fulfillment.hours.toFixed(1), ""])
    }
    section("Customers and orders", ["Metric", "This period", "Previous period"], figures)
  }

  const listOf = (title: string, name: string, rows: BreakdownRow[], value = "Visits") =>
    section(title, [name, value, ...(compared ? ["Previous period"] : []), "Share (%)"], rows.map((x) => [x.label, x.value, ...(compared ? [x.previous] : []), pct(x.share)]))
  const b = r.breakdowns
  listOf("Traffic sources", "Source", b.source)
  listOf("Social", "Network", b.social)
  listOf("Campaigns", "Campaign", b.campaign)
  listOf("Referrers", "Referrer", b.referrer)
  section("Top pages", ["Page", "Title", "Place", "Page views", "Visitors"], r.topPages.map((x) => [x.label, x.title ?? "", x.place ?? "", x.views, x.visitors]))
  if (r.topLinks.length) section("Link clicks by link", ["Link", "Clicks", "People"], r.topLinks.map((x) => [x.label, x.clicks, x.visitors]))
  if (sections.topProducts) section("Top products", ["Product", "Kind", `Sales (${ccy})`, "Orders", "Page views"], r.topProducts.map((x) => [x.label, x.kind ?? "", money(x.salesCents), x.orders, x.views]))
  if (sections.downloads && r.digital.downloads) section("Downloads", ["Product", "Downloads", "Orders"], r.digital.top.map((x) => [x.label, x.downloads ?? 0, x.orders]))
  section("Funnel", ["Step", "People", "Of the step before (%)"], r.funnel.map((s) => [s.label, s.recorded ? s.value : "Not recorded", pct(s.rate)]))
  if (sections.subscribers && r.subscribers) {
    section("Subscribers", ["Metric", "This period", "Previous period"], [["New subscribers", r.subscribers.value, compared ? r.subscribers.previous : ""]])
    if (r.subscribers.byProperty.length) listOf("Subscribers by page", "Page", r.subscribers.byProperty, "Subscribers")
    listOf("Subscribers by source", "Source", r.subscribers.bySource, "Subscribers")
  }
  listOf("Countries", "Country", b.country)
  section("Orders by country", ["Country", "Orders", `Sales (${ccy})`], b.orderCountry.map((x) => [x.label, x.value, money(x.extra?.salesCents ?? 0)]))
  section("Operating systems", ["System", "Visitors", "Page views", "Share (%)"], b.os.map((x) => [x.label, x.value, x.extra?.views ?? 0, pct(x.share)]))
  listOf("Devices", "Device", b.device)
  listOf("Browsers", "Browser", b.browser)
  if (c?.truncated) out.push(line(["Note", "This period has more orders than one export reads. Choose a shorter period for every order."]))
  return out.join("\r\n")
}

function sum(xs: number[] | undefined): number {
  return (xs ?? []).reduce((a, b) => a + b, 0)
}

/** "storelib-analytics-2026-10-01-to-2026-10-07.csv" */
export function exportFileName(from: string, to: string): string {
  const safe = (s: string) => s.replace(/[^0-9a-z-]/gi, "")
  return `storelib-analytics-${safe(from)}-to-${safe(to)}.csv`
}
