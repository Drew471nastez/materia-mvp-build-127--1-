/**
 * ===========================================================================
 *  EVERY TIMEFRAME, EVERY COMPARISON, EVERY FILTER, ON EVERY NUMBER
 * ===========================================================================
 * "Filters (product selected, place/page) and every timeframe (today, 7d,
 * 30d, 90d, 12m, custom, comparisons) apply correctly to every tab and
 * number; timezone correct; prove with tests."
 *
 *   1. Each timeframe is whole days on the seller's clock, the running one
 *      ending now, and its comparison is the instants lib/date-range/range
 *      says (the period just before, cut at the same hour while it runs;
 *      none for All time), across a change of the clocks too. There is no
 *      comparison control, on the owner's word; the comparison is the same
 *      on every number.
 *   2. Those very instants, and the product and the place, go to every read
 *      on the page: the chart and its cards (app/api/analytics/reports), the
 *      sales reports (app/api/analytics/commerce), the communities, and the
 *      reports the seller added, which are drawn from the chart's own answer.
 *   3. The sales reports count in the seller's time zone, in the chart's own
 *      buckets, against the chart's own comparison (they were UTC days, and
 *      a running Today was compared with the hours just before it).
 *   4. Which sections a seller sees, for what they sell and have and for
 *      what is chosen (lib/analytics/sections), and the added reports'
 *      order, kept per seller.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { boundsOf, compareBounds, compareRange, resolveValue, todayIn, type CompareValue, type PresetId } from "../lib/date-range/range"
import { readPeriod, writePeriod } from "../lib/date-range/params"
import { bucketLabel, bucketStarts, grainFor } from "../lib/analytics/buckets"
import { breakdownOf, commerceRowCounts, seriesOf, type CommerceOrderRow } from "../lib/analytics/commerce"
import { commerceKey, commerceQuestionOf } from "../lib/analytics/commerce-cache"
import { reportKey } from "../lib/analytics/report-cache"
import { applyPicked, kindOfProduct, moveReport, normalizeReports, profileOf, reportOptions, reportShown, sectionsFor, REPORT_IDS } from "../lib/analytics/sections"
import { buildReports, type ViewRow } from "../lib/analytics/reports"
import type { OrderRow } from "../lib/orders/order-view"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const HOUR = 3_600_000
const DAY = 24 * HOUR
const hourIn = (ms: number, tz: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(ms))) % 24
const dayIn = (ms: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms))

async function main() {
  console.log("\n1. Every timeframe is whole days on the seller's clock")
  {
    /* Wednesday 28 October 2026, 15:00 in Bucharest: the clocks went back on Sunday the 25th. */
    const TZ = "Europe/Bucharest"
    const NOW = Date.parse("2026-10-28T13:00:00Z")
    const today = todayIn(TZ, NOW)
    check("today is the seller's date, not the server's", today === "2026-10-28", today)
    const days: Record<string, number> = { today: 1, last_7_days: 7, last_30_days: 30, last_90_days: 90 }
    for (const preset of ["today", "last_7_days", "last_30_days", "last_90_days", "last_12_months", "all_time"] as PresetId[]) {
      const period = resolveValue({ preset }, today, "last_7_days", "2026-01-15")
      const span = boundsOf(period, TZ, NOW)
      check(`${preset}: starts at the seller's midnight and runs to now`, hourIn(span.start, TZ) === 0 && span.end === NOW, [new Date(span.start).toISOString(), new Date(span.end).toISOString()])
      if (days[preset]) check(`  ${preset}: ${days[preset]} days, the first ${period.start}`, dayIn(span.start, TZ) === period.start && Math.round((midnightAfter(period.end, TZ) - span.start) / DAY) === days[preset], period)
      if (preset === "last_12_months") check("  last 12 months: from the first of the month a year back", period.start === "2025-11-01", period.start)
      if (preset === "all_time") check("  all time: from the first day there is anything", period.start === "2026-01-15", period.start)
    }
    const week = resolveValue({ preset: "last_7_days" }, today, "last_7_days")
    const weekSpan = boundsOf(week, TZ, NOW)
    const starts = bucketStarts(weekSpan, grainFor(weekSpan), TZ)
    check("a week across the change of the clocks: seven days, each from its own midnight", starts.length === 7 && starts.every((s) => hourIn(s, TZ) === 0), starts.map((s) => new Date(s).toISOString()))
    check("  and the 25th is 25 hours long", starts[starts.indexOf(starts.find((s) => dayIn(s, TZ) === "2026-10-25")!) + 1] - starts.find((s) => dayIn(s, TZ) === "2026-10-25")! === 25 * HOUR)
    const custom = resolveValue({ preset: "custom", start: "2026-09-01", end: "2026-09-30" }, today, "last_7_days")
    const cs = boundsOf(custom, TZ, NOW)
    check("a custom range: its first midnight to the midnight after its last day", dayIn(cs.start, TZ) === "2026-09-01" && hourIn(cs.start, TZ) === 0 && dayIn(cs.end - 1, TZ) === "2026-09-30" && cs.end - cs.start === 30 * DAY, [cs.start, cs.end])
    const future = resolveValue({ preset: "custom", start: "2026-10-20", end: "2026-11-30" }, today, "last_7_days")
    check("  a custom range past today ends today", future.end === "2026-10-28", future.end)

    console.log("\n   ...and every comparison is the instants it says")
    const t = resolveValue({ preset: "today" }, today, "last_7_days")
    const prev = compareBounds(t, { mode: "previous_period" }, TZ, NOW)!
    check("Today against yesterday until the same hour", dayIn(prev.start, TZ) === "2026-10-27" && hourIn(prev.start, TZ) === 0 && prev.end - prev.start === NOW - boundsOf(t, TZ, NOW).start, [new Date(prev.start).toISOString(), new Date(prev.end).toISOString()])
    const wk = compareBounds(week, { mode: "previous_period" }, TZ, NOW)!
    /* Changed on purpose (round AB2): cut at the same time of day on its own last day, on the clock. This week has the 25 hour day in it, so its elapsed hours cut the comparison an hour late (tests/analytics-accuracy.test.ts BUG 4). */
    check("the last 7 days against the 7 before, cut at the same point into the last of them", dayIn(wk.start, TZ) === "2026-10-15" && dayIn(wk.end, TZ) === dayIn(NOW - 7 * DAY, TZ) && hourIn(wk.end, TZ) === hourIn(NOW, TZ) && wk.end - wk.start === NOW - weekSpan.start - HOUR, [dayIn(wk.start, TZ), (wk.end - wk.start) / HOUR])
    const yr = compareRange(custom, { mode: "previous_year" })!
    check("the previous year: the same days a year back", yr.start === "2025-09-01" && yr.end === "2025-09-30", yr)
    check("no comparison: nothing", compareBounds(week, { mode: "none" }, TZ, NOW) === null)
    const asked = readPeriod(new URLSearchParams("range=last_30_days&compare=previous_year"), today, "last_7_days")
    check("the address keeps the period and the comparison", asked.period.preset === "last_30_days" && asked.compare.mode === "previous_year", asked)
    const params = new URLSearchParams("range=last_30_days")
    writePeriod(params, null, { mode: "none" }, "last_7_days")
    check("  and writing a comparison leaves the period as it was", params.get("range") === "last_30_days" && params.get("compare") === "none", params.toString())
  }

  console.log("\n2. The same instants, product and place go to every read on the page")
  {
    const q = { start: Date.parse("2026-10-20T21:00:00Z"), end: Date.parse("2026-10-28T13:00:00Z"), compare: { start: Date.parse("2026-10-13T21:00:00Z"), end: Date.parse("2026-10-21T13:00:00Z") }, product: "p1", property: "website:w1", timeZone: "Europe/Bucharest", currency: "RON" }
    const r = new URLSearchParams(reportKey(q))
    const c = new URLSearchParams(commerceKey(q))
    check("the chart's question and the sales reports' carry the very same period", Date.parse(r.get("start")!) === Number(c.get("from")) && Date.parse(r.get("end")!) === Number(c.get("to")), [r.get("start"), c.get("from")])
    check("  the same comparison", Date.parse(r.get("cstart")!) === Number(c.get("cstart")) && Date.parse(r.get("cend")!) === Number(c.get("cend")))
    check("  the same zone, product and place", r.get("tz") === c.get("tz") && r.get("product") === c.get("product") && r.get("property") === c.get("property"))
    const none = new URLSearchParams(commerceKey({ ...q, compare: null }))
    check("  and no comparison is said to both", none.get("compare") === "none" && new URLSearchParams(reportKey({ ...q, compare: null })).get("compare") === "none")
    check("the minute's refresh is the same question to the sales reports' memory", commerceQuestionOf(commerceKey(q)) === commerceQuestionOf(commerceKey({ ...q, end: q.end + 60_000, compare: { ...q.compare, end: q.compare.end + 60_000 } })))

    const client = code("app/app/analytics/analytics-client.tsx")
    check("the page asks the chart with the comparison it shows", /useAnalyticsReports\(\{[\s\S]*?compare: against,[\s\S]*?product: selectedProduct,[\s\S]*?property: propertyKey,/.test(client))
    check("  the sales reports with the same period, comparison, zone, product and place", /<CommerceReports[\s\S]*?span=\{safeSpan\}[\s\S]*?compare=\{against\}[\s\S]*?timeZone=\{timeZone\}[\s\S]*?product=\{selectedProduct\}[\s\S]*?property=\{propertyKey\}/.test(client))
    check("  the communities with the same period, comparison and zone", /<CommunityReports[^>]*span=\{safeSpan\}[^>]*compare=\{against\}[^>]*timeZone=\{timeZone\}/.test(client))
    check("  always the period just before (no comparison control, on the owner's word), and nothing for All time", /const compare = PREVIOUS_PERIOD/.test(client) && /isAllTime \? null : compareBounds\(period, compare, timeZone, reportNow\(\)\)/.test(client) && !/ComparePicker/.test(client))
    const cards = code("app/app/analytics/analytics-reports.tsx")
    check("the added reports are drawn from the chart's own answer, never asked for apart", /function AddedBody\(\{ id, r \}: \{ id: ReportId; r: Reports \}\)/.test(cards) && !/fetch\(/.test(cards.slice(cards.indexOf("function AddedBody"), cards.indexOf("function AddedCards"))))
    const route = code("app/api/analytics/commerce/route.ts")
    check("the sales route reads the comparison's instants, the zone and no comparison", /searchParams\.get\("cstart"\)/.test(route) && /searchParams\.get\("tz"\)/.test(route) && /searchParams\.get\("compare"\) === "none"/.test(route))
    /* Moved on purpose (round AB2): the reads are lib/analytics/commerce-server, shared with the export. */
    check("  and its fulfilment time follows the product and the place", /async function fulfillmentIn[\s\S]*?commerceRowCounts\(/.test(code("lib/analytics/commerce-server.ts")))
  }

  console.log("\n3. The sales reports count on the seller's clock, in the chart's buckets")
  {
    const TZ = "Europe/Bucharest"
    const span = { start: Date.parse("2026-10-20T21:00:00Z"), end: Date.parse("2026-10-21T12:00:00Z") }
    const rows: CommerceOrderRow[] = [
      { id: "a", amount_cents: 1000, status: "completed", created_at: "2026-10-20T22:30:00Z" },
      { id: "b", amount_cents: 2500, status: "completed", created_at: "2026-10-21T08:10:00Z" },
      { id: "c", amount_cents: 700, status: "failed", created_at: "2026-10-21T09:00:00Z" },
    ]
    const series = seriesOf(rows, span, TZ)
    check("Today is drawn by the hour, from the seller's midnight", series.length === 15 && hourIn(series[0].t, TZ) === 0, [series.length, new Date(series[0].t).toISOString()])
    check("  an order at 01:30 in Bucharest is in today's 1 am, not yesterday (UTC)", series[1].total === 1000 && series.reduce((n, p) => n + p.total, 0) === 3500, series.slice(0, 3))
    const week = { start: Date.parse("2026-10-14T21:00:00Z"), end: Date.parse("2026-10-21T12:00:00Z") }
    const viewRows: ViewRow[] = []
    const chart = buildReports({ wire: { cur: {}, prev: {} }, views: viewRows, orders: [], window: week, previous: null, timeZone: TZ, mainDomain: "storelib.com", productTitles: {} })
    check("a week: the sales chart has the main chart's very buckets and labels", seriesOf(rows, week, TZ).map((p) => bucketLabel(p.t, grainFor(week), TZ)).join() === chart.visitors.series.labels.join(), chart.visitors.series.labels)
    const view = code("app/app/analytics/commerce-reports.tsx")
    check("  its dates are written in the seller's zone, not UTC", /bucketLabel\(series\[at\]\.t, grain, timeZone\)/.test(view) && !/timeZone: "UTC"/.test(view))
    check("  and with no comparison, no change and no dashed line", /function Delta\(\{ now, before, invert = false, compared \}[\s\S]*?if \(!compared\) return null/.test(view) && /previous=\{compared \? data\.previousSeries : \[\]\}/.test(view))
    check("a sale counts the same in both: the chart's revenue is the breakdown's total", breakdownOf(rows).total === 3500 && breakdownOf(rows).orders === 2)
    const order = (o: Partial<OrderRow>): OrderRow => ({ id: "x", product_id: "p1", amount_cents: 1000, status: "completed", created_at: "2026-10-21T08:00:00Z", ...o }) as OrderRow
    const both = buildReports({ wire: { cur: {}, prev: {} }, orders: [order({ id: "a", amount_cents: 1000, created_at: "2026-10-20T22:30:00Z" }), order({ id: "b", amount_cents: 2500, created_at: "2026-10-21T08:10:00Z" }), order({ id: "c", amount_cents: 700, status: "failed" })], window: span, previous: null, timeZone: TZ, mainDomain: "storelib.com", productTitles: { p1: "P" } })
    check("  (the chart: 3,500 from two orders, the failed one left out)", both.sales.value === 3500 && both.orders.value === 2, [both.sales.value, both.orders.value])
    check("a sales line follows the product and the place", commerceRowCounts({ id: "1", created_at: "", product_id: "p1", property_type: "onepage", property_id: "op" }, { productId: "p1", property: { type: "onepage" }, defaultWebsite: null }) && !commerceRowCounts({ id: "1", created_at: "", product_id: "p1", property_type: "creator_page" }, { productId: null, property: { type: "onepage" }, defaultWebsite: null }))
  }

  console.log("\n4. The sections a seller sees, and the reports they added")
  {
    const site = [{ id: "w", published: true }]
    const digital = profileOf({ products: [{ type: "digital" }, { type: "course" }], onePageId: null, websites: [], communities: 0 })
    const physical = profileOf({ products: [{ type: "physical" }], onePageId: null, websites: [], communities: 0 })
    const shop = profileOf({ products: [{ type: "digital" }], onePageId: null, websites: site, communities: 0 })
    const everything = profileOf({ products: [{ type: "physical" }, { type: "digital" }, { type: "community" }], onePageId: "op", websites: site, communities: 2 })
    const all = { property: "all", productKind: null }
    check("a seller of digital products only: no shipping, no fulfilment, downloads", !sectionsFor(digital, all).shipping && !sectionsFor(digital, all).fulfillment && sectionsFor(digital, all).downloads && !sectionsFor(digital, all).productKinds)
    check("a seller who ships: shipping and fulfilment", sectionsFor(physical, all).shipping && sectionsFor(physical, all).fulfillment && !sectionsFor(physical, all).downloads)
    /* Changed on purpose (round AB2), the owner: "For someone who only sells digital products it doesn't make sense to show shipping charges." A website alone ships nothing. */
    check("a seller of downloads with a published website: no shipping, no fulfilment", !sectionsFor(shop, all).shipping && !sectionsFor(shop, all).fulfillment && sectionsFor(shop, all).downloads)
    check("  a draft one is not", !sectionsFor(profileOf({ products: [{ type: "digital" }], onePageId: null, websites: [], communities: 0 }), all).shipping)
    check("  nor one taken down", !profileOf({ products: [], onePageId: null, websites: [{ published: false }], communities: 0 }).publishedWebsite)
    check("both kinds: Top products split into Physical and Digital", sectionsFor(everything, all).productKinds && !sectionsFor(physical, all).productKinds)
    const onePhysical = sectionsFor(everything, { property: "all", productKind: kindOfProduct("physical") })
    check("one physical product chosen: fulfilment stays, downloads and the product list go", onePhysical.fulfillment && !onePhysical.downloads && !onePhysical.topProducts && !onePhysical.subscribers)
    const oneDigital = sectionsFor(everything, { property: "all", productKind: kindOfProduct("digital") })
    check("one digital product chosen: downloads stay, shipping and fulfilment go", oneDigital.downloads && !oneDigital.shipping && !oneDigital.fulfillment)
    check("the OnePage chosen: its links instead of pages", sectionsFor(everything, { property: "onepage", productKind: null }).links && !sectionsFor(everything, all).links)
    check("communities: for a seller with one, on All pages, for All or a community product", sectionsFor(everything, all).communities && !sectionsFor(everything, { property: "creator_page", productKind: null }).communities && sectionsFor(everything, { property: "all", productKind: "community" }).communities && !onePhysical.communities && !sectionsFor(digital, all).communities)
    check("a seller with nothing to sell sees no sales reports", !sectionsFor(profileOf({ products: [], onePageId: "op", websites: [], communities: 0 }), all).sales)

    check("the reports a seller can add follow what they have", reportOptions(digital).join() === "pageviews,sessions,clicks,refunds,downloads" && reportOptions(everything).includes("toplinks") && !reportOptions(physical).includes("downloads"), [reportOptions(digital), reportOptions(everything)])
    check("Downloads waits while a physical product is chosen; OnePage links while the OnePage is", !reportShown("downloads", everything, { property: "all", productKind: "physical" }) && reportShown("downloads", everything, all) && !reportShown("toplinks", everything, { property: "onepage", productKind: null }))
    check("a saved list is tidied: known reports, each once, in order", normalizeReports(["clicks", "nope", "clicks", 3, "pageviews"]).join() === "clicks,pageviews" && normalizeReports("x").length === 0)
    check("  every report can be added once, no more", normalizeReports([...REPORT_IDS, ...REPORT_IDS]).length === REPORT_IDS.length)
    check("moving: up, down, and nothing past an end", moveReport(["a", "b", "c"] as never, "c" as never, -1).join() === "a,c,b" && moveReport(["a", "b"] as never, "a" as never, -1).join() === "a,b")
    check("the picker's Save: kept ones stay where they were, new ones at the end", applyPicked(["clicks", "pageviews"], new Set(["pageviews", "clicks", "sessions"] as const)).join() === "clicks,pageviews,sessions" && applyPicked(["clicks", "pageviews"], new Set(["pageviews"] as const)).join() === "pageviews")
    const page = code("app/app/analytics/page.tsx")
    check("the added reports are read on the server with the page, so they are on the first paint", /readReportLayout\(adminSupabase, user\.id\)/.test(page) && /savedReports=\{savedReports\}/.test(page))
    check("  draft communities are no place, as draft websites are not", /\.in\("status", \["published", "archived"\]\)/.test(page))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

/** The instant after a day ends, on that zone's clock. */
function midnightAfter(ymd: string, tz: string): number {
  return boundsOf({ start: ymd, end: ymd }, tz).end
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
type _Unused = CompareValue
