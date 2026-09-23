/**
 * THE ANALYTICS REPORTS' RULES
 *
 * lib/analytics/reports.ts decides every figure under the Analytics chart.
 * These are the ways such figures go quietly wrong: a visit counted once per
 * page, a visit's source taken from its last page, a basket counted as three
 * orders, a refund counted as a sale, a funnel step counted per refresh, a
 * device split made up, a period read from the browser's first thousand rows.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  bucketStarts,
  buildReports,
  channelOfUrl,
  grainFor,
  previousWindow,
  sessionsOf,
  socialNetwork,
  sourceGroup,
  type StepRow,
  type ViewRow,
} from "../lib/analytics/reports"
import type { OrderRow } from "../lib/orders/order-view"
import { dayPart, firstName, greetingZone } from "../lib/greeting"

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

const HOUR = 3_600_000
const DAY = 24 * HOUR
const T0 = Date.parse("2026-09-14T00:00:00Z")
const at = (d: number, h = 12) => new Date(T0 + d * DAY + h * HOUR).toISOString()

function view(session: string, d: number, extra: Partial<ViewRow> = {}, h = 12): ViewRow {
  return { session_id: session, visitor_id: `v-${session}`, created_at: at(d, h), page_url: "https://storelib.com/ana", ...extra }
}
function order(id: string, d: number, extra: Partial<OrderRow> = {}): OrderRow {
  return { id, product_id: "p1", amount_cents: 2000, status: "completed", created_at: at(d, 13), ...extra }
}

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
}

console.log("\nAnalytics reports: channels")
{
  check("storelib.com is Storelib", channelOfUrl("https://storelib.com/ana", "storelib.com") === "storelib")
  check("a subdomain is the website", channelOfUrl("https://ana.storelib.com/about", "storelib.com") === "website")
  check("a custom domain is the website", channelOfUrl("https://anashop.ro/", "storelib.com") === "website")
  check("no address is not guessed", channelOfUrl(null, "storelib.com") === null)
}

console.log("\nAnalytics reports: everything together")
{
  const w = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
  const views: ViewRow[] = [
    view("a", 8, { source_category: "social_instagram", device_type: "mobile", browser: "safari", os: "iOS", country_code: "RO", country_name: "Romania", city: "Cluj-Napoca" }, 10),
    view("a", 8, { source_category: "direct" }, 11),
    view("b", 9, { source_category: "organic_search", referrer_domain: "www.google.com", device_type: "desktop", country_code: "US", page_url: "https://ana.storelib.com/" }),
    view("c", 9, { source_category: "referral", referrer_domain: "ana.storelib.com", device_type: "tablet", country_code: "RO" }),
    view("d", 10, { device_type: null, utm_campaign: "Autumn" }),
    view("old", 2, { source_category: "direct" }),
  ]
  const steps: StepRow[] = [
    { event_type: "buy_click", session_id: "a", created_at: at(8, 11) },
    { event_type: "buy_click", session_id: "a", created_at: at(8, 11.5) },
    { event_type: "checkout_start", session_id: "a", created_at: at(8, 11.6) },
    { event_type: "checkout_start", session_id: "a", created_at: at(8, 11.7) },
    { event_type: "buy_click", session_id: "b", created_at: at(9, 13) },
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
  const r = buildReports({ views, steps, orders, window: w, timeZone: "UTC", mainDomain: "storelib.com", productTitles: { p1: "Presets", p2: "Brushes" } })

  check("sessions: four visits, not five page views", r.sessions.value === 4, r.sessions.value)
  check("  compared with one the week before", r.sessions.previous === 1 && r.sessions.change === 3)
  check("orders: a basket is one, a failed payment none", r.orders.value === 4, r.orders.value)
  check("sales: paid less refunded", r.sales.value === 2000 + 3000 + 1500 + 0, r.sales.value)
  check("average order value counts paid orders only", Math.round(r.aov.value) === Math.round((2000 + 3000 + 2000) / 3), r.aov.value)
  check("conversion is orders over visits", r.conversion.value === 1, r.conversion.value)
  check("the conversion line is per day, from the same counts", r.conversion.series.current.length === 7)

  const byChannel = Object.fromEntries(r.salesByChannel.map((c) => [c.key, c.value]))
  check("sales by channel: a basket is a website sale", byChannel.website === 2000 + 3000, byChannel)
  check("  and an order with no record says so", byChannel.storelib === 1500 && !("unknown" in byChannel))
  const p1 = r.salesByProduct.find((p) => p.key === "p1")
  check("sales by product: each product's own line less its refund, a free download still a unit", p1?.value === 2000 + 2000 + 1500 && p1?.extra?.orders === 4, p1)

  const f = Object.fromEntries(r.funnel.map((s) => [s.key, s.value]))
  check("the funnel counts each step once per visit", f.buy === 2 && f.checkout === 1, f)

  const src = Object.fromEntries(r.breakdowns.source.map((x) => [x.key, x.value]))
  check("sources are counted per visit, by the visit's first page", src.social === 1 && src.organic_search === 1 && src.referral === 1 && src.direct === 1, src)
  check("a visit from the creator's own site is not a referrer", !r.breakdowns.referrer.some((x) => x.key.includes("storelib")), r.breakdowns.referrer)
  check("google is a referrer, without www", r.breakdowns.referrer[0]?.key === "google.com")
  check("social names the app", r.breakdowns.social[0]?.label === "Instagram")
  check("campaigns come from utm_campaign", r.breakdowns.campaign[0]?.label === "Autumn")
  const ro = r.breakdowns.country.find((c) => c.key === "RO")
  check("countries: visits, and the orders and money of buyers there", ro?.value === 2 && ro.extra?.orders === 1 && ro.extra?.salesCents === 2000, ro)
  check("a country code becomes its name", r.breakdowns.country.find((c) => c.key === "US")?.label === "United States")
  const dev = Object.fromEntries(r.breakdowns.device.map((x) => [x.key, x.value]))
  check("devices as recorded, and unrecorded as Unknown", dev.mobile === 1 && dev.desktop === 1 && dev.tablet === 1 && dev.unknown === 1, dev)
  const ch = Object.fromEntries(r.breakdowns.channel.map((x) => [x.key, x.value]))
  check("sessions by channel from the landing address", ch.website === 1 && ch.storelib === 3, ch)
  check("landing pages include the website's host", r.breakdowns.landing.some((x) => x.key === "ana.storelib.com"))
}

console.log("\nAnalytics: the pieces that feed it")
{
  const route = read("app/api/analytics/reports/route.ts")
  check("the reports are read on the server, a page at a time", /\.range\(a, b\)/.test(route) && /const PAGE = 1000/.test(route))
  check("  for the signed-in creator only", /\.eq\("user_id", user\.id\)/.test(route) && /\.eq\("creator_id", creator\.id\)/.test(route))
  check("  and a product filter only for their own product", /productTitles\[wanted\]/.test(route))
  const client = read("app/app/analytics/analytics-client.tsx")
  check("no made-up device split", !/Math\.round\(totalViews \* 0\.55\)/.test(client))
  const utils = read("lib/analytics-utils.ts")
  check("the analytics session has its own cookie, not the checkout's", /const SESSION_COOKIE = "sl_asid"/.test(utils) && !/materia_session=/.test(utils))
  const event = read("app/api/track-event/route.ts")
  check("a funnel step is recorded once per visit", /\.eq\("session_id", sessionId\)/.test(event) && /duplicate: true/.test(event))
  check("the checkout reports its step with the visit", /trackFunnelStep\("checkout_start"/.test(read("app/checkout/checkout-client.tsx")))
  check("a website's pages are counted", /<TrackView type="store" creatorId=\{site\.creatorId\}/.test(read("app/(site)/w/[username]/render-site.tsx")))
  check("  and its product pages, never a preview", /previewToken \? null : <TrackView type="product"/.test(read("components/website-builder/theme/render-product.tsx")))
  check("every country by name", /Intl\.DisplayNames\(\["en"\], \{ type: "region" \}\)/.test(read("app/api/track-view/route.ts")))
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
