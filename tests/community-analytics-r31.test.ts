/**
 * ===========================================================================
 *  ROUND 31: A COMMUNITY'S ANALYTICS
 * ===========================================================================
 * Held from their inputs:
 *
 *   VISITS      how a visitor arrived, in one word (Storelib's rules, plus
 *               Explore and the store's own pages), the device and country,
 *               kept with the day's row through community_record_visit, and
 *               the old function when part 184 has not run
 *   MEMBER DAYS a member here today is one row a day, from the heartbeat and
 *               from what they do, written once per server per day
 *   NIGHTLY     the day's visits added up into counts, never the visitor
 *   REPORT      any period in the viewer's zone: members walked back from
 *               now, joins over non-member visits, unique active members,
 *               money from the memberships' own dates, a period before that
 *               was not counted whole is no comparison, and before part 184
 *               the nightly rows
 *   ROUTE       the period, the zone and the comparison from the address,
 *               behind view_analytics
 *   SECTION     /app Analytics' picker, figure tabs, chart and report cards
 *   GA          the store's tags on a published community's pages, not for
 *               its owner; a join told as join_group, once
 *   SQL         part 184 follows the run-now rules
 *   COPY        no em dash, no banned word, no server code in a client file
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { visitCountry, visitDevice, visitSource } from "@/lib/communities/visit-source"
import { alignTo, bucketKey, bucketsOf, dayKey, lineOf, membersLine, rate } from "@/lib/communities/analytics-report"
import { countVisits, rollupTraffic } from "@/lib/communities/server/analytics"
import { recordCommunityView, resetVisitReady } from "@/lib/communities/server/views"
import { recordMemberDay, resetMemberDays } from "@/lib/communities/server/member-days"
import { loadCommunityReport, sinceInside } from "@/lib/communities/server/analytics-report"
import { gaCommunityJoin } from "@/lib/communities/client/ga-events"
import { fakeDb } from "./_fake-db"

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
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const CID = "c0000000-0000-4000-8000-000000000001"
const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const NOW = Date.parse("2026-10-15T16:00:00Z")

async function main() {
  /* ── How a visitor arrived ───────────────────────────────────────────── */
  console.log("\nvisits")
  const v = (referer: string | null, path = "/community/clay", ua = "Mozilla/5.0 (Macintosh)") => visitSource({ referer, path, slug: "clay", mainDomain: "storelib.com", userAgent: ua })
  check("no referrer is direct", JSON.stringify(v(null)) === JSON.stringify({ source: "direct", referrer: null }))
  check("Instagram's link wrapper is Instagram, with its site kept", v("https://l.instagram.com/?u=x").source === "social_instagram" && v("https://l.instagram.com/?u=x").referrer === "l.instagram.com")
  check("Google is search", v("https://www.google.com/").source === "organic_search")
  check("a link's utm tags win", v("https://www.google.com/", "/community/clay?utm_source=newsletter&utm_medium=email").source === "email")
  check("Storelib's Explore is explore", v("https://storelib.com/explore").source === "explore" && v("https://storelib.com/community").source === "explore")
  check("another Storelib page is the store's own pages", v("https://storelib.com/ana").source === "storelib" && v("https://storelib.me/ana").source === "storelib")
  check("a move inside the same community is direct, not a source", v("https://storelib.com/community/clay/post/1").source === "direct")
  check("a buyer back from Stripe is direct", v("https://checkout.stripe.com/c/pay").source === "direct")
  check("another site is a referral with its host", JSON.stringify(v("https://potterymag.example.com/a")) === JSON.stringify({ source: "referral", referrer: "potterymag.example.com" }))
  check("the device from the browser's signature", visitDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile") === "mobile" && visitDevice("Mozilla/5.0 (Macintosh)") === "desktop" && visitDevice(null) === null)
  const h = (c: string | null) => ({ get: (n: string) => (n === "x-vercel-ip-country" ? c : null) })
  check("the country is two capital letters, never Tor or unknown", visitCountry(h("ro")) === "RO" && visitCountry(h("XX")) === null && visitCountry(h("T1")) === null && visitCountry(h(null)) === null)

  const calls: [string, unknown][] = []
  const rpcDb = (answers: Record<string, { data: unknown; error: unknown }>) => ({ rpc: async (name: string, args: unknown) => (calls.push([name, args]), answers[name] ?? { data: null, error: null }) })
  const key = "a".repeat(64)
  const facts = { source: "social_instagram", referrer: "l.instagram.com", device: "mobile" as const, country: "RO", member: false }
  resetVisitReady()
  check("with facts, the visit goes through community_record_visit", (await recordCommunityView(rpcDb({ community_record_visit: { data: true, error: null } }), CID, key, facts)) === "counted" && calls[0][0] === "community_record_visit" && JSON.stringify(calls[0][1]) === JSON.stringify({ p_community: CID, p_visitor: key, p_source: "social_instagram", p_referrer: "l.instagram.com", p_device: "mobile", p_country: "RO", p_member: false }))
  calls.length = 0
  check("before part 184 the view is still counted the way part 87 counts it", (await recordCommunityView(rpcDb({ community_record_visit: { data: null, error: { code: "PGRST202" } }, community_record_view: { data: true, error: null } }), CID, key, facts)) === "counted" && calls.map((c) => c[0]).join() === "community_record_visit,community_record_view")
  calls.length = 0
  await recordCommunityView(rpcDb({ community_record_view: { data: false, error: null } }), CID, key, facts)
  check("and does not ask for the missing function again", calls.map((c) => c[0]).join() === "community_record_view")
  resetVisitReady()
  const rec = raw("lib/communities/server/record-view.ts")
  /* Changed on purpose (round 33): the page's own beacon posts the referrer and the address with its query to app/api/community/<id>/visit, which reads the device and the country from its request (tests/community-analytics-r33.test.ts). */
  check("the visit reads the referrer, the address with its query, the device and the country", /referer: req\.body\.referrer, path: req\.body\.path/.test(rec) && /visitDevice\(ua, req\.body\.touch\)/.test(rec) && /visitCountry\(req\.headers\)/.test(rec))
  /* Changed on purpose (round 33 merge): read from the route's viewerContext when it has one, else asked as before. */
  check("and whether a signed in visitor is a member", /recordCommunityView\(db, community\.id, key, \{ \.\.\.visit, member: v \? v\.active : await isMember\(db, community\.id, req\.userId\) \}\)/.test(rec))

  /* ── Member days ─────────────────────────────────────────────────────── */
  console.log("\nmember days")
  resetMemberDays()
  const md = fakeDb({ community_member_days: [] })
  check("a member here today is one row", (await recordMemberDay(md, CID, UID(5), NOW)) === "written" && md.tables.community_member_days.length === 1 && md.tables.community_member_days[0].day === "2026-10-15")
  check("the second time today it is known, and nothing is asked", (await recordMemberDay(md, CID, UID(5), NOW + 3_600_000)) === "known" && md.log.filter((l) => l.table === "community_member_days").length === 1)
  check("tomorrow is another row", (await recordMemberDay(md, CID, UID(5), NOW + 86_400_000)) === "written" && md.tables.community_member_days.length === 2)
  const noTable = fakeDb({}, { failWith: { community_member_days: { code: "42P01", message: "missing" } } })
  check("before part 184 it is skipped, then not asked again", (await recordMemberDay(noTable, CID, UID(6), NOW)) === "skipped" && (await recordMemberDay(noTable, CID, UID(7), NOW)) === "skipped" && noTable.log.length <= 1)
  resetMemberDays()
  check("the heartbeat writes it beside the minute's mark", /Promise\.all\(\[touchPresence\(db, gate\.community\.id, String\(gate\.viewer\.userId\)\), recordMemberDay\(db, gate\.community\.id, String\(gate\.viewer\.userId\)\)\]\)/.test(raw("app/api/community/[communityId]/presence/route.ts")))
  check("and so does anything a member does, but not leaving", /a\.kind === "left" \? null : recordMemberDay\(db, a\.communityId, a\.userId\)/.test(raw("lib/communities/server/activity.ts")))

  /* ── Nightly ─────────────────────────────────────────────────────────── */
  console.log("\nnightly")
  const t = countVisits([
    { source: "direct", referrer: null, device: "mobile", country: "RO", member: true },
    { source: "social_instagram", referrer: "l.instagram.com", device: "mobile", country: "RO", member: false },
    { source: null, referrer: null, device: null, country: null, member: null },
  ])
  check("visits, and visits from people who were not members (an unknown is not a member)", t.visitors === 3 && t.prospects === 2)
  check("a visit with no source is direct; no device or country is not listed", t.counts.source.direct === 2 && t.counts.device.mobile === 2 && Object.keys(t.counts.device).length === 1 && t.counts.country.RO === 2)
  const night = fakeDb({
    community_view_days: [
      { community_id: CID, day: "2026-10-14", visitor_key: "k1", source: "explore", referrer: null, device: "desktop", country: "US", member: false },
      { community_id: CID, day: "2026-10-14", visitor_key: "k2", source: "explore", referrer: null, device: "mobile", country: "US", member: true },
      { community_id: CID, day: "2026-10-13", visitor_key: "k3", source: "direct", referrer: null, device: "mobile", country: "US", member: false },
    ],
    community_daily_stats: [{ community_id: CID, day: "2026-10-14", members: 3 }],
    community_daily_traffic: [],
  })
  /* Changed on purpose (round 33): the nightly count leaves a day older than the three days of rows alone, so the test counts at its own NOW, not the clock. */
  check("the nightly count writes the day's visits", (await rollupTraffic(night, CID, "2026-10-14", NOW)) === true && night.tables.community_daily_stats[0].visitors === 2 && night.tables.community_daily_stats[0].prospects === 1)
  const lines = night.tables.community_daily_traffic
  check("and one line per source, device and country, only for that day", lines.find((l) => l.dimension === "source" && l.key === "explore")?.visitors === 2 && lines.filter((l) => l.dimension === "device").length === 2 && !lines.some((l) => l.key === "direct"))
  check("nothing that says who the visitor is", lines.every((l) => !("visitor_key" in l)))
  check("the rollup adds the traffic after the day's figures", /if \(error\) throw new Error\(`daily stats[^\n]*\n\s*await rollupTraffic\(db, communityId, day\)/.test(raw("lib/communities/server/analytics.ts")))

  /* ── The report's rules ──────────────────────────────────────────────── */
  console.log("\nreport rules")
  check("bucket keys are the database's to_char keys, in the viewer's zone", bucketKey(Date.parse("2026-10-14T22:30:00Z"), "day", "Europe/Bucharest") === "2026-10-15" && bucketKey(Date.parse("2026-10-14T22:30:00Z"), "hour", "Europe/Bucharest") === "2026-10-15T01" && bucketKey(Date.parse("2026-10-14T22:30:00Z"), "month", "UTC") === "2026-10")
  const b = bucketsOf({ start: Date.parse("2026-10-08T21:00:00Z"), end: Date.parse("2026-10-15T16:00:00Z") }, "Europe/Bucharest")
  check("seven days are seven day buckets", b.grain === "day" && b.keys.length === 7 && b.keys[0] === "2026-10-09" && b.keys[6] === "2026-10-15")
  check("a UTC day is drawn on the same date, or its month", dayKey("2026-10-15", "day") === "2026-10-15" && dayKey("2026-10-15", "month") === "2026-10" && dayKey("2026-10-15", "hour") === null)
  check("counts land in their buckets, missing ones are 0", JSON.stringify(lineOf(["a", "b", "c"], { b: 2 })) === "[0,2,0]")
  check("members walk back from now: each bucket ends without what came after it", JSON.stringify(membersLine(31, [0, 3, 0, 1], [0, 0, 5, 0], 2, 1)) === JSON.stringify([31, 34, 29, 30]))
  check("a rate with nothing to divide by is no rate", rate(3, 0) === null && rate(1, 3) === 33.3)
  check("the period before is as long as this one", JSON.stringify(alignTo([1, 2], 3)) === "[1,2,null]" && alignTo(null, 3) === null)
  check("counting that began inside a period says when", sinceInside("2026-10-01", "2026-09-16") === "2026-10-01" && sinceInside("2026-09-01", "2026-09-16") === null)

  /* ── The report, against rows ────────────────────────────────────────── */
  console.log("\nreport")
  const rpcAnswer = {
    joined: { "2026-10-02": 2 },
    left: { "2026-10-03": 1 },
    posts: { "2026-10-02": 3 },
    comments: { "2026-10-02": 5, "2026-10-04": 1 },
    reactions: {},
    rsvps: {},
    lessons: {},
    contributors: { "2026-10-02": 2 },
    active: { "2026-10-02": 4, "2026-10-03": 3 },
    totals: { contributors: 2, posters: 1, commenters: 2, reactors: 0, active: 5, courses: 0 },
    active_since: "2026-10-02",
    top_contributors: [{ user_id: UID(4), posts: 3, comments: 1 }],
    top_spaces: [{ id: "s1", name: "General", slug: "general", posts: 3, comments: 6 }],
    cohorts: [{ month: "2026-10", joined: 2, stayed: 2, active: 1 }],
    programs: [],
  }
  const tables = {
    communities: [{ id: CID, owner_user_id: UID(1), creator_id: null, created_at: "2026-09-01T00:00:00Z" }],
    community_members: Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, community_id: CID, user_id: UID(i + 1), status: "active", joined_at: "2026-09-02T00:00:00Z", last_seen_at: "2026-10-14T00:00:00Z", last_active_at: null })),
    community_activity: [{ id: 1, community_id: CID, user_id: UID(9), kind: "joined", created_at: "2026-10-10T00:00:00Z" }],
    community_daily_stats: [
      { community_id: CID, day: "2026-10-01", visitors: 10, prospects: 8 },
      { community_id: CID, day: "2026-10-02", visitors: 20, prospects: 12 },
    ],
    community_daily_traffic: [{ community_id: CID, day: "2026-10-02", dimension: "source", key: "explore", visitors: 7 }],
    community_view_days: [],
    community_feed_posts: [],
    community_events: [],
    community_tiers: [],
    products: [],
    profiles: [{ id: UID(4), display_name: "Ana Pop", username: "ana", avatar_url: null }],
  }
  const db: { from: unknown; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } = { from: fakeDb(tables).from, rpc: async () => ({ data: null, error: null }) }
  const asked: Record<string, unknown>[] = []
  db.rpc = async (name: string, args: Record<string, unknown>) => {
    asked.push({ name, ...args })
    return name === "community_analytics" ? { data: args.p_detail ? rpcAnswer : { ...rpcAnswer, joined: {}, active: {}, totals: { ...rpcAnswer.totals, active: 0 } }, error: null } : { data: null, error: null }
  }
  const q = { start: Date.parse("2026-10-01T00:00:00Z"), end: Date.parse("2026-10-05T00:00:00Z"), compare: { start: Date.parse("2026-09-27T00:00:00Z"), end: Date.parse("2026-10-01T00:00:00Z") }, timeZone: "UTC" }
  const r = await loadCommunityReport(db, tables.communities[0], q, NOW)
  check("one call for the period with its lists, one for the period before without", asked.filter((a) => a.name === "community_analytics").length === 2 && asked.some((a) => a.p_detail === true && a.p_tz === "UTC" && a.p_grain === "day"))
  check("four days, by day", r.grain === "day" && r.buckets === 4 && r.lines.posts.current.join() === "0,3,0,0")
  check("members at the end of each day, walked back from the ten there are now and the join after the period", JSON.stringify(r.lines.members.current) === JSON.stringify([8, 10, 9, 9]) && r.figures.members.value === 9)
  check("visits from the nightly rows, by day", r.lines.visits.current.join() === "10,20,0,0" && r.figures.visits.value === 30)
  check("the join rate is joins over visits from non-members", r.figures.joinRate.value === rate(2, 20))
  check("a period before visits were counted is no comparison, never zero", r.figures.visits.previous === null && r.lines.visits.previous === null)
  check("active members are unique for the period, not a sum of days", r.figures.active.value === 5 && r.lines.active.current.join() === "0,4,3,0")
  check("and the period before member days began is no comparison", r.figures.active.previous === null)
  check("engagement: members who took part over members at the end", r.figures.engagement.value === rate(2, 9))
  check("sources from the nightly counts", r.traffic?.source[0]?.key === "explore" && r.traffic.source[0].value === 7)
  check("top contributors by name", r.contributors[0]?.name === "Ana Pop" && r.contributors[0].posts === 3)
  check("spaces and members who stayed come from the counting function", r.topSpaces[0]?.name === "General" && r.cohorts[0]?.stayed === 2)
  check("nothing sold, no money", r.money === null)
  check("no Google Analytics without a store", r.ga.id === null)

  const old: { from: unknown; rpc: () => Promise<{ data: unknown; error: unknown }> } = { from: fakeDb(tables).from, rpc: async () => ({ data: null, error: null }) }
  old.rpc = async () => ({ data: null, error: { code: "PGRST202", message: "not found" } })
  const r2 = await loadCommunityReport(old, tables.communities[0], q, NOW)
  check("before part 184: no engagement, no detail lists", !r2.counted.engagement && !r2.counted.detail && r2.topSpaces.length === 0 && r2.contributors.length === 0 && r2.figures.engagement.value === null)
  check("and joins are still read from the activity rows", r2.figures.joined.value === 0 && r2.figures.members.value === 9)

  /* ── Route ───────────────────────────────────────────────────────────── */
  console.log("\nroute")
  const route = raw("app/api/app/community/[id]/analytics/route.ts")
  check("behind view_analytics", /requireCreatorCommunity\(id, "view_analytics"\)/.test(route))
  check("the period, the zone and the comparison from the address, checked", /isTimeZone\(tz\)/.test(route) && /end - start > MAX_SPAN_MS/.test(route) && /cstart/.test(route) && /loadCommunityReport\(gate\.ctx\.admin, gate\.community/.test(route))
  check("the earlier ?days= answer still answers", /loadMoneyAndGrowth/.test(route) && /loadAnalytics\(/.test(route))

  /* ── Section ─────────────────────────────────────────────────────────── */
  console.log("\nsection")
  const s = raw("components/community/creator/analytics-section.tsx")
  check("/app Analytics' own pieces: the picker, the figure tabs, the strip, the chart, the legend and the change", ['from "@/components/app/date-range-picker"', 'from "@/components/app/use-period-params"', 'from "@/components/app/metric-tab"', "useTabStrip", 'from "@/components/app/analytics-chart"', "ChartLegend", "PercentChangeIndicator"].every((w) => s.includes(w)))
  check("and its report cards, lists and tabs", /ReportCard, ReportComparedContext, ReportEmpty, ReportList, ReportTabs/.test(s))
  /* Changed on purpose (round 32): the question, its instants and the period before are worked out in lib/communities/client/report-cache (communityAsk), which keeps answers by period. */
  check("the period opens on the last 30 days, compared with the period before", /usePeriodParams\(timeZone, "last_30_days"\)/.test(s) && /communityAsk\(head\.id, period, timeZone, reportNow\(\)\)/.test(s) && /compareBounds\(period, PREVIOUS_PERIOD/.test(raw("lib/communities/client/report-cache.ts")))
  check("the props stay { head, initial? }", /export function AnalyticsSection\(\{ head \}: \{ head: CommunityHead; initial\?: AnalyticsView \| null \}\)/.test(s))
  /* Changed on purpose (round 33): the link beside the period is gone; a connected Google Analytics is one quiet line under Traffic, one that is not connected is not mentioned. */
  check("Google Analytics: one quiet line when connected, with the way to manage it", s.includes('"/app/integrations?integration=google-analytics"') && /if \(!ga\?\.id\) return null/.test(s) && /data-ga="connected"/.test(s) && !/Connect Google Analytics/.test(s))
  check("the page reads only the head", !/loadAnalytics|loadMoneyAndGrowth/.test(raw("app/app/community/[id]/analytics/page.tsx")) && /<AnalyticsSection head=\{head\} \/>/.test(raw("app/app/community/[id]/analytics/page.tsx")))

  /* ── Google Analytics ───────────────────────────────────────────────── */
  console.log("\nGoogle Analytics")
  const layout = raw("app/(marketing)/community/[slug]/layout.tsx")
  check("the store's tags on a published community, not for its owner", /if \(!c \|\| !c\.creator_id \|\| c\.status !== "published" \|\| page\.viewer\?\.isOwner\) return null/.test(layout) && /<StoreTracking creatorId=\{c\.creator_id\} \/>/.test(layout))
  check("in both frames, so every page of the community counts", (layout.match(/\{tracking\}/g) ?? []).length === 2)
  const sent: unknown[][] = []
  const store = new Map<string, string>()
  const win = { gtag: (...a: unknown[]) => sent.push(a), sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } } as unknown as Window
  check("a join is GA4's join_group with the community's address", gaCommunityJoin(win, "clay-studio") && JSON.stringify(sent[0]) === JSON.stringify(["event", "join_group", { group_id: "clay-studio" }]))
  check("once in a tab", !gaCommunityJoin(win, "clay-studio") && sent.length === 1)
  check("nothing else about the person, and no odd address", !gaCommunityJoin(win, "Not A Slug!"))
  check("pressed on the page, the join tells it before the feed opens", /gaCommunityJoin\(window, slug\)\s*if \(typeof window !== "undefined" && window\.location\.pathname/.test(raw("components/community/public/join-controls.tsx")))
  check("a join finished on the server tells it from ?welcome=1, read while rendering", /useRef\(params\.get\("welcome"\) === "1"\)/.test(raw("components/community/public/community-ga.tsx")))

  /* ── SQL part 184 ────────────────────────────────────────────────────── */
  console.log("\nSQL part 184")
  const part = raw("supabase/sql/run-now/184_community_analytics.sql")
  const pl = part.trimEnd().split("\n")
  check("line 1 is the summary", /^\/\* Community analytics, run after parts 81, 85, 87 and 102\..*Safe to run again\. \*\/$/.test(pl[0]))
  check("one statement per line, every line ends its statement", pl.slice(1).every((l) => l.trim().endsWith(";")))
  check("notify pgrst is last", pl[pl.length - 1] === "notify pgrst, 'reload schema';")
  check("only adds: no DROP TABLE, no DROP COLUMN, no DELETE, no UPDATE of rows", !/DROP TABLE|DROP COLUMN|DELETE FROM|^UPDATE /im.test(part.replace(/\$f\$[\s\S]*?\$f\$/g, "")))
  check("the new tables are server only", ["community_daily_traffic", "community_member_days"].every((t) => part.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && part.includes(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`)))
  check("both functions for the service role only", /REVOKE ALL ON FUNCTION public\.community_record_visit\(uuid, text, text, text, text, text, boolean\) FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT EXECUTE ON FUNCTION public\.community_analytics\(uuid, timestamptz, timestamptz, text, text, boolean\) TO service_role;/.test(part))
  check("safe to run again", !/CREATE TABLE public|CREATE INDEX public|CREATE FUNCTION /.test(part) && /ADD COLUMN IF NOT EXISTS/.test(part))
  check("the migration copy is the part", existsSync("supabase/migrations/20270124_community_analytics.sql") && raw("supabase/migrations/20270124_community_analytics.sql") === part)
  /* Changed on purpose (round 31 merge): part 185 (community domains) comes after it in the check now. */
  check("a README row and a p184 check column", raw("supabase/sql/run-now/README.md").includes("`184_community_analytics.sql`") && /as p184_community_analytics[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
  check("the bundles and the parts record carry it", /-- part 184_community_analytics\.sql/.test(raw("supabase/sql/run-four/3_of_4_latest.sql")) && /part: "184", file: "184_community_analytics\.sql"/.test(raw("lib/admin/sql-parts.generated.ts")))

  /* ── Copy and client code ────────────────────────────────────────────── */
  console.log("\ncopy")
  const mine = [
    "components/community/creator/analytics-section.tsx",
    "components/community/public/community-ga.tsx",
    "lib/communities/analytics-report.ts",
    "lib/communities/visit-source.ts",
    "lib/communities/client/ga-events.ts",
    "lib/communities/server/analytics-report.ts",
    "lib/communities/server/member-days.ts",
    "lib/communities/server/record-view.ts",
    "app/api/app/community/[id]/analytics/route.ts",
    "supabase/sql/run-now/184_community_analytics.sql",
    "scripts/check-community-analytics-round31.mjs",
  ]
  for (const f of mine) {
    const text = raw(f)
    check(`${f}: no em dash`, !text.includes("—"))
    check(`${f}: no banned word`, !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }
  for (const f of ["components/community/creator/analytics-section.tsx", "components/community/public/community-ga.tsx", "lib/communities/analytics-report.ts", "lib/communities/visit-source.ts", "lib/communities/client/ga-events.ts"]) {
    check(`${f}: a client file imports no server code`, !/from "@\/lib\/communities\/server|next\/headers|"server-only"/.test(code(f)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
