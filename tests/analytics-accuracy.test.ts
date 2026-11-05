/**
 * ===========================================================================
 *  /app ANALYTICS, EVERY FIGURE AGAINST A FIXTURE COUNTED BY HAND
 * ===========================================================================
 * "Make sure that analytics in Storelib is actually accurate ... it's very
 * important data for users."
 *
 * One store, Mara, in Bucharest (the clocks go back on 25 October 2026, so
 * the week has a 25 hour day), selling in lei: an ebook (digital), a mug
 * (physical) and a club (a membership). A creator page, a OnePage and two
 * websites, Studio (live) and Imported shop. Orders with refunds in whole
 * and in part, a discount, tax inside the price, a tip, shipping, a basket
 * across the start of the week, a basket with one line still pending, a
 * basket from before orders kept their page, a returning customer by
 * history, a test of every place; visits on every place, one just after
 * the store's midnight and before UTC's, link clicks, Buy and checkout.
 *
 * Three ways of knowing each number, held to each other:
 *
 *   1. by hand, written below as literal numbers (EXPECT)
 *   2. by an independent reference counted in this file (reference*),
 *      for every place, every preset range and a custom one, and every
 *      switch (All, Digital, Physical)
 *   3. by the code the routes run (lib/analytics/reports buildReports,
 *      lib/analytics/commerce commerceReport), and end to end through a
 *      database fake (report-answer and commerce-server)
 *
 * And each bug this round fixed, with the number the old code gave on this
 * very fixture beside the number it gives now. Section 7 adds one order
 * refunded in two parts on different days, read through the seller's
 * ledger, each refund on its own day.
 *
 *   npx tsx --conditions=react-server tests/analytics-accuracy.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase, type Row } from "./fake-supabase"
import { buildReports, moneyOf, salesFor, type StepRow, type SubscriberRow, type ViewRow, type Reports } from "../lib/analytics/reports"
import { breakdownOf, commerceReport, commerceRowCounts, type CommerceOrderRow, type CommerceReport } from "../lib/analytics/commerce"
import { boundsOf, compareBounds, midnightOf, presetRange, type DateRange } from "../lib/date-range/range"
import { modeFor, profileOf, sectionsFor, sellsOf, type SalesMode } from "../lib/analytics/sections"
import { parseProperty, type CreatorProperties, type PropertySelector } from "../lib/analytics/properties"
import { analyticsCsv, cell, major } from "../lib/analytics/export-csv"
import { formatCurrency, formatMinor } from "../lib/markets/money"
import type { OrderRow } from "../lib/orders/order-view"
import { isBotAgent } from "../lib/analytics/user-agent"
import { countReportAnswer, reportQuestion } from "../lib/analytics/report-answer"
import { countCommerce } from "../lib/analytics/commerce-server"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── The store ────────────────────────────────────────────────────────── */

const CREATOR = "cccccccc-0000-4000-8000-000000000001"
const USER = "cccccccc-0000-4000-8000-0000000000a1"
const W1 = "cccccccc-5555-4000-8000-000000000001"
const W2 = "cccccccc-5555-4000-8000-000000000002"
const OP = "cccccccc-7777-4000-8000-000000000001"
const EBOOK = "cccccccc-1111-4000-8000-000000000001"
const MUG = "cccccccc-1111-4000-8000-000000000002"
const CLUB = "cccccccc-1111-4000-8000-000000000003"
const TZ = "Europe/Bucharest"
/* Tuesday 27 October 2026, 15:00 in Bucharest (UTC+2 since Sunday). */
const NOW = Date.parse("2026-10-27T13:00:00Z")
const TODAY = "2026-10-27"

const PROPERTIES: CreatorProperties = { onePageId: OP, websites: [{ id: W1, name: "Studio", published: true }, { id: W2, name: "Imported shop", published: true }], defaultWebsite: W1 }
const TYPES: Record<string, string | null> = { [EBOOK]: "digital", [MUG]: "physical", [CLUB]: "membership" }
const TITLES: Record<string, string> = { [EBOOK]: "Ebook", [MUG]: "Mug", [CLUB]: "Club" }

type Line = OrderRow & { tax_included?: boolean; unit_price_cents?: number; shipping_cents?: number; tax_cents?: number }
let n = 0
const line = (o: Partial<Line> & { created_at: string; product_id: string; amount_cents: number }): Line => ({
  id: `o-${String(++n).padStart(3, "0")}`,
  status: "completed",
  currency: "RON",
  quantity: 1,
  unit_price_cents: o.unit_price_cents ?? o.amount_cents,
  ...o,
})

/* Every order line, in lei (minor units, bani). */
const ORDERS: Line[] = [
  /* Before the comparison: Cy's first order, so Cy returns this week. */
  line({ product_id: EBOOK, amount_cents: 2000, created_at: "2026-09-30T10:00:00Z", property_type: "creator_page", buyer_email: "cy@example.com" }),
  /* Kim's ebook from early October, 10 of its 20 lei refunded on Saturday the 24th of this week: the refund is this week's, the sale stays October's. */
  line({ product_id: EBOOK, amount_cents: 2000, status: "refunded", refund_amount_cents: 1000, refunded_at: "2026-10-24T08:00:00Z", created_at: "2026-10-05T10:00:00Z", property_type: "creator_page", buyer_email: "kim@example.com" }),
  /* The week before. p1 inside it, refunded in full on Thursday the 22nd of this week; p2 at 15:30 on its last day, after the hour the week has reached today. */
  line({ product_id: EBOOK, amount_cents: 2000, status: "refunded", refund_amount_cents: 2000, refunded_at: "2026-10-22T07:00:00Z", created_at: "2026-10-15T10:00:00Z", property_type: "website", property_id: W1, buyer_email: "ana@example.com" }),
  line({ product_id: MUG, amount_cents: 6500, shipping_cents: 1500, unit_price_cents: 5000, created_at: "2026-10-20T12:30:00Z", property_type: "creator_page", buyer_email: "hal@example.com", checkout_id: "ck4" }),
  /* A basket across the week's start: its first line at 23:59:50 on the 20th, its second ten seconds into the 21st. */
  line({ product_id: MUG, amount_cents: 6500, shipping_cents: 1500, unit_price_cents: 5000, created_at: "2026-10-20T20:59:50Z", stripe_session_id: "cs_s2", property_type: "website", property_id: W1, buyer_email: "bob@example.com", checkout_id: "ck1" }),
  line({ product_id: EBOOK, amount_cents: 2000, created_at: "2026-10-20T21:00:20Z", stripe_session_id: "cs_s2", property_type: "website", property_id: W1, buyer_email: "bob@example.com" }),
  /* o1: 00:30 on the 21st in Bucharest, still the 20th in UTC. */
  line({ product_id: EBOOK, amount_cents: 2000, created_at: "2026-10-20T21:30:00Z", property_type: "website", property_id: W1, buyer_email: "ana@example.com" }),
  /* o9: a tip of 5 lei inside 25, from a checkout link. */
  line({ product_id: EBOOK, amount_cents: 2500, tip_cents: 500, unit_price_cents: 2000, created_at: "2026-10-22T10:00:00Z", property_type: "creator_page", source_detail: { surface: "link" }, buyer_email: "gus@example.com" }),
  /* o3: a mug refunded in part (20 of 65) on Monday the 26th, on the creator page; Ana's second order of the week. */
  line({ product_id: MUG, amount_cents: 6500, shipping_cents: 1500, unit_price_cents: 5000, status: "refunded", refund_amount_cents: 2000, refunded_at: "2026-10-26T09:00:00Z", created_at: "2026-10-23T10:00:00Z", property_type: "creator_page", buyer_email: "Ana@Example.com", checkout_id: "ck2" }),
  /* o10: a basket with one line still pending: no sale yet, either line. */
  line({ product_id: EBOOK, amount_cents: 2000, created_at: "2026-10-23T15:00:00Z", stripe_session_id: "cs_s10", property_type: "website", property_id: W1, buyer_email: "ivy@example.com" }),
  line({ product_id: MUG, amount_cents: 6500, shipping_cents: 1500, unit_price_cents: 5000, status: "pending", created_at: "2026-10-23T15:00:10Z", stripe_session_id: "cs_s10", property_type: "website", property_id: W1, buyer_email: "ivy@example.com" }),
  /* o4: the club, on the OnePage. */
  line({ product_id: CLUB, amount_cents: 1500, created_at: "2026-10-24T09:00:00Z", property_type: "onepage", property_id: OP, buyer_email: "cy@example.com" }),
  /* o5: refunded in full on the imported site, no amount recorded (the whole of it) and no refund date: dated by its order, the 25th. */
  line({ product_id: EBOOK, amount_cents: 2000, status: "refunded", created_at: "2026-10-25T12:00:00Z", property_type: "website", property_id: W2, buyer_email: "dee@example.com" }),
  /* o6: pending. */
  line({ product_id: EBOOK, amount_cents: 2000, status: "pending", created_at: "2026-10-26T12:00:00Z", property_type: "website", property_id: W1, buyer_email: "joe@example.com" }),
  /* o7: a basket from before orders kept their page: no property, no source. A basket is only filled on a website. */
  line({ product_id: EBOOK, amount_cents: 2000, created_at: "2026-10-26T08:00:00Z", stripe_session_id: "cs_s7", buyer_email: "eve@example.com" }),
  line({ product_id: MUG, amount_cents: 6000, shipping_cents: 1000, unit_price_cents: 5000, created_at: "2026-10-26T08:00:30Z", stripe_session_id: "cs_s7", buyer_email: "eve@example.com", checkout_id: "ck3" }),
  /* o8: 20 lei listed, sold for 15 with 3 lei VAT inside the price, from Explore. */
  line({ product_id: EBOOK, amount_cents: 1500, tax_cents: 300, tax_included: true, unit_price_cents: 2000, created_at: "2026-10-27T08:00:00Z", property_type: "creator_page", source_detail: { surface: "explore" }, buyer_email: "fay@example.com" }),
]
const CHECKOUTS: Record<string, string> = { ck1: "fulfilled", ck2: "unfulfilled", ck3: "fulfilled", ck4: "fulfilled" }

/* Visits. */
const view = (v: Partial<ViewRow> & { visitor_id: string; created_at: string; property_type: string }): ViewRow => ({ id: `e-${String(++n).padStart(3, "0")}`, session_id: `${v.visitor_id}-${v.property_type}`, source_category: "direct", referrer_domain: "Direct", ...v })
const VIEWS: ViewRow[] = [
  view({ visitor_id: "v6", created_at: "2026-10-16T10:00:00Z", property_type: "website", property_id: W1, path: "/", os: "iOS", device_type: "mobile" }),
  view({ visitor_id: "v5", created_at: "2026-10-20T21:10:00Z", property_type: "website", property_id: W1, path: "/", os: "iOS", device_type: "mobile" }),
  view({ visitor_id: "v1", created_at: "2026-10-21T10:00:00Z", property_type: "website", property_id: W1, path: "/", os: "iOS", device_type: "mobile", source_category: "social_instagram", referrer_domain: "l.instagram.com" }),
  view({ visitor_id: "v1", created_at: "2026-10-21T10:01:00Z", property_type: "website", property_id: W1, path: "/products/mug", product_id: MUG, os: "iOS", device_type: "mobile", source_category: "social_instagram", referrer_domain: "l.instagram.com" }),
  view({ visitor_id: "v1", created_at: "2026-10-22T09:00:00Z", property_type: "creator_page", path: "/mara", os: "iOS", device_type: "mobile" }),
  view({ visitor_id: "v2", created_at: "2026-10-23T08:00:00Z", property_type: "creator_page", path: "/mara", os: "Windows", device_type: "desktop", source_category: "organic_search", referrer_domain: "www.google.com" }),
  view({ visitor_id: "v2", created_at: "2026-10-23T08:01:00Z", property_type: "creator_page", path: "/mara/ebook", product_id: EBOOK, os: "Windows", device_type: "desktop", source_category: "organic_search", referrer_domain: "www.google.com" }),
  view({ visitor_id: "v3", created_at: "2026-10-24T12:00:00Z", property_type: "onepage", property_id: OP, path: "/", os: "Android", device_type: "mobile" }),
  view({ visitor_id: "v4", created_at: "2026-10-25T00:30:00Z", property_type: "website", property_id: W2, path: "/", os: "macOS", device_type: "desktop", source_category: "referral", referrer_domain: "chatgpt.com" }),
]
const step = (s: Partial<StepRow> & { event_type: string; visitor_id: string; created_at: string; property_type: string }): StepRow => ({ id: `e-${String(++n).padStart(3, "0")}`, session_id: `${s.visitor_id}-${s.property_type}`, ...s })
const STEPS: StepRow[] = [
  step({ event_type: "buy_click", visitor_id: "v1", created_at: "2026-10-21T10:02:00Z", property_type: "website", property_id: W1, product_id: MUG }),
  step({ event_type: "checkout_start", visitor_id: "v1", created_at: "2026-10-21T10:03:00Z", property_type: "website", property_id: W1, product_id: MUG }),
  step({ event_type: "buy_click", visitor_id: "v2", created_at: "2026-10-23T08:02:00Z", property_type: "creator_page", product_id: EBOOK }),
  step({ event_type: "checkout_start", visitor_id: "v2", created_at: "2026-10-23T08:03:00Z", property_type: "creator_page", product_id: EBOOK }),
  step({ event_type: "link_click", visitor_id: "v3", created_at: "2026-10-24T12:01:00Z", property_type: "onepage", property_id: OP, link_id: "b1" }),
  step({ event_type: "link_click", visitor_id: "v3", created_at: "2026-10-24T12:02:00Z", property_type: "onepage", property_id: OP, link_id: "b2" }),
]
const SUBSCRIBERS: SubscriberRow[] = [
  { id: "s4", subscribed_at: "2026-10-15T09:00:00Z", property_type: "onepage", property_id: OP },
  { id: "s1", subscribed_at: "2026-10-22T09:00:00Z", property_type: "website", property_id: W1 },
  { id: "s2", subscribed_at: "2026-10-23T09:00:00Z", property_type: "creator_page" },
  { id: "s3", subscribed_at: "2026-10-23T09:30:00Z", source: "import" },
]

/* ─── The page's question for a range ─────────────────────────────────── */

function question(r: DateRange & { preset?: string }) {
  const span = boundsOf(r, TZ, NOW)
  const previous = r.preset === "all_time" ? null : compareBounds(r, { mode: "previous_period" }, TZ, NOW)
  return { span, previous }
}

function ask(range: DateRange & { preset?: string }, selector: PropertySelector, mode: SalesMode = "all") {
  const { span, previous } = question(range)
  const reports = buildReports({ views: VIEWS, steps: STEPS, orders: ORDERS, subscribers: SUBSCRIBERS, window: span, previous, timeZone: TZ, mainDomain: "storelib.com", productTitles: TITLES, selector, properties: PROPERTIES, productTypes: TYPES, mode })
  const earlier = (at: number) => new Set(ORDERS.filter((o) => Date.parse(o.created_at) < at && !["pending", "failed", "disputed"].includes(o.status)).map((o) => (o.buyer_email || "").toLowerCase()))
  const commerce = commerceReport({ rows: ORDERS, span, previous, timeZone: TZ, selector, properties: PROPERTIES, productId: null, mode, productTypes: TYPES, earlier: { now: earlier(span.start), before: previous ? earlier(previous.start) : new Set() }, checkouts: CHECKOUTS })
  return { span, previous, reports, commerce }
}

/* ─── The independent reference ───────────────────────────────────────── */

const placeOfOrder = (lines: Line[]): { type: string; id: string | null } => {
  const placed = lines.find((l) => l.property_type)
  if (placed) return { type: placed.property_type!, id: placed.property_type === "creator_page" ? null : placed.property_id ?? null }
  if (lines.length > 1 || lines.some((l) => l.source === "website")) return { type: "website", id: null }
  return { type: "creator_page", id: null }
}
const under = (s: PropertySelector, p: { type: string; id: string | null }) =>
  s.type === "all" || (s.type === p.type && (s.type !== "website" || (p.id ?? W1) === s.id))
const inKind = (pid: string, mode: SalesMode) => mode === "all" || (TYPES[pid] === "physical") === (mode === "physical")

/** Payments, money and the breakdown, counted line by line from the rows by this file's own rules. */
function referenceSales(span: { start: number; end: number }, s: PropertySelector, mode: SalesMode) {
  const byPay = new Map<string, Line[]>()
  for (const o of ORDERS) {
    const k = o.stripe_session_id || o.id
    byPay.set(k, [...(byPay.get(k) ?? []), o])
  }
  let orders = 0
  const m = { revenue: 0, gross: 0, discounts: 0, returns: 0, shipping: 0, taxes: 0, tips: 0 }
  const inside = (t: number) => t >= span.start && t < span.end
  let refunds = 0
  for (const lines of byPay.values()) {
    lines.sort((a, b) => a.created_at.localeCompare(b.created_at))
    const at = Date.parse(lines[0].created_at)
    if (lines.some((l) => l.status === "pending" || l.status === "failed" || l.status === "disputed")) continue
    if (!under(s, placeOfOrder(lines))) continue
    const mine = lines.filter((l) => inKind(l.product_id, mode))
    if (!mine.length) continue
    /* Refunds on the day they were made (the order's day when none is recorded), whenever the order was placed. */
    const refundDays = new Set<number>()
    for (const l of mine) {
      if (l.status !== "refunded") continue
      const when = l.refunded_at ? Date.parse(l.refunded_at) : at
      if (!inside(when)) continue
      const refund = l.refund_amount_cents ?? l.amount_cents
      m.revenue -= refund
      m.returns += refund
      refundDays.add(Math.floor(when / 86_400_000))
    }
    refunds += refundDays.size
    if (!inside(at)) continue
    orders++
    for (const l of mine) {
      const tip = l.tip_cents ?? 0
      const ship = l.shipping_cents ?? 0
      const tax = l.tax_cents ?? 0
      const charged = l.amount_cents - tip - ship - tax
      const list = (l.unit_price_cents ?? 0) * (l.quantity ?? 1) - (l.tax_included ? tax : 0)
      m.revenue += l.amount_cents
      m.gross += Math.max(list, charged)
      m.discounts += Math.max(list, charged) - charged
      m.shipping += ship
      m.taxes += tax
      m.tips += tip
    }
  }
  return { orders, refunds, ...m }
}

/** Visitors, page views and link clicks of a place in a span, from the event rows. */
function referenceVisits(span: { start: number; end: number }, s: PropertySelector) {
  const at = (r: { created_at: string }) => Date.parse(r.created_at) >= span.start && Date.parse(r.created_at) < span.end
  const place = (r: { property_type?: string | null; property_id?: string | null }) => under(s, { type: r.property_type ?? "", id: r.property_type === "creator_page" ? null : r.property_id ?? null })
  const views = VIEWS.filter((v) => at(v) && place(v))
  return { visitors: new Set(views.map((v) => v.visitor_id)).size, views: views.length, clicks: STEPS.filter((c) => c.event_type === "link_click" && at(c) && place(c)).length }
}

const ALL: PropertySelector = { type: "all" }
const SELECTORS: Array<[string, PropertySelector]> = [
  ["All pages", ALL],
  ["Creator page", { type: "creator_page" }],
  ["OnePage", { type: "onepage" }],
  ["Studio", { type: "website", id: W1 }],
  ["Imported shop", { type: "website", id: W2 }],
]
const RANGES: Array<[string, DateRange & { preset?: string }]> = [
  ["Today", { preset: "today", ...presetRange("today", TODAY) }],
  ["Yesterday", { preset: "yesterday", ...presetRange("yesterday", TODAY) }],
  ["Last 7 days", { preset: "last_7_days", ...presetRange("last_7_days", TODAY) }],
  ["Last 30 days", { preset: "last_30_days", ...presetRange("last_30_days", TODAY) }],
  ["Month to date", { preset: "month_to_date", ...presetRange("month_to_date", TODAY) }],
  ["Last 12 months", { preset: "last_12_months", ...presetRange("last_12_months", TODAY) }],
  ["Custom, 20 to 24 October", { preset: "custom", start: "2026-10-20", end: "2026-10-24" }],
]
const WEEK = RANGES[2][1]

/* ═══ 1. THE WEEK, BY HAND ═════════════════════════════════════════════ */

console.log("\nLast 7 days in Bucharest, All pages: every figure counted by hand")
{
  const { span, previous, reports: r, commerce: c } = ask(WEEK, ALL)
  check("the week is 21 October 00:00 in Bucharest (20 Oct 21:00 UTC) to now", span.start === Date.parse("2026-10-20T21:00:00Z") && span.end === NOW, [new Date(span.start).toISOString(), new Date(span.end).toISOString()])
  check("it is compared with 14 to 20 October, cut at 15:00 on the 20th, the hour the week has reached", previous!.start === Date.parse("2026-10-13T21:00:00Z") && previous!.end === Date.parse("2026-10-20T12:00:00Z"), previous && new Date(previous.end).toISOString())
  check("visitors 5: v1 on Studio and the creator page is one person", r.visitors.value === 5, r.visitors.value)
  check("page views 8", r.views.value === 8, r.views.value)
  check("visits 6: v1's two visits on two places", r.sessions.value === 6, r.sessions.value)
  check("link clicks 2, both on the OnePage", r.linkClicks.value === 2, r.linkClicks.value)
  check("orders 7: the basket from the 20th, two pending payments are not orders of the week", r.orders.value === 7, r.orders.value)
  check("revenue 170.00 lei: 20 + 45 + 15 + 0 + 80 + 15 + 25 of the week's orders, less this week's refunds of Ana's order of the 15th (20) and Kim's of the 5th (10)", r.sales.value === 17000, r.sales.value)
  check("refunds 4, each on its own day: Ana's on the 22nd, Kim's on the 24th, o5 on the 25th (its order's day), o3 on the 26th; 70.00 lei", r.refunds.value === 4 && r.refunds.cents === 7000 && r.refunds.previous === 0, [r.refunds.value, r.refunds.cents, r.refunds.previous])
  check("the week before: 1 order, 20.00 lei (the mug at 15:30 on the 20th is after the hour)", r.orders.previous === 1 && r.sales.previous === 2000, [r.orders.previous, r.sales.previous])
  check("conversion 7 orders over 5 visitors", r.conversion.value === 7 / 5, r.conversion.value)
  const b = c.breakdown
  check("gross sales 212.00: list prices, the VAT inside the ebook's price taken out (20 - 3)", b.gross === 21200, b.gross)
  check("discounts 5.00: listed 17 without tax, charged 12", b.discounts === 500, b.discounts)
  check("returns 70.00, by the refund's day: 20 of the mug, 20 of o5, 20 of Ana's order of the 15th, 10 of Kim's", b.returns === 7000, b.returns)
  check("net sales 137.00", b.net === 13700, b.net)
  check("shipping 25.00 (15 + 10), taxes 3.00, tips 5.00", b.shipping === 2500 && b.taxes === 300 && b.tips === 500, [b.shipping, b.taxes, b.tips])
  check("total sales 170.00, Revenue on the tab to the cent", b.total === 17000 && b.total === r.sales.value, b.total)
  check("orders in the breakdown: 7, the tab's", b.orders === 7, b.orders)
  check("average order value 29.57: (212 - 5) / 7", b.aov === Math.round(20700 / 7) && b.aov === 2957, b.aov)
  check("returning customer rate 2 of 6: Ana twice this week, Cy bought in September", b.customers === 6 && b.returningCustomers === 2 && Math.abs(b.returningRate - 1 / 3) < 1e-9, [b.customers, b.returningCustomers])
  check("fulfillment rate 1 of 2 physical orders (o3 waits, the old basket went out)", c.fulfillmentRate.orders === 2 && c.fulfillmentRate.fulfilled === 1 && c.fulfillmentRate.rate === 0.5, c.fulfillmentRate)
  const ch = Object.fromEntries(c.channels.map((x) => [x.label, [x.total, x.orders]]))
  check("by channel: Studio 80.00 (2, less Ana's refund), Checkout links 25.00, Creator page 35.00 (less Kim's), OnePage 15.00, Explore 15.00, Imported shop 0.00", JSON.stringify(ch) === JSON.stringify({ Studio: [8000, 2], "Creator page": [3500, 1], "Checkout links": [2500, 1], OnePage: [1500, 1], "Storelib Explore": [1500, 1], "Imported shop": [0, 1] }), ch)
  check("the channels add up to total sales", c.channels.reduce((a, x) => a + x.total, 0) === b.total)
  check("sales over time adds up to total sales, in Bucharest's days", c.series.reduce((a, p) => a + p.total, 0) === b.total && c.series.length === 7, c.series.length)
  check("the day of o1 (00:30 on the 21st, the 20th in UTC) is the 21st", c.series[0].total === 2000, c.series[0])
  check("the 22nd is o9's 25.00 less Ana's refund of 20.00 made that morning: 5.00, on the sales chart and the tab's", c.series[1].total === 500 && r.sales.series.current[1] === 500, [c.series[1].total, r.sales.series.current[1]])
  check("the 26th: o7's 80.00 less the mug's refund of 20.00: 60.00", c.series[5].total === 6000 && r.sales.series.current[5] === 6000, [c.series[5].total, r.sales.series.current[5]])
  const f = Object.fromEntries(r.funnel.map((s) => [s.key, s.value]))
  check("funnel: 5 visitors, 2 opened a product, 2 added to cart, 2 started checkout, 7 orders", f.visitors === 5 && f.product === 2 && f.cart === 2 && f.checkout === 2 && f.orders === 7, f)
  const os = Object.fromEntries(r.breakdowns.os.map((x) => [x.label, x.value]))
  check("operating systems, in visitors: iOS 2, Windows 1, Android 1, macOS 1", os.iOS === 2 && os.Windows === 1 && os.Android === 1 && os.macOS === 1, os)
  const dev = Object.fromEntries(r.breakdowns.device.map((x) => [x.key, x.value]))
  check("devices, by each visit's first page: mobile 4, desktop 2", dev.mobile === 4 && dev.desktop === 2, dev)
  const ref = Object.fromEntries(r.breakdowns.referrer.map((x) => [x.label, x.value]))
  check("referrers by company: Instagram 1, Google 1, ChatGPT 1; Direct is not a referrer", Object.keys(ref).length === 3 && Object.values(ref).every((v) => v === 1), ref)
  check("subscribers 2: the import is not a sign-up", r.subscribers?.value === 2 && r.subscribers.previous === 1, r.subscribers && [r.subscribers.value, r.subscribers.previous])
  check("a robot's visit is never recorded (lib/analytics/collect turns it away)", isBotAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"))
}

console.log("\nLast 7 days, each place: by hand")
{
  const by = (s: PropertySelector) => ask(WEEK, s)
  const cp = by({ type: "creator_page" })
  check("creator page: 2 visitors, 3 page views, 3 orders, 75.00 lei (85.00 less Kim's refund)", cp.reports.visitors.value === 2 && cp.reports.views.value === 3 && cp.reports.orders.value === 3 && cp.reports.sales.value === 7500, [cp.reports.visitors.value, cp.reports.views.value, cp.reports.orders.value, cp.reports.sales.value])
  check("  its total sales are its revenue", cp.commerce.breakdown.total === 7500 && cp.commerce.breakdown.orders === 3)
  const op = by({ type: "onepage" })
  check("OnePage: 1 visitor, 2 link clicks, 1 order, 15.00 lei", op.reports.visitors.value === 1 && op.reports.linkClicks.value === 2 && op.reports.orders.value === 1 && op.reports.sales.value === 1500)
  const w1 = by({ type: "website", id: W1 })
  check("Studio: 2 visitors, 3 page views, 2 orders (the old basket belongs to the live site), 80.00 lei (100.00 less Ana's refund)", w1.reports.visitors.value === 2 && w1.reports.views.value === 3 && w1.reports.orders.value === 2 && w1.reports.sales.value === 8000, [w1.reports.visitors.value, w1.reports.orders.value, w1.reports.sales.value])
  check("  its fulfillment rate is the old basket's, 1 of 1", w1.commerce.fulfillmentRate.orders === 1 && w1.commerce.fulfillmentRate.fulfilled === 1)
  const w2 = by({ type: "website", id: W2 })
  check("Imported shop: 1 visitor, 1 order refunded in full: 0.00 lei, returns 20.00", w2.reports.visitors.value === 1 && w2.reports.orders.value === 1 && w2.reports.sales.value === 0 && w2.commerce.breakdown.returns === 2000 && w2.commerce.breakdown.gross === 2000)
  const parts = [cp, op, w1, w2]
  check("the places add up to All: orders and revenue, nothing counted twice or dropped", parts.reduce((a, p) => a + p.reports.orders.value, 0) === 7 && parts.reduce((a, p) => a + p.reports.sales.value, 0) === 17000)
}

console.log("\nLast 7 days, the switch: by hand")
{
  const d = ask(WEEK, ALL, "digital")
  check("Digital: 6 orders, 65.00 lei (95.00 less this week's 30.00 of ebook refunds of older orders), no shipping", d.reports.orders.value === 6 && d.reports.sales.value === 6500 && d.commerce.breakdown.total === 6500 && d.commerce.breakdown.shipping === 0, [d.reports.orders.value, d.reports.sales.value])
  const p = ask(WEEK, ALL, "physical")
  check("Physical: 2 orders, 105.00 lei, 25.00 of shipping", p.reports.orders.value === 2 && p.reports.sales.value === 10500 && p.commerce.breakdown.shipping === 2500)
  check("Digital and Physical add up to All in money (the mixed basket is an order of each)", d.reports.sales.value + p.reports.sales.value === 17000)
  const all = ask(WEEK, ALL)
  const k = all.commerce.kinds
  check("the breakdown's Digital and Physical columns are those very figures, and add up to All line by line", !!k && k.digital.total === 6500 && k.physical.total === 10500 && (["gross", "discounts", "returns", "shipping", "taxes", "tips", "total"] as const).every((f) => k.digital[f] + k.physical[f] === all.commerce.breakdown[f]), k && [k.digital.total, k.physical.total])
  check("the pending basket stays out under Digital too (its pending line is the mug)", d.commerce.orders.every((o) => o.lines.every((l) => l.stripe_session_id !== "cs_s10")))
  check("visits are the store's whatever the switch says", d.reports.visitors.value === 5 && p.reports.visitors.value === 5)
}

/* ═══ 2. EVERY PLACE, RANGE AND SWITCH, AGAINST THE REFERENCE ═══════════ */

console.log("\nEvery place, every range, every switch: the code against the reference")
{
  let combos = 0
  const wrong: string[] = []
  for (const [rangeName, range] of RANGES) {
    for (const [placeName, s] of SELECTORS) {
      for (const mode of ["all", "digital", "physical"] as SalesMode[]) {
        combos++
        const { span, previous, reports: r, commerce: c } = ask(range, s, mode)
        const want = referenceSales(span, s, mode)
        const before = previous ? referenceSales(previous, s, mode) : null
        const visits = referenceVisits(span, s)
        const got = { refunds: r.refunds.value, orders: r.orders.value, revenue: r.sales.value, total: c.breakdown.total, corders: c.breakdown.orders, gross: c.breakdown.gross, discounts: c.breakdown.discounts, returns: c.breakdown.returns, shipping: c.breakdown.shipping, taxes: c.breakdown.taxes, tips: c.breakdown.tips, visitors: r.visitors.value, views: r.views.value, clicks: r.linkClicks.value, porders: r.orders.previous, prevenue: r.sales.previous, ptotal: c.previous.total }
        const exp = { refunds: want.refunds, orders: want.orders, revenue: want.revenue, total: want.revenue, corders: want.orders, gross: want.gross, discounts: want.discounts, returns: want.returns, shipping: want.shipping, taxes: want.taxes, tips: want.tips, visitors: visits.visitors, views: visits.views, clicks: visits.clicks, porders: before ? before.orders : 0, prevenue: before ? before.revenue : 0, ptotal: before ? before.revenue : 0 }
        for (const k of Object.keys(exp) as Array<keyof typeof exp>) if (got[k] !== exp[k]) wrong.push(`${rangeName} / ${placeName} / ${mode}: ${k} ${got[k]} != ${exp[k]}`)
      }
    }
  }
  check(`${combos} questions (7 ranges, 5 places, 3 switches): orders, revenue, the whole breakdown, visitors, page views, link clicks and the period before all match`, wrong.length === 0, wrong.slice(0, 6))
}

/* ═══ 3. THE BUGS, BEFORE AND AFTER, ON THIS FIXTURE ════════════════════ */

console.log("\nBugs fixed, with the old code's number beside the new one")
{
  const { span, previous, reports: r, commerce: c } = ask(WEEK, ALL)
  /* The old sales reports: order lines on their own, each by its own time and place (app/api/analytics/commerce before this round). */
  const oldOf = (s: PropertySelector, w: { start: number; end: number }) =>
    breakdownOf(ORDERS.filter((o) => Date.parse(o.created_at) >= w.start && Date.parse(o.created_at) < w.end).filter((o) => commerceRowCounts(o as unknown as CommerceOrderRow, { productId: null, property: s, defaultWebsite: W1 })) as unknown as CommerceOrderRow[])
  const old = oldOf(ALL, span)
  check(`BUG 1 Total sales disagreed with Revenue: was ${old.total / 100} lei and ${old.orders} orders against the tab's ${r.sales.value / 100} and ${r.orders.value}; now ${c.breakdown.total / 100} and ${c.breakdown.orders}`, old.total === 24000 && old.orders === 9 && c.breakdown.total === r.sales.value && c.breakdown.orders === r.orders.value, [old.total, old.orders])
  check("  half a basket across the week's start was counted in the week (20.00 lei), and a basket with a pending line was a sale (20.00 lei); the other 30.00 is this week's refunds of older orders", old.total - (c.breakdown.total + 3000) === 4000)
  const oldCp = oldOf({ type: "creator_page" }, span)
  const cp = ask(WEEK, { type: "creator_page" })
  check(`BUG 2 a basket with no page was the creator page's in the sales reports and Studio's on the tabs: creator page was ${oldCp.total / 100} lei over ${oldCp.orders} orders, now ${cp.commerce.breakdown.total / 100} over ${cp.commerce.breakdown.orders}`, oldCp.total === 16500 && oldCp.orders === 4 && cp.commerce.breakdown.total === 7500 && cp.commerce.breakdown.orders === 3, [oldCp.total, oldCp.orders])
  check(`BUG 3 returning customer rate counted only orders inside the period: was ${Math.round(old.returningRate * 1000) / 10}%, now ${Math.round(c.breakdown.returningRate * 1000) / 10}% (Cy bought in September)`, Math.abs(old.returningRate - 1 / 8) < 1e-9 && Math.abs(c.breakdown.returningRate - 1 / 3) < 1e-9, old.returningRate)
  /* The old comparison end: the period's elapsed milliseconds from the comparison's start. */
  const full = boundsOf(WEEK, TZ)
  const running = boundsOf(WEEK, TZ, NOW)
  const oldEnd = boundsOf({ start: "2026-10-14", end: "2026-10-20" }, TZ).start + (running.end - running.start)
  const oldPrev = referenceSales({ start: previous!.start, end: oldEnd }, ALL, "all")
  check(`BUG 4 a week with the 25 hour day was compared until 16:00 on its last day, not 15:00: the week before was ${oldPrev.orders} orders, ${oldPrev.revenue / 100} lei, now ${r.orders.previous} and ${r.sales.previous / 100}`, oldEnd === Date.parse("2026-10-20T13:00:00Z") && oldPrev.orders === 2 && oldPrev.revenue === 8500 && r.orders.previous === 1 && full.end > running.end, [new Date(oldEnd).toISOString(), oldPrev])
  const spring = compareBounds({ start: "2026-03-23", end: "2026-03-29" }, { mode: "previous_period" }, TZ, Date.parse("2026-03-29T12:00:00Z"))
  check("  and a week with the 23 hour day is cut at the same hour too (15:00 on 22 March)", spring!.end === midnightOf("2026-03-22", TZ) + 15 * 3_600_000, spring && new Date(spring.end).toISOString())
  check(`BUG 5 a yen store's cards read 100 times too little: 2,500 yen was "${formatCurrency(2500 / 100, "JPY", "en")}", now "${formatMinor(2500, "JPY", "en")}" (the tab above always read it right)`, formatCurrency(2500 / 100, "JPY", "en") === "¥25" && formatMinor(2500, "JPY", "en") === "¥2,500")
  check("  the cards and the sales reports format with the currency's own decimals", /formatMinor\(cents \|\| 0, reportCurrency/.test(read("app/(storelib)/app/analytics/analytics-reports.tsx")) && /formatMinor\(n, data\?\.currency/.test(read("app/(storelib)/app/analytics/commerce-reports.tsx")) && !/shopMoneyIn|\/ 100, reportCurrency/.test(read("app/(storelib)/app/analytics/analytics-reports.tsx") + read("app/(storelib)/app/analytics/commerce-reports.tsx")))
  const digitalWithSite = profileOf({ products: [{ type: "digital" }], onePageId: null, websites: [{ published: true }], communities: 0 })
  const oldShips = digitalWithSite.physical || digitalWithSite.publishedWebsite
  check(`BUG 6 a seller of downloads with a website was shown shipping and fulfilment: was ${oldShips}, now ${sectionsFor(digitalWithSite, { property: "all", productKind: null }).shipping}`, oldShips === true && !sectionsFor(digitalWithSite, { property: "all", productKind: null }).shipping && !sectionsFor(digitalWithSite, { property: "all", productKind: null }).fulfillment)
  check("BUG 7 the sales reports read at most 50,000 lines and said nothing: the cap is now 200,000 a stretch, and the page says when it is reached", /truncated: read\.truncated/.test(read("lib/analytics/commerce-server.ts")) && /data-commerce-truncated/.test(read("app/(storelib)/app/analytics/commerce-reports.tsx")) && !/CEILING = 50_000/.test(read("app/api/analytics/commerce/route.ts")))
  check("BUG 8 there was no order fulfillment rate, only a time: now fulfilled of the physical orders, by the same filters", c.fulfillmentRate.rate === 0.5 && /data-card="fulfil"/.test(read("app/(storelib)/app/analytics/commerce-reports.tsx")) && /card="shipping" title=\{tt\("Shipping"\)\}/.test(read("app/(storelib)/app/analytics/commerce-reports.tsx")))
  /* The old rule: each order's money less whatever it ever had refunded, on the order's own day. */
  const byOrderDay = (w: { start: number; end: number }) => salesFor(ORDERS, ALL, W1).filter((o) => Date.parse(o.createdAt) >= w.start && Date.parse(o.createdAt) < w.end).reduce((a, o) => a + moneyOf(o).net, 0)
  const oldWeek = byOrderDay(span)
  const oldBefore = byOrderDay(previous!)
  check(`BUG 10 a refund was dated by its order: this week was ${oldWeek / 100} lei and the week before ${oldBefore / 100} (Ana's refund on the 22nd rewrote the 15th); now ${r.sales.value / 100} and ${r.sales.previous / 100}, Shopify's way`, oldWeek === 20000 && oldBefore === 0 && r.sales.value === 17000 && r.sales.previous === 2000, [oldWeek, oldBefore])
  check("BUG 9 every website was one 'Online store' channel: now each by its name, and Explore, links and test sales apart", c.channels.some((x) => x.label === "Studio") && c.channels.some((x) => x.label === "Imported shop") && c.channels.some((x) => x.label === "Storelib Explore"))
}

/* ═══ 4. WHAT A STORE SEES, FOR WHAT IT SELLS ═══════════════════════════ */

console.log("\nThe page morphs to what the store sells")
{
  const profile = (types: string[]) => profileOf({ products: types.map((type) => ({ type })), onePageId: OP, websites: [{ published: true }], communities: 0 })
  const digital = profile(["digital", "membership"])
  const physical = profile(["physical"])
  const both = profile(["digital", "physical"])
  const none = profile([])
  const s = (p: ReturnType<typeof profile>, mode: SalesMode = "all") => sectionsFor(p, { property: "all", productKind: null, mode: modeFor(p, mode) })
  check("digital only: no shipping, no fulfillment, downloads shown, no switch", sellsOf(digital) === "digital" && !s(digital).shipping && !s(digital).fulfillment && s(digital).downloads && modeFor(digital, "physical") === "all")
  check("physical only: shipping and fulfillment, no downloads, no switch", sellsOf(physical) === "physical" && s(physical).shipping && s(physical).fulfillment && !s(physical).downloads)
  check("both: the switch; Digital hides shipping and fulfillment, Physical hides downloads", sellsOf(both) === "both" && !s(both, "digital").shipping && !s(both, "digital").fulfillment && s(both, "physical").shipping && !s(both, "physical").downloads && s(both, "all").shipping && s(both, "all").downloads)
  check("  the Physical and Digital tabs inside Top products only while the switch is on All", s(both, "all").productKinds && !s(both, "digital").productKinds)
  check("nothing to sell yet: no sales sections", sellsOf(none) === "none" && !s(none).sales && !s(none).shipping)
  const client = read("app/(storelib)/app/analytics/analytics-client.tsx")
  check("  and the page draws the visits and one line, not zeros: three traffic tabs and the no-sales note", /sells === "none" \? TRAFFIC_TABS : CORE_TABS/.test(client) && /data-no-sales/.test(client))
  /*
    Changed on purpose twice. Round AC2 (the owner: "I don't like the All /
    Digital / Physical switch") took the switch away. Round 24 (the owner:
    "Digital / Communities / Physical pills, shown dynamically") brings the
    views back as Analytics' sliding pills, drawn only when there is a
    choice: All counts both kinds, a kind narrows to it, and ?kind= is kept
    in the address (dropped for All).
  */
  check("  the kind pills only when there is a choice, All counting both kinds, ?kind= in the address", /const kindPills = useMemo/.test(client) && /* Changed on purpose (round 42): one filter chip (components/app/kind-picker), not segments. */ /\{kindPills\.length \? <KindPicker /.test(client) && /: "all"\s*$/m.test(client.split("const mode: SalesMode =")[1]?.split("\n")[0] ?? "") && /if \(next === "all"\) url\.searchParams\.delete\("kind"\)/.test(client))
  check("  and the split is drawn where it matters: the breakdown's kind columns, the kind of each top product, Shipping only with a physical order", /showKinds=\{sections\.productKinds\}/.test(client) && /data-kind-columns/.test(read("app/(storelib)/app/analytics/commerce-reports.tsx")) && /physicalOrders > 0/.test(read("app/(storelib)/app/analytics/commerce-reports.tsx")) && /data-kind-split/.test(read("app/(storelib)/app/analytics/analytics-reports.tsx")))
}

/* ═══ 5. THE LAYOUT AND THE EXPORT ══════════════════════════════════════ */

console.log("\nAdd report at the bottom, Export in the period's row")
{
  const client = read("app/(storelib)/app/analytics/analytics-client.tsx")
  const head = client.slice(client.indexOf("data-analytics-head"), client.indexOf("data-analytics-controls"))
  /* Changed on purpose (round 49, the owner: Export "on the same line as the Analytics heading ... icon only"): the heading's line holds Send to and Export at its right, still no Add report. */
  check("no Add report in the heading row; Export and Send to at its right", !/marker="add-report"/.test(client) && !/AddReportButton/.test(head) && /<SendAnalyticsButton \/>\s*<ExportButton query=\{exportQuery\} name=\{exportName\} options=\{exportOptions\} range=\{exportRange\} \/>/.test(head))
  check("Add report under the last card, on every width", /<AddReportButton marker="add-more" label=\{tt\("Add report"\)\}/.test(client) && client.indexOf('marker="add-more"') > client.indexOf("<AnalyticsReports"))
  /* Changed on purpose (round AC2, "positioned somewhere else, without creating multiple rows"): the last control of the period's row, outside the strip that scrolls, so it never scrolls off a phone. */
  const controls = client.slice(client.indexOf("data-analytics-controls"), client.indexOf("{/* The four figures and the chart"))
  /* Changed on purpose (round 49): the period's row is filters only; Export moved to the heading's line (tests/analytics-r49.test.ts). */
  check("the period's row holds the filters only, no Export and no Send to", !/<ExportButton|<SendAnalyticsButton/.test(controls) && /data-analytics-pickers/.test(controls))
  const route = read("app/api/analytics/export/route.ts")
  check("the export is the owner's: area analytics through lib/team, a member working in another store refused", /creatorFor<[^>]+>\(admin, userId, "analytics"/.test(route) && /found\.acting/.test(route) && /q\.creatorId !== who\.creatorId/.test(route))
  check("the phone app gets a link signed for this one file, five minutes", /signOrderLink\(\{ k: "analytics"/.test(route) && /link\.k !== "analytics"/.test(route))
}

console.log("\nThe CSV holds what the page shows, with the currency and the time zone")
{
  const { span, previous, reports, commerce } = ask(WEEK, ALL)
  const both = profileOf({ products: [{ type: "digital" }, { type: "physical" }], onePageId: OP, websites: [{ published: true }], communities: 0 })
  const csv = analyticsCsv({
    meta: { store: "Mara", from: "2026-10-21", to: "2026-10-27", comparedFrom: "2026-10-14", comparedTo: "2026-10-20", timeZone: TZ, place: "All pages", sales: "All", currency: "RON", madeAt: "2026-10-27T13:00:00Z" },
    reports,
    commerce: { ...commerce, fulfillment: { hours: 30, shipped: 1 }, grain: "day" },
    sections: sectionsFor(both, { property: "all", productKind: null }),
    timeZone: TZ,
  })
  const lines = csv.split("\r\n")
  const has = (l: string) => lines.includes(l)
  check("names the time zone, the period, the comparison and the currency", has(`Time zone,${TZ}`) && has("Period,2026-10-21 to 2026-10-27") && has("Compared with,2026-10-14 to 2026-10-20") && has("Currency,\"RON, amounts in RON with 2 decimals\""), lines.slice(0, 9))
  check("the summary: 5 visitors, 8 page views, 6 visits, 2 link clicks, 7 orders, 170.00 lei, 4 refunds of 70.00", has("Visitors,5,1") && has("Page views,8,1") && has("Visits,6,1") && has("Link clicks,2,0") && has("Orders,7,1") && has("Total sales (RON),170.00,20.00") && has("Refunds,4,0") && has("Refunded (RON),70.00,0.00"), lines.slice(10, 22))
  check("the breakdown, signed, with the Digital and Physical columns that add up to it: 212.00 (112 + 100), -5.00, -70.00 (-50 - 20), 137.00, 25.00, 3.00, 5.00, 170.00 (65 + 105)", has("Line,This period (RON),Digital (RON),Physical (RON),Previous period (RON)") && ["Gross sales,212.00,112.00,100.00,20.00", "Discounts,-5.00,-5.00,0.00,0.00", "Returns,-70.00,-50.00,-20.00,0.00", "Net sales,137.00,57.00,80.00,20.00", "Shipping charges,25.00,0.00,25.00,0.00", "Taxes,3.00,3.00,0.00,0.00", "Tips,5.00,5.00,0.00,0.00", "Total sales,170.00,65.00,105.00,20.00"].every(has), lines.filter((l) => /^(Gross|Discounts|Returns|Net|Shipping|Taxes|Tips|Total sales),/.test(l)))
  check("channels, customers and fulfillment", has("Studio,80.00,2") && has("Returning customer rate (%),33.3,0.0") && has("Order fulfillment rate (%),50.0,") && has("Average order value (RON),29.57,20.00"))
  check("every report is a section of its own", ["Summary", "Over time", "Total sales breakdown", "Total sales over time", "Total sales by channel", "Customers and orders", "Traffic sources", "Referrers", "Top pages", "Link clicks by link", "Top products", "Funnel", "Subscribers", "Countries", "Operating systems", "Devices", "Browsers"].every((t) => has(t)))
  check("the days over time are Bucharest's", lines.indexOf("Over time") > 0 && lines[lines.indexOf("Over time") + 2].startsWith("Oct 21"), lines[lines.indexOf("Over time") + 2])
  const digitalOnly = profileOf({ products: [{ type: "digital" }], onePageId: null, websites: [{ published: true }], communities: 0 })
  const dcsv = analyticsCsv({ meta: { store: "Mara", from: "a", to: "b", comparedFrom: null, comparedTo: null, timeZone: TZ, place: "All pages", sales: "All", currency: "RON", madeAt: "x" }, reports, commerce: { ...commerce, fulfillment: { hours: null, shipped: 0 }, grain: "day" }, sections: sectionsFor(digitalOnly, { property: "all", productKind: null }), timeZone: TZ })
  check("a seller of downloads gets no shipping line and no fulfillment rows", !/Shipping charges|fulfillment rate/i.test(dcsv))
  check("a cell that starts like a formula is kept as text; a negative amount is still a number", cell("=HYPERLINK(\"x\")") === "\"'=HYPERLINK(\"\"x\"\")\"" && cell("-5.00") === "-5.00" && cell("a,b") === "\"a,b\"")
  check("amounts in the currency's own decimals: 2500 yen is 2500, 1250 cents is 12.50, 1234 fils is 1.234", major(2500, "JPY") === "2500" && major(1250, "USD") === "12.50" && major(1234, "KWD") === "1.234")
  void span
  void previous
}

/* ═══ 6. END TO END, THROUGH THE ROUTES' OWN CODE AND A DATABASE FAKE ═══ */

function world(): FakeSupabase {
  const db = new FakeSupabase()
  db.clock = NOW
  db.table("products", {}, Object.keys(TYPES).map((id) => ({ id, creator_id: CREATOR, title: TITLES[id], type: TYPES[id] })))
  db.table("creators", { embeds: { products: (r, d) => d.rows("products").filter((p) => p.creator_id === r.id).map((p) => ({ id: p.id, title: p.title, type: p.type })) } }, [{ id: CREATOR, user_id: USER, slug: "mara", display_name: "Mara" }])
  db.table("store_theme_installs", {}, [
    { id: W1, creator_id: CREATOR, status: "published", sort_order: 0, name: "Studio", published_at: "2026-09-01T00:00:00Z" },
    { id: W2, creator_id: CREATOR, status: "unpublished", sort_order: 1, name: "Imported shop", published_at: "2026-09-10T00:00:00Z" },
  ])
  db.table("onepages", {}, [{ id: OP, seller_id: CREATOR, owner_id: USER, slug: "mara", published_blocks: [{ id: "b1", type: "link", title: "Shop" }, { id: "b2", type: "link", title: "YouTube" }] }])
  db.table("onepage_views", {}, [])
  db.table("onepage_clicks", {}, [])
  db.table("custom_domains", {}, [])
  db.table("download_events", {}, [])
  db.table("fulfillments", {}, [])
  db.table("store_settings", {}, [{ creator_id: CREATOR, currency: "RON" }])
  db.table("subscribers", {}, SUBSCRIBERS.map((s) => ({ ...s, creator_id: CREATOR, created_at: s.subscribed_at })) as unknown as Row[])
  db.table("orders", {}, ORDERS.map((o) => ({ ...o, creator_id: CREATOR })) as unknown as Row[])
  db.table("commerce_checkouts", {}, Object.entries(CHECKOUTS).map(([id, fulfillment_status]) => ({ id, creator_id: CREATOR, fulfillment_status, created_at: "2026-10-01T00:00:00Z" })))
  db.table("analytics_events", {}, [...VIEWS.map((v) => ({ ...v, event_type: "view" })), ...STEPS].map((e) => ({ creator_id: CREATOR, property_id: null, product_id: null, ...e })) as unknown as Row[])
  return db
}

async function endToEnd() {
  console.log("\nEnd to end: the routes' own reads and counting, every place and switch, Last 7 days")
  const db = world()
  const { span, previous } = question(WEEK)
  const wrong: string[] = []
  let asked = 0
  for (const [placeName, s] of SELECTORS) {
    for (const mode of ["all", "digital", "physical"] as SalesMode[]) {
      const url = new URL("https://storelib.com/api/analytics/reports")
      url.searchParams.set("start", new Date(span.start).toISOString())
      url.searchParams.set("end", new Date(span.end).toISOString())
      url.searchParams.set("cstart", new Date(previous!.start).toISOString())
      url.searchParams.set("cend", new Date(previous!.end).toISOString())
      url.searchParams.set("tz", TZ)
      url.searchParams.set("product", "all")
      if (s.type !== "all") url.searchParams.set("property", s.type === "website" ? `website:${s.id}` : s.type)
      if (mode !== "all") url.searchParams.set("kind", mode)
      const q = await reportQuestion(db as never, USER, url, "storelib.com")
      if ("error" in q) {
        wrong.push(`${placeName}: ${q.error}`)
        continue
      }
      asked++
      const answer = await countReportAnswer(db as never, q.q, q.productTitles, q.productTypes, USER)
      const r = answer.reports as Reports
      const c = await countCommerce(db as never, { creatorId: CREATOR, properties: q.q.properties, selector: q.q.selector, productId: null, productTypes: q.productTypes, span, previous, timeZone: TZ, mode })
      const local = ask(WEEK, parseProperty(s.type === "all" ? null : s.type === "website" ? `website:${s.id}` : s.type), mode)
      const pairs: Array<[string, number, number]> = [
        ["orders", r.orders.value, local.reports.orders.value],
        ["revenue", r.sales.value, local.reports.sales.value],
        ["visitors", r.visitors.value, local.reports.visitors.value],
        ["page views", r.views.value, local.reports.views.value],
        ["link clicks", r.linkClicks.value, local.reports.linkClicks.value],
        ["total sales = revenue", c.breakdown.total, r.sales.value],
        ["sales orders = orders", c.breakdown.orders, r.orders.value],
        ["returning", c.breakdown.returningCustomers, local.commerce.breakdown.returningCustomers],
        ["fulfilled", c.fulfillmentRate.fulfilled, local.commerce.fulfillmentRate.fulfilled],
        ["previous total", c.previous.total, r.sales.previous],
      ]
      for (const [k, a, b] of pairs) if (a !== b) wrong.push(`${placeName} / ${mode}: ${k} ${a} != ${b}`)
    }
  }
  check(`${asked} questions through reportQuestion, countReportAnswer and countCommerce agree with the fixture and with each other`, asked === 15 && wrong.length === 0, wrong.slice(0, 8))
  const all = await countCommerce(db as never, { creatorId: CREATOR, properties: { ...PROPERTIES }, selector: ALL, productId: null, productTypes: TYPES, span, previous, timeZone: TZ, mode: "all" })
  check("the returning customer rate from the database: 2 of 6, Cy's September order found", all.breakdown.returningCustomers === 2 && all.breakdown.customers === 6, [all.breakdown.returningCustomers, all.breakdown.customers])
  check("the fulfillment rate from the checkouts: 1 of 2", all.fulfillmentRate.fulfilled === 1 && all.fulfillmentRate.orders === 2)
  check("nothing truncated, every line in lei", all.truncated === false && all.unconverted === 0 && all.currency === "RON")
  const bad = new URL("https://storelib.com/api/analytics/reports?start=2026-10-20T21:00:00Z&end=2026-10-27T13:00:00Z&property=website:cccccccc-5555-4000-8000-0000000000ff")
  const refused = await reportQuestion(db as never, USER, bad, "storelib.com")
  check("a website that is not the store's is refused before anything is read", "error" in refused && (refused as { status: number }).status === 404)
}

/* ═══ 7. TWO PART REFUNDS OF ONE ORDER, EACH ON ITS OWN DAY ════════════ */

/*
  Lia's 30.00 lei ebook from 1 October: 5.00 refunded on Friday the 16th
  (the week before) and 10.00 on Monday the 26th (this week). The order row
  keeps the total, 15.00, and only the LAST date, the 26th, because every
  refund writes refunded_at again. The seller's ledger has both refunds,
  each with its own time. The old reading put all 15.00 on the 26th: this
  week 15.00 down, the week before untouched. Now: 10.00 this week, 5.00 the
  week before, and Total sales is still Revenue in both.
*/
const LIA = { id: "o-lia", product_id: EBOOK, amount_cents: 3000, status: "refunded", refund_amount_cents: 1500, refunded_at: "2026-10-26T09:00:00Z", created_at: "2026-10-01T10:00:00Z", property_type: "creator_page", buyer_email: "lia@example.com", currency: "RON", quantity: 1, unit_price_cents: 3000, creator_id: CREATOR }
const LIA_LEDGER = [
  { id: "le-1", creator_id: CREATOR, event_type: "refund", order_id: "o-lia", amount_cents: 500, currency: "ron", created_at: "2026-10-16T08:00:00Z" },
  { id: "le-2", creator_id: CREATOR, event_type: "refund", order_id: "o-lia", amount_cents: 1000, currency: "ron", created_at: "2026-10-26T09:00:00Z" },
]

async function partRefunds() {
  console.log("\nTwo part refunds of one order, on different days")
  const { span, previous } = question(WEEK)
  const url = new URL("https://storelib.com/api/analytics/reports")
  url.searchParams.set("start", new Date(span.start).toISOString())
  url.searchParams.set("end", new Date(span.end).toISOString())
  url.searchParams.set("cstart", new Date(previous!.start).toISOString())
  url.searchParams.set("cend", new Date(previous!.end).toISOString())
  url.searchParams.set("tz", TZ)
  url.searchParams.set("product", "all")
  const answerOf = async (db: FakeSupabase) => {
    const q = await reportQuestion(db as never, USER, url, "storelib.com")
    if ("error" in q) throw new Error(String((q as { error: string }).error))
    const r = (await countReportAnswer(db as never, q.q, q.productTitles, q.productTypes, USER)).reports as Reports
    const c = await countCommerce(db as never, { creatorId: CREATOR, properties: q.q.properties, selector: q.q.selector, productId: null, productTypes: q.productTypes, span, previous, timeZone: TZ, mode: "all" })
    return { r, c }
  }
  const base = await answerOf(world())
  const withLedger = world()
  withLedger.table("orders", {}, [...withLedger.rows("orders"), LIA as unknown as Row])
  withLedger.table("ledger_events", {}, LIA_LEDGER as unknown as Row[])
  const now = await answerOf(withLedger)
  const noLedger = world()
  noLedger.table("orders", {}, [...noLedger.rows("orders"), LIA as unknown as Row])
  const old = await answerOf(noLedger)

  check("this week loses only the 10.00 refunded on the 26th", base.r.sales.value - now.r.sales.value === 1000, base.r.sales.value - now.r.sales.value)
  check("the week before loses the 5.00 refunded on the 16th, though the row's date is the 26th", base.r.sales.previous - now.r.sales.previous === 500, base.r.sales.previous - now.r.sales.previous)
  check("one more refund in each week, 10.00 and 5.00 of money", now.r.refunds.value - base.r.refunds.value === 1 && now.r.refunds.cents - base.r.refunds.cents === 1000 && now.r.refunds.previous - base.r.refunds.previous === 1 && now.r.refunds.previousCents - base.r.refunds.previousCents === 500, [now.r.refunds.value - base.r.refunds.value, now.r.refunds.cents - base.r.refunds.cents, now.r.refunds.previousCents - base.r.refunds.previousCents])
  check("Total sales is Revenue in both weeks", now.c.breakdown.total === now.r.sales.value && now.c.previous.total === now.r.sales.previous, [now.c.breakdown.total, now.r.sales.value, now.c.previous.total, now.r.sales.previous])
  check("returns in the breakdown: 10.00 more this week, 5.00 more the week before", now.c.breakdown.returns - base.c.breakdown.returns === 1000 && now.c.previous.returns - base.c.previous.returns === 500, [now.c.breakdown.returns - base.c.breakdown.returns, now.c.previous.returns - base.c.previous.returns])
  const monday = now.r.sales.series.current.length - 2
  check("sales over time: the 26th is 10.00 lower, the other days as they were", base.r.sales.series.current[monday] - now.r.sales.series.current[monday] === 1000 && now.r.sales.series.current.every((v, i) => i === monday || v === base.r.sales.series.current[i]), [base.r.sales.series.current, now.r.sales.series.current])
  check("  and in the breakdown's chart the same", base.c.series[monday].total - now.c.series[monday].total === 1000)
  check("the 16th, in the week before's chart, is 5.00 lower", base.r.sales.series.previous.reduce((a, b) => a + b, 0) - now.r.sales.series.previous.reduce((a, b) => a + b, 0) === 500)
  /* BUG: the row's one date. Without the ledger rows, both refunds are on the 26th, as before. */
  check(`BUG partial refunds moved to the newest date: without the ledger this week lost ${(base.r.sales.value - old.r.sales.value) / 100} lei and the week before ${(base.r.sales.previous - old.r.sales.previous) / 100}; with it 10.00 and 5.00`, base.r.sales.value - old.r.sales.value === 1500 && base.r.sales.previous - old.r.sales.previous === 0, [base.r.sales.value - old.r.sales.value, base.r.sales.previous - old.r.sales.previous])
  const csv = analyticsCsv({ meta: { store: "Mara", from: "a", to: "b", comparedFrom: "c", comparedTo: "d", timeZone: TZ, place: "All pages", sales: "All", currency: "RON", madeAt: "x" }, reports: now.r, commerce: { ...now.c, grain: "day" } as never, sections: sectionsFor(profileOf({ products: [{ type: "digital" }, { type: "physical" }], onePageId: OP, websites: [{ published: true }], communities: 0 }), { property: "all", productKind: null }), timeZone: TZ })
  check("the export says the same: 160.00 lei this week, 5 refunds of 80.00", csv.includes("Total sales (RON),160.00,15.00") && csv.includes("Refunds,5,1") && csv.includes("Refunded (RON),80.00,5.00"), csv.split("\n").filter((l) => /Total sales|Refund/.test(l)).slice(0, 4))
}

endToEnd()
  .then(partRefunds)
  .catch((e) => {
    failed++
    failures.push(`end to end threw: ${(e as Error).stack}`)
    console.log(`  FAIL  end to end threw: ${(e as Error).stack}`)
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed) {
      console.log(failures.map((f) => `  - ${f}`).join("\n"))
      process.exit(1)
    }
  })
