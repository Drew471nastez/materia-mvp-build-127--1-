/**
 * THE HOME PAGE'S FIGURES, BY THE ANALYTICS RULES
 *
 * lib/analytics/home-figures.ts decides Home's four figures and its chart.
 * These are the ways they went wrong before it did: a partial refund taking
 * the whole order out of Revenue, a basket counted as three orders, Today at
 * 10am compared with yesterday evening, a disputed payment counted as a
 * sale, and a chart whose buckets did not match the period it named (an
 * eighth day on Last 7 days, two days missing from Last 30 days, August in
 * Month to date).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { homeFigures, homeSpans, homeTotals } from "../lib/analytics/home-figures"
import { resolveValue, todayIn, type PresetId } from "../lib/date-range/range"
import type { ViewRow } from "../lib/analytics/reports"
import type { OrderRow } from "../lib/orders/order-view"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const HOUR = 3_600_000
const DAY = 24 * HOUR
/* New York, where a day starts at 04:00 UTC in September. */
const TZ = "America/New_York"
/* Friday 25 September 2026, 10:00 in New York. */
const NOW = Date.parse("2026-09-25T14:00:00Z")
const TODAY = todayIn(TZ, NOW)
/** Noon in New York on a September day. */
const nyNoon = (ymd: string, h = 12) => new Date(Date.parse(`${ymd}T${String(h + 4).padStart(2, "0")}:00:00Z`)).toISOString()

function period(preset: PresetId) {
  return resolveValue({ preset }, TODAY)
}
function order(id: string, createdAt: string, extra: Partial<OrderRow> = {}): OrderRow {
  return { id, product_id: "p1", amount_cents: 5000, status: "completed", created_at: createdAt, ...extra }
}
function figures(preset: PresetId, orders: OrderRow[], views: ViewRow[] = [], clicks: number[] = []) {
  const { window, previous } = homeSpans(period(preset), TZ, NOW)
  return homeFigures({ orders, views, clicks, window, previous, timeZone: TZ })
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

console.log("\nHome: the period and what it is compared with")
{
  check("today is Sep 25 on the creator's clock", TODAY === "2026-09-25", TODAY)
  const today = homeSpans(period("today"), TZ, NOW)
  check("Today runs from the creator's midnight to now", today.window.start === Date.parse("2026-09-25T04:00:00Z") && today.window.end === NOW)
  check("  and is compared with yesterday from midnight to the same hour, not yesterday evening",
    today.previous?.start === Date.parse("2026-09-24T04:00:00Z") && today.previous?.end === Date.parse("2026-09-24T14:00:00Z"), today.previous)
  const week = homeSpans(period("last_7_days"), TZ, NOW)
  check("Last 7 days starts at midnight six days ago", week.window.start === Date.parse("2026-09-19T04:00:00Z"))
  check("  and is compared with the seven days before, cut at the same hour",
    week.previous?.start === Date.parse("2026-09-12T04:00:00Z") && week.previous?.end === Date.parse("2026-09-18T14:00:00Z"), week.previous)
  check("All time is compared with nothing", homeSpans(period("all_time"), TZ, NOW).previous === null)
}

console.log("\nHome: money and orders, as Analytics counts them")
{
  const orders: OrderRow[] = [
    order("partial", nyNoon("2026-09-22"), { status: "refunded", refund_amount_cents: 500 }),
    order("full", nyNoon("2026-09-22"), { amount_cents: 2000, status: "refunded", refund_amount_cents: 2000 }),
    order("b1", nyNoon("2026-09-23"), { amount_cents: 1000, stripe_session_id: "cs_basket" }),
    order("b2", nyNoon("2026-09-23"), { amount_cents: 1000, stripe_session_id: "cs_basket", product_id: "p2" }),
    order("b3", nyNoon("2026-09-23"), { amount_cents: 1000, stripe_session_id: "cs_basket", product_id: "p3" }),
    order("disputed", nyNoon("2026-09-24"), { amount_cents: 9900, status: "disputed" }),
    order("failed", nyNoon("2026-09-24"), { status: "failed" }),
  ]
  const f = figures("last_7_days", orders)
  check("a $50 order refunded $5 is $45 of revenue, not nothing", f.periodRevenue === 4500 + 0 + 3000, f.periodRevenue)
  check("a basket of three is one order, and a failed or disputed payment none", f.periodOrders === 3, f.periodOrders)
  check("the revenue line adds up to the figure, in dollars", Math.round(sum(f.series.revenue.map((p) => p.value)) * 100) === f.periodRevenue)
  check("the orders line adds up to the figure", sum(f.series.orders.map((p) => p.value)) === f.periodOrders)
  check("refunded orders are marked on the day they were placed", f.series.orders.find((p) => p.label === "Sep 22")?.refunds === 2)
  const t = homeTotals(orders)
  check("all time: the same rules", t.totalOrders === 3 && t.totalRevenue === 7500, t)
}

console.log("\nHome: the chart's days are the period's days")
{
  const week = figures("last_7_days", [order("before", nyNoon("2026-09-18")), order("first", nyNoon("2026-09-19")), order("last", nyNoon("2026-09-25", 9))])
  const labels = week.series.orders.map((p) => p.label)
  check("Last 7 days draws seven days, Sep 19 to Sep 25, not eight", labels.length === 7 && labels[0] === "Sep 19" && labels[6] === "Sep 25", labels)
  check("  an order from the day before is on neither the chart nor the figure", week.periodOrders === 2 && sum(week.series.orders.map((p) => p.value)) === 2)
  check("  and the first day's order is on the first day", week.series.orders[0].value === 1)

  const month = figures("last_30_days", [order("first", nyNoon("2026-08-27")), order("second", nyNoon("2026-08-28"))])
  check("Last 30 days draws thirty days from Aug 27, its first two included",
    month.series.orders.length === 30 && month.series.orders[0].label === "Aug 27" && month.series.orders[0].value === 1 && month.series.orders[1].value === 1, month.series.orders.slice(0, 3))

  const mtd = figures("month_to_date", [order("august", nyNoon("2026-08-30")), order("september", nyNoon("2026-09-02"))])
  check("Month to date starts on Sep 1, and an August order is not in it",
    mtd.series.orders[0].label === "Sep 1" && mtd.periodOrders === 1 && sum(mtd.series.orders.map((p) => p.value)) === 1, { first: mtd.series.orders[0], orders: mtd.periodOrders })

  const quarter = figures("last_90_days", [order("first", nyNoon("2026-06-28"))])
  check("Last 90 days keeps its first days", quarter.series.orders.length === 90 && quarter.series.orders[0].value === 1, quarter.series.orders.length)

  /* 23:30 in New York is 03:30 UTC the next day: the creator's day, not UTC's. */
  const late = figures("yesterday", [order("late", "2026-09-25T03:30:00Z")])
  check("Yesterday is drawn by the creator's hours, and 11:30pm lands in 11 pm", late.series.orders.length === 24 && late.series.orders[23].label === "11 pm" && late.series.orders[23].value === 1, late.series.orders[23])
}

console.log("\nHome: views and conversion")
{
  const views: ViewRow[] = [
    { id: "1", session_id: "s1", created_at: nyNoon("2026-09-24", 9) },
    { id: "2", session_id: "s1", created_at: nyNoon("2026-09-24", 10) },
    { id: "3", session_id: "s2", created_at: nyNoon("2026-09-24") },
    { id: "4", session_id: "s3", created_at: nyNoon("2026-09-24") },
    { id: "5", session_id: "s4", created_at: nyNoon("2026-09-24") },
    { id: "old", session_id: "s0", created_at: nyNoon("2026-09-15") },
  ]
  const clicks = [Date.parse(nyNoon("2026-09-24")), Date.parse(nyNoon("2026-09-10"))]
  const f = figures("last_7_days", [order("o", nyNoon("2026-09-24"))], views, clicks)
  check("views are the period's page views, and the week before's are its own", f.periodViews === 5 && f.prevPeriodViews === 1, { now: f.periodViews, before: f.prevPeriodViews })
  check("conversion is orders over visits, as on Analytics: one order in four visits", f.conversionRate === 25, f.conversionRate)
  check("link taps are drawn beside the views, in the period only", sum(f.series.views.map((p) => p.secondaryValue ?? 0)) === 1)
}

console.log("\nHome: the page reads it this way")
{
  const dash = code("components/app/dashboard-client.tsx")
  /* Changed on purpose: Home no longer counts from rows it read itself (1,000 at most); it draws the Analytics answer (homeFromReports). */
  check("the figures and the chart are the Analytics answer for the period, with the viewer's zone",
    /homeFromReports\(homeAnswer\.reports, clicksByBucket\(/.test(dash) && /homeQuestion\(period, dashTimeZone, reportNow\(/.test(dash) && /askReport\(key, /.test(dash))
  check("  and all time under each figure is Analytics' all time line", /const totals = homeAllTime\(homeAnswer\?\.allTime\)/.test(dash))
  check("no bucket shapes or comparison of its own are left",
    !/generateTimeBuckets/.test(dash) && !/start\.getTime\(\) - 1/.test(dash) && !/o\.status === "completed"/.test(dash) && !/DASH_LEGACY_TIMEFRAME/.test(dash))
  check("no views or orders are read in the browser, where a read stops at 1,000 rows",
    !/spansToRead/.test(dash) && !/select\("id, visitor_id, session_id, product_id, created_at"\)/.test(dash) && !/liveOrders/.test(dash) && !/\.from\("orders"\)/.test(dash))
  check("the link taps are every one of the period's, a page at a time, with the end left out",
    /readByKeyset<\{ id: string; created_at: string \}>/.test(dash) && /\.eq\("event_type", "click"\)\.lt\("created_at", iso\(span\.end\)\)/.test(dash) && /\.limit\(KEYSET_PAGE\)/.test(dash) && !/\.lte\("created_at"/.test(dash))
  /* "It takes too much to load the data; blur it while it loads but keep it intact": the answer is drawn when it lands, the
     link taps (a thousand a read, one read after another) join it after, and a chart for another period stays, blurred. */
  check("the period's answer is drawn the moment it lands, not after the link taps are paged through",
    !/await clicksRead/.test(dash) && /void clicksRead\.then\(\(clicks\) => \{/.test(dash) && /setHomeAnswer\(answerOf\(answer, clicksKept\.current\.get\(question\) \?\? \[\]\)\)/.test(dash))
  check("while a new period comes the chart already drawn stays, blurred 4px and dimmed; a kept period and a tab never blur",
    /setChartStale\(!kept\)/.test(dash) && /chartStale \? "opacity-55 blur-\[4px\]"/.test(dash) && /setIsRefreshing\(!kept\)/.test(dash) && !/setOpenKPIModal\([^)]*\);[^}]*setChartStale/.test(dash))
  check("a new order asks again, past what was kept", /setOrdersChanged\(\(n\) => n \+ 1\)/.test(dash) && /\[periodKey, creatorId, ordersChanged\]/.test(dash) && /askPastKept\.current \? NOW_STEP_MS : 0/.test(dash))
  /* "The live pill shows a skeleton block while it loads." It waits as
     itself now: dot, a held "0" and "live", the number fading in. */
  check("the live pill waits as itself, its number fading in on opacity, with no shimmer bar in it",
    !/ShimmerBlock/.test(dash) && (dash.match(/<LivePill count=\{liveVisitors\}/g) ?? []).length === 2
      && /count == null \? "opacity-0" : "opacity-100"/.test(dash) && /\{count \?\? 0\}<\/span> \{label\}/.test(dash))
  const home = code("app/app/page.tsx")
  /* Changed on purpose: the page reads no order rows now (a read stops at 1,000). The first sale and the sales challenges
     are counted over every order by the same rule (homeTotals, or analytics_all_time which counts the same), still through lib/home/progress. */
  check("the page reads no order rows, and counts the sales over every order, the same way",
    !/\.from\("orders"\)/.test(home) && /creatorSalesTotals\(adminSupabase, creator\.id\)/.test(home) && /sales: salesTotals/.test(home) && /viewerId=\{user\.id\}/.test(home)
      && /homeTotals\(rows\)/.test(code("lib/analytics/creator-orders.ts")) && /homeTotals\(\(orders \?\? \[\]\) as OrderRow\[\]\)/.test(code("lib/home/progress.ts"))
      && /rows\.sales \? \{ sales: n\(rows\.sales\.sales\)/.test(code("lib/home/progress.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
