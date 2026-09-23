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
import { buildOnePageReports } from "../lib/analytics/reports"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "../lib/analytics/sources"
import { isBotAgent, parseUserAgent } from "../lib/analytics/user-agent"
import { moneyOf, spansToRead } from "../lib/analytics/reports"
import { axisWidth, compactCount, compactMoney, compactPercent, niceScale } from "../lib/analytics/chart-scale"

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

console.log("\nAnalytics: OnePage")
{
  const w = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
  const IPHONE_IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0"
  const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
  const r = buildOnePageReports({
    views: [
      { id: "1", visitor_id: "a", referrer: "", user_agent: IPHONE_IG, country_code: "RO", created_at: at(8) },
      { id: "2", visitor_id: "b", referrer: "https://www.google.com/search?q=x", user_agent: MAC_CHROME, country_code: "US", created_at: at(9) },
      { id: "3", visitor_id: "c", referrer: "https://t.co/abc", user_agent: MAC_CHROME, created_at: at(10) },
      { id: "0", visitor_id: "z", referrer: "", user_agent: MAC_CHROME, created_at: at(3) },
    ],
    clicks: [
      { block_id: "b1", url: "https://shop.example.com", created_at: at(8) },
      { block_id: "b1", url: "https://shop.example.com", created_at: at(9) },
      { block_id: "b2", url: "https://youtube.com/x", created_at: at(9) },
    ],
    leads: [{ created_at: at(10) }],
    window: w,
    timeZone: "UTC",
    mainDomain: "storelib.com",
    linkLabels: { b1: "My shop" },
    categorize: (host, ua) => categorizeServerSource(host || "Direct", null, null, detectClientAppFromUA(ua)),
    parseAgent: parseUserAgent,
    hostOf: referrerHost,
  })
  check("views are counted in the period, against the one before", r.views.value === 3 && r.views.previous === 1)
  check("clicks and the click-through rate agree", r.clicks.value === 3 && r.ctr.value === 1)
  check("subscribers", r.subscribers.value === 1)
  check("top links use the block's own name, then the link's site", r.links[0]?.label === "My shop" && r.links[1]?.label === "youtube.com", r.links)
  const src = Object.fromEntries(r.breakdowns.source.map((x) => [x.key, x.value]))
  check("an Instagram in-app view is Social, Google is Search, t.co is Social", src.social === 2 && src.organic_search === 1, src)
  check("the device is read from the signature", r.breakdowns.device.find((d) => d.key === "mobile")?.value === 1)
  check("iPhone is iOS, a Mac is macOS", parseUserAgent(IPHONE_IG).os === "iOS" && parseUserAgent(MAC_CHROME).os === "macOS")
  check("Instagram's browser is named Instagram, not Safari", parseUserAgent(IPHONE_IG).browser === "Instagram")
  check("an iPad is a tablet", parseUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)").device === "tablet")
  check("a referrer's host, without www", referrerHost("https://www.google.com/x") === "google.com" && referrerHost("") === "")
  check("the view tracker and the reports share one set of source rules", /from "@\/lib\/analytics\/sources"/.test(read("app/api/track-view/route.ts")))
  const route = read("app/api/analytics/reports/route.ts")
  check("the OnePage is found from the signed-in user, never the request", /\.eq\("owner_id", userId\)/.test(route))
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

  const view = read("app/api/track-view/route.ts")
  check("the view tracker drops robots before anything is read", /if \(isBotAgent\(ua\)\) \{/.test(view))
  check("and the creator's own visits", /if \(await isOwnVisit\(/.test(view) && /auth\.getUser\(\)/.test(read("lib/analytics/own-visit.ts")))
  check("the half-hour dedupe survives two rows in the window (maybeSingle errored, and the error branch inserted)",
    /await dedupeQuery\.limit\(1\)/.test(view) && !/dedupeQuery\.maybeSingle\(\)/.test(view))
  check("device, browser and system come from the request's own signature", /const parsed = parseUserAgent\(ua\)/.test(view))
  check("a referrer that is Storelib, the creator's site or Stripe is Direct", /isInternalReferrer\(host, getMainDomain\(\), pageHost\)/.test(view))
  check("a page that is not a real creator's is not counted", /from\("creators"\)\.select\("id, user_id"\)\.eq\("id", payload\.creatorId\)/.test(view))
  check("a scripted browser does not send a view", /if \(isAutomatedBrowser\(\)\) return/.test(read("components/analytics/track-view.tsx")))

  const event = read("app/api/track-event/route.ts")
  check("funnel steps read the consent cookie on the server, not the page",
    /const consented = allows\(parse\(\(await cookies\(\)\)\.get\(CONSENT_COOKIE\)\?\.value, Date\.now\(\)\), "analytics"\)/.test(event)
      && /const sessionId = consented &&/.test(event) && /const visitorId = consented &&/.test(event))
  check("and only the steps the funnel knows are recorded", /\(EVENTS as readonly string\[\]\)\.includes\(payload\.eventType\)/.test(event) && /isBotAgent/.test(event))
}

console.log("\nReports: time zones, periods and comparisons")
{
  const K = "Asia/Kolkata"
  const w = { start: Date.parse("2026-09-13T18:30:00Z"), end: Date.parse("2026-09-14T18:30:00Z") } // one day in India
  const s = bucketStarts(w, "hour", K)
  check("an hour in India starts on the hour in India, not at half past", s.length === 24 && new Date(s[1]).toISOString() === "2026-09-13T19:30:00.000Z", new Date(s[1]).toISOString())
  check("the period and its comparison are read as one stretch when they touch", spansToRead({ start: 10, end: 20 }, { start: 0, end: 10 }).length === 1)
  check("and as two when a year apart, not the whole year between", spansToRead({ start: 1000, end: 1100 }, { start: 0, end: 100 }).length === 2)

  /* "Last 7 days" at 3pm: the period runs to now, the comparison to the same hour. */
  const cur = { start: T0 + 7 * DAY, end: T0 + 13 * DAY + 15 * HOUR }
  const prev = { start: T0, end: T0 + 6 * DAY + 15 * HOUR }
  const views: ViewRow[] = [view("x", 7, {}, 1), view("y", 0, {}, 1), view("z", 13, {}, 1)]
  const r = buildReports({ views, steps: [], orders: [], window: cur, previous: prev, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {} })
  check("the comparison's buckets are its own days, so day 1 sits beside day 1", r.sessions.series.previous[0] === 1 && r.sessions.series.current[0] === 1, r.sessions.series)
  check("the chart's views add up to the figure on its tab", r.views.series.current.reduce((a, b) => a + b, 0) === r.views.value && r.views.value === 2)
  const none = buildReports({ views, steps: [], orders: [], window: cur, previous: null, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {} })
  check("No comparison: nothing is compared, and nothing is shown as new", none.compared === false && none.sessions.change === null && none.sessions.series.previous.length === 0)
}

console.log("\nReports: money and channels")
{
  const w = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
  const orders: OrderRow[] = [
    order("t1", 8, { amount_cents: 1200, tip_cents: 200, source: "storelib" }),
    order("f1", 9, { amount_cents: 0 }),
    order("f2", 10, { amount_cents: 0, source: "website" }),
    order("old", 11, { amount_cents: 500, source: null }),
  ]
  const r = buildReports({ views: [], steps: [], orders, window: w, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {} })
  check("a tip is counted once: amount_cents already includes it", r.sales.value === 1200 + 500, r.sales.value)
  check("the sales line adds up to the sales figure", r.sales.series.current.reduce((a, b) => a + b, 0) === r.sales.value)
  const ch = Object.fromEntries(r.salesByChannel.map((c) => [c.key, c]))
  check("sales by channel is not empty when the orders are free", r.salesByChannel.length === 2 && ch.website?.extra?.orders === 1, r.salesByChannel)
  check("an order from before the channel was recorded is a Storelib page sale", ch.storelib?.value === 1700 && ch.storelib?.extra?.orders === 3, ch.storelib)
  const free = buildReports({ views: [], steps: [], orders: [order("a", 8, { amount_cents: 0 }), order("b", 9, { amount_cents: 0, source: "website" })], window: w, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {} })
  check("with no money at all, the ring is shared by orders", free.salesByChannel.every((c) => c.share === 0.5), free.salesByChannel)
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
    /export const SERIES = "#8b5cf6"/.test(reports) && /compared: "#b8bcc6"/.test(chart) && /strokeDasharray="5 4"/.test(chart))
  const icons = read("components/analytics/source-icon.tsx")
  const marks = read("components/analytics/brand-marks.ts")
  check("brand marks are inlined, not a runtime icon library", !/react-icons/.test(icons) && /export const BRAND_MARKS/.test(marks))
  check("in their own colours", /instagram: \{[^}]*fill: null/.test(marks) && /youtube: \{[^}]*fill: "#FF0000"/.test(marks) && /facebook: \{[^}]*fill: "#0866FF"/.test(marks))
  check("Google in four colours, TikTok in its offset, Instagram in its gradient",
    /#FBBC05[\s\S]*#EA4335[\s\S]*#34A853[\s\S]*#4285F4/.test(icons) && /#25F4EE/.test(icons) && /radialGradient/.test(icons))
  const page = read("app/app/analytics/analytics-client.tsx")
  check("the product picker on a phone is the shared sheet, above the navigation pill", /<BottomSheet isOpen=\{isProductsSheetOpen\}/.test(page) && !/function AnalyticsProductsSheet/.test(page))
  check("no order is spread across days it did not happen on", !/Distribute orders across existing dates/.test(page) && !/new Date\(a\.date \+ ", 2024"\)/.test(page))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
