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
import { groupOrders, isSale, PAYMENT_LABEL, type OrderRow } from "../lib/orders/order-view"
import { readMetrics } from "../lib/orders/metrics"
import { dayPart, firstName, greetingZone } from "../lib/greeting"
import { buildOnePageReports } from "../lib/analytics/reports"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "../lib/analytics/sources"
import { isBotAgent, parseUserAgent } from "../lib/analytics/user-agent"
import { lineMoney, moneyOf, spansToRead } from "../lib/analytics/reports"
import { GROUP_COLUMNS, talliesFromWire, tallyArgs, tallyVisits, type VisitTallies, type VisitTally } from "../lib/analytics/reports"
import { questionOf, reportKey, reportNow } from "../lib/analytics/report-cache"
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
  /* Pages by keyset since the speed work: an OFFSET (`.range(a, b)`) made Postgres walk every earlier row again for each page. */
  check("the reports are read on the server, a page at a time, each page from where the last ended",
    /\.limit\(PAGE\)/.test(route) && /const PAGE = 1000/.test(route) && /created_at\.gt\."\$\{after\.t\}",id\.gt\.\$\{after\.id\}/.test(route) && !/\.range\(/.test(route))
  check("  for the signed-in creator only", /\.eq\("user_id", user\.id\)/.test(route) && /\.eq\("creator_id", creator\.id\)/.test(route))
  check("  and a product filter only for their own product", /productTitles\[wanted\]/.test(route))
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
  check("the view tracker and the reports share one set of source rules", /from "\.\/sources"/.test(read("lib/analytics/collect.ts")) && /from "@\/lib\/analytics\/collect-route"/.test(read("app/api/track-view/route.ts")))
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
    /export const SERIES = "#8b5cf6"/.test(reports) && /compared: "#b8bcc6"/.test(chart) && /comparedColor=\{CHART_COLORS\.compared\}/.test(chart)
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
    shared sheet on a phone.
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
  check("no order is spread across days it did not happen on", !/Distribute orders across existing dates/.test(page) && !/new Date\(a\.date \+ ", 2024"\)/.test(page))
}

console.log("\nAnalytics: from the review")
{
  const route = read("app/api/analytics/reports/route.ts")
  const page = read("app/app/analytics/analytics-client.tsx")
  check("All time is answered, not refused: the span allows years past 2020", /const MAX_SPAN_MS = 30 \* 366 \* 24 \* 3_600_000/.test(route))
  check("and All time is compared with nothing", /const isAllTime = period\.preset === "all_time"/.test(page) && /isAllTime \? null : compareBounds\(/.test(page) && !/<ComparePicker/.test(page))
  check("OnePage views: each window counted from its own sessions, never twice", !/now\.concat\(before\)/.test(read("lib/analytics/reports.ts")) && /current: bucketCounts\(at\(now\), starts, cur, n\)/.test(read("lib/analytics/reports.ts")))
  /* The funnel steps go through the one pipeline a page view does (lib/analytics/collect). */
  const ev = read("lib/analytics/collect.ts")
  check("a funnel step needs a real creator and their own product, and the creator's own clicks do not count",
    /from\("creators"\)\.select\("id, user_id"\)\.eq\("id", creatorId\)/.test(ev) && /\.eq\("id", productId\)\.eq\("creator_id", creatorId\)/.test(ev) && /isOwnVisit\(/.test(ev) &&
      /collectFrom\(req, eventType as CollectKind, body, createAdminClient\(\)\)/.test(read("app/api/track-event/route.ts")))
  check("a step is sent once per page, with nothing stored", /const sentSteps = new Set<string>\(\)/.test(read("lib/analytics-utils.ts")) && /if \(sentSteps\.has\(key\)\) return Promise\.resolve\(\)/.test(read("lib/analytics-utils.ts")))
  check("a failed refresh keeps the figures; only a different question clears them",
    /questionOf\(s\.data\.key\) === question \? s\.data : null/.test(read("app/app/analytics/analytics-reports.tsx")))
}

console.log("\nAnalytics: disputes, products and countries, from the accuracy audit")
{
  const w = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
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
  const r = buildReports({ views: [], steps: [], orders, window: w, timeZone: "UTC", mainDomain: "storelib.com", productTitles: { p1: "Presets", p2: "Brushes" } })
  check("a disputed order is left out of Orders and Total sales", r.orders.value === 3 && r.sales.value === 2000 + 4500 + 1700, { orders: r.orders.value, sales: r.sales.value })
  const byProduct = r.salesByProduct.reduce((sum, row) => sum + row.value, 0)
  check("Sales by product adds up to Total sales", byProduct === r.sales.value, { byProduct, sales: r.sales.value })
  check("  each product its own lines less their refunds", r.salesByProduct.find((x) => x.key === "p1")?.value === 3000 && r.salesByProduct.find((x) => x.key === "p2")?.value === 5200, r.salesByProduct)
  check("lineMoney is the unit moneyOf adds up", lineMoney(orders[1]).net === 4500 && moneyOf(groupOrders([orders[2], orders[3]])[0]).net === 1700)
  const m = Object.fromEntries(readMetrics(groupOrders(orders), w, null, "UTC").map((x) => [x.key, x]))
  check("the Orders page's own figures leave a dispute out the same way", m.orders.value === 3 && m.sales.value === 2000 + 4500 + 1700, { orders: m.orders.value, sales: m.sales.value })
  check("every page asks one question of an order", /\.filter\(isSale\)/.test(read("lib/analytics/reports.ts")) && /\.filter\(isSale\)/.test(read("app/api/analytics/reports/route.ts"))
    && /const counted = isSale/.test(read("lib/orders/metrics.ts")) && /isSale\(o\)/.test(read("lib/website-builder/site-performance.ts")))

  /*
    Countries: 26 with a visit each, and the last of them by name, Zimbabwe,
    with an order. The visits were cut to 25 before the orders were added,
    so Zimbabwe came back as a new row with no visits, sorted last and cut
    again: its order was nowhere on the card.
  */
  const codes = ["AR", "AT", "AU", "BE", "BR", "CA", "CH", "CL", "CN", "CZ", "DE", "DK", "ES", "FI", "FR", "GB", "GR", "IE", "IN", "IT", "JP", "MX", "NL", "NO", "PL", "ZW"]
  const views = codes.map((code) => view(`c-${code}`, 8, { country_code: code }))
  const countries = buildReports({
    views,
    steps: [],
    orders: [order("zw", 8, { buyer_country_code: "ZW", buyer_country: "Zimbabwe" })],
    window: w,
    timeZone: "UTC",
    mainDomain: "storelib.com",
    productTitles: {},
  }).breakdowns.country
  const zw = countries.find((c) => c.key === "ZW")
  check("a country with a visit and an order keeps both, past the 25th", zw?.value === 1 && zw.extra?.orders === 1 && zw.extra?.salesCents === 2000, zw)
  check("  and the card is still 25 countries, none of them with no visits", countries.length === 25 && countries.every((c) => c.value > 0), countries.length)

  /* Pages of 1,000 read in an order with no ties, so none is read twice or missed. */
  const route = read("app/api/analytics/reports/route.ts")
  /* Counted by `.limit(PAGE)` since pages start where the last ended (keyset) instead of `.range(a, b)`. */
  const ranges = (route.match(/\.limit\(PAGE\)/g) ?? []).length
  const tieBroken = (route.match(/\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(PAGE\)/g) ?? []).length
  check("every paged read is sorted by time and then by id", ranges === 5 && tieBroken === ranges, { ranges, tieBroken })
}

console.log("\nAnalytics: counted by the database or by Node, the same figures")
{
  /*
    analytics_visit_tally counts in Postgres what tallyVisits counts here, and
    answers in groups: the columns a breakdown reads, how many visits, and the
    rank of the earliest. This is that answer made from Node's own tally, in
    no particular order, read back by talliesFromWire: every figure has to
    come out as the rows gave it. scripts/bench-analytics.mjs holds the real
    database to the same, figure by figure.
  */
  const toWire = (t: VisitTallies, detail: boolean) => {
    const one = (x: VisitTally) => ({
      views: x.views,
      view_buckets: x.viewBuckets,
      sessions: x.sessions,
      session_buckets: x.sessionBuckets,
      ...(detail
        ? {
            steps: x.steps,
            groups: Object.fromEntries(
              Object.entries(x.groups!).map(([kind, groups]) => {
                const cols = GROUP_COLUMNS[kind as keyof typeof GROUP_COLUMNS] as ReadonlyArray<keyof ViewRow>
                return [kind, groups.map((g, i) => [...cols.map((c) => (g.first[c] as string | null) ?? null), g.n, i + 1]).reverse()]
              }),
            ),
          }
        : {}),
    })
    return { cur: one(t.cur), prev: one(t.prev) }
  }
  const w = { start: T0 + 7 * DAY, end: T0 + 14 * DAY }
  const views: ViewRow[] = []
  const sources = ["social_instagram", "direct", "organic_search", null, "referral"]
  for (let i = 0; i < 400; i++) {
    views.push(
      view(`s${i % 150}`, 1 + (i % 13), {
        id: `v${String(i).padStart(4, "0")}`,
        source_category: sources[i % 5],
        referrer_domain: ["www.google.com", "Google.com", null, "storelib.com"][i % 4],
        country_code: ["RO", "ro", "US", null][i % 4],
        country_name: [null, "Romania"][i % 2],
        city: ["Cluj-Napoca", "S%C3%A3o%20Paulo", null][i % 3],
        browser: ["chrome", "Chrome", "CHROME", null][i % 4],
        utm_campaign: ["Autumn", "autumn", null][i % 3],
        page_url: ["https://storelib.com/ana?fbclid=1", "https://storelib.com/ana", "https://anashop.ro/p/1", null][i % 4],
        ...(i % 9 === 0 ? { session_id: null } : {}),
      }, i % 24),
    )
  }
  views.sort((a, b) => a.created_at.localeCompare(b.created_at) || String(a.id).localeCompare(String(b.id)))
  const steps: StepRow[] = [
    { event_type: "buy_click", session_id: "s3", created_at: at(8, 3) },
    { event_type: "buy_click", session_id: null, visitor_id: null, created_at: at(8, 4) },
    { event_type: "checkout_start", session_id: "s3", created_at: at(8, 5) },
  ]
  const orders = [order("o1", 8, { source: "website", buyer_country_code: "RO" }), order("o2", 9), order("o0", 2)]
  for (const timeZone of ["UTC", "America/New_York", "Asia/Kolkata"]) {
    const base = { orders, window: w, timeZone, mainDomain: "storelib.com", productTitles: { p1: "Presets" } }
    const fromRows = buildReports({ ...base, views, steps })
    const tallied = tallyVisits({ views, steps, window: w, timeZone })
    const fromGroups = buildReports({ ...base, visits: talliesFromWire(JSON.parse(JSON.stringify(toWire(tallied, true))), true) })
    check(`every figure and list is the same from the groups as from the rows (${timeZone})`, JSON.stringify(fromGroups) === JSON.stringify(fromRows))
    const quick = buildReports({ ...base, visits: talliesFromWire(JSON.parse(JSON.stringify(toWire(tallied, false))), false) })
    check(`  and the quick answer has every figure, marked partial, with the lists and funnel left to wait (${timeZone})`,
      quick.partial === true && fromRows.partial === undefined
        && (["views", "sessions", "conversion", "aov", "sales", "orders", "refunds", "salesByChannel", "salesByProduct"] as const).every((k) => JSON.stringify(quick[k]) === JSON.stringify(fromRows[k]))
        && quick.funnel.length === 0 && quick.breakdowns.source.length === 0 && quick.breakdowns.country.length === 0)
  }
  const args = tallyArgs(w, null, "UTC")
  check("the database is handed the chart's own buckets, and an empty comparison when there is none",
    args.p_cur_starts.length === 7 && args.p_prev_starts.length === 0 && args.p_prev_start === args.p_prev_end)

  const sql = read("supabase/migrations/20261002_analytics_report_speed.sql")
  check("the functions are the server's alone: a creator id in, so nobody else may run them",
    /REVOKE ALL ON FUNCTION public\.analytics_visit_tally\([^)]*\) FROM PUBLIC, anon, authenticated;/.test(sql)
      && /REVOKE ALL ON FUNCTION public\.analytics_all_time\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(sql)
      && !/SECURITY DEFINER/.test(sql))
  check("the reads have indexes in the order they ask: creator or product, kind, time, id",
    /ON public\.analytics_events \(creator_id, event_type, created_at, id\)/.test(sql) && /ON public\.analytics_events \(product_id, event_type, created_at, id\)/.test(sql)
      && /ON public\.orders \(product_id, created_at, id\)/.test(sql))
  const part = "supabase/sql/run-now/25_analytics_speed.sql"
  check("the run-now part exists, is listed, and every line of it is one whole statement",
    read(part).trim().split("\n").slice(1).every((l) => /;\s*$/.test(l)) && /25_analytics_speed\.sql/.test(read("supabase/sql/run-now/README.md"))
      && /p25_analytics_speed/.test(read("supabase/sql/run-now/99_check_after.sql")))

  const route = read("app/api/analytics/reports/route.ts")
  check("the route counts in the database, and in Node from the rows while the functions are missing",
    /\(admin, "analytics_visit_tally", \{ \.\.\.args, p_detail: true \}\)/.test(route) && /error\.code === "PGRST202"/.test(route) && /tallyVisits\(\{ views: views\.rows, steps: steps\.rows/.test(route))
  check("the reads it still makes go side by side, not one after another",
    /const reads = await Promise\.all\(\s*spans\.map/.test(route) && /const \[v, o, a\] = await Promise\.all\(\[visits, orders, allTime\]\)/.test(route))
  check("an answer is kept a few seconds for the same person and the same whole question, never longer",
    /const key = `\$\{user\.id\}\|\$\{question\}`/.test(route) && /const CACHE_MS = 15_000/.test(route) && /private, max-age=/.test(route) && /Vary: "Cookie, Authorization"/.test(route))

  /* The page and the sidebar's prefetch ask the very same question. */
  const q = { start: T0, end: T0 + DAY, compare: { start: T0 - DAY, end: T0 }, product: "all", mode: "store" as const, timeZone: "UTC" }
  check("a question is its key without the moving end", questionOf(reportKey(q)) === questionOf(reportKey({ ...q, end: q.end + 5000, compare: { start: T0 - DAY, end: T0 + 5000 } })))
  check("now is rounded up to ten seconds, never down", reportNow(T0 + 1) === T0 + 10_000 && reportNow(T0) === T0)
  const cache = read("lib/analytics/report-cache.ts")
  check("a kept answer is shown only to the person it was counted for",
    /if \(!viewer \|\| k\.answer\.viewer !== viewer\) return null/.test(cache) && /viewer: q\.viewer/.test(route) && /viewer: userId,/.test(read("app/app/analytics/analytics-client.tsx")))
  const reports = read("app/app/analytics/analytics-reports.tsx")
  check("the figures go on screen first; the funnel and lists keep the last ones, softened, or wait in their shapes, for the rest",
    /const l = r\?\.partial \? before : r/.test(reports) && /const listsBlank = !l \|\| l\.partial === true/.test(reports)
      && /<VisitCards b=\{listsBlank \? null : l!\.breakdowns\} blank=\{listsBlank\}/.test(reports))
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
      && /const waitingLists = reportsState\.loading && !!answer && answer\.mode === "store" && !!answer\.reports\.partial/.test(client))
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
      && /\{waitingFigures && !sample \? \(/.test(client) && /animation: `skeleton-reveal 260ms ease-out \$\{COUNTING_NOTE_MS\}ms forwards`/.test(client))
  check("it moves nothing (over the chart, out of the flow), is announced politely, and starts again for a new question",
    /role="status"\s+data-counting-note=""\s+className="pointer-events-none absolute inset-x-0/.test(client) && /key=\{waitingKey\}/.test(client))
  check("and the figures on screen stay, blurred, while it waits", /soft=\{soft\} loading=\{figuresLoading\}/.test(client))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
