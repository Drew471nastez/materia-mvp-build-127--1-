/**
 * ===========================================================================
 *  ROUND 37: EVERY FIGURE ON A COMMUNITY'S CHART, AGAINST NUMBERS BY HAND
 * ===========================================================================
 * "Ensure tracking is very well made, update it fully." One seeded week in
 * New York, its rows placed on purpose around midnight there and around the
 * day the visit rows stop being kept, read by the real loadCommunityReport
 * (lib/communities/server/analytics-report.ts), and each figure the chart's
 * tabs show checked against what was worked out by hand from those rows:
 *
 *   MEMBERS      walked back from 10 now through each join and leave
 *   NEW MEMBERS  joins by New York day, never the owner's
 *   ACTIVE       the hours a member was here (part 271) put in the
 *                viewer's day; days before the hours from part 184's days
 *   VISITORS     the hours the nightly count keeps (271), the day counts
 *                before them (by their noon), and the last three days from
 *                the visit rows, each by its own moment; nothing twice
 *   JOIN RATE    joins a visitor made (not one the team added) over visits
 *                from people who were not members
 *   ENGAGEMENT   members who posted, commented or reacted, from those rows
 *                (a like on one's own post too), a post the safety check
 *                held back never counted
 *   CHURN        who left over the members there were at the start
 *   REVENUE      the orders less refunds, a disputed one left out, and the
 *                paid members at the end of each day
 *
 * The SQL function community_analytics (part 271) is answered by a
 * reference written from its definition. When a Postgres is at hand
 * (R37_PG_HOST, a socket directory or host, and R37_PG_PORT, R37_PG_USER: a
 * superuser), part 271 itself is run there, twice, on the same rows, and
 * its answers must equal the reference's and the numbers by hand.
 *
 * Also: the nightly count keeps each hour's visits, a member's heartbeat
 * writes the hour beside the day, a like is always the liker's activity,
 * the day's count leaves out held posts, and part 271's conventions.
 *
 * Run with:  npx tsx --conditions=react-server tests/community-analytics-r37.test.ts
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { loadCommunityReport } from "@/lib/communities/server/analytics-report"
import { countDay, rollupTraffic, visitHourOf, visitHours } from "@/lib/communities/server/analytics"
import { recordMemberDay, resetMemberDays, utcHour } from "@/lib/communities/server/member-days"
import type { CommunityReport } from "@/lib/communities/analytics-report"
import { boundsOf, compareBounds, type RangeValue } from "@/lib/date-range/range"

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
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const raw = (p: string) => readFileSync(p, "utf8")

const CID = "c0000000-0000-4000-8000-000000000037"
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const OWNER = U(1)
const NOW = Date.parse("2026-10-15T16:00:00.000Z")
const NY = "America/New_York"
const at = (iso: string) => new Date(Date.parse(iso)).toISOString()

/* ── The seeded community: one week in New York (EDT, UTC-4), Oct 5 to Oct 11 ── */

type Row = Record<string, any>
const activity = (id: number, user: number, kind: string, iso: string) => ({ id, community_id: CID, user_id: U(user), kind, target_id: null, created_at: at(iso) })
const member = (n: number, source: string, status = "active") => ({ id: `m${n}`, community_id: CID, user_id: U(n), status, role: n === 1 ? "owner" : "member", source, joined_at: at("2026-01-01T00:00:00Z"), last_seen_at: null, last_active_at: null })

function seed(): Record<string, Row[]> {
  return {
    communities: [{ id: CID, owner_user_id: OWNER, creator_id: null, created_at: at("2025-06-01T00:00:00Z") }],
    /* Ten members now, the owner among them. U4 was added by the team; U6 left. */
    community_members: [member(1, "owner"), member(2, "free"), member(3, "free"), member(4, "manual"), member(5, "invite"), member(6, "free", "cancelled"), member(7, "subscription"), member(8, "free"), member(9, "free"), member(10, "free"), member(11, "free")],
    community_activity: [
      activity(1, 3, "joined", "2026-10-05T04:00:00Z"), // NY Oct 5 00:00: day 1, a visitor's own join
      activity(2, 4, "joined", "2026-10-07T15:00:00Z"), // Oct 7: added by the team, not a visitor's join
      activity(3, 1, "joined", "2026-10-07T16:00:00Z"), // the owner: never a join
      activity(4, 5, "joined", "2026-10-12T03:30:00Z"), // NY Oct 11 23:30: day 7, by invite
      activity(5, 6, "left", "2026-10-09T12:00:00Z"), // Oct 9
      activity(6, 2, "joined", "2026-09-29T12:00:00Z"), // the week before, Sep 29
    ],
    community_feed_posts: [
      { id: "p1", community_id: CID, author_id: U(3), status: "published", removed_reason: null, space_id: null, reaction_count: 1, comment_count: 0, title: "Kiln day", body_text: "", created_at: at("2026-10-06T05:00:00Z") }, // Oct 6
      { id: "p2", community_id: CID, author_id: U(7), status: "removed", removed_reason: "Held for review: a link", space_id: null, reaction_count: 0, comment_count: 0, title: "Buy now", body_text: "", created_at: at("2026-10-08T12:00:00Z") }, // held back: never a post
      { id: "p3", community_id: CID, author_id: U(8), status: "removed", removed_reason: "Off topic", space_id: null, reaction_count: 0, comment_count: 0, title: "Off topic", body_text: "", created_at: at("2026-10-09T12:00:00Z") }, // up, then removed: it was a post
    ],
    community_feed_comments: [{ id: "c1", post_id: "p1", community_id: CID, author_id: U(9), status: "published", removed_reason: null, created_at: at("2026-10-10T12:00:00Z") }], // Oct 10
    community_reactions: [
      { id: "r1", community_id: CID, user_id: U(3), target_type: "post", target_id: "p1", created_at: at("2026-10-06T06:00:00Z") }, // U3 likes their own post, Oct 6
      { id: "r2", community_id: CID, user_id: U(10), target_type: "post", target_id: "p1", created_at: at("2026-10-11T23:30:00Z") }, // NY Oct 11 19:30
    ],
    community_event_rsvps: [],
    /* The hours began at 15:00 UTC on Oct 4, so they hold every day from Oct 5 (UTC); before that, the days. */
    community_member_hours: [
      { community_id: CID, user_id: U(3), hour: at("2026-10-04T15:00:00Z") }, // before the hours hold whole days: the day row says it
      { community_id: CID, user_id: U(3), hour: at("2026-10-06T03:00:00Z") }, // NY Oct 5 23:00: day 1
      { community_id: CID, user_id: U(4), hour: at("2026-10-06T03:00:00Z") }, // day 1
      { community_id: CID, user_id: U(4), hour: at("2026-10-06T14:00:00Z") }, // Oct 6: day 2
      { community_id: CID, user_id: U(5), hour: at("2026-10-12T03:00:00Z") }, // NY Oct 11 23:00: day 7
      { community_id: CID, user_id: U(9), hour: at("2026-10-12T05:00:00Z") }, // NY Oct 12 01:00: after the week
    ],
    community_member_days: [
      { community_id: CID, user_id: U(2), day: "2026-09-28" },
      { community_id: CID, user_id: U(3), day: "2026-10-04" },
      { community_id: CID, user_id: U(9), day: "2026-10-04" },
      { community_id: CID, user_id: U(3), day: "2026-10-06" }, // the hours hold this day: not read
    ],
    community_daily_stats: [
      { community_id: CID, day: "2026-09-28", visitors: 2, prospects: 2 },
      { community_id: CID, day: "2026-09-30", visitors: 10, prospects: 8 },
      { community_id: CID, day: "2026-10-05", visitors: 7, prospects: 6 }, // before the hours: its noon is NY Oct 5, 08:00
      { community_id: CID, day: "2026-10-06", visitors: 5, prospects: 4 }, // the hours hold it: never twice
      { community_id: CID, day: "2026-10-11", visitors: 4, prospects: 1 },
    ],
    community_visit_hours: [
      { community_id: CID, hour: at("2026-10-06T02:00:00Z"), visitors: 3, prospects: 2 }, // NY Oct 5 22:00: day 1
      { community_id: CID, hour: at("2026-10-06T04:00:00Z"), visitors: 2, prospects: 2 }, // NY Oct 6 00:00: day 2
      { community_id: CID, hour: at("2026-10-11T23:00:00Z"), visitors: 4, prospects: 1 }, // NY Oct 11 19:00: day 7
      { community_id: CID, hour: at("2026-10-12T03:00:00Z"), visitors: 2, prospects: 1 }, // a kept day: the visit rows are read, not this
    ],
    /* Oct 12 (UTC) is one of the three days whose visit rows are still kept. */
    community_view_days: [
      { community_id: CID, visitor_key: "k".repeat(20), day: "2026-10-12", created_at: at("2026-10-12T03:30:00Z"), source: "explore", referrer: null, device: "mobile", country: "US", member: false }, // NY Oct 11 23:30: day 7
      { community_id: CID, visitor_key: "j".repeat(20), day: "2026-10-12", created_at: at("2026-10-12T03:40:00Z"), source: "app", referrer: null, device: "mobile", country: "US", member: true }, // day 7, a member
      { community_id: CID, visitor_key: "h".repeat(20), day: "2026-10-12", created_at: at("2026-10-12T04:10:00Z"), source: "direct", referrer: null, device: "desktop", country: "RO", member: false }, // NY Oct 12 00:10: after the week
    ],
    community_daily_traffic: [{ community_id: CID, day: "2026-10-05", dimension: "source", key: "organic_search", visitors: 7 }],
    community_events: [],
    community_event_tickets: [],
    community_leave_reasons: [],
    community_spaces: [],
    community_tiers: [{ community_id: CID, product_id: "prod1", billing: "recurring", kind: "paid" }],
    products: [],
    memberships: [
      { id: "ms1", product_id: "prod1", buyer_id: U(3), status: "active", billing_interval: "month", amount_cents: 1000, currency: "usd", created_at: at("2026-10-06T12:00:00Z"), started_at: at("2026-10-06T12:00:00Z"), canceled_at: null, ended_at: null, trial_end: null },
      { id: "ms2", product_id: "prod1", buyer_id: U(7), status: "canceled", billing_interval: "year", amount_cents: 12000, currency: "usd", created_at: at("2026-09-01T00:00:00Z"), started_at: at("2026-09-01T00:00:00Z"), canceled_at: at("2026-10-09T15:00:00Z"), ended_at: at("2026-10-09T15:00:00Z"), trial_end: null },
    ],
    orders: [
      { id: "o1", product_id: "prod1", status: "completed", amount_cents: 1000, refund_amount_cents: null, refunded_at: null, currency: "usd", created_at: at("2026-10-06T12:00:00Z") }, // NY Oct 6
      { id: "o2", product_id: "prod1", status: "refunded", amount_cents: 3000, refund_amount_cents: 1000, refunded_at: at("2026-10-09T00:00:00Z"), currency: "usd", created_at: at("2026-10-08T12:00:00Z") }, // Oct 8, $10 of $30 back
      { id: "o3", product_id: "prod1", status: "disputed", amount_cents: 9900, refund_amount_cents: null, refunded_at: null, currency: "usd", created_at: at("2026-10-07T12:00:00Z") }, // in dispute: no sale
      { id: "o4", product_id: "prod1", status: "completed", amount_cents: 500, refund_amount_cents: null, refunded_at: null, currency: "usd", created_at: at("2026-09-30T12:00:00Z") }, // the week before
    ],
    community_program_access: [],
    profiles: [],
  }
}

/* ── The reference for community_analytics (SQL part 271), from its definition ── */

/** to_char(instant AT TIME ZONE tz, ...), written apart from the code under test. */
function toChar(ms: number, grain: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const hour = p.hour === "24" ? "00" : p.hour
  return grain === "hour" ? `${p.year}-${p.month}-${p.day}T${hour}` : grain === "day" ? `${p.year}-${p.month}-${p.day}` : `${p.year}-${p.month}`
}
const HELD = (r: Row) => r.status === "removed" && String(r.removed_reason ?? "").startsWith("Held for review:")

function reference(t: Record<string, Row[]>, args: Record<string, any>) {
  const from = Date.parse(args.p_from)
  const to = Date.parse(args.p_to)
  const tz = args.p_tz
  const grain = args.p_grain
  const owner = t.communities[0].owner_user_id
  const inside = (r: Row) => r.community_id === CID && Date.parse(r.created_at) >= from && Date.parse(r.created_at) < to
  const tally = (rows: Row[]) => rows.reduce<Record<string, number>>((o, r) => ((o[r.b] = (o[r.b] ?? 0) + 1), o), {})
  const distinct = (rows: Row[]) => {
    const sets: Record<string, Set<string>> = {}
    for (const r of rows) (sets[r.b] ??= new Set()).add(r.user_id)
    return Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, s.size]))
  }
  const b = (r: Row): Row => ({ ...r, b: toChar(Date.parse(r.created_at), grain, tz) })
  const act = (t.community_activity ?? []).filter(inside).map(b)
  const sourceOf = (u: string) => t.community_members.find((m) => m.user_id === u)?.source ?? "free"
  const posts = (t.community_feed_posts ?? []).filter(inside).filter((r) => !HELD(r)).map(b)
  const comments = (t.community_feed_comments ?? []).filter(inside).filter((r) => !HELD(r)).map(b)
  const reactions = (t.community_reactions ?? []).filter(inside).map(b)
  const took = [...posts.map((r) => ({ user_id: r.author_id, b: r.b, k: "post" })), ...comments.map((r) => ({ user_id: r.author_id, b: r.b, k: "comment" })), ...reactions.map((r) => ({ user_id: r.user_id, b: r.b, k: "reaction" }))].filter((r) => r.user_id)
  const firstHour = (t.community_member_hours ?? []).filter((r) => r.community_id === CID).map((r) => Date.parse(r.hour)).sort((x, y) => x - y)[0]
  const cutDay = firstHour === undefined ? null : new Date(firstHour + 86_400_000).toISOString().slice(0, 10)
  const cut = cutDay ? Date.parse(`${cutDay}T00:00:00Z`) : null
  const hours = cut === null ? [] : (t.community_member_hours ?? []).filter((r) => r.community_id === CID && Date.parse(r.hour) >= Math.max(from, cut) && Date.parse(r.hour) < to).map((r) => ({ user_id: r.user_id, b: toChar(Date.parse(r.hour), grain, tz) }))
  const firstDay = toChar(from, "day", tz)
  const lastDay = toChar(to - 1, "day", tz)
  const days = (t.community_member_days ?? []).filter((r) => r.community_id === CID && r.day >= firstDay && r.day <= lastDay && (cutDay === null || r.day < cutDay)).map((r) => ({ user_id: r.user_id, b: grain === "month" ? r.day.slice(0, 7) : r.day }))
  const here = [...hours, ...(grain === "hour" ? [] : days)]
  return {
    joined: tally(act.filter((r) => r.kind === "joined" && r.user_id !== owner)),
    joined_by_visit: tally(act.filter((r) => r.kind === "joined" && r.user_id !== owner && !["manual", "platform", "product", "owner"].includes(sourceOf(r.user_id)))),
    left: tally(act.filter((r) => r.kind === "left")),
    posts: tally(posts),
    comments: tally(comments),
    reactions: tally(reactions),
    rsvps: {},
    lessons: {},
    contributors: distinct(took),
    active: grain === "hour" && (cut === null || cut > from) ? null : distinct(here),
    totals: {
      contributors: new Set(took.map((r) => r.user_id)).size,
      posters: new Set(took.filter((r) => r.k === "post").map((r) => r.user_id)).size,
      commenters: new Set(took.filter((r) => r.k === "comment").map((r) => r.user_id)).size,
      reactors: new Set(took.filter((r) => r.k === "reaction").map((r) => r.user_id)).size,
      active: new Set([...hours, ...days].map((r) => r.user_id)).size,
      courses: 0,
    },
    active_since: (t.community_member_days ?? []).map((r) => r.day).sort()[0] ?? null,
    active_hours_since: cut === null ? null : new Date(cut).toISOString(),
    ...(args.p_detail ? { top_contributors: [], top_spaces: [], cohorts: [], programs: [] } : {}),
  }
}

function dbOf(t: Record<string, Row[]>, answer: (args: Record<string, any>) => unknown = (a) => reference(t, a)) {
  const base = fakeDb(t)
  return {
    from: base.from,
    rpc: async (name: string, args: Record<string, any>) => (name === "community_analytics" ? { data: answer(args), error: null } : { data: null, error: { code: "PGRST202", message: "not found" } }),
  }
}

const range = (start: string, end: string, preset: RangeValue["preset"] = "custom"): RangeValue => ({ start, end, preset })
const WEEK = range("2026-10-05", "2026-10-11")
function questionOf(period: RangeValue, tz: string, now: number) {
  const b = boundsOf(period, tz, now)
  const compare = period.preset === "all_time" ? null : compareBounds(period, { mode: "previous_period" }, tz, now)
  return { start: b.start, end: Math.max(b.end, b.start + 1), compare, timeZone: tz }
}

/** Every figure the chart's tabs show, and its line, worked out by hand from seed(). */
const BY_HAND = {
  members: { line: [9, 9, 10, 10, 9, 9, 10], value: 10, previous: 8 },
  joined: { line: [1, 0, 1, 0, 0, 0, 1], value: 3, previous: 1 },
  active: { line: [2, 1, 0, 0, 0, 0, 1], value: 3, previous: 3, previousLine: [1, 0, 0, 0, 0, 0, 2] },
  visitors: { line: [10, 2, 0, 0, 0, 0, 6], value: 18, previous: 12, prospects: 12, previousLine: [2, 0, 10, 0, 0, 0, 0] },
  joinRate: { line: [12.5, 0, null, null, null, null, 50], value: 16.7 },
  engagement: { line: [0, 11.1, 0, 0, 11.1, 11.1, 10], value: 40 },
  churn: { value: 12.5 },
  posts: { line: [0, 1, 0, 0, 1, 0, 0] },
  reactions: { line: [0, 1, 0, 0, 0, 0, 1] },
  revenue: { line: [0, 1000, 0, 2000, 0, 0, 0], value: 3000, previous: 500 },
  subscribers: { line: [1, 2, 2, 2, 1, 1, 1] },
  mrr: { line: [1000, 2000, 2000, 2000, 1000, 1000, 1000] },
}

function checkFigures(r: CommunityReport, label: string) {
  const L = r.lines
  const F = r.figures
  check(`${label}: seven New York days`, r.grain === "day" && r.buckets === 7, { grain: r.grain, buckets: r.buckets })
  check(`${label}: members walked back from 10 now: 9 9 10 10 9 9 10, 8 at the start of the week before's end`, same(L.members.current, BY_HAND.members.line) && F.members.value === 10 && F.members.previous === 8, { line: L.members.current, fig: F.members })
  check(`${label}: new members by New York day (00:00 Oct 5 is day 1, 23:30 Oct 11 day 7), never the owner`, same(L.joined.current, BY_HAND.joined.line) && F.joined.value === 3 && F.joined.previous === 1, { line: L.joined.current, fig: F.joined })
  check(`${label}: active members from the hours, by New York day; the day row of a day the hours hold not read twice`, same(L.active.current, BY_HAND.active.line) && F.active.value === 3, { line: L.active.current, fig: F.active })
  check(`${label}: and the week before from part 184's days`, same(L.active.previous, BY_HAND.active.previousLine) && F.active.previous === 3, { line: L.active.previous, fig: F.active })
  check(`${label}: visitors: the hours (22:00 Oct 5 is day 1, 00:00 Oct 6 day 2), Oct 5's day count by its noon, the kept rows by their moment, nothing twice`, same(L.visits.current, BY_HAND.visitors.line) && F.visits.value === 18 && F.prospects.value === 12, { line: L.visits.current, fig: F.visits, prospects: F.prospects })
  check(`${label}: and the week before, by the day counts' noons`, same(L.visits.previous, BY_HAND.visitors.previousLine) && F.visits.previous === 12, { line: L.visits.previous, fig: F.visits })
  check(`${label}: join rate: 2 joins a visitor made (not the one the team added) over 12 visits from non-members`, F.joinRate.value === BY_HAND.joinRate.value && same(L.joinRate.current, BY_HAND.joinRate.line), { fig: F.joinRate, line: L.joinRate.current })
  check(`${label}: posts: a held post never one, a removed one still one`, same(L.posts.current, BY_HAND.posts.line) && F.posts.value === 2, { line: L.posts.current })
  check(`${label}: reactions by New York day`, same(L.reactions.current, BY_HAND.reactions.line) && F.reactions.value === 2, L.reactions.current)
  check(`${label}: engagement: 4 of 10 took part (a like on one's own post counts), by day over the members that day`, F.engagement.value === BY_HAND.engagement.value && same(L.engagement.current, BY_HAND.engagement.line), { fig: F.engagement, line: L.engagement.current })
  check(`${label}: who took part: 2 posted, 1 commented, 2 reacted`, same(r.people, { posters: 2, commenters: 1, reactors: 2 }), r.people)
  check(`${label}: churn: 1 left of 8 at the start`, F.churn.value === BY_HAND.churn.value, F.churn)
  const m = r.money
  check(`${label}: revenue less refunds by New York day, a disputed order left out, against the week before`, !!m && same(m.lines.revenue.current, BY_HAND.revenue.line) && m.figures.revenue.value === 3000 && m.figures.revenue.previous === 500, m ? { line: m.lines.revenue.current, fig: m.figures.revenue } : null)
  check(`${label}: paid members and monthly revenue at the end of each day, a yearly plan as a twelfth`, !!m && same(m.lines.subscribers.current, BY_HAND.subscribers.line) && same(m.lines.mrr.current, BY_HAND.mrr.line), m ? { subs: m.lines.subscribers.current, mrr: m.lines.mrr.current } : null)
  const sources = Object.fromEntries((r.traffic?.source ?? []).map((x) => [x.key, x.value]))
  check(`${label}: where visitors came from: Oct 5's kept day lines by noon, the kept rows of the week, never one after it`, same(sources, { organic_search: 7, app: 1, explore: 1 }), sources)
}

/* ── Part 271 itself, on a Postgres, when there is one ───────────────── */

const PG = { host: process.env.R37_PG_HOST || "", port: process.env.R37_PG_PORT || "5432", user: process.env.R37_PG_USER || "postgres" }
const PSQL = ["/usr/bin/psql", "/usr/local/bin/psql", "/opt/homebrew/bin/psql"].find((p) => existsSync(p)) ?? null

function psql(db: string, args: string[], input?: string): string {
  return execFileSync(PSQL as string, ["-h", PG.host, "-p", PG.port, "-U", PG.user, "-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] })
}

const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

/** The tables part 271 reads, in their production shape for the columns it reads, and the rows of seed(). */
function schemaAndRows(t: Record<string, Row[]>): string {
  const uuid = (s: string) => (/^[0-9a-f-]{36}$/.test(s) ? s : `00000000-0000-4000-9000-${Buffer.from(s).toString("hex").padStart(12, "0").slice(-12)}`)
  const out = [
    "DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);",
    "CREATE TABLE public.communities (id uuid PRIMARY KEY, owner_user_id uuid);",
    "CREATE TABLE public.community_activity (id bigserial PRIMARY KEY, community_id uuid, user_id uuid, kind text, target_id text, created_at timestamptz);",
    "CREATE TABLE public.community_members (id text, community_id uuid, user_id uuid, status text, role text, source text, joined_at timestamptz, last_seen_at timestamptz, last_active_at timestamptz);",
    "CREATE TABLE public.community_feed_posts (id uuid PRIMARY KEY, community_id uuid, author_id uuid, status text, removed_reason text, space_id uuid, created_at timestamptz);",
    "CREATE TABLE public.community_feed_comments (id uuid PRIMARY KEY, post_id uuid, community_id uuid, author_id uuid, status text, removed_reason text, created_at timestamptz);",
    "CREATE TABLE public.community_reactions (id uuid PRIMARY KEY, community_id uuid, user_id uuid, created_at timestamptz);",
    "CREATE TABLE public.community_event_rsvps (community_id uuid, created_at timestamptz);",
    "CREATE TABLE public.community_member_days (community_id uuid, user_id uuid, day date);",
    "CREATE TABLE public.community_spaces (id uuid, community_id uuid, name text, slug text, archived_at timestamptz);",
    "CREATE TABLE public.products (id uuid, title text);",
    "CREATE TABLE public.courses (id uuid, product_id uuid, created_at timestamptz);",
    "CREATE TABLE public.course_enrollments (id uuid, course_id uuid, buyer_id uuid, completed_at timestamptz, percent numeric);",
    "CREATE TABLE public.community_courses (id uuid, community_id uuid, title text, product_id uuid, course_id uuid, status text);",
    "CREATE TABLE public.community_view_days (community_id uuid, visitor_key text, day date, created_at timestamptz, member boolean);",
  ]
  const users = new Set<string>()
  for (const r of t.community_member_hours) users.add(r.user_id)
  for (const u of users) out.push(`INSERT INTO auth.users VALUES (${lit(u)});`)
  out.push(`INSERT INTO public.communities VALUES (${lit(CID)}, ${lit(OWNER)});`)
  for (const r of t.community_activity) out.push(`INSERT INTO public.community_activity (community_id, user_id, kind, target_id, created_at) VALUES (${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.kind)}, NULL, ${lit(r.created_at)});`)
  for (const r of t.community_members) out.push(`INSERT INTO public.community_members VALUES (${lit(r.id)}, ${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.status)}, ${lit(r.role)}, ${lit(r.source)}, ${lit(r.joined_at)}, NULL, NULL);`)
  for (const r of t.community_feed_posts) out.push(`INSERT INTO public.community_feed_posts VALUES (${lit(uuid(r.id))}, ${lit(r.community_id)}, ${lit(r.author_id)}, ${lit(r.status)}, ${lit(r.removed_reason)}, NULL, ${lit(r.created_at)});`)
  for (const r of t.community_feed_comments) out.push(`INSERT INTO public.community_feed_comments VALUES (${lit(uuid(r.id))}, ${lit(uuid(r.post_id))}, ${lit(r.community_id)}, ${lit(r.author_id)}, ${lit(r.status)}, ${lit(r.removed_reason)}, ${lit(r.created_at)});`)
  for (const r of t.community_reactions) out.push(`INSERT INTO public.community_reactions VALUES (${lit(uuid(r.id))}, ${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.created_at)});`)
  for (const r of t.community_member_days) out.push(`INSERT INTO public.community_member_days VALUES (${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.day)});`)
  for (const r of t.community_view_days) out.push(`INSERT INTO public.community_view_days VALUES (${lit(r.community_id)}, ${lit(r.visitor_key)}, ${lit(r.day)}, ${lit(r.created_at)}, ${lit(r.member)});`)
  return out.join("\n")
}

async function onPostgres(): Promise<void> {
  console.log("\npart 271 on a Postgres")
  if (!PSQL || !PG.host) {
    console.log(`  skipped  ${!PSQL ? "no psql here" : "R37_PG_HOST is not set"}`)
    return
  }
  const db = `r37_${process.pid}`
  try {
    psql("postgres", ["-c", `CREATE DATABASE ${db}`])
  } catch (e) {
    console.log(`  skipped  no Postgres answers at ${PG.host}:${PG.port} (${String((e as Error).message).split("\n")[0]})`)
    return
  }
  try {
    const t = seed()
    psql(db, [], schemaAndRows(t))
    const part = "supabase/sql/run-now/271_community_analytics_tracking.sql"
    psql(db, ["-1", "-f", part])
    psql(db, ["-1", "-f", part])
    check("part 271 runs, and runs again", true)
    const filled = psql(db, ["-At", "-c", "select count(*), coalesce(sum(visitors), 0) from public.community_visit_hours"]).trim()
    check("the visit hours are filled from the kept visit rows of past days (two visits in one hour, Oct 12 03:00 UTC; one at 04:00)", filled === "2|3", filled)
    for (const t2 of ["community_visit_hours", "community_member_hours"]) {
      const rls = psql(db, ["-At", "-c", `select relrowsecurity, has_table_privilege('anon', 'public.${t2}', 'SELECT'), has_table_privilege('authenticated', 'public.${t2}', 'SELECT') from pg_class where relname = '${t2}'`]).trim()
      check(`${t2}: row level security on, nothing for anon or authenticated`, rls === "t|f|f", rls)
    }
    check("community_analytics: not for anon", psql(db, ["-At", "-c", "select has_function_privilege('anon', 'public.community_analytics(uuid,timestamptz,timestamptz,text,text,boolean)', 'EXECUTE')"]).trim() === "f")
    for (const r of t.community_member_hours) psql(db, ["-c", `INSERT INTO public.community_member_hours VALUES (${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.hour)})`])
    const q = questionOf(WEEK, NY, NOW)
    const ask = (from: number, to: number, grain: string, tz = NY) => {
      const args = { p_community: CID, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_tz: tz, p_grain: grain, p_detail: false }
      const got = JSON.parse(psql(db, ["-At", "-c", `select public.community_analytics(${lit(args.p_community)}, ${lit(args.p_from)}, ${lit(args.p_to)}, ${lit(args.p_tz)}, ${lit(args.p_grain)}, false)`]).trim())
      return { got, args }
    }
    const norm = (x: any) => JSON.parse(JSON.stringify(x, (k, v) => (k === "active_hours_since" && v ? new Date(v).toISOString() : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)))
    for (const [what, from, to, grain] of [
      ["the week by day", q.start, q.end, "day"],
      ["the week before by day", q.compare!.start, q.compare!.end, "day"],
      ["the year by month", Date.parse("2025-11-01T04:00:00Z"), Date.parse("2026-10-16T04:00:00Z"), "month"],
      ["Oct 6 by the hour", Date.parse("2026-10-06T04:00:00Z"), Date.parse("2026-10-07T04:00:00Z"), "hour"],
      ["Oct 4 by the hour, before the hours hold whole days", Date.parse("2026-10-04T04:00:00Z"), Date.parse("2026-10-05T04:00:00Z"), "hour"],
    ] as const) {
      const { got, args } = ask(from, to, grain)
      const want = reference(t, args)
      check(`${what}: part 271's answer is the reference's`, same(norm(got), norm(want)), { got: norm(got), want: norm(want) })
    }
    /* And through the server's own assembly: the same figures by hand, with the database answering. */
    const answers = new Map<string, unknown>()
    for (const span of [q, q.compare!]) {
      for (const detail of [true, false]) {
        const { got } = ask(span.start, span.end, "day")
        answers.set(`${new Date(span.start).toISOString()}|${detail}`, { ...got, ...(detail ? { top_contributors: [], top_spaces: [], cohorts: [], programs: [] } : {}) })
      }
    }
    const r = await loadCommunityReport(dbOf(t, (a) => answers.get(`${a.p_from}|${a.p_detail}`)), t.communities[0] as any, q, NOW)
    checkFigures(r, "with part 271 answering")
  } finally {
    try {
      psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`])
    } catch {
      /* Left for the next run's name to differ. */
    }
  }
}

async function main() {
  /* ── Every figure, by hand ─────────────────────────────────────────── */
  console.log("\nthe week of Oct 5 in New York, every figure against the rows by hand")
  const t = seed()
  const q = questionOf(WEEK, NY, NOW)
  const r = await loadCommunityReport(dbOf(t), t.communities[0] as any, q, NOW)
  checkFigures(r, "the reference")
  check("a period before whose counting began inside it is no comparison (part 184's rule, still)", r.figures.active.previous !== null && r.figures.visits.previous !== null)

  /* An hour chart of a day the hours hold, and of one they do not. */
  console.log("\nby the hour")
  const day6 = await loadCommunityReport(dbOf(t), t.communities[0] as any, questionOf(range("2026-10-06", "2026-10-06"), NY, NOW), NOW)
  check("Oct 6 by the hour: its first hour holds the visitors of 00:00 (04:00 UTC)", day6.grain === "hour" && day6.lines.visits.current[0] === 2 && day6.counted.visitsByHour, { grain: day6.grain, first: day6.lines.visits.current.slice(0, 3) })
  check("  and active members have an hour line now: U4 at 10:00", day6.counted.active && day6.lines.active.current[10] === 1 && day6.figures.active.value === 1, { line: day6.lines.active.current, fig: day6.figures.active })
  const sep30 = await loadCommunityReport(dbOf(t), t.communities[0] as any, questionOf(range("2026-09-30", "2026-09-30"), "UTC", NOW), NOW)
  check("a day from before the hours, by the hour: no line, said so; its 10 visitors still counted", sep30.counted.visitsByHour === false && sep30.lines.visits.current.every((x) => x === null) && sep30.figures.visits.value === 10 && sep30.counted.active === false, { byHour: sep30.counted.visitsByHour, fig: sep30.figures.visits, active: sep30.counted.active })

  /* ── Before part 271: the same figures part 184 counted ───────────── */
  console.log("\nbefore part 271")
  const old = seed()
  delete (old as any).community_visit_hours
  const oldDb = dbOf(old, (a) => {
    const x = reference(old, a) as Record<string, unknown>
    delete x.joined_by_visit
    return x
  })
  const before = await loadCommunityReport({ ...oldDb, from: (table: string) => (table === "community_visit_hours" ? fakeDb({}, { failWith: { community_visit_hours: { code: "42P01", message: "missing" } } }).from(table) : oldDb.from(table)) }, old.communities[0] as any, q, NOW)
  check("visitors from the day counts by noon and the kept rows: Oct 6's 5 on day 2, Oct 11's 4 on day 7", same(before.lines.visits.current, [7, 5, 0, 0, 0, 0, 6]), before.lines.visits.current)
  check("the join rate divides every join (3 of 12) when the database cannot tell who joined by visiting", before.figures.joinRate.value === 25, before.figures.joinRate)

  /* ── The nightly count keeps the day's visits by the hour ──────────── */
  console.log("\nthe nightly count")
  check("a visit's hour is its moment on the hour, in UTC", visitHourOf("2026-10-14", "2026-10-14T01:50:12.000Z") === "2026-10-14T01:00:00.000Z" && visitHourOf("2026-10-14", null) === "2026-10-14T00:00:00.000Z")
  check("a moment from another day is the day's first hour", visitHourOf("2026-10-14", "2026-10-13T23:59:00.000Z") === "2026-10-14T00:00:00.000Z")
  check("each hour's visitors and those who were not members", same(visitHours("2026-10-14", [{ created_at: "2026-10-14T01:10:00Z", member: false }, { created_at: "2026-10-14T01:50:00Z", member: true }, { created_at: "2026-10-14T13:00:00Z", member: null }]), [{ hour: "2026-10-14T01:00:00.000Z", visitors: 2, prospects: 1 }, { hour: "2026-10-14T13:00:00.000Z", visitors: 1, prospects: 1 }]))
  const night = fakeDb({
    community_daily_stats: [{ community_id: CID, day: "2026-10-14" }],
    community_view_days: [
      { community_id: CID, visitor_key: "a".repeat(20), day: "2026-10-14", created_at: "2026-10-14T01:10:00.000Z", source: "app", referrer: null, device: "mobile", country: "US", member: false },
      { community_id: CID, visitor_key: "b".repeat(20), day: "2026-10-14", created_at: "2026-10-14T01:50:00.000Z", source: null, referrer: null, device: null, country: null, member: true },
      { community_id: CID, visitor_key: "c".repeat(20), day: "2026-10-14", created_at: "2026-10-14T22:05:00.000Z", source: "explore", referrer: null, device: "desktop", country: "RO", member: false },
    ],
    community_daily_traffic: [],
    community_visit_hours: [],
  })
  check("yesterday is counted", (await rollupTraffic(night, CID, "2026-10-14", NOW)) === true)
  check("  with its hours: 01:00 two (one not a member), 22:00 one", same(night.tables.community_visit_hours.map((h: Row) => [h.hour, h.visitors, h.prospects]), [["2026-10-14T01:00:00.000Z", 2, 1], ["2026-10-14T22:00:00.000Z", 1, 1]]), night.tables.community_visit_hours)
  check("  and counted again, the same rows, not more", (await rollupTraffic(night, CID, "2026-10-14", NOW)) === true && night.tables.community_visit_hours.length === 2 && night.tables.community_visit_hours[0].visitors === 2)
  const noHours = fakeDb({ community_daily_stats: [{ community_id: CID, day: "2026-10-14" }], community_view_days: night.tables.community_view_days, community_daily_traffic: [] }, { failWith: { community_visit_hours: { code: "42P01", message: "missing" } } })
  check("before part 271 the day is still counted", (await rollupTraffic(noHours, CID, "2026-10-14", NOW)) === true && noHours.tables.community_daily_stats[0].visitors === 3)

  const posts = fakeDb({
    community_feed_posts: [
      { id: "a", community_id: CID, status: "published", removed_reason: null, created_at: "2026-10-14T10:00:00.000Z" },
      { id: "b", community_id: CID, status: "removed", removed_reason: "Held for review: a link", created_at: "2026-10-14T11:00:00.000Z" },
      { id: "c", community_id: CID, status: "removed", removed_reason: "Spam", created_at: "2026-10-14T12:00:00.000Z" },
      { id: "d", community_id: CID, status: "deleted", removed_reason: null, created_at: "2026-10-14T13:00:00.000Z" },
    ],
    community_feed_comments: [{ id: "x", community_id: CID, status: "removed", removed_reason: "Held for review: words", created_at: "2026-10-14T10:00:00.000Z" }],
  })
  const d = await countDay(posts, CID, "2026-10-14")
  check("the day's count: a held post or comment is not one; removed after it was up, or deleted, it was", d.posts === 3 && d.comments === 0, { posts: d.posts, comments: d.comments })

  /* ── A member's hours ──────────────────────────────────────────────── */
  console.log("\na member's hours")
  resetMemberDays()
  const md = fakeDb({ community_member_days: [], community_member_hours: [] })
  check("the first visit today: the day's row and the hour's", (await recordMemberDay(md, CID, U(5), NOW)) === "written" && md.tables.community_member_days.length === 1 && same(md.tables.community_member_hours.map((h: Row) => h.hour), [utcHour(NOW)]))
  check("again in the same hour: nothing asked", (await recordMemberDay(md, CID, U(5), NOW + 20 * 60_000)) === "known" && md.log.filter((l) => l.table === "community_member_hours").length === 1)
  check("an hour later: the hour's row, the day already known", (await recordMemberDay(md, CID, U(5), NOW + 3_600_000)) === "known" && md.tables.community_member_hours.length === 2 && md.tables.community_member_days.length === 1)
  resetMemberDays()
  const noTable = fakeDb({ community_member_days: [] }, { failWith: { community_member_hours: { code: "42P01", message: "missing" } } })
  check("before part 271 the day is written all the same, and the hours not asked again", (await recordMemberDay(noTable, CID, U(6), NOW)) === "written" && (await recordMemberDay(noTable, CID, U(7), NOW)) === "written" && noTable.log.filter((l) => l.table === "community_member_hours").length === 1)
  resetMemberDays()

  /* ── What writes the rows ──────────────────────────────────────────── */
  console.log("\nwhat writes the rows")
  const reactions = stripComments(raw("lib/communities/server/reactions.ts"))
  check("every new like is the liker's activity, their own post's too (not only when it gives the author a point)", /if \(!error\) await recordActivity\(db, \{ communityId: community\.id, userId: viewer\.userId, kind: "reaction"/.test(reactions) && !/authorId !== viewer\.userId\) \{[^}]*recordActivity/.test(reactions))
  check("the heartbeat and anything a member does still write the member's day (and now its hour)", /recordMemberDay\(db, gate\.community\.id/.test(raw("app/api/community/[communityId]/presence/route.ts")) && /recordMemberHour\(db, communityId, userId, now\)/.test(raw("lib/communities/server/member-days.ts")))
  check("the nightly count writes the hours after the day", /await rollupVisitHours\(db, communityId, d, rows\)/.test(raw("lib/communities/server/analytics.ts")))

  /* ── Part 271's conventions ────────────────────────────────────────── */
  console.log("\npart 271")
  const part = raw("supabase/sql/run-now/271_community_analytics_tracking.sql")
  const lines = part.trimEnd().split("\n")
  check("one statement a line, a comment first and the schema reload last", lines[0].startsWith("/* ") && lines[0].endsWith(" */") && lines[lines.length - 1] === "notify pgrst, 'reload schema';" && lines.slice(1).every((l) => /;$/.test(l)))
  check("safe to run again", !/CREATE TABLE public|CREATE INDEX public|CREATE FUNCTION public/.test(part) && /CREATE OR REPLACE FUNCTION public\.community_analytics/.test(part) && /ON CONFLICT \(community_id, hour\) DO UPDATE/.test(part))
  check("both new tables server only", ["community_visit_hours", "community_member_hours"].every((x) => part.includes(`ALTER TABLE public.${x} ENABLE ROW LEVEL SECURITY;`) && part.includes(`REVOKE ALL ON public.${x} FROM PUBLIC, anon, authenticated;`)))
  check("the function: the same arguments, server only", /REVOKE ALL ON FUNCTION public\.community_analytics\(uuid, timestamptz, timestamptz, text, text, boolean\) FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT EXECUTE ON FUNCTION public\.community_analytics\(uuid, timestamptz, timestamptz, text, text, boolean\) TO service_role;/.test(part))
  check("the migration is the same text", raw("supabase/migrations/20270206_community_analytics_tracking.sql") === part)
  check("listed in the README and checked after", /`271_community_analytics_tracking\.sql`/.test(raw("supabase/sql/run-now/README.md")) && /as p271_community_analytics_tracking/.test(raw("supabase/sql/run-now/99_check_after.sql")))
  check("carried into the four files", raw("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 271_community_analytics_tracking.sql"))

  await onPostgres()

  /* ── Copy ──────────────────────────────────────────────────────────── */
  console.log("\ncopy")
  for (const f of ["components/community/creator/analytics-section.tsx", "lib/communities/server/analytics-report.ts", "lib/communities/server/analytics.ts", "lib/communities/server/member-days.ts", "lib/communities/server/reactions.ts", "supabase/sql/run-now/271_community_analytics_tracking.sql", "scripts/check-community-analytics-round37.mjs"]) {
    const text = raw(f)
    check(`${f}: no em dash`, !text.includes("—"))
    check(`${f}: no banned word`, !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
