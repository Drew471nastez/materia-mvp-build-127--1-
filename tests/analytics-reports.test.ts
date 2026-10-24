/**
 * THE ANALYTICS REPORTS' RULES
 *
 * lib/analytics/reports.ts decides every figure on /app/analytics and Home.
 * These are the ways such figures go quietly wrong: a visitor counted once
 * per place they saw, a visit's source taken from its last page, a basket
 * counted as three orders, a refund counted as a sale, an order counted
 * under two places or under none, a OnePage visit counted from two tables,
 * a day in the wrong time zone, a period read from the browser's first
 * thousand rows. tests/analytics-report-sql.test.ts holds the database's
 * counting to the same answers on a real Postgres.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  bucketStarts,
  buildReports,
  channelOfUrl,
  foldLegacyOnePage,
  grainFor,
  previousWindow,
  reportArgs,
  salesFor,
  sessionsOf,
  socialNetwork,
  sourceGroup,
  sourceName,
  wireFromRows,
  type ReportWire,
  type StepRow,
  type SubscriberRow,
  type ViewRow,
} from "../lib/analytics/reports"
import { groupOrders, isSale, PAYMENT_LABEL, type OrderRow } from "../lib/orders/order-view"
import { readMetrics } from "../lib/orders/metrics"
import { dayPart, firstName, greetingZone } from "../lib/greeting"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "../lib/analytics/sources"
import { isBotAgent, parseUserAgent } from "../lib/analytics/user-agent"
import { lineMoney, moneyOf, spansToRead } from "../lib/analytics/reports"
import { questionOf, reportKey, reportNow } from "../lib/analytics/report-cache"
import { commerceRowCounts } from "../lib/analytics/commerce"
import { axisWidth, compactCount, compactMoney, compactPercent, niceScale } from "../lib/analytics/chart-scale"
import {
  ALL,
  DEFAULT_PROPERTY,
  DEFAULT_PROPERTY_LABEL,
  counts,
  isSignup,
  orderProperty,
  ownsProperty,
  parseProperty,
  propertyOptions,
  propertyParam,
  subscriberProperty,
  type CreatorProperties,
  type PropertySelector,
} from "../lib/analytics/properties"
import { summaryHref, summaryText } from "../lib/analytics/summary"
import { homeFromReports } from "../lib/analytics/home-figures"
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const HOUR = 3_600_000
const DAY = 24 * HOUR
const T0 = Date.parse("2026-09-14T00:00:00Z")
const at = (d: number, h = 12) => new Date(T0 + d * DAY + h * HOUR).toISOString()

/* The creator's places in these checks: a OnePage and two websites, W1 live. */
const OP = "00000000-0000-4000-8000-0000000000a1"
const W1 = "00000000-0000-4000-8000-0000000000b1"
const W2 = "00000000-0000-4000-8000-0000000000b2"
const STRANGER = "00000000-0000-4000-8000-0000000000c9"
const PLACES: CreatorProperties = { onePageId: OP, websites: [{ id: W1, name: "Studio" }, { id: W2, name: "Shop" }], defaultWebsite: W1 }

function view(session: string, d: number, extra: Partial<ViewRow> = {}, h = 12): ViewRow {
  return { session_id: session, visitor_id: `v-${session}`, created_at: at(d, h), page_url: "https://storelib.com/ana", property_type: "creator_page", property_id: null, path: "/ana", ...extra }
}
function order(id: string, d: number, extra: Partial<OrderRow> = {}): OrderRow {
  return { id, product_id: "p1", amount_cents: 2000, status: "completed", created_at: at(d, 13), ...extra }
}
const W = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
const report = (input: Partial<Parameters<typeof buildReports>[0]> & { orders?: OrderRow[] }) =>
  buildReports({ views: [], steps: [], orders: [], window: W, timeZone: "UTC", mainDomain: "storelib.com", productTitles: { p1: "Presets", p2: "Brushes" }, properties: PLACES, ...input })

console.log("\nAnalytics reports: periods")
{
  const w = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
  const p = previousWindow(w)
  check("the period before is the same length, just before", p.end === w.start && p.start === w.start - 7 * DAY)
  check("a day is drawn by the hour", grainFor({ start: T0, end: T0 + DAY }) === "hour")
  check("a week by the day", grainFor(w) === "day" && bucketStarts(w, "day", "UTC").length === 7)
  check("a year by the month", grainFor({ start: T0, end: T0 + 365 * DAY }) === "month")
  const buckets = bucketStarts(w, "day", "America/New_York")
  check("days start at the viewer's midnight", new Date(buckets[1]).toISOString().endsWith("04:00:00.000Z"), new Date(buckets[1]).toISOString())
}

console.log("\nAnalytics reports: sessions")
{
  const w = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
  const views = [
    view("a", 8, { source_category: "social_instagram", device_type: "mobile" }, 10),
    view("a", 8, { source_category: "direct", device_type: "desktop" }, 11),
    view("a", 8, { source_category: "direct" }, 12),
    view("b", 9, { source_category: "organic_search", referrer_domain: "www.google.com" }),
    { visitor_id: "loner", created_at: at(10, 9) },
    { visitor_id: "loner", created_at: at(10, 15) },
    { visitor_id: "loner", created_at: at(11, 9) },
  ] as ViewRow[]
  const s = sessionsOf(views, w, "UTC")
  check("three pages in one visit are one session", s.filter((x) => x.key === "s:a").length === 1)
  check("a visit is described by its first page", s.find((x) => x.key === "s:a")?.first.source_category === "social_instagram")
  check("without a session id, a visitor's day is one visit", s.filter((x) => x.key.startsWith("v:loner")).length === 2, s.map((x) => x.key))
  check("social apps group under Social", sourceGroup("social_tiktok") === "social" && socialNetwork("social_tiktok") === "tiktok")
  check("an unknown category is a referral, not dropped", sourceGroup("something_new") === "referral")
  check("a source in words: the network, else the group", sourceName("social_instagram") === "Instagram" && sourceName("organic_search") === "Search" && sourceName(null) === "Direct")
}

console.log("\nAnalytics reports: channels")
{
  check("storelib.com is Storelib", channelOfUrl("https://storelib.com/ana", "storelib.com") === "storelib")
  check("a subdomain is the website", channelOfUrl("https://ana.storelib.com/about", "storelib.com") === "website")
  check("a custom domain is the website", channelOfUrl("https://anashop.ro/", "storelib.com") === "website")
  check("no address is not guessed", channelOfUrl(null, "storelib.com") === null)
}

console.log("\nThe property filter: which place, and only the creator's own")
{
  /*
    "In Analytics, as default it needs to be set to all pages in that thing, a
    default, but people can change it." The default is a declared thing
    (DEFAULT_PROPERTY) rather than what is left when every other branch of
    parseProperty fails, it is All pages, and it is the name at the top of the
    filter's list. The page reads it in propertyFromAddress
    (app/app/analytics/analytics-client) and scripts/check-analytics-page
    loads the page with no property, an empty one, a word that is not a place
    and a website the creator does not have, and reads the button, the read
    and the address for each.
  */
  check("the filter's default is a declared All pages, not a fall-through",
    DEFAULT_PROPERTY.type === "all" && DEFAULT_PROPERTY_LABEL === "All pages"
      && propertyOptions(PLACES)[0].label === DEFAULT_PROPERTY_LABEL
      && /DEFAULT_PROPERTY/.test(read("app/app/analytics/analytics-client.tsx"))
      && /default, nothing in the address|the filter reads/.test(read("scripts/check-analytics-page.mjs")))
  check("no parameter is All", parseProperty(null).type === "all" && propertyParam(ALL) === null)
  check("the creator page and the OnePage by name", parseProperty("creator_page").type === "creator_page" && parseProperty("onepage").type === "onepage")
  const w = parseProperty(`website:${W2.toUpperCase()}`)
  check("a website by its install id, in lower case", w.type === "website" && (w as { id: string }).id === W2 && propertyParam(w) === `website:${W2}`)
  check("anything unreadable is All, not an error and not a guess", parseProperty("website:../../etc").type === "all" && parseProperty("store").type === "all")
  check("the creator's own places are theirs", ownsProperty(PLACES, { type: "website", id: W1 }) && ownsProperty(PLACES, { type: "onepage" }) && ownsProperty(PLACES, ALL))
  check("  somebody else's website is not, and neither is a OnePage the creator does not have",
    !ownsProperty(PLACES, { type: "website", id: STRANGER }) && !ownsProperty({ ...PLACES, onePageId: null }, { type: "onepage" }))
  const labels = propertyOptions(PLACES).map((o) => o.label)
  check("the filter lists All pages, the creator page, the OnePage and each website by its name", labels.join("|") === "All pages|Creator page|OnePage|Studio|Shop", labels)
  check("  one website is just Website", propertyOptions({ onePageId: null, websites: [{ id: W1, name: "Studio" }], defaultWebsite: W1 }).map((o) => o.label).join("|") === "All pages|Creator page|Website")
  check("  and a creator with only a creator page has nothing to choose", propertyOptions({ onePageId: null, websites: [], defaultWebsite: null }).length === 1)
  check("a website row that never knew its install is the live website's, and only that one's",
    counts({ type: "website", id: W1 }, { type: "website", id: null }, W1) && !counts({ type: "website", id: W2 }, { type: "website", id: null }, W1))
  check("All counts everything, a place only its own", counts(ALL, { type: null, id: null }, W1) && !counts({ type: "creator_page" }, { type: "onepage", id: OP }, W1))
}

console.log("\nAn order is under exactly one place")
{
  const one = (lines: Partial<OrderRow>[], source: string | null = null) => orderProperty({ lines: lines as never, source })
  check("attributed: its own property", one([{ property_type: "website", property_id: W2 }]).type === "website" && one([{ property_type: "website", property_id: W2 }]).id === W2)
  check("  the creator page's id is not needed to tell it apart", one([{ property_type: "creator_page", property_id: "creator-id" }]).id === null)
  check("before part 60: a website's source is the website", one([{ source: "website" }], "website").type === "website")
  check("  the OnePage's surface is the OnePage", one([{ source: "storelib", source_detail: { surface: "onepage" } }], "storelib").type === "onepage")
  check("  anything else is the creator page", one([{ source: "storelib", source_detail: { surface: "product" } }], "storelib").type === "creator_page" && one([{}], null).type === "creator_page")
  const orders: OrderRow[] = [
    order("cp", 8, { property_type: "creator_page", property_id: "c" } as never),
    order("op", 8, { property_type: "onepage", property_id: OP } as never),
    order("w1", 9, { property_type: "website", property_id: W1 } as never),
    order("w2", 9, { property_type: "website", property_id: W2, amount_cents: 1234 } as never),
    order("wnull", 9, { property_type: "website", property_id: null, amount_cents: 999 } as never),
    order("oldweb", 10, { source: "website" }),
    order("oldop", 10, { source: "storelib", source_detail: { surface: "onepage" } } as never),
    order("old", 10, {}),
    order("b1", 11, { stripe_session_id: "cs_b", amount_cents: 700 }),
    order("b2", 11, { stripe_session_id: "cs_b", amount_cents: 300, product_id: "p2" }),
    order("stranger", 11, { property_type: "website", property_id: STRANGER } as never),
  ]
  const all = salesFor(orders, ALL, W1)
  const places: PropertySelector[] = [{ type: "creator_page" }, { type: "onepage" }, { type: "website", id: W1 }, { type: "website", id: W2 }]
  const parts = places.map((p) => salesFor(orders, p, W1))
  const ids = parts.flat().map((o) => o.id)
  check("every order is under one place: none twice", new Set(ids).size === ids.length, ids)
  check("  and All is the parts, but for an order on a website the creator no longer has", all.length === ids.length + 1 && all.some((o) => o.lines[0].id === "stranger"), { all: all.length, parts: ids.length })
  const cents = (list: ReturnType<typeof salesFor>) => list.reduce((n, o) => n + moneyOf(o).net, 0)
  check("  to the cent", cents(all) - cents(parts.flat()) === 2000, { all: cents(all), parts: cents(parts.flat()) })
  check("the live website has its own orders and every website order that never knew its install", parts[2].map((o) => o.id).sort().join() === ["oldweb", "w1", "wnull", "b1"].sort().join(), parts[2].map((o) => o.id))
  check("  a basket with no source is a website's, as the Orders page says", parts[2].some((o) => o.lines.length === 2))
}

console.log("\nAnalytics reports: everything together")
{
  const views: ViewRow[] = [
    view("a", 8, { source_category: "social_instagram", device_type: "mobile", browser: "safari", os: "iOS", country_code: "RO", country_name: "Romania", city: "Cluj-Napoca" }, 10),
    view("a", 8, { source_category: "direct" }, 11),
    view("b", 9, { source_category: "organic_search", referrer_domain: "www.google.com", device_type: "desktop", country_code: "US", page_url: "https://anashop.ro/", property_type: "website", property_id: W1, path: "/" }),
    view("c", 9, { source_category: "referral", referrer_domain: "ana.storelib.com", device_type: "tablet", country_code: "RO", product_id: "p1", path: "/ana/presets" }),
    view("d", 10, { device_type: null, utm_campaign: "Autumn" }),
    view("old", 2, { source_category: "direct" }),
  ]
  const steps: StepRow[] = [
    { event_type: "buy_click", session_id: "a", visitor_id: "v-a", created_at: at(8, 11.5), property_type: "creator_page" },
    { event_type: "checkout_start", session_id: "a", created_at: at(8, 11.6), property_type: "creator_page" },
    { event_type: "checkout_start", session_id: "a", created_at: at(8, 11.7), property_type: "creator_page" },
    { event_type: "link_click", visitor_id: "vz", property_type: "onepage", property_id: OP, link_id: "b1", created_at: at(9) },
    { event_type: "link_click", visitor_id: "vz", property_type: "onepage", property_id: OP, link_id: "b1", created_at: at(9, 13) },
    { event_type: "link_click", visitor_id: "vy", property_type: "onepage", property_id: OP, link_url: "https://youtube.com/x", created_at: at(10) },
  ]
  const orders: OrderRow[] = [
    order("o1", 8, { buyer_country_code: "RO", buyer_country: "Romania", source: "website" }),
    order("o2a", 9, { stripe_session_id: "cs_1", product_id: "p1" }),
    order("o2b", 9, { stripe_session_id: "cs_1", product_id: "p2", amount_cents: 1000 }),
    order("o3", 10, { status: "refunded", refund_amount_cents: 500, source: "storelib" }),
    order("o4", 10, { status: "failed" }),
    order("o5", 11, { amount_cents: 0, source: "storelib" }),
    order("o0", 3, { amount_cents: 4000, source: "storelib" }),
  ]
  const r = report({ views, steps, orders, linkLabels: { b1: "My shop" } })

  check("visitors are people: four, whatever they opened", r.visitors.value === 4 && r.visitors.previous === 1, r.visitors)
  check("page views are every page: five", r.views.value === 5, r.views.value)
  check("sessions: four visits, compared with one the week before", r.sessions.value === 4 && r.sessions.previous === 1 && r.sessions.change === 3)
  check("orders: a basket is one, a failed payment none", r.orders.value === 4, r.orders.value)
  check("revenue: paid less refunded", r.sales.value === 2000 + 3000 + 1500 + 0, r.sales.value)
  check("conversion is orders over unique visitors", r.conversion.value === 1, r.conversion.value)
  check("the chart's visitors, views and orders are drawn per day, from the same counts",
    r.visitors.series.current.length === 7 && r.views.series.current.reduce((a, b) => a + b, 0) === r.views.value && r.orders.series.current.reduce((a, b) => a + b, 0) === r.orders.value)

  const p1 = r.topProducts.find((p) => p.key === "p1")
  check("top products: each product's own lines less its refund, a free download still an order, its page views beside",
    p1?.salesCents === 2000 + 2000 + 1500 && p1?.orders === 4 && p1?.views === 1, p1)
  check("  and they add up to Revenue", r.topProducts.reduce((n, p) => n + p.salesCents, 0) === r.sales.value)

  const f = Object.fromEntries(r.funnel.map((s) => [s.key, s]))
  check("the funnel is people: four visitors, one opened a product, one opened the checkout (twice), four ordered",
    f.visitors.value === 4 && f.product.value === 1 && f.checkout.value === 1 && f.orders.value === 4, r.funnel)
  check("  a step's rate is of the step before; more orders than checkouts is no rate, not 400%",
    f.visitors.rate === null && f.product.rate === 0.25 && f.cart.value === 1 && f.cart.rate === 1 && f.checkout.rate === 1 && f.orders.rate === null, r.funnel.map((s) => s.rate))

  const pages = r.topPages.map((p) => `${p.place}:${p.label}:${p.views}/${p.visitors}`)
  check("top pages are each place's paths, with their views and visitors, and under All the place they are on",
    pages.join("|") === "Creator page:/ana:3/2|Studio:/:1/1|Creator page:/ana/presets:1/1", pages)
  check("link clicks come from link_click, never an event called 'click'", r.linkClicks.value === 3 && r.linkClicks.series.current.reduce((a, b) => a + b, 0) === 3)
  check("  a OnePage block by its own name, a link out by where it goes", r.topLinks[0]?.label === "My shop" && r.topLinks[0]?.clicks === 2 && r.topLinks[0]?.visitors === 1 && r.topLinks[1]?.label === "youtube.com/x", r.topLinks)

  const src = Object.fromEntries(r.breakdowns.source.map((x) => [x.key, x.value]))
  check("sources are counted per visit, by the visit's first page", src.social === 1 && src.organic_search === 1 && src.referral === 1 && src.direct === 1, src)
  check("a visit from the creator's own site is not a referrer", !r.breakdowns.referrer.some((x) => x.key.includes("storelib")), r.breakdowns.referrer)
  /* Changed on purpose: a referrer is its company, Google for any of its sites or its app (round Z6). */
  check("google is one referrer, named Google, without www", r.breakdowns.referrer[0]?.key === "google" && r.breakdowns.referrer[0]?.label === "Google")
  check("social names the app", r.breakdowns.social[0]?.label === "Instagram")
  check("campaigns come from utm_campaign", r.breakdowns.campaign[0]?.label === "Autumn")
  const ro = r.breakdowns.country.find((c) => c.key === "RO")
  check("countries count visits, and a code becomes its name", ro?.value === 2 && r.breakdowns.country.find((c) => c.key === "US")?.label === "United States", r.breakdowns.country)
  const dev = Object.fromEntries(r.breakdowns.device.map((x) => [x.key, x.value]))
  check("devices as recorded, and unrecorded as Unknown", dev.mobile === 1 && dev.desktop === 1 && dev.tablet === 1 && dev.unknown === 1, dev)
  check("browsers by name", r.breakdowns.browser.find((b) => b.key === "safari")?.label === "Safari")

  /* One place at a time: the same rows, filtered, and its orders only. */
  const site = report({ views, steps, orders, selector: { type: "website", id: W1 } })
  check("the live website: its one visitor, its two orders (the website sale and the basket), no link clicks from the OnePage",
    site.visitors.value === 1 && site.orders.value === 2 && site.sales.value === 5000 && site.linkClicks.value === 0, { v: site.visitors.value, o: site.orders.value, s: site.sales.value })
  check("  and its pages name no place: there is only one", site.topPages.every((p) => p.place === null))
  const page = report({ views, steps, orders, selector: { type: "creator_page" } })
  check("the creator page: three visitors, its two orders, conversion two in three",
    page.visitors.value === 3 && page.orders.value === 2 && page.conversion.value === 2 / 3, { v: page.visitors.value, o: page.orders.value, c: page.conversion.value })
  const other = report({ views, steps, orders, selector: { type: "website", id: W2 } })
  check("a website with nothing: no visitors and no conversion rate, not 0%", other.visitors.value === 0 && other.conversion.value === null && other.conversion.series.current.every((x) => x === null))
}

console.log("\nAnalytics: the quick answer and the rest")
{
  const views: ViewRow[] = []
  const sources = ["social_instagram", "direct", "organic_search", null, "referral"]
  for (let i = 0; i < 400; i++) {
    views.push(
      view(`s${i % 150}`, 1 + (i % 13), {
        id: `v${String(i).padStart(4, "0")}`,
        visitor_id: `v${i % 90}`,
        source_category: sources[i % 5],
        referrer_domain: ["www.google.com", "Google.com", null, "storelib.com"][i % 4],
        country_code: ["RO", "ro", "US", null][i % 4],
        browser: ["chrome", "Chrome", "CHROME", null][i % 4],
        utm_campaign: ["Autumn", "autumn", null][i % 3],
        property_type: ["creator_page", "onepage", "website", "website"][i % 4],
        property_id: [null, OP, W1, null][i % 4],
        path: ["/ana", "/", "/p/1", "/about"][i % 4],
        ...(i % 9 === 0 ? { session_id: null } : {}),
      }, i % 24),
    )
  }
  const steps: StepRow[] = [
    { event_type: "checkout_start", session_id: "s3", created_at: at(8, 5), property_type: "website", property_id: W1 },
    { event_type: "link_click", session_id: "s4", created_at: at(8, 6), property_type: "onepage", property_id: OP, link_id: "b1" },
  ]
  const orders = [order("o1", 8, { source: "website", buyer_country_code: "RO" }), order("o2", 9), order("o0", 2)]
  for (const timeZone of ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Asia/Kathmandu"]) {
    for (const selector of [ALL, { type: "onepage" }, { type: "website", id: W1 }] as PropertySelector[]) {
      const base = { orders, window: W, timeZone, mainDomain: "storelib.com", productTitles: { p1: "Presets" }, selector, properties: PLACES }
      const wire = wireFromRows({ views, steps, window: W, previous: previousWindow(W), timeZone, selector, defaultWebsite: W1, product: null, mainDomain: "storelib.com" })
      const fromRows = buildReports({ ...base, views, steps })
      const fromWire = buildReports({ ...base, wire: JSON.parse(JSON.stringify(wire)) as ReportWire })
      const label = `${timeZone}, ${propertyParam(selector) ?? "all"}`
      check(`the database's answer, sent as JSON, draws exactly what the rows do (${label})`, JSON.stringify(fromWire) === JSON.stringify(fromRows))
      const only = (w: ReportWire["cur"]): ReportWire["cur"] => ({
        visitors: w.visitors, views: w.views, product_visitors: w.product_visitors, product_views: w.product_views,
        visitor_buckets: w.visitor_buckets, view_buckets: w.view_buckets, clicks: w.clicks, click_buckets: w.click_buckets,
      })
      const quick = buildReports({ ...base, wire: { cur: only(wire.cur), prev: only(wire.prev) } })
      check(`  the quick answer has the tabs' figures, marked partial, the lists and funnel left to wait (${label})`,
        quick.partial === true && fromRows.partial === undefined
          && (["visitors", "views", "conversion", "sales", "orders", "refunds", "linkClicks"] as const).every((k) => JSON.stringify(quick[k]) === JSON.stringify(fromRows[k]))
          && quick.funnel.length === 0 && quick.topPages.length === 0 && quick.breakdowns.source.length === 0)
      const cur = wire.cur
      check(`  each bucket's visitors are at most the period's, and its views add up to them (${label})`,
        (cur.visitor_buckets ?? []).every((n) => n <= (cur.visitors ?? 0)) && (cur.view_buckets ?? []).reduce((a, b) => a + b, 0) === cur.views)
    }
  }
  const all = wireFromRows({ views, steps, window: W, previous: null, timeZone: "UTC", selector: ALL, defaultWebsite: W1, product: null, mainDomain: "storelib.com" }).cur
  const parts = [{ type: "creator_page" }, { type: "onepage" }, { type: "website", id: W1 }, { type: "website", id: W2 }].map(
    (selector) => wireFromRows({ views, steps, window: W, previous: null, timeZone: "UTC", selector: selector as PropertySelector, defaultWebsite: W1, product: null, mainDomain: "storelib.com" }).cur,
  )
  const partVisitors = parts.reduce((n, p) => n + (p.visitors ?? 0), 0)
  check("page views under All are the sum of the places'", parts.reduce((n, p) => n + (p.views ?? 0), 0) === all.views)
  check("  and visitors are unique across them: one person on two places is one visitor under All", (all.visitors ?? 0) < partVisitors, { all: all.visitors, parts: partVisitors })
  const args = reportArgs(W, null, "UTC")
  check("the database is handed the chart's own buckets, and an empty comparison when there is none",
    args.p_cur_starts.length === 7 && args.p_prev_starts.length === 0 && args.p_prev_start === args.p_prev_end)
  const k = reportArgs(W, previousWindow(W), "Asia/Kathmandu")
  check("  in the creator's zone: Kathmandu's days start at 18:15 UTC", new Date(k.p_cur_starts[1]).toISOString().endsWith("18:15:00.000Z"), new Date(k.p_cur_starts[1]).toISOString())
}

console.log("\nAnalytics: time zones with half and quarter hours")
{
  const K = "Asia/Kolkata"
  const w = { start: Date.parse("2026-09-13T18:30:00Z"), end: Date.parse("2026-09-14T18:30:00Z") } // one day in India
  const s = bucketStarts(w, "hour", K)
  check("an hour in India starts on the hour in India, not at half past", s.length === 24 && new Date(s[1]).toISOString() === "2026-09-13T19:30:00.000Z", new Date(s[1]).toISOString())
  const nepal = { start: Date.parse("2026-09-20T18:15:00Z"), end: Date.parse("2026-09-27T18:15:00Z") } // a week in Nepal, +5:45
  const late = view("n1", 0, { created_at: "2026-09-21T18:10:00Z" })
  const early = view("n2", 0, { created_at: "2026-09-21T18:20:00Z" })
  const r = buildReports({ views: [late, early], steps: [], orders: [], window: nepal, previous: null, timeZone: "Asia/Kathmandu", mainDomain: "storelib.com", productTitles: {} })
  check("18:10 UTC is the 21st in Kathmandu and 18:20 the 22nd: one visitor each day",
    r.visitors.series.current[0] === 1 && r.visitors.series.current[1] === 1 && r.visitors.value === 2, r.visitors.series.current)
  check("  and each visit lies in the same day as its visitor", r.sessions.series.current[0] === 1 && r.sessions.series.current[1] === 1, r.sessions.series.current)
  const la = bucketStarts({ start: Date.parse("2026-09-20T07:00:00Z"), end: Date.parse("2026-09-27T07:00:00Z") }, "day", "America/Los_Angeles")
  check("a day in Los Angeles starts at 07:00 UTC in September", la.length === 7 && new Date(la[3]).toISOString() === "2026-09-23T07:00:00.000Z")
}

console.log("\nThe OnePage, counted once: its old table before its events, never both")
{
  const IPHONE_IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0"
  const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
  const since = T0 + 10 * DAY
  const legacy = {
    onePageId: OP,
    since,
    views: [
      { id: "1", visitor_id: "x", referrer: "", user_agent: IPHONE_IG, country_code: "RO", created_at: at(8) },
      { id: "2", visitor_id: "y", referrer: "https://www.google.com/search?q=x", user_agent: MAC_CHROME, country_code: "US", created_at: at(9) },
      { id: "3", visitor_id: "bot", referrer: "", user_agent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", created_at: at(9) },
      { id: "4", visitor_id: "z", referrer: "", user_agent: MAC_CHROME, created_at: at(11) },
      { id: "0", visitor_id: "w", referrer: "", user_agent: MAC_CHROME, created_at: at(3) },
    ],
    clicks: [
      { id: "c1", block_id: "b1", visitor_id: "x", created_at: at(8) },
      { id: "c2", block_id: "b1", visitor_id: "x", created_at: at(8, 13) },
      { id: "c3", block_id: "b2", visitor_id: "z", created_at: at(12) },
    ],
  }
  /* From `since` on, the same visits are in the events: z's view and a click on b1. */
  const events: ViewRow[] = [view("z", 11, { visitor_id: "ev-z", property_type: "onepage", property_id: OP, path: "/ana/links" })]
  const steps: StepRow[] = [{ event_type: "link_click", visitor_id: "ev-z", property_type: "onepage", property_id: OP, link_id: "b1", created_at: at(11, 13) }]
  const deps = {
    isBot: isBotAgent,
    categorize: (host: string, ua: string | null) => categorizeServerSource(host || "Direct", null, null, detectClientAppFromUA(ua)),
    parseAgent: parseUserAgent,
    hostOf: referrerHost,
    mainDomain: "storelib.com",
  }
  const input = { window: W, previous: previousWindow(W), timeZone: "UTC", selector: { type: "onepage" } as PropertySelector, product: null }
  const base = wireFromRows({ views: events, steps, window: W, previous: previousWindow(W), timeZone: "UTC", selector: { type: "onepage" }, defaultWebsite: W1, product: null, mainDomain: "storelib.com" })
  const folded = foldLegacyOnePage(base, legacy, input, deps)
  check("visitors: two from the old table before the switch, one from the events after, the robot and z's old row left out",
    folded.cur.visitors === 3 && folded.cur.views === 3 && folded.prev.visitors === 1, { cur: folded.cur.visitors, prev: folded.prev.visitors })
  check("  a visit each, and in the chart on its own day", folded.cur.sessions === 3 && folded.cur.visitor_buckets?.[1] === 1 && folded.cur.visitor_buckets?.[2] === 1 && folded.cur.visitor_buckets?.[4] === 1, folded.cur.visitor_buckets)
  check("  link clicks: the two old taps on b1 and the new one, and b2's tap after the switch is not read twice",
    folded.cur.clicks === 3 && (folded.cur.links ?? []).length === 1 && folded.cur.links?.[0][3] === 3, folded.cur.links)
  const src = folded.cur.maps?.source ?? {}
  check("  the old rows' sources from their referrer and browser: Instagram's in-app browser, Google", src.social_instagram === 1 && src.organic_search === 1, src)
  check("  its devices from the signature", folded.cur.maps?.device?.mobile === 1 && folded.cur.maps?.device?.desktop === 1, folded.cur.maps?.device)
  const r = buildReports({ wire: folded, orders: [], window: W, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {}, selector: { type: "onepage" }, properties: PLACES, linkLabels: { b1: "My shop" } })
  check("the OnePage's most clicked links, by the block's own name", r.topLinks[0]?.label === "My shop" && r.topLinks[0]?.clicks === 3, r.topLinks)
  check("never folded into another place, or into a product's figures",
    foldLegacyOnePage(base, legacy, { ...input, selector: { type: "creator_page" } }, deps) === base && foldLegacyOnePage(base, legacy, { ...input, product: "p1" }, deps) === base)
  const none = foldLegacyOnePage(base, { ...legacy, since: null }, input, deps)
  check("before the OnePage has any event, the old table is the whole record", none.cur.visitors === (base.cur.visitors ?? 0) + 3, none.cur.visitors)
  check("iPhone is iOS, a Mac is macOS, Instagram's browser is Instagram", parseUserAgent(IPHONE_IG).os === "iOS" && parseUserAgent(MAC_CHROME).os === "macOS" && parseUserAgent(IPHONE_IG).browser === "Instagram")
  check("an iPad is a tablet", parseUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)").device === "tablet")
  check("a referrer's host, without www", referrerHost("https://www.google.com/x") === "google.com" && referrerHost("") === "")
  const reads = code("lib/analytics/report-read.ts")
  check("the switch is the OnePage's first view in the events, read by the whole index key",
    /\.eq\("creator_id", q\.creatorId\)\s*\.eq\("property_type", "onepage"\)\s*\.eq\("property_id", onePageId\)\s*\.eq\("event_type", "view"\)\s*\.order\("created_at", \{ ascending: true \}\)\s*\.limit\(1\)/.test(reads)
      && /end: since === null \? s\.end : Math\.min\(s\.end, since\)/.test(reads))
  /* Changed on purpose: the route's question is read in lib/analytics/report-answer.ts, so a test can ask it of a fake database (tests/analytics-e2e.test.ts). */
  check("the OnePage is found from the signed-in creator, never the request", /\["owner_id", creatorUserId\]/.test(read("lib/analytics/property.ts")) && /creatorProperties\(admin, creator\.id, userId\)/.test(read("lib/analytics/report-answer.ts")) && /reportQuestion\(admin, user\.id, url,/.test(read("app/api/analytics/reports/route.ts")))
}

console.log("\nThe funnel: a step not recorded says so")
{
  const views: ViewRow[] = [view("a", 8), view("b", 8, { product_id: "p1" }), view("c", 9)]
  const r = report({ views, orders: [order("o", 9)] })
  const f = Object.fromEntries(r.funnel.map((s) => [s.key, s]))
  check("no checkout recorded while there is an order: not recorded, not 0%", f.checkout.recorded === false && f.checkout.rate === null && f.orders.rate === null, r.funnel)
  check("  the steps before it keep their rates", f.product.rate === 1 / 3 && f.visitors.recorded && f.product.recorded)
  const empty = report({})
  check("with nothing at all, every step is there with no rate", empty.funnel.length === 5 && empty.funnel.every((s) => s.value === 0 && s.rate === null))
}

console.log("\nSubscribers: new in the period, by place and by source")
{
  const subscribers: SubscriberRow[] = [
    { id: "s1", subscribed_at: at(8), property_type: "onepage", property_id: OP, last_touch: { source: "social_instagram" } },
    { id: "s2", subscribed_at: at(9), source: "website", last_touch: null },
    { id: "s3", subscribed_at: at(9), source: "import" },
    { id: "s4", subscribed_at: at(2), property_type: "creator_page" },
    { id: "s5", subscribed_at: at(10), source_detail: { surface: "product" }, last_touch: { source: "organic_search" } },
  ]
  const r = report({ subscribers })
  check("new sign-ups in the period against the week before; an import is not a sign-up", r.subscribers?.value === 3 && r.subscribers.previous === 1, r.subscribers)
  const by = Object.fromEntries((r.subscribers?.byProperty ?? []).map((x) => [x.label, x.value]))
  check("  by place: the OnePage, the live website by its name, the creator page", by.OnePage === 1 && by.Studio === 1 && by["Creator page"] === 1, by)
  const src = Object.fromEntries((r.subscribers?.bySource ?? []).map((x) => [x.label, x.value]))
  check("  by the source of their visit, and Not recorded where there was none", src.Instagram === 1 && src.Search === 1 && src["Not recorded"] === 1, src)
  const one = report({ subscribers, selector: { type: "onepage" } })
  check("  under one place: its own, and no split by place", one.subscribers?.value === 1 && one.subscribers.byProperty.length === 0)
  check("no subscribers asked for, no card", report({}).subscribers === null)
  check("imports, manual adds and the API are contacts, not sign-ups",
    !isSignup({ source: "csv_import" }) && !isSignup({ source_detail: { surface: "manual" } }) && isSignup({ source: "onepage" }))
  check("an old sign-up's place from its words", subscriberProperty({ source: "onepage" }).type === "onepage" && subscriberProperty({ source: "website_footer" }).type === "website" && subscriberProperty({}).type === "creator_page")
}

console.log("\nThe summaries on the Website and OnePage screens")
{
  check("visitors and orders in one line", summaryText({ visitors: 1240, orders: 18 }) === "Last 30 days: 1,240 visitors · 18 orders")
  check("  one of each, singular", summaryText({ visitors: 1, orders: 1 }) === "Last 30 days: 1 visitor · 1 order")
  check("  and No visits yet before anybody came", summaryText({ visitors: 0, orders: 0 }) === "No visits yet")
  check("it opens Analytics on the same 30 days, filtered to the place", summaryHref({ type: "website", id: W1 }) === `/app/analytics?range=last_30_days&property=website%3A${W1}` && summaryHref({ type: "onepage" }) === "/app/analytics?range=last_30_days&property=onepage")
  const route = code("app/api/analytics/summary/route.ts")
  check("the summary is the signed-in creator's, and a place that is not theirs is nothing",
    /\.eq\("user_id", user\.id\)/.test(route) && route.indexOf("ownsProperty(properties, selector)") > 0 && route.indexOf("ownsProperty(properties, selector)") < route.indexOf("countVisits(admin"))
  check("  counted as Analytics counts, kept a minute", /part: "figures" as const/.test(route) && /salesFor\(orders\.rows, selector, properties\.defaultWebsite\)/.test(route) && /const CACHE_MS = 60_000/.test(route) && /private, max-age=/.test(route))
  const line = read("components/app/analytics-summary-line.tsx")
  /*
    THE WEBSITE BUILDER KEEPS ITS LINE; THE ONEPAGE EDITOR NO LONGER HAS
    ONE. In the editor it sat above the profile picture, the first thing on
    the tab it opens on, and it is a reading rather than anything to edit:
    "I still don't like the analytics text thing showing above the profile
    avatar, get rid of it". The numbers are on Analytics, where they are
    looked at on purpose, and the line this check covers still goes there.
  */
  check("  and on screen in the website builder",
    /<AnalyticsSummaryFact property=\{`website:\$\{live\.id\}`\} \/>/.test(read("app/app/website-builder/website-builder-client.tsx"))
      && /summaryText\(/.test(line) && /data-analytics-summary-link/.test(line))
  check("  and nowhere over the OnePage editor's links", !/AnalyticsSummaryLine/.test(read("components/onepage/onepage-editor.tsx")))
}

console.log("\nHome is Analytics under All")
{
  const views: ViewRow[] = [view("a", 8), view("a", 8, { property_type: "onepage", property_id: OP }), view("b", 9, { property_type: "website", property_id: W1 })]
  const r = report({ views, orders: [order("o", 9)] })
  const h = homeFromReports(r)
  check("Home's visitors, orders, revenue and conversion are the report's", h.periodVisitors === r.visitors.value && h.periodOrders === r.orders.value && h.periodRevenue === r.sales.value && h.conversionRate === 50, { h, v: r.visitors.value })
  check("  every place counted, each person once", h.periodVisitors === 2 && h.periodPageViews === 3)
}

console.log("\nAnalytics: the pieces that feed it")
{
  /* Changed on purpose: the route's question and counting are in lib/analytics/report-answer.ts (tests/analytics-e2e.test.ts asks them of a fake database). */
  const route = code("app/api/analytics/reports/route.ts")
  const answer = code("lib/analytics/report-answer.ts")
  const reads = code("lib/analytics/report-read.ts")
  /* Pages by keyset since the speed work: an OFFSET (`.range(a, b)`) made Postgres walk every earlier row again for each page. */
  check("the events are read on the server, a page at a time, each page from where the last ended",
    /\.limit\(PAGE\)/.test(reads) && /const PAGE = 1000/.test(reads) && /created_at\.gt\."\$\{after\.t\}",id\.gt\.\$\{after\.id\}/.test(reads)
      && (reads.match(/\.range\(/g) ?? []).length === 1 && /\.from\("subscribers"\)[\s\S]{0,400}\.range\(from, from \+ PAGE - 1\)/.test(reads))
  check("  for the signed-in creator only", /reportQuestion\(admin, user\.id, url,/.test(route) && /\.eq\("user_id", userId\)/.test(answer) && /\.eq\("creator_id", creator\.id\)/.test(answer))
  check("  and a product filter only for their own product", /productTitles\[wanted\]/.test(answer))
  check("  and a place only if it is theirs, refused before anything is read",
    /if \(!ownsProperty\(properties, selector\)\) return \{ status: 404, error: "No such property" \}/.test(answer)
      && /if \("error" in asked\) return NextResponse\.json\(\{ error: asked\.error \}, \{ status: asked\.status \}\)/.test(route)
      && route.indexOf("reportQuestion(") < route.indexOf("countReportAnswer("))
  check("  the database is always asked for the creator's own id, the place only narrows it",
    /p_creator_id: q\.creatorId,/.test(reads) && /\.eq\("creator_id", q\.creatorId\)\.eq\("event_type", "view"\)/.test(reads))
  const client = read("app/app/analytics/analytics-client.tsx")
  check("no made-up device split", !/Math\.round\(totalViews \* 0\.55\)/.test(client))
  const utils = read("lib/analytics-utils.ts")
  check("the analytics session has its own cookie, not the checkout's", /const SESSION_COOKIE = "sl_asid"/.test(utils) && !/materia_session=/.test(utils))
  /* Changed on purpose: every tracking route is one pipeline now (lib/analytics/collect), so the rules are read there. */
  const event = read("lib/analytics/collect.ts")
  check("a funnel step is recorded once per visit", /\.eq\("event_type", kind\)\.eq\("session_id", sessionId\)/.test(event) && /reason: "duplicate"/.test(event))
  check("the checkout reports its step with the visit", /trackFunnelStep\("checkout_start"/.test(read("app/checkout/checkout-client.tsx")))
  check("a website's pages are counted, each by its path", /<TrackView type="store" creatorId=\{site\.creatorId\}/.test(read("app/(site)/w/[username]/render-site.tsx")) && /\[creatorId, productId, pathname\]/.test(read("components/analytics/track-view.tsx")))
  check("  and its product pages, never a preview", /previewToken \? null : <TrackView type="product"/.test(read("components/website-builder/theme/render-product.tsx")))
  check("every country by name", /Intl\.DisplayNames\(\["en"\], \{ type: "region" \}\)/.test(read("lib/analytics/collect.ts")))
  check("the view tracker and the reports share one set of source rules", /from "\.\/sources"/.test(read("lib/analytics/collect.ts")) && /from "@\/lib\/analytics\/collect-route"/.test(read("app/api/track-view/route.ts")))
}

console.log("\nHome: the greeting")
{
  const noonUtc = Date.parse("2026-09-23T12:30:00Z")
  check("12:30 in London is afternoon", dayPart(noonUtc, "Europe/London") === "afternoon")
  check("the same moment is morning in New York", dayPart(noonUtc, "America/New_York") === "morning")
  check("and night in Sydney, at 22:30", dayPart(noonUtc, "Australia/Sydney") === "night")
  check("and evening in Bucharest at 19:00", dayPart(Date.parse("2026-09-23T16:00:00Z"), "Europe/Bucharest") === "evening")
  check("the creator's own zone beats the connection's", greetingZone("Europe%2FBucharest", "America/New_York") === "Europe/Bucharest")
  check("the connection's zone is used when there is no other", greetingZone(undefined, "America/New_York") === "America/New_York")
  check("junk from either is ignored", greetingZone("nope", "Mars/Base") === "UTC")
  check("the first name, not the whole name", firstName("Andrew Nastase") === "Andrew" && firstName("") === "")
  const client = read("components/app/dashboard-client.tsx")
  check("the heading greets by time of day", /dashboard\.greeting\.\$\{greetingPart\}/.test(client) && !/\{t\("dashboard\.welcome"\)\}, \{displayName\}/.test(client))
  check("  starting from the server's answer, so the first paint is right", /initialDayPart=\{dayPart\(Date\.now\(\), greetingTimeZone\)\}/.test(read("app/app/page.tsx")))
  for (const lang of ["de", "es", "fr"]) check(`  in ${lang} too`, /"dashboard\.greeting\.night":/.test(read(`lib/i18n/dict/${lang}.ts`)))
}

console.log("\nTracking: where a visit came from, by domain and not by substring")
{
  const src = (ref: string, s?: string | null, m?: string | null, app?: string | null) => categorizeServerSource(ref, s ?? null, m ?? null, app ?? null)
  check("pinterest.com is Pinterest, not X (it contains \"t.co\")", src("pinterest.com") === "social_pinterest", src("pinterest.com"))
  check("reddit.com is Reddit, not X", src("www.reddit.com") === "social_reddit", src("www.reddit.com"))
  check("microsoft.com and dropbox.com are referrals, not X", src("microsoft.com") === "referral" && src("dropbox.com") === "referral")
  check("t.co and x.com are X", src("t.co") === "social_x" && src("x.com") === "social_x")
  check("l.instagram.com is Instagram, pinterest.co.uk is Pinterest", src("l.instagram.com") === "social_instagram" && src("pinterest.co.uk") === "social_pinterest")
  check("youtu.be is YouTube, lnkd.in is LinkedIn", src("youtu.be") === "social_youtube" && src("lnkd.in") === "social_linkedin")
  check("Gmail is email, Google is search", src("mail.google.com") === "email" && src("www.google.co.uk") === "organic_search")
  check("DuckDuckGo, Bing and Ecosia are search", ["duckduckgo.com", "bing.com", "ecosia.org"].every((d) => src(d) === "organic_search"))
  check("utm_source=google is search, not social", src("Direct", "google", "organic") === "organic_search" && src("Direct", "google") === "organic_search")
  check("utm_source=google with cpc is paid search", src("Direct", "google", "cpc") === "paid_search")
  check("utm_source=chatgpt.com is a referral, not social", src("Direct", "chatgpt.com") === "referral", src("Direct", "chatgpt.com"))
  check("utm_source=ig is Instagram, utm_source=digital is not", src("Direct", "ig") === "social_instagram" && src("Direct", "digital") === "referral")
  check("utm_medium=paid_social is paid", src("Direct", "facebook", "paid_social") === "paid")
  check("a newsletter tool is email", src("Direct", "mailchimp") === "email")
  check("an Instagram in-app view with no referrer is Instagram", src("Direct", null, null, detectClientAppFromUA("Mozilla/5.0 (iPhone) Instagram 300.0")) === "social_instagram")
  check("no referrer and no app is direct", src("") === "direct" && src("Direct") === "direct")
  check("Storelib itself, a creator's Storelib site and Stripe are not sources",
    isInternalReferrer("storelib.com", "storelib.com") && isInternalReferrer("ana.storelib.com", "storelib.com") && isInternalReferrer("checkout.stripe.com", "storelib.com") && !isInternalReferrer("google.com", "storelib.com"))
}

console.log("\nTracking: robots and people")
{
  check("Googlebot is a robot", isBotAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"))
  check("a headless browser is a robot", isBotAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36"))
  check("a link preview is a robot", isBotAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"))
  check("no signature at all is not a browser", isBotAgent("") && isBotAgent(null))
  check("an iPhone is a person", !isBotAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"))
  check("a CUBOT phone is a person, whatever its name ends in", !isBotAgent("Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"))
  check("Instagram's browser is a person", !isBotAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Instagram 300.0"))
  check("mobile Edge is Edge", parseUserAgent("Mozilla/5.0 (Linux; Android 10) Chrome/120 Mobile Safari/537.36 EdgA/120").browser === "Edge")

  const utils = read("lib/analytics-utils.ts")
  check("the browser reads device, browser and system by the server's rules (an iPhone was macOS)",
    /parseUserAgent\(navigator\.userAgent\)/.test(utils) && !/if \(ua\.includes\("Mac OS"\)\) return "macOS"/.test(utils))
  check("and its source hint is the server's own function", /return categorizeServerSource\(referrer, utmSource, utmMedium, clientApp\)/.test(utils))
  check("an iPad, which says it is a Mac, is a tablet", /navigator\.maxTouchPoints \?\? 0\) > 1/.test(utils))

  /* Changed on purpose: the view tracker, the funnel steps and the OnePage links are one pipeline (lib/analytics/collect). */
  const view = read("lib/analytics/collect.ts")
  check("the view tracker drops robots before anything is read", /if \(isBotAgent\(ua\)\) return \{ recorded: false, reason: "bot" \}/.test(view) && view.indexOf("isBotAgent(ua)") < view.indexOf('from("creators")'))
  check("and the creator's own visits", /if \(await deps\.isOwnVisit\(/.test(view) && /isOwnVisit,/.test(read("lib/analytics/collect-route.ts")) && /auth\.getUser\(\)/.test(read("lib/analytics/own-visit.ts")))
  check("the half-hour dedupe survives two rows in the window (maybeSingle errored, and the error branch inserted)",
    /await q\.limit\(1\)/.test(view) && !/\.eq\("event_type", EVENT\.pageView\)[^\n]*\.maybeSingle\(\)/.test(view))
  check("device, browser and system come from the request's own signature", /const parsed = parseUserAgent\(ua\)/.test(view))
  check("a referrer that is Storelib, the creator's site or Stripe is Direct", /isInternalReferrer\(host, mainDomain, pageHost\)/.test(view))
  check("a page that is not a real creator's is not counted", /from\("creators"\)\.select\("id, user_id"\)\.eq\("id", creatorId\)/.test(view))
  check("a scripted browser does not send a view", /webdriver === true\) return "automated"/.test(read("lib/analytics/page-tracker.ts")) && /schedulePageView\(window/.test(read("components/analytics/track-view.tsx")))

  check("funnel steps read the consent cookie on the server, not the page",
    /const consented = allows\(parse\(req\.cookie\(CONSENT_COOKIE\), now\), "analytics"\)/.test(view)
      /* Changed on purpose: without consent the ids are now the daily hash and its visit (lib/analytics/anon-visit), never what the page sent. */
      && /visitorId = consented \? browserId\(body\.visitorId\) : anonVisitor/.test(view) && /sessionId = consented \? sessionFromBody : anonVisitor \? await anonSession/.test(view))
  const event = read("app/api/track-event/route.ts")
  check("and only the steps the funnel knows are recorded", /\(EVENTS as readonly string\[\]\)\.includes\(eventType\)/.test(event) && /isBotAgent/.test(view))
}

console.log("\nReports: periods and comparisons")
{
  check("the period and its comparison are read as one stretch when they touch", spansToRead({ start: 10, end: 20 }, { start: 0, end: 10 }).length === 1)
  check("and as two when a year apart, not the whole year between", spansToRead({ start: 1000, end: 1100 }, { start: 0, end: 100 }).length === 2)

  /* "Last 7 days" at 3pm: the period runs to now, the comparison to the same hour. */
  const cur = { start: T0 + 7 * DAY, end: T0 + 13 * DAY + 15 * HOUR }
  const prev = { start: T0, end: T0 + 6 * DAY + 15 * HOUR }
  const views: ViewRow[] = [view("x", 7, {}, 1), view("y", 0, {}, 1), view("z", 13, {}, 1)]
  const r = buildReports({ views, steps: [], orders: [], window: cur, previous: prev, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {} })
  check("the comparison's buckets are its own days, so day 1 sits beside day 1", r.visitors.series.previous[0] === 1 && r.visitors.series.current[0] === 1, r.visitors.series)
  check("the chart's views add up to the figure on its tab", r.views.series.current.reduce((a, b) => a + b, 0) === r.views.value && r.views.value === 2)
  const none = buildReports({ views, steps: [], orders: [], window: cur, previous: null, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {} })
  check("No comparison: nothing is compared, and nothing is shown as new",
    none.compared === false && none.visitors.change === null && none.visitors.series.previous.length === 0 && none.conversion.previous === null)
}

console.log("\nReports: money")
{
  const orders: OrderRow[] = [
    order("t1", 8, { amount_cents: 1200, tip_cents: 200, source: "storelib" }),
    order("f1", 9, { amount_cents: 0 }),
    order("f2", 10, { amount_cents: 0, source: "website" }),
    order("old", 11, { amount_cents: 500, source: null }),
  ]
  const r = report({ orders })
  check("a tip is counted once: amount_cents already includes it", r.sales.value === 1200 + 500, r.sales.value)
  check("the revenue line adds up to the revenue figure", r.sales.series.current.reduce((a, b) => a + b, 0) === r.sales.value)
  check("a free order is still an order", r.orders.value === 4)
  const free = report({ orders: [order("a", 8, { amount_cents: 0 }), order("b", 9, { amount_cents: 0, product_id: "p2" })] })
  check("with no money at all, Top products shares by orders", free.topProducts.every((p) => p.share === 0.5), free.topProducts)
  check("moneyOf reads refunds per line", moneyOf({ lines: [{ id: "1", product_id: "p", amount_cents: 1000, status: "refunded", refund_amount_cents: 400, created_at: at(8) }] } as never).net === 600)
}

console.log("\nCharts: the scale")
{
  const one = niceScale(1, { integer: true, intervals: 2 })
  check("a series of 0 and 1 is drawn on 0, 1, 2: the 1 in the middle, never on the edge", JSON.stringify(one.ticks) === "[0,1,2]", one.ticks)
  const hundred = niceScale(100, { integer: true, intervals: 3 })
  check("the top is always above the highest point", hundred.top > 100 && hundred.ticks[0] === 0, hundred.ticks)
  check("counts step in whole numbers", niceScale(3, { integer: true }).ticks.every((t) => Number.isInteger(t)))
  check("nothing at all still draws a quiet axis", niceScale(0, { integer: true }).ticks.length === 3)
  check("labels are compact: 1.2k, $3k, $950, 40%", compactCount(1200) === "1.2k" && compactMoney(300000) === "$3k" && compactMoney(95000) === "$950" && compactPercent(0.4) === "40%")
  check("the axis for 0 1 2 is narrow, not 40px", axisWidth(["0", "1", "2"], 11, 8) <= 16, axisWidth(["0", "1", "2"], 11, 8))
  check("and wide enough for $1.2k", axisWidth(["$0", "$600", "$1.2k"], 11, 8) >= 34)
}

console.log("\nThe look: Storelib's violet, a grey comparison, real logos")
{
  const reports = read("app/app/analytics/analytics-reports.tsx")
  const chart = read("components/app/analytics-chart.tsx")
  check("no report is drawn in the old blue", !/#2a78d6/i.test(reports) && !/#2a78d6/i.test(chart))
  check("the series is Storelib's violet and the comparison a grey dashed line",
    /#8b5cf6/i.test(reports) && /compared: "#b8bcc6"/.test(chart) && /comparedColor=\{CHART_COLORS\.compared\}/.test(chart)
      && /strokeDasharray="5 4"/.test(read("components/app/morph-lines.tsx")))
  const icons = read("components/analytics/source-icon.tsx")
  const marks = read("components/analytics/brand-marks.ts")
  check("brand marks are inlined, not a runtime icon library", !/react-icons/.test(icons) && /export const BRAND_MARKS/.test(marks))
  check("in their own colours", /instagram: \{[^}]*fill: null/.test(marks) && /youtube: \{[^}]*fill: "#FF0000"/.test(marks) && /facebook: \{[^}]*fill: "#0866FF"/.test(marks))
  check("Google in four colours, TikTok in its offset, Instagram in its gradient",
    /#FBBC05[\s\S]*#EA4335[\s\S]*#34A853[\s\S]*#4285F4/.test(icons) && /#25F4EE/.test(icons) && /radialGradient/.test(icons))
  const page = read("app/app/analytics/analytics-client.tsx")
  /*
    "The All products selector in analytics should be the same UI as the
    timeframe selector, and on mobile a smooth, clean bottom sheet." It is
    components/app/product-picker: the date picker's button and rows, and the
    shared sheet on a phone. The property filter is built the same way.
  */
  const productPicker = read("components/app/product-picker.tsx")
  check("the product picker on a phone is the shared sheet, above the navigation pill",
    /<ProductPicker products=\{products\}/.test(page) && /<BottomSheet isOpen=\{open\} onClose=\{\(\) => setOpen\(false\)\} title="Product">/.test(productPicker)
      && !/function AnalyticsProductsSheet|isProductsSheetOpen|products-dropdown/.test(page))
  check("and it is the date picker's button, rows and popover, with nothing in front of the label",
    /import \{ PickerDivider, PickerRow, onRowsKey, pickerButton, pickerSurface, usePhone \} from "@\/components\/app\/date-range-picker"/.test(productPicker)
      && /className=\{cn\(pickerButton,/.test(productPicker) && /<PopoverContent/.test(productPicker) && /className=\{cn\(pickerSurface,/.test(productPicker)
      && !/ShoppingBag|<img\b|thumbnail/.test(productPicker))
  check("a search field only for a creator with more than eight products",
    /export const SEARCH_FROM = 9/.test(productPicker) && /const searchable = products\.length >= SEARCH_FROM/.test(productPicker))
  const propertyPicker = read("components/app/property-picker.tsx")
  check("the property filter is the same button beside the date range, a sheet on a phone, and nothing when there is one place",
    /<PropertyPicker options=\{options\} value=\{property\} onChange=\{setProperty\} \/>/.test(page)
      && /import \{ PickerDivider, PickerRow, onRowsKey, pickerButton, pickerSurface, usePhone \} from "@\/components\/app\/date-range-picker"/.test(propertyPicker)
      && /<BottomSheet isOpen=\{open\} onClose=\{\(\) => setOpen\(false\)\} title="Property">/.test(propertyPicker) && /if \(options\.length < 2\) return null/.test(propertyPicker))
  check("  kept in the address, the old OnePage view's ?mode=onepage read as the OnePage",
    /params\.get\("property"\) \?\? \(params\.get\("mode"\) === "onepage" \? "onepage" : null\)/.test(page) && /url\.searchParams\.set\("property", value\)/.test(page) && /url\.searchParams\.delete\("mode"\)/.test(page))
  check("  and the Store and OnePage switch is gone", !/buildOnePageReports|mode === "onepage" \?|setMode\(/.test(page))
  check("no order is spread across days it did not happen on", !/Distribute orders across existing dates/.test(page) && !/new Date\(a\.date \+ ", 2024"\)/.test(page))
  const order = [...reports.matchAll(/\bcard="([a-z]+)"/g)].map((m) => m[1])
  check("the cards in the order asked for: sources, pages, products, funnel, subscribers, then the rest",
    order.indexOf("traffic") < order.indexOf("pages") && order.indexOf("pages") < order.indexOf("products") && order.indexOf("products") < order.indexOf("funnel")
      && order.indexOf("funnel") < order.indexOf("subscribers") && order.indexOf("subscribers") < order.indexOf("countries") && order.indexOf("countries") < order.indexOf("devices"), order)
}

console.log("\nAnalytics: from the review")
{
  /* Changed on purpose: the span is checked in lib/analytics/report-answer.ts. */
  const route = read("lib/analytics/report-answer.ts")
  const page = read("app/app/analytics/analytics-client.tsx")
  check("All time is answered, not refused: the span allows years past 2020", /export const MAX_SPAN_MS = 30 \* 366 \* 24 \* 3_600_000/.test(route))
  check("and All time is compared with nothing", /const isAllTime = period\.preset === "all_time"/.test(page) && /isAllTime \? null : compareBounds\(/.test(page) && !/<ComparePicker/.test(page))
  check("OnePage visits: the old table only before the first event, so never twice", /const before = \(at: number\) => legacy\.since === null \|\| at < legacy\.since/.test(read("lib/analytics/reports.ts")))
  /* The funnel steps go through the one pipeline a page view does (lib/analytics/collect). */
  const ev = read("lib/analytics/collect.ts")
  check("a funnel step needs a real creator and their own product, and the creator's own clicks do not count",
    /from\("creators"\)\.select\("id, user_id"\)\.eq\("id", creatorId\)/.test(ev) && /\.eq\("id", productId\)\.eq\("creator_id", creatorId\)/.test(ev) && /isOwnVisit\(/.test(ev) &&
      /collectFrom\(req, eventType as CollectKind, body, createAdminClient\(\)\)/.test(read("app/api/track-event/route.ts")))
  check("a step is sent once per page, with nothing stored", /const sentSteps = new Set<string>\(\)/.test(read("lib/analytics-utils.ts")) && /if \(sentSteps\.has\(key\)\) return Promise\.resolve\(\)/.test(read("lib/analytics-utils.ts")))
  check("a failed refresh keeps the figures; only a different question clears them",
    /s\.data && questionOf\(s\.data\.key\) === question \? s\.data : null/.test(read("app/app/analytics/analytics-reports.tsx")))
}

console.log("\nAnalytics: disputes, products and countries, from the accuracy audit")
{
  /*
    A disputed payment: the bank has the money while it decides, and a lost
    dispute stays "disputed" for good. It was a full sale in Total sales and
    missing from Sales by product, so the two cards did not add up.
  */
  const orders: OrderRow[] = [
    order("s1", 8, { product_id: "p1", amount_cents: 2000 }),
    order("s2", 9, { product_id: "p2", amount_cents: 5000, status: "refunded", refund_amount_cents: 500 }),
    order("b1", 10, { product_id: "p1", amount_cents: 1000, stripe_session_id: "cs_b" }),
    order("b2", 10, { product_id: "p2", amount_cents: 700, stripe_session_id: "cs_b" }),
    order("d1", 11, { product_id: "p1", amount_cents: 9900, status: "disputed" }),
  ]
  const [disputed] = groupOrders([orders[4]])
  check("a disputed payment reads as disputed, not paid", disputed.payment === "disputed" && PAYMENT_LABEL.disputed === "Disputed")
  check("  and is not a sale", !isSale(disputed) && isSale(groupOrders([orders[0]])[0]))
  const r = report({ orders })
  check("a disputed order is left out of Orders and Revenue", r.orders.value === 3 && r.sales.value === 2000 + 4500 + 1700, { orders: r.orders.value, sales: r.sales.value })
  const byProduct = r.topProducts.reduce((sum, row) => sum + row.salesCents, 0)
  check("Top products adds up to Revenue", byProduct === r.sales.value, { byProduct, sales: r.sales.value })
  check("  each product its own lines less their refunds", r.topProducts.find((x) => x.key === "p1")?.salesCents === 3000 && r.topProducts.find((x) => x.key === "p2")?.salesCents === 5200, r.topProducts)
  check("lineMoney is the unit moneyOf adds up", lineMoney(orders[1]).net === 4500 && moneyOf(groupOrders([orders[2], orders[3]])[0]).net === 1700)
  const m = Object.fromEntries(readMetrics(groupOrders(orders), W, null, "UTC").map((x) => [x.key, x]))
  check("the Orders page's own figures are the same to the cent", m.orders.value === r.orders.value && m.sales.value === r.sales.value, { orders: m.orders.value, sales: m.sales.value })
  /* Changed on purpose: the all time count moved with the answer to lib/analytics/report-answer.ts. */
  check("every page asks one question of an order", /\.filter\(isSale\)/.test(read("lib/analytics/reports.ts")) && /\.filter\(isSale\)/.test(read("lib/analytics/report-answer.ts"))
    && /const counted = isSale/.test(read("lib/orders/metrics.ts")) && /isSale\(o\)/.test(read("lib/website-builder/site-performance.ts")))

  /* Countries: the card is visits by country, the most first, 25 of them, and nothing that is not a country. */
  const codes = ["AR", "AT", "AU", "BE", "BR", "CA", "CH", "CL", "CN", "CZ", "DE", "DK", "ES", "FI", "FR", "GB", "GR", "IE", "IN", "IT", "JP", "MX", "NL", "NO", "PL", "ZW"]
  const views = [...codes.map((code) => view(`c-${code}`, 8, { country_code: code })), view("zw2", 9, { country_code: "zw" }), view("xx", 9, { country_code: "XX" }), view("none", 9, { country_code: null })]
  const countries = report({ views }).breakdowns.country
  check("a country's visits in any case are one row, and it is not cut for its name", countries[0]?.key === "ZW" && countries[0]?.value === 2, countries[0])
  check("  and the card is 25 countries, none of them unknown", countries.length === 25 && countries.every((c) => /^[A-Z]{2}$/.test(c.key) && c.key !== "XX"), countries.length)

  /* Pages of 1,000 read in an order with no ties, so none is read twice or missed. */
  /* Changed on purpose: the route's own paged read (all time) is in lib/analytics/report-answer.ts. */
  const reads = read("lib/analytics/report-read.ts") + read("lib/analytics/report-answer.ts")
  /* Counted by `.limit(PAGE)` since pages start where the last ended (keyset) instead of `.range(a, b)`. */
  const ranges = (reads.match(/\.limit\(PAGE\)/g) ?? []).length
  const tieBroken = (reads.match(/\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(PAGE\)/g) ?? []).length
  /* Changed on purpose: six, the systems and carts read from the rows before part 253 is the sixth (round Z6). */
  check("every paged read is sorted by time and then by id", ranges === 6 && tieBroken === ranges, { ranges, tieBroken })
}

console.log("\nAnalytics: counted by the database, and from the rows while it cannot")
{
  const sql = read("supabase/sql/run-now/61_analytics_one_pipeline.sql")
  const lines = sql.trim().split("\n")
  check("the part is one whole statement per line", lines.slice(1).every((l) => /;\s*$/.test(l)), lines.findIndex((l, i) => i > 0 && !/;\s*$/.test(l)))
  check("the report functions are the server's alone: a creator id in, so nobody else may run them",
    /^REVOKE ALL ON FUNCTION public\.analytics_report\(uuid, text, uuid, uuid, uuid, bigint, bigint, bigint, bigint, bigint\[\], bigint\[\], text, timestamptz\) FROM PUBLIC, anon, authenticated;$/m.test(sql)
      && /^REVOKE ALL ON FUNCTION public\.analytics_property_counts\(timestamptz, timestamptz, uuid, text, uuid, uuid, uuid\) FROM PUBLIC, anon, authenticated;$/m.test(sql)
      && /^GRANT EXECUTE ON FUNCTION public\.analytics_report\([^)]*\) TO service_role;$/m.test(sql))
  const report54 = lines.find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.analytics_report(")) ?? ""
  const eventReads = (report54.match(/FROM public\.analytics_events e/g) ?? []).length
  check("  every read in it is the creator's own rows", eventReads === 6
    && eventReads === (report54.match(/FROM public\.analytics_events e WHERE (\$4::uuid IS NULL AND )?e\.creator_id = \$1 /g) ?? []).length
    && /FROM public\.analytics_property_daily d WHERE d\.creator_id = \$1 /.test(report54) && /analytics_property_counts\(r\.f, r\.t, \$1, /.test(report54), eventReads)
  check("  planned for each question, not once for all of them", /EXECUTE format\(/.test(report54) && !/SECURITY DEFINER/.test(report54))
  /* Changed on purpose: the backfill adds the columns it reads itself, two more lines (e9844055c). */
  check("the run-now part is listed with its size, and the check after has a column for it",
    /`61_analytics_one_pipeline\.sql` \|[^\n]*\| 43 \|/.test(read("supabase/sql/run-now/README.md")) && /as p61_analytics_reports[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))

  const reads = read("lib/analytics/report-read.ts")
  check("the route counts in the database, and from the rows while the function is missing",
    /rpc<ReportWire>\(admin, "analytics_report", \{ \.\.\.args, p_part: part \}\)/.test(reads) && /error\.code === "PGRST202"/.test(reads) && /shared\.rows \?\?= countFromRows\(admin, q\)/.test(reads))
  /* Changed on purpose: the counting is lib/analytics/report-answer.ts, the route only who asks, its memory and its stream. */
  const route = read("app/api/analytics/reports/route.ts") + read("lib/analytics/report-answer.ts")
  check("the reads it makes go side by side, not one after another",
    /* Changed on purpose: systems, carts and titles (part 253) and the digital orders' downloads are read beside the rest (round Z6). */
    /const \[v, d, l, o, s, labelsById, a, \[audNow, audBefore\], dl\] = await Promise\.all\(\[quick, rest, legacy, orders, subscribers, labels, allTime, audience, downloads\]\)/.test(route))
  check("an answer is kept a few seconds for the same person and the same whole question, never longer",
    /const key = `\$\{user\.id\}\|\$\{asked\.question\}`/.test(route) && /const CACHE_MS = 15_000/.test(route) && /private, max-age=/.test(route) && /Vary: "Cookie, Authorization"/.test(route))

  /* The page and the sidebar's prefetch ask the very same question. */
  /* Changed on purpose (round AD1): only an end that is "now" is left out. A finished period ends at a midnight and keeps it, so two ranges from the same day are two questions (tests/analytics-ad1.test.ts). */
  const q = { start: T0, end: T0 + DAY - 3_600_000, compare: { start: T0 - DAY, end: T0 - 3_600_000 }, product: "all", property: "all", timeZone: "UTC" }
  check("a question is its key without the moving end", questionOf(reportKey(q)) === questionOf(reportKey({ ...q, end: q.end + 5000, compare: { start: T0 - DAY, end: T0 - 3_600_000 + 5000 } })))
  check("  and another place is another question", questionOf(reportKey(q)) !== questionOf(reportKey({ ...q, property: "onepage" })))
  check("  and another currency is another question, while none is the question it was", !reportKey(q).includes("ccy=") && questionOf(reportKey(q)) !== questionOf(reportKey({ ...q, currency: "eur" })) && reportKey({ ...q, currency: "eur" }).includes("ccy=EUR"))
  check("a sales line follows the product and the place", commerceRowCounts({ id: "1", created_at: "", product_id: "p1", property_type: "website", property_id: "w1" }, { productId: "p1", property: { type: "website", id: "w1" }, defaultWebsite: "w1" })
    && !commerceRowCounts({ id: "1", created_at: "", product_id: "p2", property_type: "website", property_id: "w1" }, { productId: "p1", property: { type: "website", id: "w1" }, defaultWebsite: "w1" })
    && !commerceRowCounts({ id: "1", created_at: "", product_id: "p1", property_type: "creator_page", property_id: null }, { productId: null, property: { type: "website", id: "w1" }, defaultWebsite: "w1" }))
  check("now is rounded up to ten seconds, never down", reportNow(T0 + 1) === T0 + 10_000 && reportNow(T0) === T0)
  const cache = read("lib/analytics/report-cache.ts")
  check("a kept answer is shown only to the person it was counted for",
    /if \(!viewer \|\| k\.answer\.viewer !== viewer\) return null/.test(cache) && /viewer,\n\s+property: propertyParam/.test(route) && /viewer: userId,/.test(read("app/app/analytics/analytics-client.tsx")))
  check("hovering Analytics in the sidebar, or Home going idle, fetches its numbers ahead",
    /import\("@\/lib\/analytics\/report-cache"\)\.then\(\(m\) => m\.warmAnalytics\(\)\)/.test(read("lib/ui/app-navigation.ts"))
      && /import\("@\/lib\/analytics\/report-cache"\)\.then\(\(m\) => m\.warmAnalytics\(\)\)/.test(read("components/shared/prefetch-links.tsx")))
}

console.log("\nAnalytics: a wait that says so")
{
  /* "It shows those numbers blurred, which is okay, but it takes too much to load the data ... without showing some feedback to the user." */
  const client = read("app/app/analytics/analytics-client.tsx")
  const line = read("components/app/loading-line.tsx")
  check("what is waited for: the figures of this question, or its lists; never the minute's silent refresh of the same one",
    /const waitingFigures = reportsState\.loading && \(!answer \|\| reportsState\.stale\)/.test(client)
      && /const waitingLists = reportsState\.loading && !!answer && !!answer\.reports\.partial/.test(client))
  check("the app's slim progress line runs along the top of the figures' card while either lasts",
    /<LoadingLine active=\{waitingFigures \|\| waitingLists\} \/>/.test(client) && /import \{ LoadingLine \} from "@\/components\/app\/loading-line"/.test(client)
      && /className="relative bg-white rounded-2xl[^"]*overflow-hidden"/.test(client))
  check("it shows nothing for 300ms, the navigation bar's wait, then runs towards 90% and ends at the full width, fading",
    /export const LOADING_LINE_AFTER_MS = 300/.test(line) && /\{ transform: "scaleX\(0\)", opacity: 1 \}, \{ transform: "scaleX\(0\.9\)", opacity: 1 \}/.test(line)
      && /\{ transform: "scaleX\(1\)", opacity: 1, offset: 0\.45 \}/.test(line) && /\{ transform: "scaleX\(1\)", opacity: 0 \}/.test(line))
  check("on transform and opacity only, from effects: no React state, nothing renders while it moves",
    !/useState/.test(line) && /el\.animate\(/.test(line) && !/requestAnimationFrame/.test(line) && /prefers-reduced-motion: reduce/.test(line))
  check("after 2.5s of waiting for the figures, a quiet line over the chart: Counting visits for this range",
    /export const COUNTING_NOTE_MS = 2500/.test(client) && />Counting visits for this range</.test(client)
      && /\{waitingFigures \? \(/.test(client) && /animation: `skeleton-reveal 260ms ease-out \$\{COUNTING_NOTE_MS\}ms forwards`/.test(client))
  check("it moves nothing (over the chart, out of the flow), is announced politely, and starts again for a new question",
    /role="status"\s+data-counting-note=""\s+className="pointer-events-none absolute inset-x-0/.test(client) && /key=\{waitingKey\}/.test(client))
  check("and the figures on screen stay, blurred, while it waits", /soft=\{soft\} loading=\{figuresLoading\}/.test(client))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
