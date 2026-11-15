/**
 * ===========================================================================
 *  ROUND 33: A COMMUNITY'S VISITS TRACKED WELL, AND EVERYTHING AN ADMIN NEEDS
 * ===========================================================================
 * "Make sure countries, devices, traffic sources and referrers are very well
 * tracked", "everything an admin needs, accurate and working", "a clear
 * overview, then sections", "remove the Connect Google Analytics next to the
 * time frame". Held here:
 *
 *   SOURCE      a visit's source in one word, case by case: no referrer,
 *               search, social sites and their link wrappers, email, utm
 *               tags (and ?ref= without them), click ids from ads and
 *               networks, in-app browsers, Storelib's Explore and its other
 *               pages, a move inside the community, the community's own
 *               domain, a payment page, the Storelib app
 *   DEVICE      phone, tablet (an iPad that says it is a Mac), desktop
 *   COUNTRY     Vercel's header first, then other edges' names; never an
 *               unknown, Tor or a region
 *   PERSON      a person's browser, never a bot, a preview or a fetcher
 *   VISIT       the route's recordVisit: once a visitor a day through the
 *               database, never the owner or the store's account, never a
 *               draft, never a program; signed out and on the community's
 *               own domain too; whether the visitor was a member
 *   BEACON      every page of a published community carries it (the
 *               layout), the render counts nothing, it waits for a real
 *               screen, and it tells once a day
 *   NIGHTLY     part 184's count never writes nobody over a day whose rows
 *               are gone
 *   REPORT      member churn, visits from non-members, RSVPs, lessons, DAU,
 *               WAU, MAU and stickiness, new and returning members, why
 *               members left, against rows worked out by hand
 *   SECTION     the period alone in its row, six figures over the sections,
 *               Growth, Traffic, Engagement, Content and Revenue as tabs
 *   COPY        no em dash, no banned word, no server code in a client file
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { fakeDb } from "./_fake-db"
import { isPersonBrowser, isStorelibApp, visitCountry, visitDevice, visitSource } from "@/lib/communities/visit-source"
import { readVisitBody, recordVisit, visitFactsOf } from "@/lib/communities/server/record-view"
import { resetVisitReady } from "@/lib/communities/server/views"
import { rollupTraffic } from "@/lib/communities/server/analytics"
import { loadCommunityReport } from "@/lib/communities/server/analytics-report"
import { REPORT_VERSION } from "@/lib/communities/analytics-report"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(raw(p))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const CID = "c0000000-0000-4000-8000-000000000033"
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const NOW = Date.parse("2026-10-15T16:00:00.000Z")

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const INSTAGRAM_APP = `${IPHONE} Instagram 312.0.0.32.112 (iPhone15,2; iOS 17_0; en_US)`
const TIKTOK_APP = `${ANDROID} musical_ly_2023 BytedanceWebview/d8a21c6`
const STORELIB_APP = `${IPHONE} Capacitor StorelibWindows/1`
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

async function main() {
  /* ── Sources ─────────────────────────────────────────────────────────── */
  console.log("\nhow a visitor arrived")
  const v = (referer: string | null, path = "/community/clay", ua = MAC, pageHost: string | null = "storelib.com") => visitSource({ referer, path, slug: "clay", mainDomain: "storelib.com", userAgent: ua, pageHost })
  check("no referrer, no tag: direct", same(v(null), { source: "direct", referrer: null }))
  check("Google, any country's: search, with its site", same(v("https://www.google.com/"), { source: "organic_search", referrer: "google.com" }) && v("https://www.google.co.uk/").source === "organic_search")
  check("Bing and DuckDuckGo: search", v("https://www.bing.com/search?q=clay").source === "organic_search" && v("https://duckduckgo.com/").source === "organic_search")
  check("Gmail is email, never search", v("https://mail.google.com/mail/u/0/").source === "email")
  check("Instagram's link wrapper: Instagram, its site kept", same(v("https://l.instagram.com/?u=x"), { source: "social_instagram", referrer: "l.instagram.com" }))
  check("Facebook's, X's t.co and YouTube: their networks", v("https://lm.facebook.com/l.php").source === "social_facebook" && v("https://t.co/abc").source === "social_x" && v("https://www.youtube.com/").source === "social_youtube")
  check("another site: a referral with its host", same(v("https://potterymag.example.com/a"), { source: "referral", referrer: "potterymag.example.com" }))
  check("utm tags win over the site", v("https://www.google.com/", "/community/clay?utm_source=newsletter&utm_medium=email").source === "email")
  check("utm_source=ig is Instagram, and the tag is kept when no site sent it", same(v(null, "/community/clay?utm_source=ig"), { source: "social_instagram", referrer: "ig" }))
  check("utm_medium=cpc from Google is paid search", v(null, "/community/clay?utm_source=google&utm_medium=cpc").source === "paid_search")
  check("?ref= is a source when there are no utm tags", same(v(null, "/community/clay?ref=newsletter"), { source: "email", referrer: "newsletter" }) && v(null, "/community/clay?ref=producthunt").source === "referral")
  check("a tag with anything odd in it is not kept", same(v(null, "/community/clay?utm_source=%3Cscript%3E"), { source: "direct", referrer: null }))
  check("a Google ad's gclid with no referrer is paid search", v(null, "/community/clay?gclid=abc").source === "paid_search")
  check("fbclid with no referrer is Facebook, ttclid TikTok", v(null, "/community/clay?fbclid=x").source === "social_facebook" && v(null, "/community/clay?ttclid=x").source === "social_tiktok")
  check("a click id never beats the site that sent the visitor", v("https://l.instagram.com/", "/community/clay?fbclid=x").source === "social_instagram")
  check("Instagram's in-app browser with no referrer is Instagram", v(null, "/community/clay", INSTAGRAM_APP).source === "social_instagram")
  check("TikTok's in-app browser too", v(null, "/community/clay", TIKTOK_APP).source === "social_tiktok")
  check("Storelib's Explore and the list of communities: explore", v("https://storelib.com/explore").source === "explore" && v("https://storelib.com/explore/communities?q=clay").source === "explore" && v("https://storelib.com/community").source === "explore")
  check("the creator's page, a product, a OnePage, another community: the store's own pages", ["https://storelib.com/ana", "https://storelib.com/ana/p/mug", "https://storelib.me/ana", "https://storelib.com/community/other"].every((r) => same(v(r), { source: "storelib", referrer: null })))
  check("a move inside the same community is direct", v("https://storelib.com/community/clay/post/1").source === "direct" && v("https://storelib.com/community/Clay").source === "direct")
  check("a buyer back from Stripe is direct", v("https://checkout.stripe.com/c/pay").source === "direct")
  check("on the community's own domain, a page of that domain is a move, never a referral from itself", same(v("https://club.maralind.com/about", "/", MAC, "club.maralind.com"), { source: "direct", referrer: null }) && same(v("https://www.club.maralind.com/", "/post/1", MAC, "www.club.maralind.com"), { source: "direct", referrer: null }))
  check("and another site linking to that domain is still a referral", v("https://potterymag.example.com/", "/", MAC, "club.maralind.com").source === "referral")
  check("inside the Storelib app, whatever Storelib page it came from: the app", ["https://storelib.com/explore", "https://storelib.com/ana", null].every((r) => same(v(r, "/community/clay", STORELIB_APP), { source: "app", referrer: null })))
  check("but a tagged link opened in the app keeps its tag", v(null, "/community/clay?utm_source=newsletter", STORELIB_APP).source === "email")
  check("the app is told by its signature", isStorelibApp(STORELIB_APP) && !isStorelibApp(IPHONE))

  /* ── Device, country, person ─────────────────────────────────────────── */
  console.log("\ndevice, country, person")
  check("an iPhone and an Android phone: mobile", visitDevice(IPHONE) === "mobile" && visitDevice(ANDROID) === "mobile")
  check("an iPad and an Android tablet: tablet", visitDevice(IPAD) === "tablet" && visitDevice(ANDROID_TABLET) === "tablet")
  check("an iPad asking for the desktop site (a Mac with a touch screen): tablet", visitDevice(MAC, 5) === "tablet")
  check("a Mac without touches and Windows: desktop", visitDevice(MAC, 0) === "desktop" && visitDevice(MAC) === "desktop" && visitDevice(WINDOWS, 10) === "desktop")
  check("no signature: no device", visitDevice(null) === null && visitDevice("") === null)
  const hs = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null })
  check("Vercel's country header, in capitals", visitCountry(hs({ "x-vercel-ip-country": "ro" })) === "RO")
  check("then Cloudflare's and CloudFront's names", visitCountry(hs({ "cf-ipcountry": "DE" })) === "DE" && visitCountry(hs({ "cloudfront-viewer-country": "fr" })) === "FR")
  check("Vercel's wins when both are there", visitCountry(hs({ "x-vercel-ip-country": "US", "cf-ipcountry": "DE" })) === "US")
  check("never unknown, Tor or a region", ["XX", "T1", "EU", "AP", "A1", "ZZ", "USA", "1", ""].every((c) => visitCountry(hs({ "x-vercel-ip-country": c })) === null))
  check("an unknown in Vercel's header falls through to another edge's", visitCountry(hs({ "x-vercel-ip-country": "XX", "cf-ipcountry": "GB" })) === "GB")
  check("browsers people use are people, the Storelib app too", [MAC, IPHONE, ANDROID, IPAD, INSTAGRAM_APP, STORELIB_APP, WINDOWS].every(isPersonBrowser))
  check("crawlers, previews, headless browsers and fetchers are not", ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "facebookexternalhit/1.1", "WhatsApp/2.23.20.0 A", "Mozilla/5.0 HeadlessChrome/126.0", "curl/8.4.0", "Slackbot-LinkExpanding 1.0", "", null].every((ua) => !isPersonBrowser(ua)))

  /* ── The visit, through the route's recordVisit ──────────────────────── */
  console.log("\nthe visit")
  const body = readVisitBody({ path: "/community/clay?utm_source=ig", referrer: "https://l.instagram.com/", touch: 0 })
  check("the beacon's body is read as a path, an http referrer and a touch count", same(body, { path: "/community/clay?utm_source=ig", referrer: "https://l.instagram.com/", touch: 0 }))
  check("anything else in it is dropped", same(readVisitBody({ path: "//evil.example/x", referrer: "javascript:alert(1)", touch: 99 }), { path: null, referrer: null, touch: null }) && same(readVisitBody(null), { path: null, referrer: null, touch: null }))
  const headersOf = (h: Record<string, string>) => new Headers(h)
  const facts = visitFactsOf({ headers: headersOf({ "user-agent": IPHONE, "x-vercel-ip-country": "ro", host: "storelib.com" }), body }, "clay", "storelib.com")
  check("the facts kept with the visit", same(facts, { source: "social_instagram", referrer: "l.instagram.com", device: "mobile", country: "RO" }), facts)
  const onDomain = visitFactsOf({ headers: headersOf({ "user-agent": MAC, "x-forwarded-host": "club.maralind.com", host: "storelib-xyz.vercel.app" }), body: readVisitBody({ path: "/about", referrer: "https://club.maralind.com/", touch: 0 }) }, "clay", "storelib.com")
  check("on the community's own domain the host the visitor asked for is the page's (x-forwarded-host)", onDomain.source === "direct" && onDomain.referrer === null, onDomain)

  const COMMUNITY = { id: CID, slug: "clay", status: "published", owner_user_id: U(1), creator_id: "cr1" }
  const calls: [string, Record<string, unknown>][] = []
  const visitDb = (answer: unknown = true) => ({
    from: fakeDb({ community_members: [{ community_id: CID, user_id: U(5), status: "active" }, { community_id: CID, user_id: U(6), status: "left" }], creators: [{ id: "cr1", user_id: U(2) }] }).from,
    rpc: async (name: string, args: Record<string, unknown>) => (calls.push([name, args]), { data: answer, error: null }),
  })
  const req = (h: Record<string, string>, userId: string | null = null, b = body) => ({ headers: headersOf({ "user-agent": IPHONE, "x-forwarded-for": "203.0.113.9", ...h }), browserId: null, userId, body: b })
  resetVisitReady()
  calls.length = 0
  check("a signed out visitor is counted, through community_record_visit", (await recordVisit(visitDb(), COMMUNITY, req({ "x-vercel-ip-country": "RO" }))) === "counted" && calls[0]?.[0] === "community_record_visit")
  check("with every fact, and not a member", calls[0]?.[1].p_source === "social_instagram" && calls[0]?.[1].p_referrer === "l.instagram.com" && calls[0]?.[1].p_device === "mobile" && calls[0]?.[1].p_country === "RO" && calls[0]?.[1].p_member === false, calls[0]?.[1])
  check("a visitor key, never an address", typeof calls[0]?.[1].p_visitor === "string" && /^[0-9a-f]{64}$/.test(String(calls[0]?.[1].p_visitor)) && !JSON.stringify(calls[0]?.[1]).includes("203.0.113.9"))
  calls.length = 0
  await recordVisit(visitDb(), COMMUNITY, req({}, U(5)))
  check("a member is told as a member", calls[0]?.[1].p_member === true)
  calls.length = 0
  await recordVisit(visitDb(), COMMUNITY, req({}, U(6)))
  check("somebody who left is not a member", calls[0]?.[1].p_member === false)
  calls.length = 0
  check("the same visitor again today is a repeat, the database's own rule", (await recordVisit(visitDb(false), COMMUNITY, req({}))) === "repeat")
  calls.length = 0
  check("the owner is never a visit, and nothing is asked", (await recordVisit(visitDb(), COMMUNITY, req({}, U(1)))) === "owner" && calls.length === 0)
  check("nor the store account the community belongs to", (await recordVisit(visitDb(), COMMUNITY, req({}, U(2)))) === "owner" && calls.length === 0)
  check("a bot is never a visit", (await recordVisit(visitDb(), COMMUNITY, req({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }))) === "not_a_person" && calls.length === 0)
  check("nor a link preview", (await recordVisit(visitDb(), COMMUNITY, req({ "user-agent": "WhatsApp/2.23.20.0 A" }))) === "not_a_person" && calls.length === 0)
  check("a draft is never counted", (await recordVisit(visitDb(), { ...COMMUNITY, status: "draft" }, req({}))) === "not_published" && calls.length === 0)
  check("no address, no account, no browser id: nothing to key it by, skipped", (await recordVisit(visitDb(), COMMUNITY, { headers: headersOf({ "user-agent": IPHONE }), browserId: null, userId: null, body })) === "skipped" && calls.length === 0)
  resetVisitReady()

  /* ── The route, the beacon, the layout ───────────────────────────────── */
  console.log("\nthe route, the beacon, the layout")
  const route = code("app/api/community/[communityId]/visit/route.ts")
  check("the route answers only the page itself", /if \(site && site !== "same-origin"\) return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403/.test(route))
  /* Changed on purpose (round 33 merge): the route asks viewerContext who is visiting and rate limits, as every community route must (communities-security). */
  check("and reads the session, the browser id and the body before counting", /const userId = await sessionUserId\(\)/.test(route) && /viewerContext\(db, community, userId\)/.test(route) && /rateLimit\(\{/.test(route) && /request\.cookies\.get\("materia_visitor"\)/.test(route) && /readVisitBody\(await readJson\(request\)\)/.test(route) && /recordVisit\(db, community,/.test(route))
  const beacon = code("components/community/public/visit-beacon.tsx")
  check("the beacon is a client file that posts to the route", /^"use client"/.test(raw("components/community/public/visit-beacon.tsx")) && /fetch\(`\/api\/community\/\$\{communityId\}\/visit`, \{ method: "POST"/.test(beacon) && /keepalive: true/.test(beacon))
  check("it says nothing from a browser a program drives", /if \(typeof navigator !== "undefined" && navigator\.webdriver\) return/.test(beacon))
  check("a prerendered page waits until it is shown", /if \(doc\.prerendering\) \{\s*doc\.addEventListener\("prerenderingchange", send, \{ once: true \}\)/.test(beacon))
  check("once a UTC day per browser, remembered only once the server answered", /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(beacon) && /if \(window\.localStorage\.getItem\(key\) === day\) return/.test(beacon) && /if \(!answer\?\.ok\) return\s*try \{\s*window\.localStorage\.setItem\(key, day\)/.test(beacon))
  check("it sends the address as the page opened, the referrer and the touch points", /opened\.current = `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`/.test(beacon) && /referrer: referer \|\| document\.referrer \|\| null/.test(beacon) && /navigator\.maxTouchPoints/.test(beacon))
  const layout = code("app/(storelib)/(marketing)/community/[slug]/layout.tsx")
  check("every page of a published community carries it, in both frames", (layout.match(/\{visit\}/g) ?? []).length === 2 && /* Changed on purpose (round 63): a stranger\'s shared copy draws no Referer (lib/communities/stranger-page). */ /const visit = visitBeacon\(page, asked\.get\(COMMUNITY_STRANGER_HEADER\) \? null : asked\.get\("referer"\)\)/.test(layout))
  check("never for its owner or the store's account, never for a draft", /if \(!c \|\| c\.status !== "published" \|\| page\.viewer\?\.isOwner \|\| page\.viewer\?\.isCreatorAccount\) return null/.test(layout))
  check("no page counts a view while it renders (a prefetch renders too)", !/scheduleCommunityView/.test(code("app/(storelib)/(marketing)/community/[slug]/page.tsx")) && !/scheduleCommunityView/.test(code("app/(storelib)/(marketing)/community/[slug]/about/page.tsx")) && !/scheduleCommunityView/.test(code("lib/communities/server/record-view.ts")))
  check("the member's heartbeat still writes the member's day", /recordMemberDay\(db, gate\.community\.id, String\(gate\.viewer\.userId\)\)/.test(code("app/api/community/[communityId]/presence/route.ts")))

  /* ── Nightly ─────────────────────────────────────────────────────────── */
  console.log("\nnightly (part 184)")
  const night = fakeDb({ community_view_days: [], community_daily_stats: [{ community_id: CID, day: "2026-10-05", visitors: 40, prospects: 31 }], community_daily_traffic: [] })
  check("a day older than the rows' three days is left as it is, never written as nobody", (await rollupTraffic(night, CID, "2026-10-05", NOW)) === false && night.tables.community_daily_stats[0].visitors === 40 && night.log.length === 0)
  const fresh = fakeDb({
    community_view_days: [
      { community_id: CID, day: "2026-10-14", visitor_key: "k1", source: "app", referrer: null, device: "mobile", country: "RO", member: true },
      { community_id: CID, day: "2026-10-14", visitor_key: "k2", source: "social_instagram", referrer: "l.instagram.com", device: "tablet", country: "DE", member: false },
    ],
    community_daily_stats: [{ community_id: CID, day: "2026-10-14" }],
    community_daily_traffic: [],
  })
  check("yesterday is counted, the app and a tablet among its lines", (await rollupTraffic(fresh, CID, "2026-10-14", NOW)) === true && fresh.tables.community_daily_traffic.some((l) => l.dimension === "source" && l.key === "app" && l.visitors === 1) && fresh.tables.community_daily_traffic.some((l) => l.dimension === "device" && l.key === "tablet"))

  /* ── The report ──────────────────────────────────────────────────────── */
  console.log("\nthe report")
  const day = (d: string) => `${d}T12:00:00.000Z`
  const tables = {
    communities: [{ id: CID, owner_user_id: U(1), creator_id: null, created_at: "2026-09-01T00:00:00Z" }],
    community_members: [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, community_id: CID, user_id: U(i + 1), status: "active", joined_at: "2026-09-02T00:00:00Z", last_seen_at: i < 2 ? "2026-10-15T10:00:00Z" : i < 5 ? "2026-10-11T00:00:00Z" : i < 8 ? "2026-09-25T00:00:00Z" : null, last_active_at: null })),
    ],
    community_activity: [
      { id: 1, community_id: CID, user_id: U(9), kind: "joined", created_at: day("2026-10-02") },
      { id: 2, community_id: CID, user_id: U(10), kind: "joined", created_at: day("2026-10-03") },
      { id: 3, community_id: CID, user_id: U(11), kind: "left", created_at: day("2026-10-03") },
    ],
    community_member_days: [
      { community_id: CID, user_id: U(9), day: "2026-10-02" },
      { community_id: CID, user_id: U(3), day: "2026-10-02" },
      { community_id: CID, user_id: U(4), day: "2026-10-03" },
    ],
    community_daily_stats: [{ community_id: CID, day: "2026-10-02", visitors: 20, prospects: 12 }],
    community_daily_traffic: [],
    community_view_days: [],
    community_feed_posts: [],
    community_events: [],
    community_tiers: [],
    products: [],
    profiles: [],
    community_leave_reasons: [
      { community_id: CID, reason: "too_busy", created_at: day("2026-10-03") },
      { community_id: CID, reason: "too_busy", created_at: day("2026-10-04") },
      { community_id: CID, reason: "not_for_me", created_at: day("2026-10-02") },
      { community_id: CID, reason: "content", created_at: day("2026-09-20") },
    ],
  }
  const rpcAnswer = {
    joined: { "2026-10-02": 1, "2026-10-03": 1 },
    left: { "2026-10-03": 1 },
    posts: {},
    comments: {},
    reactions: {},
    rsvps: { "2026-10-02": 4, "2026-10-04": 1 },
    lessons: { "2026-10-03": 7 },
    contributors: {},
    active: { "2026-10-02": 2, "2026-10-03": 1 },
    totals: { contributors: 0, posters: 0, commenters: 0, reactors: 0, active: 3, courses: 0 },
    active_since: "2026-10-01",
  }
  const db = { from: fakeDb(tables).from, rpc: async (name: string) => (name === "community_analytics" ? { data: rpcAnswer, error: null } : { data: null, error: null }) }
  const q = { start: Date.parse("2026-10-01T00:00:00Z"), end: Date.parse("2026-10-05T00:00:00Z"), compare: null, timeZone: "UTC" }
  const r = await loadCommunityReport(db, tables.communities[0], q, NOW)
  check("the answer says its shape, so a browser's kept answer from before is not drawn", r.version === REPORT_VERSION && REPORT_VERSION === 2)
  check("members at the end of each day, walked back from the ten now (a join and a leave on Oct 3)", same(r.lines.members.current, [9, 10, 10, 10]), r.lines.members.current)
  check("member churn: 1 left of the 9 there were when the period began (11.1%)", r.figures.churn.value === 11.1, r.figures.churn)
  check("and by day, over the members each day began with (1 of 10 on Oct 3)", same(r.lines.churn.current, [0, 0, 10, 0]), r.lines.churn.current)
  check("visits from people who were not members, by day and in all", same(r.lines.prospects.current, [0, 12, 0, 0]) && r.figures.prospects.value === 12)
  check("the join rate stays joins over those visits", r.figures.joinRate.value === 16.7, r.figures.joinRate)
  check("event RSVPs and lessons completed, from the counting function", same(r.lines.rsvps.current, [0, 4, 0, 1]) && r.figures.rsvps.value === 5 && r.figures.lessons.value === 7)
  check("DAU, WAU, MAU: members here in the last day, week and month", r.live.active1 === 2 && r.live.active7 === 5 && r.live.active30 === 8, r.live)
  check("stickiness is DAU over MAU (25%)", r.live.stickiness === 25)
  check("new and returning: of the 3 active, 1 joined in the period", same(r.activeSplit, { new: 1, returning: 2 }), r.activeSplit)
  check("why members left in the period, most first, nothing from before it", same(r.leaveReasons, [{ reason: "too_busy", count: 2 }, { reason: "not_for_me", count: 1 }]), r.leaveReasons)

  const old = { from: fakeDb(tables).from, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "not found" } }) }
  const r2 = await loadCommunityReport(old, tables.communities[0], q, NOW)
  check("before part 184: no RSVPs, lessons or new and returning, never a zero", r2.figures.rsvps.value === null && r2.figures.lessons.value === null && r2.lines.rsvps.current.every((x) => x === null) && r2.activeSplit === null)
  check("but member churn and the live figures are still counted", r2.figures.churn.value === 11.1 && r2.live.active30 === 8)

  /* ── The section ─────────────────────────────────────────────────────── */
  console.log("\nthe section")
  const s = code("components/community/creator/analytics-section.tsx")
  const controls = /data-analytics-controls=""[\s\S]*?<\/div>/.exec(s)?.[0] ?? ""
  check("the period sits alone: no Google Analytics beside it", /<DateRangePicker /.test(controls) && !/Ga|google/i.test(controls))
  /* Changed on purpose (round 37): the owner asked for the chart and its switchers only. The six figure overview and the five sections' tabs are gone; the figure tabs over the one chart are the overview, and one details card follows the figure chosen. */
  check("no Connect Google Analytics anywhere; a connected one is a quiet line under the details", !/Connect Google Analytics/.test(s) && /<\/div>\s*<GaLine ga=\{r\?\.ga \?\? null\} \/>/.test(s) && /if \(!ga\?\.id\) return null/.test(s))
  check("no overview row and no section tabs any more", !/<Overview |<SectionTabs |const SECTIONS\b/.test(s))
  /* Changed on purpose (round 38): the figures live in lib/communities/analytics-figures.ts, beside the rule for the five in the row; the section takes them from there. */
  check("the figures: members, new members, active members, visitors, join rate, engagement, churn, revenue", /export const FIGURES: readonly FigureKey\[\] = \["members", "joined", "active", "visitors", "joinRate", "engagement", "churn", "revenue"\]/.test(readFileSync("lib/communities/analytics-figures.ts", "utf8")) && /from "@\/lib\/communities\/analytics-figures"/.test(s))
  check("one chart for every figure", (s.match(/<AnalyticsChartWithTooltip/g) ?? []).length === 1)
  check("a figure the database cannot count has no tab; Revenue only for a community that sells", /if \(counted\.visits\) \{/.test(s) && /if \(counted\.engagement\) out\.push/.test(s) && /if \(m\) \{\s*const mrr/.test(s))
  check("an address ending in #visitors (or round 33's #traffic) opens that figure, and the choice is kept for the tab", /window\.location\.hash/.test(s) && /traffic: "visitors"/.test(s) && /window\.sessionStorage\.setItem\(FIGURE_KEY, next\)/.test(s))
  check("the Storelib app named as a source", /if \(key === "app"\) return tt\("Storelib app"\)/.test(raw("components/community/creator/analytics-section.tsx")))

  /* ── Copy and client code ────────────────────────────────────────────── */
  console.log("\ncopy")
  const mine = [
    "components/community/creator/analytics-section.tsx",
    "components/community/public/visit-beacon.tsx",
    "lib/communities/visit-source.ts",
    "lib/communities/analytics-report.ts",
    "lib/communities/client/report-cache.ts",
    "lib/communities/server/record-view.ts",
    "lib/communities/server/analytics-report.ts",
    "lib/communities/server/analytics.ts",
    "app/api/community/[communityId]/visit/route.ts",
    "app/(storelib)/(marketing)/community/[slug]/layout.tsx",
    "scripts/check-community-analytics-round33.mjs",
  ]
  for (const f of mine) {
    const text = raw(f)
    check(`${f}: no em dash`, !text.includes("—"))
    check(`${f}: no banned word`, !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }
  for (const f of ["components/community/creator/analytics-section.tsx", "components/community/public/visit-beacon.tsx", "lib/communities/visit-source.ts", "lib/communities/analytics-report.ts"]) {
    check(`${f}: a client file imports no server code`, !/from "@\/lib\/communities\/server|next\/headers|"server-only"/.test(code(f)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
