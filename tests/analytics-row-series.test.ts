/**
 * ===========================================================================
 *  EACH ROW'S OWN LINE, CLICKS BETWEEN PAGES, AND THE TYPE FILTER AS A CHIP
 * ===========================================================================
 * Round 42 (the owner): an opened report draws each row's own trend over the
 * period, asked for only when it opens; links and buttons that lead to
 * another page of the same site are counted and reported; and All / Digital /
 * Physical / Communities is one filter chip like the Emails subscribers'
 * Status and Source, beside the period, the place and the product.
 *
 * The numbers are worked out by hand from small fixtures, and every line is
 * held to the row it belongs to: a line's buckets add up to the row's own
 * number on the card, by the same rules (lib/analytics/row-series,
 * lib/analytics/reports). analytics_row_series and analytics_nav_clicks
 * (supabase/sql/run-now part 331) were run against these same counts on a
 * scratch Postgres 16 (72 questions, the same answers); here the SQL is held
 * to its shape.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { buildReports, REMOVED_PRODUCT, type StepRow, type ViewRow } from "../lib/analytics/reports"
import { productSalesSeries, rowSeriesOf, storedRowSeries, topSeries, type StoredDim } from "../lib/analytics/row-series"
import { navWireFromRows, siteClicksOf, type NavClickRow } from "../lib/analytics/site-clicks"
import { normalizeLinkLabel } from "../lib/analytics/events"
import type { OrderRow } from "../lib/orders/order-view"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sum = (xs: number[] | undefined) => (xs ?? []).reduce((a, b) => a + b, 0)

const DAY = 86_400_000
const T0 = Date.parse("2026-10-05T00:00:00Z")
/** A week by the day, in UTC: seven buckets, Monday to Sunday. */
const W = { start: T0, end: T0 + 7 * DAY }
const SITE = "aaaaaaaa-5555-4000-8000-000000000001"
const PLACES = { onePageId: null, websites: [{ id: SITE, name: "Studio", published: true }], defaultWebsite: SITE }
const at = (d: number, h = 12, m = 0) => new Date(T0 + d * DAY + h * 3_600_000 + m * 60_000).toISOString()

let n = 0
function view(session: string | null, d: number, extra: Partial<ViewRow> = {}, h = 12, m = 0): ViewRow {
  return { id: `v${++n}`, session_id: session, visitor_id: session ? `who-${session}` : null, created_at: at(d, h, m), property_type: "website", property_id: SITE, path: "/", ...extra }
}

console.log("\nA page's line: its views, where they happened")
{
  const views = [
    view("a", 0, { path: "/shop" }),
    view("b", 0, { path: "/shop" }, 15),
    view("c", 0, { path: "/shop" }, 20),
    view("a", 2, { path: "/shop" }),
    view("a", 2, { path: "/about" }),
    view("d", 6, { path: "/about" }, 23, 59),
    /* Before the week: not on the line. */
    view("e", -1, { path: "/shop" }),
  ]
  const s = storedRowSeries({ views, steps: [], window: W, timeZone: "UTC", selector: { type: "all" }, defaultWebsite: SITE, product: null, dim: "page" })
  check("/shop: three on Monday, one on Wednesday", same(s[`website|${SITE}|/shop`], [3, 0, 1, 0, 0, 0, 0]), s)
  check("/about: Wednesday and the last minute of Sunday", same(s[`website|${SITE}|/about`], [0, 0, 1, 0, 0, 0, 1]))
  const r = buildReports({ views, steps: [], orders: [], window: W, previous: null, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {}, properties: PLACES })
  check("each line adds up to its row in Top pages, under the same key", r.topPages.every((p) => sum(s[p.key]) === p.views) && r.topPages.length === 2, r.topPages.map((p) => [p.key, p.views]))
  const tz = storedRowSeries({ views, steps: [], window: W, timeZone: "Asia/Tokyo", selector: { type: "all" }, defaultWebsite: SITE, product: null, dim: "page" })
  check("in Tokyo the week touches eight days, and Monday's 15:00 and 20:00 UTC views are Tuesday's (the buckets are the viewer's days)", same(tz[`website|${SITE}|/shop`], [1, 2, 1, 0, 0, 0, 0, 0]), tz)
}

console.log("\nA source's, a country's, a device's line: visits, where each began")
{
  const views = [
    /* A visit from Google on Monday that goes on to a second page: one visit, Monday. */
    view("g1", 0, { source_category: "organic_search", referrer_domain: "www.google.com", country_code: "ro", device_type: "Mobile", browser: "Chrome" }, 9),
    view("g1", 0, { source_category: "organic_search", referrer_domain: "www.google.com", country_code: "ro", device_type: "Mobile", browser: "Chrome", path: "/shop" }, 9, 5),
    /* The same visit's id three days later: a visit of its own (more than a UTC day without a page). */
    view("g1", 3, { source_category: "organic_search", referrer_domain: "google.co.uk", country_code: "GB", device_type: "desktop", browser: "Safari" }, 9),
    /* Instagram twice on Tuesday, once on Sunday. */
    view("i1", 1, { source_category: "social_instagram", referrer_domain: "l.instagram.com", country_code: "US", device_type: "mobile", browser: "Safari" }),
    view("i2", 1, { source_category: "social_instagram", referrer_domain: "instagram.com", country_code: "US", device_type: "mobile", browser: "Safari" }, 18),
    view("i3", 6, { source_category: "social_instagram", referrer_domain: "instagram.com", country_code: null, device_type: null, browser: null }),
    /* A visit that began the evening before the week and carried on into it is not a visit of the week. */
    view("x", -1, { source_category: "email", referrer_domain: "" }, 23, 50),
    view("x", 0, { source_category: "email", referrer_domain: "" }, 0, 10),
    /* Typed in. */
    view("d1", 4, { source_category: "direct", referrer_domain: "" }),
  ]
  const ask = (dim: StoredDim) => storedRowSeries({ views, steps: [], window: W, timeZone: "UTC", selector: { type: "all" }, defaultWebsite: SITE, product: null, dim })
  const r = buildReports({ views, steps: [], orders: [], window: W, previous: null, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {}, properties: PLACES })
  const source = rowSeriesOf("source", ask("source"), "storelib.com")
  check("Search: Monday and Thursday", same(source.organic_search, [1, 0, 0, 1, 0, 0, 0]), source)
  check("Social: two on Tuesday, one on Sunday", same(source.social, [0, 2, 0, 0, 0, 0, 1]))
  check("the email visit begun before the week is not on any line", !source.email && sum(Object.values(source).flat()) === 6)
  const referrer = rowSeriesOf("referrer", ask("referrer"), "storelib.com")
  check("Referrers: google.com and google.co.uk are one Google line; every Instagram address one Instagram line", same(referrer.google, [1, 0, 0, 1, 0, 0, 0]) && same(referrer.instagram, [0, 2, 0, 0, 0, 0, 1]), referrer)
  check("  and Direct, which the card leaves out, has no line", !referrer.direct)
  const social = rowSeriesOf("social", ask("source"), "storelib.com")
  check("Social, by network: Instagram", same(social.instagram, [0, 2, 0, 0, 0, 0, 1]), social)
  const country = rowSeriesOf("country", ask("country"), "storelib.com")
  check("Countries: Romania Monday, Britain Thursday, the US twice on Tuesday; no country, no line", same(country.RO, [1, 0, 0, 0, 0, 0, 0]) && same(country.GB, [0, 0, 0, 1, 0, 0, 0]) && same(country.US, [0, 2, 0, 0, 0, 0, 0]) && !country.unknown, country)
  const device = rowSeriesOf("device", ask("device"), "storelib.com")
  check("Devices: mobile Monday and Tuesday twice, desktop Thursday, the rest unknown", same(device.mobile, [1, 2, 0, 0, 0, 0, 0]) && same(device.desktop, [0, 0, 0, 1, 0, 0, 0]) && same(device.unknown, [0, 0, 0, 0, 1, 0, 1]), device)
  const browser = rowSeriesOf("browser", ask("browser"), "storelib.com")
  for (const [dim, rows, lines] of [
    ["source", r.breakdowns.source, source],
    ["social", r.breakdowns.social, social],
    ["referrer", r.breakdowns.referrer, referrer],
    ["country", r.breakdowns.country, country],
    ["device", r.breakdowns.device, device],
    ["browser", r.breakdowns.browser, browser],
  ] as const) {
    check(`every ${dim} row's line adds up to the row on the card`, rows.length > 0 && rows.every((row) => sum(lines[row.key]) === row.value), rows.map((row) => [row.key, row.value, lines[row.key]]))
  }
  const site = storedRowSeries({ views: [...views, view("o1", 2, { property_type: "creator_page", property_id: null, source_category: "organic_search" })], steps: [], window: W, timeZone: "UTC", selector: { type: "website", id: SITE }, defaultWebsite: SITE, product: null, dim: "source" })
  check("a place chosen: only its visits (the creator page's search visit is not the website's)", sum(site.organic_search) === 2, site)
}

console.log("\nA link's and a button's line: clicks")
{
  const steps: Array<StepRow & { path?: string | null; link_label?: string | null }> = [
    { event_type: "link_click", created_at: at(0), property_type: "website", property_id: SITE, link_url: "https://instagram.com/ana" },
    { event_type: "link_click", created_at: at(0, 14), property_type: "website", property_id: SITE, link_url: "https://instagram.com/ana" },
    { event_type: "link_click", created_at: at(5), property_type: "website", property_id: SITE, link_url: "https://instagram.com/ana" },
    { event_type: "nav_click", created_at: at(1), property_type: "website", property_id: SITE, path: "/", link_url: "/shop", link_label: "Shop now" },
    { event_type: "nav_click", created_at: at(1, 16), property_type: "website", property_id: SITE, path: "/", link_url: "/shop", link_label: "Shop now" },
    { event_type: "nav_click", created_at: at(3), property_type: "website", property_id: SITE, path: "/shop", link_url: "/products/mug", link_label: null },
  ]
  const link = storedRowSeries({ views: [], steps, window: W, timeZone: "UTC", selector: { type: "all" }, defaultWebsite: SITE, product: null, dim: "link" })
  check("a link: two on Monday, one on Saturday, keyed as Top links keys it", same(link[`website|${SITE}|https://instagram.com/ana`], [2, 0, 0, 0, 0, 1, 0]), link)
  const nav = storedRowSeries({ views: [], steps, window: W, timeZone: "UTC", selector: { type: "all" }, defaultWebsite: SITE, product: null, dim: "nav" })
  check("a button: Shop now on the home page twice on Tuesday; the product card once on Thursday", same(nav[`website|${SITE}|/|/shop|Shop now`], [0, 2, 0, 0, 0, 0, 0]) && same(nav[`website|${SITE}|/shop|/products/mug|`], [0, 0, 0, 1, 0, 0, 0]), nav)
  const withProduct = storedRowSeries({ views: [], steps, window: W, timeZone: "UTC", selector: { type: "all" }, defaultWebsite: SITE, product: "p1", dim: "link" })
  check("with a product chosen a click has no line (a click is not of a product)", Object.keys(withProduct).length === 0)
  const many = Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`k${String(i).padStart(3, "0")}`, [i]]))
  const top = topSeries(many)
  check("at most 100 lines, the busiest", Object.keys(top).length === 100 && !!top.k129 && !top.k029)
}

console.log("\nA product's line: its sales on the order's day, less refunds on the refund's day")
{
  const order = (id: string, d: number, extra: Partial<OrderRow> = {}): OrderRow => ({ id, product_id: "p1", amount_cents: 2000, status: "completed", created_at: at(d, 13), ...extra })
  const orders = [
    order("o1", 0),
    order("o2", 0, { product_id: "p2", amount_cents: 500 }),
    /* Sold on Tuesday, refunded on Friday: +2000 Tuesday, −2000 Friday. */
    order("o3", 1, { status: "refunded", refund_amount_cents: 2000, refunded_at: at(4, 10) }),
    order("o4", 3, { product_id: "gone", amount_cents: 900 }),
    /* Not a sale. */
    order("o5", 2, { status: "failed" }),
  ]
  const s = productSalesSeries({ orders, window: W, timeZone: "UTC", selector: { type: "all" }, defaultWebsite: SITE, productTitles: { p1: "Presets", p2: "Brushes" }, removedKey: REMOVED_PRODUCT })
  check("Presets: 20.00 Monday, 20.00 Tuesday, −20.00 Friday", same(s.p1, [2000, 2000, 0, 0, -2000, 0, 0]), s)
  check("Brushes: 5.00 Monday; a deleted product under Removed product", same(s.p2, [500, 0, 0, 0, 0, 0, 0]) && same(s[REMOVED_PRODUCT], [0, 0, 0, 900, 0, 0, 0]))
  const r = buildReports({ views: [], steps: [], orders, window: W, previous: null, timeZone: "UTC", mainDomain: "storelib.com", productTitles: { p1: "Presets", p2: "Brushes" }, properties: PLACES })
  check("each line adds up to its row in Top products", r.topProducts.every((p) => sum(s[p.key]) === p.salesCents), r.topProducts.map((p) => [p.key, p.salesCents]))
}

console.log("\nClicks between pages: the report")
{
  const C = (d: number, from: string, to: string, label: string | null, who: string, extra: Partial<NavClickRow> = {}): NavClickRow => ({ id: `n${++n}`, event_type: "nav_click", created_at: at(d), property_type: "website", property_id: SITE, path: from, link_url: to, link_label: label, visitor_id: who, ...extra })
  const rows = [
    C(0, "/", "/shop", "Shop now", "a"),
    C(1, "/", "/shop", "Shop now", "b"),
    C(2, "/", "/shop", "Shop now", "b"),
    C(2, "/shop", "/products/mug", "Mug", "a"),
    C(3, "/", "/about", null, "c"),
    /* The week before: Shop now twice, About once. */
    C(-3, "/", "/shop", "Shop now", "z"),
    C(-2, "/", "/shop", "Shop now", "y"),
    C(-2, "/", "/about", null, "y"),
    /* Another place, and not a nav_click. */
    C(1, "/", "/x", "X", "q", { property_type: "creator_page", property_id: null }),
    C(1, "/", "/y", "Y", "q", { event_type: "link_click" }),
  ]
  const prev = { start: T0 - 7 * DAY, end: T0 }
  const wire = navWireFromRows({ rows, window: W, previous: prev, selector: { type: "website", id: SITE }, defaultWebsite: SITE })
  check("five clicks this week on the website, three the week before", wire.cur === 5 && wire.prev === 3, wire)
  check("Shop now first: three clicks by two people, two the week before", same(wire.rows[0], ["website", SITE, "/", "/shop", "Shop now", 3, 2, 2]), wire.rows[0])
  check("then About and the mug, one each", wire.rows.length === 3 && wire.rows.slice(1).every((r) => r[5] === 1), wire.rows)
  const report = siteClicksOf(wire, { compared: true, selector: { type: "website", id: SITE }, properties: PLACES })
  check("the figure: 5 against 3, +67%", report.value === 5 && report.previous === 3 && Math.round((report.change ?? 0) * 100) === 67, report)
  const about = report.rows.find((r) => r.to === "/about")
  check("a button with no words is named by the page it opens", about?.label === "/about" && about.from === "/" && about.previous === 1, about)
  const all = siteClicksOf(navWireFromRows({ rows, window: W, previous: prev, selector: { type: "all" }, defaultWebsite: SITE }), { compared: false, selector: { type: "all" }, properties: PLACES })
  check("under All both places count, each row says its place, and with no comparison nothing before", all.value === 6 && all.rows.every((r) => r.place !== null && r.previous === 0) && all.change === null, all)
  check("a button's words: whitespace one space, at most 80, never an address or a long number", normalizeLinkLabel("  Shop \n now ") === "Shop now" && normalizeLinkLabel("x".repeat(100))?.length === 80 && normalizeLinkLabel("jane@example.com") === null && normalizeLinkLabel("Order 1234567") === null && normalizeLinkLabel("Call 0722 123 456") === null && normalizeLinkLabel("Size 42") === "Size 42")
}

console.log("\nAsked only when a report opens, through the page's own question")
{
  const route = read("app/api/analytics/rows/route.ts")
  check("app/api/analytics/rows: Analytics permission, the reports' own question, a known dimension", /requireTeamPermission\("analytics"(?:, \{ read: true \})?\)/.test(route) && /reportQuestion\(gate\.db, gate\.userId, url, getMainDomain\(\), \{ creatorId: gate\.creatorId, ownerUserId: gate\.ownerUserId \}\)/.test(route) && /isRowDim\(dim\)/.test(route))
  const answer = read("lib/analytics/report-answer.ts")
  const main = answer.slice(answer.indexOf("export async function countReportAnswer"), answer.indexOf("export async function allTimeOf"))
  check("the page's own answer reads no lines", !/readStoredRowSeries|productSalesSeries|analytics_row_series/.test(main))
  const reports = read("app/app/analytics/analytics-reports.tsx")
  check("the lines are asked when the panel is open, one dimension at a time", /const lines = useRowLines\(open \? question : undefined, view\)/.test(reports) && /fetch\(`\/api\/analytics\/rows\?\$\{question\}&dim=\$\{encodeURIComponent\(dim\)\}`/.test(reports))
  check("every list of pages, links, sources, referrers, countries, devices, products and buttons names its line", ['lines: "page"', 'lines: "link"', 'lines: "product"', 'lines: "nav"', '"share", fmtCount, "source")', '"share", fmtCount, "referrer")', '"share", fmtCount, "country")', '"share", fmtCount, t)'].every((x) => reports.includes(x)))
  const detail = read("app/app/analytics/report-detail.tsx")
  check("a row draws its line beside its number, the column there before the lines come", /<RowLine values=\{series\?\.\[r\.key\]\} ready=\{!!series\} \/>/.test(detail) && /data-detail-line=\{lines\.state\}/.test(detail))
  check("the Clicks between pages card, for a website, opening its report", /card="siteclicks" detail=\{\{ id: "siteclicks" \}\}/.test(reports) && /case "siteclicks":/.test(reports) && /siteclicks: tt\("Clicks between pages"\)/.test(reports))
  check("counted for All or a website, with a website and no product", /const nav = !q\.product && q\.properties\.websites\.length > 0 && \(q\.selector\.type === "all" \|\| q\.selector\.type === "website"\) \? readNavClicks\(admin, q\)/.test(answer))
}

console.log("\nThe type filter is one picker, beside the others, all of them round 23's white pills again")
{
  const client = read("app/app/analytics/analytics-client.tsx")
  const controls = client.slice(client.indexOf("data-analytics-controls"), client.indexOf("{/* The four figures and the chart"))
  check("All / Digital / Physical / Communities is one KindPicker in the filters' row, not segments", /<KindPicker options=\{kindPills\} value=\{shownView\} onChange=\{setView\} onIntent=\{warmView\} allLabel=\{tt\("All types"\)\} \/>/.test(controls) && !/SegmentedPills/.test(client) && /* Changed on purpose (round 43): the Emails chips taken back, so the row no longer asks for them. */ !/data-filter-chips/.test(controls))
  const picker = read("components/app/kind-picker.tsx")
  check("a popover on a computer, the shared sheet on a phone, a check on the one showing", /<BottomSheet isOpen=\{open\}/.test(picker) && /<PopoverContent/.test(picker) && /checked=\{o\.value === value\}/.test(picker) && /data-filter-set=\{isAll \? undefined : ""\}/.test(picker))
  const css = read("app/globals.css")
  /* Changed on purpose (round 43, the owner: the filters look as they did before round 42): the round white pill, 36px, for every filter, the type too. */
  const rule = /\[data-analytics-controls\] button\[aria-haspopup="dialog"\] \{([^}]*)\}/.exec(css)?.[1] ?? ""
  check("every filter is the round white pill again: 36px, round, white, 14px words", /height: 36px/.test(rule) && /border-radius: 999px/.test(rule) && /background-color: #fff/.test(rule) && /font-size: 14px/.test(rule) && !/\[data-filter-chips\]/.test(css))
  check("a filter that narrows the page says so: the place, the product, the type; the period always", /data-filter-set=\{options\[0\] && !sameProperty\(value, options\[0\]\.value\) \? "" : undefined\}/.test(read("components/app/property-picker.tsx")) && /data-filter-set=\{value === "all" \? undefined : ""\}/.test(read("components/app/product-picker.tsx")) && /data-filter-set=""/.test(read("components/app/date-range-picker.tsx")))
}

console.log("\nThe SQL, part 331")
{
  const file = "supabase/sql/run-now/331_analytics_clicks_between_pages_and_row_lines.sql"
  const sql = read(file)
  check("nav_click allowed, link_label kept short, the two functions for the service role only", /CHECK \(event_type IN \([^)]*'link_click', 'nav_click'\)\) NOT VALID/.test(sql) && /char_length\(link_label\) <= 80/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.analytics_nav_clicks\([^)]*\) TO service_role/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.analytics_row_series\([^)]*\) TO service_role/.test(sql) && /REVOKE ALL ON FUNCTION public\.analytics_row_series\([^)]*\) FROM PUBLIC, anon, authenticated/.test(sql))
  check("one statement a line, safe to run again", sql.split("\n").filter((l) => l.trim()).slice(1).every((l) => /;$/.test(l.trim())) && /IF NOT EXISTS/.test(sql) && /DROP CONSTRAINT IF EXISTS/.test(sql))
  check("the README row, the check after, and the migration copy", read("supabase/sql/run-now/README.md").includes("`331_analytics_clicks_between_pages_and_row_lines.sql`") && /as p331_analytics_clicks_rows/.test(read("supabase/sql/run-now/99_check_after.sql")) && existsSync("supabase/migrations/20271029_analytics_clicks_between_pages_and_row_lines.sql") && read("supabase/migrations/20271029_analytics_clicks_between_pages_and_row_lines.sql") === sql)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
