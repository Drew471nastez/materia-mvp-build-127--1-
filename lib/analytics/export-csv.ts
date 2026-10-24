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
import { guardFormula } from "@/lib/csv/formula-guard"
import type { Reports, BreakdownRow, Series } from "./reports"
import type { SalesBreakdown, ChannelRow, CommercePoint, FulfillmentFigures } from "./commerce"
import type { Sections } from "./sections"
import { minorUnits } from "@/lib/markets/money"
import { bucketLabel, type Grain } from "./buckets"
import { roundShares } from "./percent"

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
  /** The breakdown for each kind, when every kind is counted together (lib/analytics/commerce). */
  kinds?: { digital: SalesBreakdown; physical: SalesBreakdown } | null
}

/** One cell: quoted when it holds a comma, a quote or a line break; a leading = + - @ is kept as text, never run as a formula. */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return ""
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v)
  if (typeof v !== "number" && !/^-?\d+(\.\d+)?$/.test(s)) s = guardFormula(s)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const line = (xs: unknown[]) => xs.map(cell).join(",")

/** Minor units as major, with the currency's decimals: 1250 USD is 12.50, 2500 JPY is 2500. */
export function major(minor: number, currency: string): string {
  const d = minorUnits(currency)
  return (Math.round(minor) / 10 ** d).toFixed(d)
}

const pct = (f: number | null | undefined) => (f === null || f === undefined || !Number.isFinite(f) ? "" : (f * 100).toFixed(1))

/**
 * A list's shares with one decimal. When the rows are the whole (their
 * shares add up to 1, nothing cut off the list), rounded so they add up to
 * exactly 100.0 (lib/analytics/percent roundShares); a cut list keeps each
 * row's own share of everything.
 */
export function sharesOf(rows: Array<{ value: number; share: number }>): string[] {
  const whole = Math.abs(rows.reduce((a, r) => a + (Number.isFinite(r.share) ? r.share : 0), 0) - 1) < 1e-9
  if (!whole) return rows.map((r) => pct(r.share))
  return roundShares(rows.map((r) => r.value), 1).map((s) => s.toFixed(1))
}

/**
 * THE REPORTS ONE CAN CHOOSE IN THE EXPORT, in the page's order. Each is one
 * or more sections of the file; the modal lists them (app/app/analytics/
 * export-dialog) and the route takes `reports=` as a list of these ids.
 */
export const EXPORT_REPORTS = ["summary", "over-time", "sales", "traffic", "pages", "products", "funnel", "subscribers", "countries", "devices"] as const
export type ExportReport = (typeof EXPORT_REPORTS)[number]

export const EXPORT_REPORT_NAME: Record<ExportReport, string> = {
  summary: "Summary",
  "over-time": "Over time",
  sales: "Sales",
  traffic: "Traffic sources and referrers",
  pages: "Pages and links",
  products: "Products and downloads",
  funnel: "Funnel",
  subscribers: "Subscribers",
  countries: "Countries",
  devices: "Devices and systems",
}

/** `reports=summary,sales` from an address, only ids that exist, in the page's order; nothing asked is everything. */
export function parseExportReports(raw: string | null | undefined): ExportReport[] {
  const asked = new Set(String(raw ?? "").split(",").map((s) => s.trim()))
  const picked = EXPORT_REPORTS.filter((id) => asked.has(id))
  return picked.length ? picked : [...EXPORT_REPORTS]
}

export interface ExportInput {
  meta: ExportMeta
  reports: Reports
  commerce: ExportCommerce | null
  sections: Sections
  timeZone: string
  /** The reports chosen; left out, every one. */
  only?: readonly ExportReport[]
}

interface Part {
  report: ExportReport
  title: string
  lines: string[]
}

/** The file's head: the store, the period, the comparison, the time zone, the place and the currency. */
function headOf(meta: ExportMeta): string[] {
  const ccy = meta.currency
  return [
    line(["Storelib analytics"]),
    line(["Store", meta.store]),
    line(["Period", `${meta.from} to ${meta.to}`]),
    line(["Compared with", meta.comparedFrom && meta.comparedTo ? `${meta.comparedFrom} to ${meta.comparedTo}` : "Nothing"]),
    line(["Time zone", meta.timeZone]),
    line(["Place", meta.place]),
    line(["Sales", meta.sales]),
    line(["Currency", `${ccy}, amounts in ${ccy} with ${minorUnits(ccy)} decimals`]),
    line(["Made", meta.madeAt]),
    "",
  ]
}

/** Every section of the export, each under the report it belongs to. */
function partsOf(input: ExportInput): Part[] {
  const { meta, reports: r, commerce: c, sections } = input
  const ccy = meta.currency
  const money = (n: number) => major(n, ccy)
  const parts: Part[] = []
  let report: ExportReport = "summary"
  const section = (title: string, header: string[], rows: unknown[][]) => {
    parts.push({ report, title, lines: [line([title]), line(header), ...rows.map(line), ""] })
  }
  const compared = r.compared

  const before = (h: { previous: number }) => (compared ? h.previous : "")
  report = "summary"
  section("Summary", ["Metric", "This period", "Previous period"], [
    ["Visitors", r.visitors.value, before(r.visitors)],
    ["Page views", r.views.value, before(r.views)],
    ["Visits", r.sessions.value, before(r.sessions)],
    ["Link clicks", r.linkClicks.value, compared ? sum(r.linkClicks.series.previous) : ""],
    ["Orders", r.orders.value, before(r.orders)],
    [`Total sales (${ccy})`, money(r.sales.value), compared ? money(r.sales.previous) : ""],
    ["Conversion rate (%)", pct(r.conversion.value), compared ? pct(r.conversion.previous) : ""],
    /* Dated by the refund, whatever day the order was placed (lib/analytics/refund-dates). */
    ["Refunds", r.refunds.value, compared ? r.refunds.previous : ""],
    [`Refunded (${ccy})`, money(r.refunds.cents), compared ? money(r.refunds.previousCents) : ""],
  ])

  report = "over-time"
  const over = (s: Series) => s.current
  section("Over time", ["Date", "Visitors", "Page views", "Visits", "Link clicks", "Orders", `Total sales (${ccy})`, "Refunds"], r.visitors.series.labels.map((label, i) => [
    label,
    over(r.visitors.series)[i] ?? 0,
    over(r.views.series)[i] ?? 0,
    over(r.sessions.series)[i] ?? 0,
    over(r.linkClicks.series)[i] ?? 0,
    over(r.orders.series)[i] ?? 0,
    money(over(r.sales.series)[i] ?? 0),
    over(r.refunds.series)[i] ?? 0,
  ]))

  if (c && sections.sales) {
    report = "sales"
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
    /* A store selling both kinds: each line for Digital and for Physical beside the whole, as the card shows them. */
    const kinds = sections.productKinds && c.kinds ? c.kinds : null
    section(
      "Total sales breakdown",
      ["Line", `This period (${ccy})`, ...(kinds ? [`Digital (${ccy})`, `Physical (${ccy})`] : []), `Previous period (${ccy})`],
      rows.map(([label, k]) => [label, signed(k, b[k] as number), ...(kinds ? [signed(k, kinds.digital[k] as number), signed(k, kinds.physical[k] as number)] : []), compared ? signed(k, p[k] as number) : ""]),
    )

    section("Total sales over time", ["Date", `Total sales (${ccy})`, "Orders", `Average order value (${ccy})`, ...(compared ? [`Previous total sales (${ccy})`, "Previous orders"] : [])], c.series.map((pt, i) => [
      bucketLabel(pt.t, c.grain, input.timeZone),
      money(pt.total),
      pt.orders,
      money(pt.aov),
      ...(compared ? [money(c.previousSeries[i]?.total ?? 0), c.previousSeries[i]?.orders ?? 0] : []),
    ]))

    section("Total sales by channel", ["Channel", `Total sales (${ccy})`, "Orders"], c.channels.map((ch) => [ch.label, money(ch.total), ch.orders]))

    const figures: unknown[][] = [
      [`Average order value (${ccy})`, b.orders ? money(b.aov) : "", compared && p.orders ? money(p.aov) : ""],
      /* No customer, no rate: blank, as the page writes "–", never 0.0. */
      ["Returning customer rate (%)", b.customers ? pct(b.returningRate) : "", compared && p.customers ? pct(p.returningRate) : ""],
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

  const listOf = (title: string, name: string, rows: BreakdownRow[], value = "Visits") => {
    const shares = sharesOf(rows)
    section(title, [name, value, ...(compared ? ["Previous period"] : []), "Share (%)"], rows.map((x, i) => [x.label, x.value, ...(compared ? [x.previous] : []), shares[i]]))
  }
  const b = r.breakdowns
  report = "traffic"
  listOf("Traffic sources", "Source", b.source)
  listOf("Social", "Network", b.social)
  listOf("Campaigns", "Campaign", b.campaign)
  listOf("Referrers", "Referrer", b.referrer)
  report = "pages"
  section("Top pages", ["Page", "Title", "Place", "Page views", "Visitors"], r.topPages.map((x) => [x.label, x.title ?? "", x.place ?? "", x.views, x.visitors]))
  if (r.topLinks.length) section("Link clicks by link", ["Link", "Clicks", "People"], r.topLinks.map((x) => [x.label, x.clicks, x.visitors]))
  report = "products"
  if (sections.topProducts) section("Top products", ["Product", "Kind", `Sales (${ccy})`, "Orders", "Page views"], r.topProducts.map((x) => [x.label, x.kind ?? "", money(x.salesCents), x.orders, x.views]))
  if (sections.downloads && r.digital.downloads) section("Downloads", ["Product", "Downloads", "Orders"], r.digital.top.map((x) => [x.label, x.downloads ?? 0, x.orders]))
  report = "funnel"
  section("Funnel", ["Step", "People", "Of the step before (%)"], r.funnel.map((s) => [s.label, s.recorded ? s.value : "Not recorded", pct(s.rate)]))
  if (sections.subscribers && r.subscribers) {
    report = "subscribers"
    section("Subscribers", ["Metric", "This period", "Previous period"], [["New subscribers", r.subscribers.value, compared ? r.subscribers.previous : ""]])
    if (r.subscribers.byProperty.length) listOf("Subscribers by page", "Page", r.subscribers.byProperty, "Subscribers")
    listOf("Subscribers by source", "Source", r.subscribers.bySource, "Subscribers")
  }
  report = "countries"
  listOf("Countries", "Country", b.country)
  section("Orders by country", ["Country", "Orders", `Sales (${ccy})`], b.orderCountry.map((x) => [x.label, x.value, money(x.extra?.salesCents ?? 0)]))
  report = "devices"
  const osShares = sharesOf(b.os)
  section("Operating systems", ["System", "Visitors", "Page views", "Share (%)"], b.os.map((x, i) => [x.label, x.value, x.extra?.views ?? 0, osShares[i]]))
  listOf("Devices", "Device", b.device)
  listOf("Browsers", "Browser", b.browser)
  return parts
}

const TRUNCATED = () => line(["Note", "This period has more orders than one export reads. Choose a shorter period for every order."])

/** The reports chosen, one section after another in a single file. */
export function analyticsCsv(input: ExportInput): string {
  const only = new Set(input.only ?? EXPORT_REPORTS)
  const out = headOf(input.meta)
  for (const p of partsOf(input)) if (only.has(p.report)) out.push(...p.lines)
  if (input.commerce?.truncated) out.push(TRUNCATED())
  return out.join("\r\n")
}

/** The reports chosen, a file each, every file with the same head: what the zip holds. */
export function analyticsFiles(input: ExportInput): Array<{ report: ExportReport; name: string; csv: string }> {
  const only = new Set(input.only ?? EXPORT_REPORTS)
  const by = new Map<ExportReport, string[]>()
  for (const p of partsOf(input)) {
    if (!only.has(p.report)) continue
    by.set(p.report, [...(by.get(p.report) ?? []), ...p.lines])
  }
  return EXPORT_REPORTS.filter((id) => by.has(id)).map((id) => {
    const out = [...headOf(input.meta), ...(by.get(id) ?? [])]
    if (id === "sales" && input.commerce?.truncated) out.push(TRUNCATED())
    return { report: id, name: `${String(EXPORT_REPORTS.indexOf(id) + 1).padStart(2, "0")}-${id}.csv`, csv: out.join("\r\n") }
  })
}

function sum(xs: number[] | undefined): number {
  return (xs ?? []).reduce((a, b) => a + b, 0)
}

/** "storelib-analytics-2026-10-01-to-2026-10-07.csv" */
export function exportFileName(from: string, to: string, ext: "csv" | "zip" = "csv"): string {
  const safe = (s: string) => s.replace(/[^0-9a-z-]/gi, "")
  return `storelib-analytics-${safe(from)}-to-${safe(to)}.${ext}`
}

/** The two files the export makes: one CSV with every report chosen, or a zip with a CSV per report. */
export type ExportFormat = "csv" | "zip"
export const parseExportFormat = (raw: string | null | undefined): ExportFormat => (raw === "zip" ? "zip" : "csv")
