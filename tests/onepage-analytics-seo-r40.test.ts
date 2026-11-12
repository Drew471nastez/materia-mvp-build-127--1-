/**
 * ===========================================================================
 *  ROUND 40: THE ONEPAGE'S FIGURES AND WHAT IT SAYS TO GOOGLE
 * ===========================================================================
 * "Make sure one-page analytics are very well tracked for everything ... in
 * sync with Storelib's analytics, 100% accurate." And the search title,
 * description, share card and indexing.
 *
 * What this holds:
 *
 *   the editor's link stats and /app/analytics give the same views,
 *   visitors and per block clicks for the same OnePage and period, from
 *   the same rows: visitors driven through the real pipeline
 *   (lib/analytics/collect) into tests/fake-supabase, then asked of both
 *   lib/onepage/link-stats-server and lib/analytics/report-answer
 *
 *   robots, the owner and repeats are counted by neither; the older
 *   onepage_views and onepage_clicks count only before the first event,
 *   and a robot's older row not at all
 *
 *   each social icon is its own click, folded into its row for the editor
 *   and named by its platform on Analytics; a group's figure is its own
 *   and its children's; an email block's figure is its sign-ups
 *
 *   the older tables are written only for what the pipeline accepts
 *   (lib/onepage/visit-gate), and the page's render asks before counting
 *
 *   a page that shows nothing is noindex; sameAs is the icons the page
 *   draws; canonical, Open Graph and the X card come from one resolver
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { collect, type CollectDeps, type CollectKind, type CollectOutcome } from "../lib/analytics/collect"
import { marksOwner } from "../lib/analytics/own-marker"
import { clearPropertyCache } from "../lib/analytics/property"
import { ALLOWED_EVENT_TYPES } from "../lib/analytics/events"
import { everything, serialize } from "../lib/consent/consent"
import { countReportAnswer, reportQuestion } from "../lib/analytics/report-answer"
import type { Reports } from "../lib/analytics/reports"
import { blockIdsCounted, blockOfLinkId, clickBelongs, clicksPerBlock, platformOfLinkId, socialLinkId, socialLinkLabel } from "../lib/onepage/link-keys"
import { blockStats, clickRate, legacyBefore } from "../lib/onepage/link-stats"
import { readBlockStats, readPageClicks, type StatsPage } from "../lib/onepage/link-stats-server"
import { legacyClickAllowed, looksLikeVisitor } from "../lib/onepage/visit-gate"
import { onePageShowsSomething, onePageSocialLinks } from "../lib/onepage/page-presence"
import { onePageMetadataFrom, resolveOnePageSeo, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from "../lib/onepage/seo"
import { onePageSameAs } from "../lib/seo/structured-data"
import { onePageIndexable, PLATFORM_DISALLOW } from "../lib/seo/indexing"
import { parseSitemapName } from "../lib/seo/sitemaps"

process.env.ANALYTICS_OWN_SECRET = process.env.ANALYTICS_OWN_SECRET || "storelib-tests-own-marker-key"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const ANA_USER = "aaaaaaaa-0000-4000-8000-0000000000a1"
const ONEPAGE = "aaaaaaaa-7777-4000-8000-000000000001"
const TZ = "Europe/Bucharest"
const NOW = Date.parse("2026-10-21T12:00:00Z")
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
const consent = { storelib_consent: serialize(everything(true, NOW)) }
const HREF = "https://storelib.com/ana/links"

const BLOCKS = [
  { id: "b1", type: "link_button", enabled: true, data: { label: "My shop", url: "https://shop.example" } },
  { id: "s1", type: "social_row", enabled: true, data: { platforms: [{ platform: "instagram", url: "@ana" }, { platform: "tiktok", url: "@ana" }] } },
  { id: "g1", type: "group", enabled: true, data: { title: "More", children: [{ id: "c1", type: "link_button", enabled: true, data: { label: "Blog", url: "https://blog.example" } }] } },
  { id: "e1", type: "email_capture", enabled: true, data: { headline: "Join" } },
]

function world(): FakeSupabase {
  const db = new FakeSupabase()
  db.clock = NOW
  const uuid = () => crypto.randomUUID()
  db.table("profiles", {}, [{ id: ANA_USER, username: "ana" }])
  db.table("products", {}, [])
  db.table("creators", { embeds: { products: () => [] } }, [{ id: ANA, user_id: ANA_USER, slug: "ana", username: "ana" }])
  db.table("store_theme_installs", {}, [])
  db.table("onepages", {}, [{ id: ONEPAGE, seller_id: ANA, owner_id: ANA_USER, slug: "ana", status: "published", published_blocks: BLOCKS, draft_blocks: BLOCKS }])
  db.table("custom_domains", {}, [])
  db.table("subscribers", {}, [])
  db.table("download_events", {}, [])
  db.table("store_settings", {}, [{ creator_id: ANA, currency: "EUR" }])
  db.table("orders", { defaults: () => ({ id: uuid() }) })
  db.table("onepage_views", { defaults: () => ({ id: uuid() }) }, [
    /* Before the OnePage's first event: a person, and a robot the old table could not refuse. */
    { onepage_id: ONEPAGE, visitor_id: "old1", referrer: "https://l.instagram.com/", user_agent: IPHONE, country_code: "RO", created_at: "2026-10-19T09:00:00Z" },
    { onepage_id: ONEPAGE, visitor_id: "oldbot", referrer: "", user_agent: GOOGLEBOT, country_code: "US", created_at: "2026-10-19T09:30:00Z" },
  ])
  db.table("onepage_clicks", { defaults: () => ({ id: uuid() }) }, [{ onepage_id: ONEPAGE, block_id: "b1", url: "https://shop.example", visitor_id: "old1", created_at: "2026-10-19T09:01:00Z" }])
  db.table("onepage_leads", { defaults: () => ({ id: uuid() }) }, [
    { onepage_id: ONEPAGE, email: "a@example.com", block_id: "e1", created_at: "2026-10-20T10:00:00Z" },
    { onepage_id: ONEPAGE, email: "b@example.com", block_id: "e1", created_at: "2026-10-21T10:00:00Z" },
    { onepage_id: ONEPAGE, email: "c@example.com", block_id: "e1", created_at: "2026-09-01T10:00:00Z" },
  ])
  db.table("analytics_events", {
    defaults: (d) => ({ id: uuid(), created_at: d.now() }),
    checks: [(r) => ((ALLOWED_EVENT_TYPES as readonly string[]).includes(r.event_type) ? null : "analytics_events_event_type_check")],
  })
  return db
}

function deps(db: FakeSupabase): CollectDeps {
  /* The owner is the browser carrying the session cookie this test names. */
  return { db, now: () => db.clock, mainDomain: "storelib.com", isOwnVisit: async (names) => names.includes("sb-owner-auth-token"), marksOwner, limited: async () => false }
}

async function ask(db: FakeSupabase, at: string, body: Record<string, unknown>, opts: { kind?: CollectKind; ua?: string; ip?: string; owner?: boolean } = {}): Promise<CollectOutcome> {
  db.clock = Date.parse(at)
  const headers = new Headers({ host: "storelib.com", "user-agent": opts.ua ?? IPHONE, "x-forwarded-for": opts.ip ?? "203.0.113.7", "sec-fetch-site": "same-origin", "x-vercel-ip-country": "RO" })
  const cookies: Record<string, string> = { ...consent, ...(opts.owner ? { "sb-owner-auth-token": "x" } : {}) }
  return collect({ kind: opts.kind ?? "view", body: { creatorId: ANA, href: HREF, ...body }, headers, cookie: (n) => cookies[n], cookieNames: Object.keys(cookies) }, deps(db))
}

async function report(db: FakeSupabase, period: { start: number; end: number }): Promise<Reports> {
  clearPropertyCache()
  const p = new URLSearchParams({ start: new Date(period.start).toISOString(), end: new Date(period.end).toISOString(), tz: TZ, property: "onepage", compare: "none" })
  const asked = await reportQuestion(db as never, ANA_USER, new URL(`https://storelib.com/api/analytics/reports?${p}`), "storelib.com")
  if ("error" in asked) throw new Error(asked.error)
  return (await countReportAnswer(db as never, asked.q, asked.productTitles, asked.productTypes, ANA_USER)).reports as Reports
}

function pureRules() {
  console.log("\nWhich block a click belongs to (lib/onepage/link-keys)")
  const ig = socialLinkId("s1", "Instagram")
  check("an icon is counted under its row and its platform", ig === "s1__instagram" && /^[A-Za-z0-9_-]{1,80}$/.test(ig), ig)
  check("  an alias is the platform's own name", socialLinkId("s1", "ig") === "s1__instagram" && socialLinkId("s1", "x") !== "s1__")
  check("  a long row id stays inside the pipeline's 80", socialLinkId("r".repeat(120), "youtube").length <= 80)
  check("  and folds back into its row", blockOfLinkId(ig) === "s1" && platformOfLinkId(ig) === "instagram" && blockOfLinkId("b1") === "b1" && platformOfLinkId("block_1_social") === null)
  check("  a link's address is never read as an icon", platformOfLinkId("https://a.example/x__y") === null && blockOfLinkId("https://a.example/x__y") === "https://a.example/x__y" && socialLinkLabel("https://a.example/x__y") === null)
  check("  Analytics names it by the platform", socialLinkLabel(ig) === "Instagram" && socialLinkLabel("s1__tiktok") === "TikTok", [socialLinkLabel(ig), socialLinkLabel("s1__tiktok")])
  const ids = blockIdsCounted(BLOCKS, "g1")
  check("a group counts itself and every block inside it", ids.has("g1") && ids.has("c1") && !ids.has("b1"))
  check("  a row counts its icons", clickBelongs("s1__tiktok", blockIdsCounted(BLOCKS, "s1")) && !clickBelongs("s1__tiktok", blockIdsCounted(BLOCKS, "b1")))
  const per = clicksPerBlock(["b1", "b1", "s1__instagram", "s1__tiktok", "s1", "c1", null], BLOCKS)
  check("the list's figures: each block, a row with its icons, a group with its children", per.b1 === 2 && per.s1 === 3 && per.g1 === 1 && per.c1 === 1, per)

  console.log("\nThe figures (lib/onepage/link-stats)")
  check("no views is no rate, not 0%", clickRate(3, 0) === null && clickRate(1, 4) === 25 && clickRate(1, 3) === 33.33)
  const legacy = legacyBefore([
    { created_at: "2026-10-19T09:00:00Z", user_agent: IPHONE },
    { created_at: "2026-10-19T09:30:00Z", user_agent: GOOGLEBOT },
    { created_at: "2026-10-20T09:00:00Z", user_agent: IPHONE },
  ], Date.parse("2026-10-20T00:00:00Z"), { botsOut: true })
  check("older rows count only before the first event, and a robot's not at all", legacy.length === 1)
  const starts = [Date.parse("2026-10-20T00:00:00Z"), Date.parse("2026-10-21T00:00:00Z")]
  const s = blockStats({
    window: { start: starts[0], end: Date.parse("2026-10-22T00:00:00Z") },
    starts,
    labels: ["Oct 20", "Oct 21"],
    page: { views: 4, visitors: 3, view_buckets: [3, 1] },
    clicks: [{ created_at: "2026-10-20T10:00:00Z", link: "b1" }, { created_at: "2026-10-21T10:00:00Z", link: "b1" }, { created_at: "2026-10-21T10:00:00Z", link: "c1" }, { created_at: "2026-10-23T10:00:00Z", link: "b1" }],
    ids: new Set(["b1"]),
  })
  check("a block's clicks are its own, inside the period, per bucket", s.total_clicks === 2 && s.chart_data[0].clicks === 1 && s.chart_data[1].clicks === 1, s.chart_data)
  check("  with the page's views and a rate per bucket", s.total_views === 4 && s.total_visitors === 3 && s.click_rate === 50 && s.chart_data[1].ctr === 100 && Math.abs(s.chart_data[0].ctr - 33.33) < 0.01)
  const signups = blockStats({ window: { start: starts[0], end: Date.parse("2026-10-22T00:00:00Z") }, starts, labels: ["", ""], page: { views: 4, view_buckets: [3, 1] }, clicks: [{ created_at: "2026-10-20T10:00:00Z", link: "e1" }], ids: new Set(["e1"]), signups: [{ created_at: "2026-10-21T08:00:00Z" }] })
  check("an email block's figure is its sign-ups, not taps on its gift link", signups.counts === "signups" && signups.total_clicks === 1 && signups.chart_data[1].clicks === 1 && signups.chart_data[0].clicks === 0)

  console.log("\nWho the older tables count (lib/onepage/visit-gate)")
  check("the pipeline's refusals write nothing to onepage_clicks", ["bot", "prefetch", "cross_site", "rate_limited", "own", "invalid"].every((r) => !legacyClickAllowed({ reason: r as CollectOutcome["reason"] })))
  check("  a click it kept, or one it could not place, is still counted there", ["recorded", "duplicate", "not_ready", "no_property"].every((r) => legacyClickAllowed({ reason: r as CollectOutcome["reason"] })) && !legacyClickAllowed(null))
  check("a robot, a link preview and a prefetch are not a visitor",
    !looksLikeVisitor(new Headers({ "user-agent": GOOGLEBOT })) && !looksLikeVisitor(new Headers({ "user-agent": "facebookexternalhit/1.1" })) && !looksLikeVisitor(new Headers({ "user-agent": IPHONE, "sec-purpose": "prefetch" })) && looksLikeVisitor(new Headers({ "user-agent": IPHONE })))
}

async function sameNumbers() {
  console.log("\nThe editor and Analytics, from the same rows")
  const db = world()
  /* Visitor one, on the 20th: the page, the shop link, two icons, the link inside the group. */
  const v1 = { sessionId: "s_one", visitorId: "v_one" }
  const r1 = await ask(db, "2026-10-20T09:00:00Z", { ...v1, referrerDomain: "l.instagram.com" })
  await ask(db, "2026-10-20T09:01:00Z", { ...v1, linkId: "b1", linkUrl: "https://shop.example" }, { kind: "link_click" })
  const ig = await ask(db, "2026-10-20T09:02:00Z", { ...v1, linkId: socialLinkId("s1", "instagram"), linkUrl: "https://instagram.com/ana" }, { kind: "link_click" })
  const tk = await ask(db, "2026-10-20T09:03:00Z", { ...v1, linkId: socialLinkId("s1", "tiktok"), linkUrl: "https://tiktok.com/@ana" }, { kind: "link_click" })
  await ask(db, "2026-10-20T09:04:00Z", { ...v1, linkId: "c1", linkUrl: "https://blog.example" }, { kind: "link_click" })
  check("the visit is the OnePage's", r1.recorded && r1.row?.property_type === "onepage" && r1.row?.property_id === ONEPAGE, r1.reason)
  check("two icons in one row, one after the other, are two clicks", ig.recorded && tk.recorded, [ig.reason, tk.reason])
  /* Visitor two, on the 21st, taps the shop link twice; a robot and the owner look too. */
  const v2 = { sessionId: "s_two", visitorId: "v_two" }
  await ask(db, "2026-10-21T08:00:00Z", { ...v2 }, { ua: MAC, ip: "198.51.100.2" })
  await ask(db, "2026-10-21T08:01:00Z", { ...v2, linkId: "b1", linkUrl: "https://shop.example" }, { kind: "link_click", ua: MAC, ip: "198.51.100.2" })
  const again = await ask(db, "2026-10-21T08:02:00Z", { ...v2, linkId: "b1", linkUrl: "https://shop.example" }, { kind: "link_click", ua: MAC, ip: "198.51.100.2" })
  const bot = await ask(db, "2026-10-21T08:05:00Z", { sessionId: "s_bot", visitorId: "v_bot" }, { ua: GOOGLEBOT, ip: "66.249.66.1" })
  const own = await ask(db, "2026-10-21T08:06:00Z", { sessionId: "s_own", visitorId: "v_own" }, { owner: true, ip: "192.0.2.9" })
  const ownTap = await ask(db, "2026-10-21T08:07:00Z", { sessionId: "s_own", visitorId: "v_own", linkId: "b1", linkUrl: "https://shop.example" }, { kind: "link_click", owner: true, ip: "192.0.2.9" })
  check("a second tap in the same visit, a robot and the owner are refused", again.reason === "duplicate" && bot.reason === "bot" && own.reason === "own" && ownTap.reason === "own", [again.reason, bot.reason, own.reason, ownTap.reason])

  db.clock = NOW
  const period = { start: Date.parse("2026-10-14T21:00:00Z"), end: Date.parse("2026-10-21T21:00:00Z") }
  const page = (db.rows("onepages")[0] as unknown) as StatsPage
  const reports = await report(db, period)
  const b1 = await readBlockStats(db as never, page, { blockId: "b1", window: period, timeZone: TZ, blockType: "link_button" })
  const list = await readPageClicks(db as never, page, { window: period, timeZone: TZ })
  if (!b1 || !list) {
    check("the editor's figures were read", false)
    return
  }
  const link = (id: string) => reports.topLinks.find((l) => l.key === `onepage|${ONEPAGE}|${id}`)
  check("page views: the editor's are Analytics' (one older person, two now; no robot, no owner)", b1.total_views === reports.views.value && b1.total_views === 3, [b1.total_views, reports.views.value])
  check("visitors: the same", b1.total_visitors === reports.visitors.value && b1.total_visitors === 3, [b1.total_visitors, reports.visitors.value])
  check("the shop link's clicks: the same, the older one folded in once", b1.total_clicks === 3 && link("b1")?.clicks === 3, [b1.total_clicks, link("b1")?.clicks])
  check("  its rate is clicks out of views", b1.click_rate === 100, b1.click_rate)
  check("  bucketed on the creator's days, as Analytics buckets them",
    JSON.stringify(b1.chart_data.map((d) => d.label)) === JSON.stringify(reports.views.series.labels) && JSON.stringify(b1.chart_data.map((d) => d.views)) === JSON.stringify(reports.views.series.current),
    [b1.chart_data.map((d) => [d.label, d.views]), reports.views.series])
  check("the list: each icon is its row's, a group has its child's, the form has its sign-ups", list.block_clicks.b1 === 3 && list.block_clicks.s1 === 2 && list.block_clicks.g1 === 1 && list.block_clicks.e1 === 2, list.block_clicks)
  check("  and the page's clicks are Analytics' link clicks", list.total_clicks === reports.linkClicks.value, [list.total_clicks, reports.linkClicks.value])
  const igRow = link("s1__instagram")
  const tkRow = link("s1__tiktok")
  check("Analytics lists each icon by its platform", igRow?.label === "Instagram" && tkRow?.label === "TikTok" && igRow?.clicks === 1, reports.topLinks.map((l) => [l.label, l.clicks]))
  const form = await readBlockStats(db as never, page, { blockId: "e1", window: period, timeZone: TZ, blockType: "email_capture" })
  check("an email block's stats are its sign-ups in the period", form?.counts === "signups" && form?.total_clicks === 2, form?.total_clicks)
  const social = await readBlockStats(db as never, page, { blockId: "s1", window: period, timeZone: TZ, blockType: "social_row" })
  check("a row of icons has its own stats", social?.total_clicks === 2)
}

function seo() {
  console.log("\nWhat the page says to Google")
  check("a page with only switched off blocks shows nothing", !onePageShowsSomething({ blocks: [{ id: "h", type: "header", enabled: true }, { id: "x", type: "link_button", enabled: false, data: { url: "https://a.example" } }], bio: "", socialLinks: {} }))
  check("  a link out of its schedule is nothing either",
    !onePageShowsSomething({ blocks: [{ id: "x", type: "link_button", enabled: true, data: { url: "https://a.example", label: "A" }, schedule: { enabled: true, start_at: "2027-01-01T00:00:00Z" } }], bio: null, socialLinks: null, now: NOW }))
  check("  a bio, an icon or a link is something",
    onePageShowsSomething({ blocks: [], bio: "Hi", socialLinks: {} }) && onePageShowsSomething({ blocks: [], bio: "", socialLinks: { instagram: "@ana" } }) && onePageShowsSomething({ blocks: [BLOCKS[0]], bio: "", socialLinks: {} }))
  const links = onePageSocialLinks({ blocks: BLOCKS, socialLinks: { youtube: "@ana" } })
  check("sameAs is the icons the row draws", Object.keys(links).join(",") === "instagram,tiktok", links)
  check("  the profile's links for a row with none, and for a page with no row", onePageSocialLinks({ blocks: [{ type: "social_row", enabled: true, data: { platforms: [] } }], socialLinks: { youtube: "@ana" } }).youtube === "@ana" && onePageSocialLinks({ blocks: [], socialLinks: { youtube: "@ana" } }).youtube === "@ana")
  check("  as full addresses", onePageSameAs(links).includes("https://instagram.com/ana"), onePageSameAs(links))

  const resolved = resolveOnePageSeo({ name: "Ana", bio: "Prints and zines.", handle: "ana", avatarUrl: null, theme: {}, settings: { seo_title: "Ana's prints", seo_description: "Zines from Cluj." }, pageUrl: "https://links.ana.ro/links", origin: "https://storelib.com" })
  const meta = onePageMetadataFrom(resolved, { handle: "ana", indexable: true }) as Record<string, any>
  check("the typed title and description are the ones in <head>", meta.title.absolute === "Ana's prints" && meta.description === "Zines from Cluj.")
  check("  the canonical is the connected domain's", meta.alternates.canonical === "https://links.ana.ro/links" && meta.openGraph.url === "https://links.ana.ro/links")
  check("  Open Graph and the X card carry the share picture", meta.openGraph.images[0].url === resolved.image.url && meta.twitter.images[0] === resolved.image.url && /\/ana\/links\/(share\.png|photo\.jpg)\?v=/.test(resolved.image.url), resolved.image.url)
  const custom = resolveOnePageSeo({ name: "Ana", bio: "", handle: "ana", avatarUrl: null, theme: {}, settings: { social_image_url: "https://x.supabase.co/card.jpg" }, shareImageMode: "custom", pageUrl: "https://storelib.me/ana" })
  check("  an uploaded share card is the og:image, as a large card", custom.image.source === "custom" && custom.image.twitterCard === "summary_large_image" && custom.image.width === 1200)
  check("  limits are Google's", SEO_TITLE_MAX === 60 && SEO_DESCRIPTION_MAX === 160)
  const noindex = onePageMetadataFrom(resolved, { handle: "ana", indexable: false }) as Record<string, any>
  check("a page that may not be listed says noindex", noindex.robots.index === false && noindex.robots.googleBot.index === false)
  /* Changed on purpose (round 41): onePageIndexable takes no product count (tests/indexing-r41.test.ts). */
  check("an unpublished page may not be listed", !onePageIndexable({ status: "draft", handle: "ana" }))
  check("storelib.me's sitemap names its OnePage files", parseSitemapName("onepages.xml")?.kind === "onepages-index" && parseSitemapName("onepages-0.xml")?.kind === "onepages")
  check("robots.txt leaves a handle's page open", !PLATFORM_DISALLOW.some((r) => r === "/ana$" || r === "/ana/"))
}

function wiring() {
  console.log("\nThe routes and the page")
  const track = read("app/api/onepage/track/route.ts")
  /* Changed on purpose (round rel2-public): the older table is not written any more; Analytics' link_click is the one record, and the rows already there are still folded in before the first event. */
  check("a click goes to Analytics, and nothing is written to the older table",
    /await recordLinkClick\(request, body\)/.test(track) && !/from\("onepage_clicks"\)/.test(track) && !/createClient\(\)/.test(track))
  check("  a page id that is not a uuid is refused", /UUID\.test\(onepage_id\)/.test(track))
  const stats = read("app/api/onepage/stats/route.ts")
  /* Round 40 (team areas): the page's owner is the signed in owner, or for a team member with OnePage the store owner (lib/team/onepage), so the check compares with actor.pageOwnerId. Pin changed on purpose. */
  check("the stats route checks the owner, then reads what Analytics reads", /* Round 49: the request's one read (lib/auth/request-scope readUserForRoute) */ /auth\.getUser\(\)|await readUserForRoute\(\)/.test(stats) && /onePageActor\(supabase, user\.id\)/.test(stats) && /onepage\.owner_id !== actor\.pageOwnerId/.test(stats) && /readBlockStats\(/.test(stats) && /readPageClicks\(/.test(stats) && /isTimeZone\(tz\)/.test(stats))
  const page = read("app/(storelib)/(marketing)/l/[slug]/page.tsx")
  /* Changed on purpose (rel-public): the render counts no view at all; Analytics' own view event (TrackView) is the count, by the same checks, and onepage_views was only read before the first of them. */
  check("the page's render writes no view of its own; Analytics' event is the count", !/onepage_views|viewCountable/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")) && /<TrackView creatorId=\{resolvedCreatorId\}/.test(page))
  check("  a page that shows nothing is noindex, and has no structured data", (page.match(/onePageShowsSomething\(/g) ?? []).length === 2)
  check("  sameAs is the icons it draws", /onePageSameAs\(onePageSocialLinks\(/.test(page))
  const pub = read("components/onepage/public-onepage.tsx")
  check("an icon sends its own id, and every other block its own", /trackClick\(socialLinkId\(block\.id, platform\), normalizedUrl\)/.test(pub) && /block_id: blockId \|\| block\.id/.test(pub))
  const tab = read("components/onepage/tabs/links-tab.tsx")
  check("the list asks once for every row, not once per row", /pageClickCounts\(onepage\.id, statsTimeZone\)/.test(tab) && !/days=365/.test(tab))
  check("  the stats are bucketed in the creator's zone", /&tz=\$\{encodeURIComponent\(statsTimeZone\)\}/.test(tab))
  const chart = read("components/onepage/link-stats-chart.tsx")
  check("the stats show the click rate beside views and clicks", /tab="ctr"/.test(chart) && /grid-cols-3/.test(chart))
  check("  their copy has no words the rules ban", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(chart.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\*.*$/gm, "")))
}

async function main() {
  pureRules()
  await sameNumbers()
  seo()
  wiring()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
