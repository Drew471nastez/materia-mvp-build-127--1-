/**
 * ===========================================================================
 *  /app ANALYTICS: CURRENCIES, RATES, PERCENTAGES AND CHANGES, BY HAND
 * ===========================================================================
 * The owner: "Find more bugs in the analytics with currencies ... rates ...
 * percentages ... stats". A store in lei that sells in five other
 * currencies (dollars, euros, yen with no decimals, Kuwaiti dinars with
 * three, and one in CFA francs no rate covers), with the day rates stubbed
 * in the database fake (fx_rates), so every conversion below is the real
 * code's and every expected number is written out by hand. Then the stores
 * whose own currency has no decimals (yen) and three (dinars), and every
 * rule a percentage on the page follows.
 *
 * Each bug this round fixed is a check that names the old number and the new.
 *
 *   npx tsx --conditions=react-server tests/analytics-currency.test.ts
 */
import { FakeSupabase, type Row } from "./fake-supabase"
import { buildReports, type Reports } from "../lib/analytics/reports"
import { commerceReport, lineBreakdown, withListTotal, type CommerceOrderRow } from "../lib/analytics/commerce"
import { inReportingCurrency } from "../lib/money/report-currency"
import { countReportAnswer, reportQuestion } from "../lib/analytics/report-answer"
import { countCommerce } from "../lib/analytics/commerce-server"
import { analyticsCsv, analyticsFiles, major, parseExportReports, sharesOf, EXPORT_REPORTS } from "../lib/analytics/export-csv"
import { changeOf, percentText, ratio, roundShares } from "../lib/analytics/percent"
import { formatMinor } from "../lib/markets/money"
import { profileOf, sectionsFor } from "../lib/analytics/sections"
import type { OrderRow } from "../lib/orders/order-view"
import type { CreatorProperties } from "../lib/analytics/properties"

/* No network: the ECB history the conversion may reach for when a day has no rate answers nothing. */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder"
globalThis.fetch = (async () => {
  throw new Error("offline")
}) as typeof fetch

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

const CREATOR = "dddddddd-0000-4000-8000-000000000001"
const USER = "dddddddd-0000-4000-8000-0000000000a1"
const EBOOK = "dddddddd-1111-4000-8000-000000000001"
const PRINT = "dddddddd-1111-4000-8000-000000000002"
const TZ = "UTC"
/* Tuesday 27 October 2026, noon. The week is 21 October 00:00 to now, compared with 14 October 00:00 to 20 October noon. */
const NOW = Date.parse("2026-10-27T12:00:00Z")
const WEEK = { start: Date.parse("2026-10-21T00:00:00Z"), end: NOW }
const BEFORE = { start: Date.parse("2026-10-14T00:00:00Z"), end: Date.parse("2026-10-20T12:00:00Z") }
const PROPS: CreatorProperties = { onePageId: null, websites: [], defaultWebsite: null }
const TYPES: Record<string, string | null> = { [EBOOK]: "digital", [PRINT]: "physical" }
const TITLES: Record<string, string> = { [EBOOK]: "Ebook", [PRINT]: "Print" }

/*
  THE DAY RATES, per euro as the ECB publishes them, chosen so every
  conversion is a sum one can do by hand: 1 euro is 5 lei, 1.25 dollars,
  160 yen, 0.4 dinars. No rate for the CFA franc.
*/
const RATES = { RON: 5, USD: 1.25, JPY: 160, KWD: 0.4 }
const FX = Array.from({ length: 30 }, (_, i) => ({ as_of: new Date(Date.parse("2026-10-01T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), rates: RATES, base: "EUR" }))

let n = 0
type Line = OrderRow & { unit_price_cents?: number; shipping_cents?: number; tax_cents?: number; tax_included?: boolean }
const line = (o: Partial<Line> & { created_at: string; amount_cents: number; currency: string }): Line => ({
  id: `l-${String(++n).padStart(3, "0")}`,
  product_id: EBOOK,
  status: "completed",
  quantity: 1,
  unit_price_cents: o.amount_cents,
  property_type: "creator_page",
  buyer_email: `b${n}@example.com`,
  ...o,
})

/* In lei (bani) by hand, at 5 lei to the euro. */
const ORDERS: Line[] = [
  /* 30.00 lei as it is. */
  line({ amount_cents: 3000, currency: "ron", created_at: "2026-10-21T10:00:00Z" }),
  /* $10.00 = 8 euros = 40.00 lei. */
  line({ amount_cents: 1000, currency: "usd", created_at: "2026-10-22T10:00:00Z" }),
  /* 10.00 euros = 50.00 lei. */
  line({ amount_cents: 1000, currency: "eur", created_at: "2026-10-22T11:00:00Z" }),
  /* 1,600 yen (no decimals) = 10 euros = 50.00 lei. */
  line({ amount_cents: 1600, currency: "jpy", created_at: "2026-10-23T10:00:00Z" }),
  /* 2.000 dinars (three decimals: 2000 fils) = 5 euros = 25.00 lei. */
  line({ amount_cents: 2000, currency: "kwd", created_at: "2026-10-23T11:00:00Z" }),
  /* Three prints at 1,005 yen, 3,015 yen = 94.21875 lei charged, 94.22; each 1,005 yen is 31.40625, 31.41, and three of those 94.23. */
  line({ product_id: PRINT, amount_cents: 3015, unit_price_cents: 1005, quantity: 3, currency: "jpy", created_at: "2026-10-24T10:00:00Z" }),
  /* A $20.00 order refunded $5.00 on the 26th: 80.00 lei on the 24th, 20.00 lei back on the 26th, at the order's own rate. */
  line({ amount_cents: 2000, currency: "usd", status: "refunded", refund_amount_cents: 500, refunded_at: "2026-10-26T09:00:00Z", created_at: "2026-10-24T12:00:00Z" }),
  /* 5,000 CFA francs: no rate, so not guessed. Left out of the money, and counted. */
  line({ amount_cents: 5000, currency: "xaf", created_at: "2026-10-25T10:00:00Z" }),
  /* The week before: one order of 10.00 euros, refunded in full on the 22nd of this week. */
  line({ amount_cents: 1000, currency: "eur", status: "refunded", refund_amount_cents: 1000, refunded_at: "2026-10-22T08:00:00Z", created_at: "2026-10-16T10:00:00Z" }),
]

function world(): FakeSupabase {
  const db = new FakeSupabase()
  db.clock = NOW
  db.table("products", {}, Object.keys(TYPES).map((id) => ({ id, creator_id: CREATOR, title: TITLES[id], type: TYPES[id] })))
  db.table("creators", { embeds: { products: (r, d) => d.rows("products").filter((p) => p.creator_id === r.id).map((p) => ({ id: p.id, title: p.title, type: p.type })) } }, [{ id: CREATOR, user_id: USER, slug: "kenji", display_name: "Kenji" }])
  for (const t of ["store_theme_installs", "onepages", "onepage_views", "onepage_clicks", "custom_domains", "download_events", "fulfillments", "subscribers", "commerce_checkouts"]) db.table(t, {}, [])
  db.table("store_settings", {}, [{ creator_id: CREATOR, currency: "RON" }])
  db.table("fx_rates", {}, FX as unknown as Row[])
  db.table("orders", {}, ORDERS.map((o) => ({ ...o, creator_id: CREATOR })) as unknown as Row[])
  db.table("analytics_events", {}, [
    ...["v1", "v2", "v3", "v4"].map((v, i) => ({ id: `e${i}`, event_type: "view", visitor_id: v, session_id: v, created_at: `2026-10-2${2 + i}T09:00:00Z`, property_type: "creator_page", path: "/kenji", creator_id: CREATOR, source_category: "direct", referrer_domain: "Direct" })),
  ] as unknown as Row[])
  return db
}

async function main() {
  /* ═══ 1. A LEI STORE SELLING IN FIVE OTHER CURRENCIES, END TO END ════════ */
  console.log("\nA store in lei, orders in dollars, euros, yen, dinars and CFA francs, through the routes' own code")
  const db = world()
  const url = new URL("https://storelib.com/api/analytics/reports")
  url.searchParams.set("start", new Date(WEEK.start).toISOString())
  url.searchParams.set("end", new Date(WEEK.end).toISOString())
  url.searchParams.set("cstart", new Date(BEFORE.start).toISOString())
  url.searchParams.set("cend", new Date(BEFORE.end).toISOString())
  url.searchParams.set("tz", TZ)
  const q = await reportQuestion(db as never, USER, url, "storelib.com")
  if ("error" in q) throw new Error(String((q as { error: string }).error))
  const answer = await countReportAnswer(db as never, q.q, q.productTitles, q.productTypes, USER)
  const r = answer.reports as Reports
  const conv = answer.conversion as { currency: string; converted: number; unconverted: number }
  const c = await countCommerce(db as never, { creatorId: CREATOR, properties: q.q.properties, selector: q.q.selector, productId: null, productTypes: q.productTypes, span: WEEK, previous: BEFORE, timeZone: TZ, mode: "all" })

  /* 30 + 40 + 50 + 50 + 25 + 94.22 + 80, less the refunds made this week: 20.00 of the dollar order, 50.00 of last week's euro order. */
  const want = 3000 + 4000 + 5000 + 5000 + 2500 + 9422 + 8000 - 2000 - 5000
  check(`revenue ${want / 100} lei: every order at its own day's rate, the CFA francs left out, this week's refunds off on their own day`, r.sales.value === want, r.sales.value)
  check("orders 7: the CFA franc order has no rate and is not counted in money or orders, as the page's note says", r.orders.value === 7, r.orders.value)
  check("the note's numbers: 7 converted, 1 that could not be, in RON", conv.currency === "RON" && conv.unconverted === 1 && conv.converted >= 7, conv)
  check("Total sales in the breakdown is Revenue, to the ban, in a store of six currencies", c.breakdown.total === r.sales.value && c.breakdown.orders === r.orders.value, [c.breakdown.total, r.sales.value])
  check("returns 70.00 lei: the dollar refund at its order's rate (5 x 4) and the euro one (10 x 5)", c.breakdown.returns === 7000, c.breakdown.returns)
  check("the week before: 1 order, 50.00 lei (its refund is this week's)", r.orders.previous === 1 && r.sales.previous === 5000 && c.previous.total === 5000, [r.orders.previous, r.sales.previous, c.previous.total])
  const oldPhantom = (() => {
    /* The old conversion: unit price and charge converted apart, the unit then times three. */
    const [old] = inReportingCurrency([{ ...ORDERS[5] } as CommerceOrderRow], "RON", FX.map((d) => ({ asOf: d.as_of, rates: d.rates }))).rows
    return lineBreakdown(old as CommerceOrderRow).discounts
  })()
  check(`BUG phantom discount: three prints at 1,005 yen in a lei store showed a discount of ${oldPhantom} bani nobody gave (unit converted then tripled, 94.23 against 94.22 charged); now ${c.breakdown.discounts}`, oldPhantom === 1 && c.breakdown.discounts === 0, [oldPhantom, c.breakdown.discounts])
  check("  gross sales are then exactly what was charged, item by item: 302.22 lei", c.breakdown.gross === 3000 + 4000 + 5000 + 5000 + 2500 + 9422 + 8000, c.breakdown.gross)
  const aov = Math.round((c.breakdown.gross - c.breakdown.discounts) / c.breakdown.orders)
  check(`average order value ${aov / 100} lei: converted gross less discounts over 7 orders, never cents of five currencies added as one`, c.breakdown.aov === aov && aov === Math.round(36922 / 7), c.breakdown.aov)
  const rawMix = ORDERS.slice(0, 7).reduce((a, o) => a + o.amount_cents, 0) / 7
  check(`  (adding the orders' own minor units would say ${Math.round(rawMix) / 100}, a number of nothing)`, Math.round(rawMix) !== c.breakdown.aov)
  check("the Digital and Physical columns add up to the whole in a mixed currency store", !!c.kinds && c.kinds.digital.total + c.kinds.physical.total === c.breakdown.total && c.kinds.physical.total === 9422, c.kinds && [c.kinds.digital.total, c.kinds.physical.total])
  check("conversion is orders over visitors of the same place and period: 7 over 4, the funnel's last step over its first", r.conversion.value === 7 / 4 && r.funnel[4].value / r.funnel[0].value === r.conversion.value, r.conversion.value)
  check("refunds 2 this week, 70.00 lei back; none the week before", r.refunds.value === 2 && r.refunds.cents === 7000 && r.refunds.previous === 0, [r.refunds.value, r.refunds.cents])

  /* ═══ 2. STORES WHOSE OWN CURRENCY HAS NO DECIMALS, OR THREE ═════════════ */
  console.log("\nA yen store and a dinar store")
  const days = FX.map((d) => ({ asOf: d.as_of, rates: d.rates }))
  const toStore = (rows: Line[], ccy: string) => inReportingCurrency(withListTotal(rows as CommerceOrderRow[]) as unknown as Line[], ccy, days).rows as unknown as OrderRow[]
  const yenRows = toStore([ORDERS[0], ORDERS[1], ORDERS[3]], "JPY")
  const yen = buildReports({ orders: yenRows, wire: { cur: { visitors: 0 }, prev: { visitors: 0 } }, window: WEEK, previous: BEFORE, timeZone: TZ, mainDomain: "storelib.com", productTitles: TITLES, productTypes: TYPES })
  /* 30 lei = 6 euros = 960 yen; $10 = 8 euros = 1,280 yen; 1,600 yen as it is. */
  check("yen: 30 lei + $10 + 1,600 yen = 3,840 yen, in whole yen", yen.sales.value === 960 + 1280 + 1600, yen.sales.value)
  check("  written ¥3,840 on the page and 3840 in the export, never ¥38.40", formatMinor(yen.sales.value, "JPY", "en") === "¥3,840" && major(yen.sales.value, "JPY") === "3840", [formatMinor(yen.sales.value, "JPY", "en"), major(yen.sales.value, "JPY")])
  check("  with no visitors there is no conversion rate, not 0% and not Infinity", yen.conversion.value === null && percentText(yen.conversion.value) === "–")
  const kwdRows = toStore([ORDERS[1], ORDERS[4]], "KWD")
  const kwd = commerceReport({ rows: kwdRows, span: WEEK, previous: BEFORE, timeZone: TZ, selector: { type: "all" }, properties: PROPS, productId: null, mode: "all", productTypes: TYPES })
  /* $10 = 8 euros = 3.200 dinars; 2.000 dinars. */
  check("dinars: $10 + 2.000 KWD = 5.200 KWD, average 2.600, in fils", kwd.breakdown.total === 5200 && kwd.breakdown.aov === 2600, [kwd.breakdown.total, kwd.breakdown.aov])
  const kwdReports = buildReports({ orders: kwdRows, wire: { cur: { visitors: 2 }, prev: { visitors: 0 } }, window: WEEK, previous: BEFORE, timeZone: TZ, mainDomain: "storelib.com", productTitles: TITLES, productTypes: TYPES })
  const digitalOnly = profileOf({ products: [{ type: "digital" }], onePageId: null, websites: [], communities: 0 })
  const csv = analyticsCsv({ meta: { store: "Kenji", from: "2026-10-21", to: "2026-10-27", comparedFrom: "2026-10-14", comparedTo: "2026-10-20", timeZone: TZ, place: "All pages", sales: "All", currency: "KWD", madeAt: "x" }, reports: kwdReports, commerce: { ...kwd, fulfillment: { hours: null, shipped: 0 }, grain: "day" }, sections: sectionsFor(digitalOnly, { property: "all", productKind: null }), timeZone: TZ }).split("\r\n")
  check("  the export writes three decimals: 5.200 and 2.600", csv.includes("Total sales,5.200,0.000") && csv.includes("Average order value (KWD),2.600,"), csv.filter((l) => /^(Total sales|Average order value)/.test(l)))

  /* ═══ 3. PERCENTAGES ════════════════════════════════════════════════════ */
  console.log("\nPercentages: nothing to divide by, shares of a whole, changes against nothing and below nothing")
  check("a rate with nothing to divide by is null and written –: never NaN%, never 0%", ratio(3, 0) === null && ratio(0, 0) === null && percentText(null) === "–" && percentText(NaN) === "–" && percentText(0 / 0) === "–")
  check("small rates keep a decimal, the rest are whole: 2.5%, 12%, 140%", percentText(0.025) === "2.5%" && percentText(0.123) === "12%" && percentText(1.4) === "140%")
  const third = roundShares([1, 1, 1])
  const oldThird = [1, 1, 1].map((v) => Math.round((v / 3) * 100))
  check(`BUG shares of one whole did not add up to 100: three equal sources read ${oldThird.join(" + ")} = ${oldThird.reduce((a, b) => a + b)}%; now ${third.join(" + ")} = ${third.reduce((a, b) => a + b)}%`, oldThird.reduce((a, b) => a + b) === 99 && third.reduce((a, b) => a + b) === 100 && third.join() === "34,33,33")
  const split = roundShares([335, 665])
  const oldSplit = [0.335, 0.665].map((f) => Number((f * 100).toFixed(0)))
  check(`BUG the Top products split read ${oldSplit[0]}% digital · ${oldSplit[1]}% physical (${oldSplit[0] + oldSplit[1]}%); now ${split[0]}% · ${split[1]}%`, oldSplit[0] + oldSplit[1] === 101 && split.join() === "33,67" /* a tie of remainders goes to the larger part */)
  check("  nothing at all is 0% each, and a negative part counts as nothing", roundShares([0, 0]).join() === "0,0" && roundShares([-5, 10]).join() === "0,100")
  check("  the export's shares add up to 100.0 when the list is whole, one decimal", sharesOf([{ value: 1, share: 1 / 3 }, { value: 1, share: 1 / 3 }, { value: 1, share: 1 / 3 }]).join() === "33.4,33.3,33.3")
  check("a change against nothing is no percentage (the page writes New), never Infinity or +100%", changeOf(5, 0) === null && changeOf(0, 0) === null)
  const oldNegative = (5 - -10) / -10
  check(`BUG a change against a negative period (a week of refunds) read ${Math.round(oldNegative * 100)}%, a fall; now +${Math.round((changeOf(5, -10) ?? 0) * 100)}%, measured by its size`, oldNegative === -1.5 && changeOf(5, -10) === 1.5)
  /* A week whose refunds of older orders outweigh its sales: below nothing, and the week after measured from there. */
  const negRows: OrderRow[] = [
    { id: "n1", product_id: EBOOK, amount_cents: 2000, status: "refunded", refund_amount_cents: 2000, refunded_at: "2026-10-16T10:00:00Z", created_at: "2026-09-01T10:00:00Z", currency: "ron" },
    { id: "n2", product_id: EBOOK, amount_cents: 1000, status: "completed", created_at: "2026-10-22T10:00:00Z", currency: "ron" },
  ]
  const neg = buildReports({ orders: negRows, wire: { cur: { visitors: 1 }, prev: { visitors: 1 } }, window: WEEK, previous: BEFORE, timeZone: TZ, mainDomain: "storelib.com", productTitles: TITLES, productTypes: TYPES })
  check("  a week of only a refund of an older order is -20.00 lei, and this week's 10.00 is up 150% from it, not New", neg.sales.previous === -2000 && neg.sales.value === 1000 && neg.sales.change === 1.5, [neg.sales.previous, neg.sales.value, neg.sales.change])
  const none = commerceReport({ rows: [], span: WEEK, previous: BEFORE, timeZone: TZ, selector: { type: "all" }, properties: PROPS, productId: null, mode: "all", productTypes: TYPES })
  const emptyCsv = analyticsCsv({ meta: { store: "x", from: "a", to: "b", comparedFrom: "c", comparedTo: "d", timeZone: TZ, place: "All pages", sales: "All", currency: "RON", madeAt: "x" }, reports: neg, commerce: { ...none, fulfillment: { hours: null, shipped: 0 }, grain: "day" }, sections: sectionsFor(digitalOnly, { property: "all", productKind: null }), timeZone: TZ }).split("\r\n")
  check("BUG the export wrote a returning customer rate of 0.0% and an average order of 0.00 for a period with no customer and no order: now blank, as the page writes –", emptyCsv.includes("Returning customer rate (%),,") && emptyCsv.includes("Average order value (RON),,"), emptyCsv.filter((l) => /^(Returning|Average)/.test(l)))

  /* ═══ 4. THE EXPORT'S CHOICES ═══════════════════════════════════════════ */
  console.log("\nThe export: which reports, one file or a file each")
  check("the reports asked for, only real ones, in the page's order; nothing asked is everything", parseExportReports("funnel,sales,../etc,summary").join() === "summary,sales,funnel" && parseExportReports(null).length === EXPORT_REPORTS.length && parseExportReports("").length === EXPORT_REPORTS.length)
  const both = sectionsFor(profileOf({ products: [{ type: "digital" }, { type: "physical" }], onePageId: null, websites: [], communities: 0 }), { property: "all", productKind: null })
  const input = { meta: { store: "Kenji", from: "2026-10-21", to: "2026-10-27", comparedFrom: "2026-10-14", comparedTo: "2026-10-20", timeZone: TZ, place: "All pages", sales: "All", currency: "RON", madeAt: "x" }, reports: r, commerce: { ...c, grain: "day" as const }, sections: both, timeZone: TZ }
  const onlySales = analyticsCsv({ ...input, only: ["sales"] }).split("\r\n")
  check("one CSV of the reports chosen: Sales alone has its four sections and not the Summary or the Funnel", onlySales.includes("Total sales breakdown") && onlySales.includes("Total sales by channel") && !onlySales.includes("Summary") && !onlySales.includes("Funnel") && onlySales.includes("Currency,\"RON, amounts in RON with 2 decimals\""))
  const files = analyticsFiles({ ...input, only: ["summary", "funnel", "devices"] })
  check("a file per report, each with the store's head, named in the page's order", files.map((f) => f.name).join() === "01-summary.csv,07-funnel.csv,10-devices.csv" && files.every((f) => f.csv.startsWith("Storelib analytics\r\nStore,Kenji")), files.map((f) => f.name))
  check("  a cell that starts like a formula is still kept as text in every file", !files.some((f) => /(^|,)=/.test(f.csv)))
}

main()
  .catch((e) => {
    failed++
    failures.push(`threw: ${(e as Error).stack}`)
    console.log(`  FAIL  threw: ${(e as Error).stack}`)
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed) {
      console.log(failures.map((f) => `  - ${f}`).join("\n"))
      process.exit(1)
    }
  })
