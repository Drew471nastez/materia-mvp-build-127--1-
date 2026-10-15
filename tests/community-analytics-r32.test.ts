/**
 * ===========================================================================
 *  ROUND 32: A COMMUNITY'S ANALYTICS, COUNTED RIGHT
 * ===========================================================================
 * "It needs to be accurate." A seeded community, its rows placed on purpose
 * around midnight in the viewer's zone, read by the real
 * loadCommunityReport (lib/communities/server/analytics-report.ts) through
 * an in-memory database, and every figure checked against numbers worked
 * out by hand from those rows:
 *
 *   BUCKETS     a join at 23:59 in New York is that day's, one at 00:00 the
 *               next day's, whatever the UTC date says; hours in Tokyo;
 *               months in New York
 *   COUNTS      joins (never the owner's), leaves, posts, active members
 *               (each once in the period), visits and the visits from
 *               people who were not members
 *   MEMBERS     walked back from the members there are now, through every
 *               join and leave after the period
 *   COMPARISON  the period before, bucket by bucket, cut where it should be;
 *               member days that began inside the period before are no
 *               comparison
 *   RATES       join rate, engagement and churn, and none where there is
 *               nothing to divide by
 *   MONEY       revenue less refunds by day, monthly revenue and paying
 *               members at the end of each day, new, cancelled, upgrades
 *   BEFORE 184  the same joins, leaves and members from the activity rows
 *   CLIENT      the question is the period (the same every minute), one
 *               request per question, dropped when nobody waits, kept and
 *               found again, and the section draws no bar and no blur
 *
 * The SQL function community_analytics is answered here by a reference
 * written from part 184's definition (to_char of each row's instant in the
 * zone), so the server's assembly of its answer is what is under test.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { loadCommunityReport } from "@/lib/communities/server/analytics-report"
import { bucketsOf, type CommunityReport } from "@/lib/communities/analytics-report"
import { askCommunityReport, communityAsk, keptCommunityReport, resetCommunityReports, sameReport, warmCommunityReport } from "@/lib/communities/client/report-cache"
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

const CID = "c0000000-0000-4000-8000-000000000032"
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const OWNER = U(1)
const NOW = Date.parse("2026-10-15T16:00:00.000Z")
const at = (iso: string) => new Date(Date.parse(iso)).toISOString()

/* ── The reference for community_analytics (SQL part 184), from its definition ── */

type Row = Record<string, any>
/** to_char(instant AT TIME ZONE tz, 'YYYY-MM-DD"T"HH24' | 'YYYY-MM-DD' | 'YYYY-MM'), written apart from the code under test. */
function toChar(ms: number, grain: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const hour = p.hour === "24" ? "00" : p.hour
  return grain === "hour" ? `${p.year}-${p.month}-${p.day}T${hour}` : grain === "day" ? `${p.year}-${p.month}-${p.day}` : `${p.year}-${p.month}`
}
function reference(t: Record<string, Row[]>, args: Record<string, any>) {
  const from = Date.parse(args.p_from)
  const to = Date.parse(args.p_to)
  const tz = args.p_tz
  const grain = args.p_grain
  const owner = t.communities[0].owner_user_id
  const inside = (r: Row) => r.community_id === CID && Date.parse(r.created_at) >= from && Date.parse(r.created_at) < to
  const tally = (rows: Row[], key: (r: Row) => string) => rows.reduce<Record<string, number>>((o, r) => ((o[key(r)] = (o[key(r)] ?? 0) + 1), o), {})
  const b = (r: Row) => toChar(Date.parse(r.created_at), grain, tz)
  const act = (t.community_activity ?? []).filter(inside)
  const took = act.filter((r) => ["post", "comment", "reaction"].includes(r.kind) && r.user_id)
  const distinctBy = (rows: Row[], key: (r: Row) => string) => {
    const sets: Record<string, Set<string>> = {}
    for (const r of rows) (sets[key(r)] ??= new Set()).add(r.user_id)
    return Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, s.size]))
  }
  const firstDay = toChar(from, "day", tz)
  const lastDay = toChar(to - 1, "day", tz)
  const days = (t.community_member_days ?? []).filter((r) => r.community_id === CID && r.day >= firstDay && r.day <= lastDay)
  const dayKey = (r: Row) => (grain === "month" ? r.day.slice(0, 7) : r.day)
  return {
    joined: tally(act.filter((r) => r.kind === "joined" && r.user_id !== owner), b),
    left: tally(act.filter((r) => r.kind === "left"), b),
    posts: tally((t.community_feed_posts ?? []).filter(inside), b),
    comments: tally((t.community_feed_comments ?? []).filter(inside), b),
    reactions: tally((t.community_reactions ?? []).filter(inside), b),
    rsvps: {},
    lessons: {},
    contributors: distinctBy(took, b),
    active: grain === "hour" ? null : distinctBy(days, dayKey),
    totals: {
      contributors: new Set(took.map((r) => r.user_id)).size,
      posters: new Set(took.filter((r) => r.kind === "post").map((r) => r.user_id)).size,
      commenters: new Set(took.filter((r) => r.kind === "comment").map((r) => r.user_id)).size,
      reactors: new Set(took.filter((r) => r.kind === "reaction").map((r) => r.user_id)).size,
      active: new Set(days.map((r) => r.user_id)).size,
      courses: 0,
    },
    active_since: (t.community_member_days ?? []).map((r) => r.day).sort()[0] ?? null,
    ...(args.p_detail ? { top_contributors: [], top_spaces: [], cohorts: [], programs: [] } : {}),
  }
}

/* ── The seeded community ──────────────────────────────────────────────── */

const activity = (id: number, user: number, kind: string, iso: string) => ({ id, community_id: CID, user_id: U(user), kind, created_at: at(iso) })
function seed(): Record<string, Row[]> {
  return {
    communities: [{ id: CID, owner_user_id: OWNER, creator_id: null, created_at: at("2025-06-01T00:00:00Z") }],
    /* Twelve members now, the owner among them, as member_count counts them. */
    community_members: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, community_id: CID, user_id: U(i + 1), status: "active", joined_at: i === 2 ? at("2026-10-05T04:00:00Z") : at("2026-01-01T00:00:00Z"), last_seen_at: null, last_active_at: null })),
    community_activity: [
      activity(1, 2, "joined", "2026-10-05T03:59:00Z"), // New York Oct 4, 23:59: the period before, its last day
      activity(2, 3, "joined", "2026-10-05T04:00:00Z"), // New York Oct 5, 00:00: this period, its first day
      activity(3, 4, "joined", "2026-10-07T15:00:00Z"), // Oct 7
      activity(4, 1, "joined", "2026-10-07T16:00:00Z"), // the owner: never a join
      activity(5, 5, "joined", "2026-10-12T03:30:00Z"), // New York Oct 11, 23:30: still this period
      activity(6, 6, "left", "2026-10-09T12:00:00Z"), // Oct 9
      activity(7, 7, "joined", "2026-10-12T05:00:00Z"), // New York Oct 12: after the period
      activity(8, 8, "left", "2026-10-14T12:00:00Z"), // after the period
      activity(9, 9, "joined", "2026-09-29T12:00:00Z"), // the period before, Sep 29
      activity(10, 10, "left", "2026-09-30T02:00:00Z"), // New York Sep 29, 22:00
      activity(11, 3, "post", "2026-10-06T05:00:00Z"), // took part: Oct 6
      activity(12, 4, "reaction", "2026-10-07T15:30:00Z"), // took part: Oct 7
    ],
    community_feed_posts: [
      { id: "p1", community_id: CID, created_at: at("2026-10-06T02:00:00Z"), status: "published", reaction_count: 0, comment_count: 0 }, // New York Oct 5, 22:00
      { id: "p2", community_id: CID, created_at: at("2026-10-06T05:00:00Z"), status: "published", reaction_count: 0, comment_count: 0 }, // Oct 6
      { id: "p3", community_id: CID, created_at: at("2026-10-11T23:00:00Z"), status: "published", reaction_count: 0, comment_count: 0 }, // Oct 11
      { id: "p4", community_id: CID, created_at: at("2026-10-12T04:30:00Z"), status: "published", reaction_count: 0, comment_count: 0 }, // after
      { id: "p5", community_id: CID, created_at: at("2026-10-01T12:00:00Z"), status: "published", reaction_count: 0, comment_count: 0 }, // before: Oct 1
    ],
    community_feed_comments: [],
    community_reactions: [],
    community_member_days: [
      { community_id: CID, user_id: U(3), day: "2026-10-05" },
      { community_id: CID, user_id: U(3), day: "2026-10-06" },
      { community_id: CID, user_id: U(4), day: "2026-10-06" },
      { community_id: CID, user_id: U(5), day: "2026-10-11" },
      { community_id: CID, user_id: U(3), day: "2026-10-12" },
      { community_id: CID, user_id: U(9), day: "2026-09-29" },
    ],
    community_daily_stats: [
      { community_id: CID, day: "2026-09-28", visitors: 5, prospects: 5, posts: 0, comments: 0, reactions: 0, active_members: 0 },
      { community_id: CID, day: "2026-10-05", visitors: 10, prospects: 8, posts: 0, comments: 0, reactions: 0, active_members: 0 },
      { community_id: CID, day: "2026-10-11", visitors: 6, prospects: 6, posts: 0, comments: 0, reactions: 0, active_members: 0 },
    ],
    community_daily_traffic: [],
    community_view_days: [],
    community_events: [],
    community_event_tickets: [],
    community_tiers: [{ community_id: CID, product_id: "prod1", billing: "recurring", kind: "paid" }],
    products: [],
    memberships: [
      { id: "ms1", product_id: "prod1", buyer_id: U(3), status: "active", billing_interval: "month", amount_cents: 1000, currency: "usd", created_at: at("2026-10-06T12:00:00Z"), started_at: at("2026-10-06T12:00:00Z"), canceled_at: null, ended_at: null, trial_end: null },
      { id: "ms2", product_id: "prod1", buyer_id: U(4), status: "canceled", billing_interval: "year", amount_cents: 12000, currency: "usd", created_at: at("2026-09-20T00:00:00Z"), started_at: at("2026-09-20T00:00:00Z"), canceled_at: at("2026-10-09T15:00:00Z"), ended_at: at("2026-10-09T15:00:00Z"), trial_end: null },
      { id: "ms3", product_id: "prod1", buyer_id: U(9), status: "active", billing_interval: "month", amount_cents: 500, currency: "usd", created_at: at("2026-09-29T12:00:00Z"), started_at: at("2026-09-29T12:00:00Z"), canceled_at: null, ended_at: null, trial_end: null },
    ],
    orders: [
      { id: "o1", product_id: "prod1", status: "completed", amount_cents: 1000, refund_amount_cents: null, refunded_at: null, currency: "usd", created_at: at("2026-10-06T12:00:00Z") },
      { id: "o2", product_id: "prod1", status: "refunded", amount_cents: 2000, refund_amount_cents: 500, refunded_at: at("2026-10-09T00:00:00Z"), currency: "usd", created_at: at("2026-10-08T12:00:00Z") },
      { id: "o3", product_id: "prod1", status: "completed", amount_cents: 500, refund_amount_cents: null, refunded_at: null, currency: "usd", created_at: at("2026-09-29T12:00:00Z") },
    ],
    profiles: [],
  }
}

function dbOf(t: Record<string, Row[]>, rpc: "ready" | "missing") {
  const base = fakeDb(t)
  return {
    from: base.from,
    rpc: async (name: string, args: Record<string, any>) => {
      if (rpc === "missing" || name !== "community_analytics") return { data: null, error: { code: "PGRST202", message: "not found" } }
      return { data: reference(t, args), error: null }
    },
  }
}

const NY = "America/New_York"
const range = (start: string, end: string, preset: RangeValue["preset"] = "custom"): RangeValue => ({ start, end, preset })

async function reportFor(period: RangeValue, tz: string, now: number, rpc: "ready" | "missing" = "ready", t = seed()): Promise<CommunityReport> {
  const b = boundsOf(period, tz, now)
  const compare = period.preset === "all_time" ? null : compareBounds(period, { mode: "previous_period" }, tz, now)
  return loadCommunityReport(dbOf(t, rpc), t.communities[0] as any, { start: b.start, end: Math.max(b.end, b.start + 1), compare, timeZone: tz }, now)
}

async function main() {
  /* ── A week by day, in New York ──────────────────────────────────────── */
  console.log("\na week by day in New York (Oct 5 to Oct 11, against Sep 28 to Oct 4)")
  const week = range("2026-10-05", "2026-10-11")
  const r = await reportFor(week, NY, NOW)
  check("seven day buckets", r.grain === "day" && r.buckets === 7, { grain: r.grain, buckets: r.buckets })
  check("the client draws as many dates as the server counted buckets", bucketsOf(boundsOf(week, NY, NOW), NY).keys.length === r.buckets)
  check("joins by New York day: 00:00 Oct 5 is Oct 5, 23:30 Oct 11 is Oct 11, never the owner's", same(r.lines.joined.current, [1, 0, 1, 0, 0, 0, 1]), r.lines.joined.current)
  check("a join at 23:59 Oct 4 New York (Oct 5 in UTC) is the period before's last day", same(r.lines.joined.previous, [0, 1, 0, 0, 0, 0, 1]), r.lines.joined.previous)
  check("leaves by day, and 22:00 Sep 29 New York (Sep 30 in UTC) is Sep 29", same(r.lines.left.current, [0, 0, 0, 0, 1, 0, 0]) && same(r.lines.left.previous, [0, 1, 0, 0, 0, 0, 0]), { cur: r.lines.left.current, prev: r.lines.left.previous })
  check("joined 3 against 2, left 1 against 1", r.figures.joined.value === 3 && r.figures.joined.previous === 2 && r.figures.left.value === 1 && r.figures.left.previous === 1, [r.figures.joined, r.figures.left])
  check("members at the end of each day, walked back from 12 through the join and leave after the period", same(r.lines.members.current, [11, 11, 12, 12, 11, 11, 12]), r.lines.members.current)
  check("and the period before ends where this one starts (10)", same(r.lines.members.previous, [9, 9, 9, 9, 9, 9, 10]) && r.figures.members.value === 12 && r.figures.members.previous === 10, { prev: r.lines.members.previous, fig: r.figures.members })
  check("posts by New York day (22:00 Oct 5 is Oct 5)", same(r.lines.posts.current, [1, 1, 0, 0, 0, 0, 1]) && r.figures.posts.value === 3 && r.figures.posts.previous === 1, { line: r.lines.posts.current, fig: r.figures.posts })
  check("active members by day, each counted once in the period", same(r.lines.active.current, [1, 2, 0, 0, 0, 0, 1]) && r.figures.active.value === 3, { line: r.lines.active.current, fig: r.figures.active })
  check("member days that began inside the period before are no comparison, never a zero", r.figures.active.previous === null && r.lines.active.previous === null, { fig: r.figures.active, line: r.lines.active.previous })
  check("visits by day from the nightly counts, and the period before's", same(r.lines.visits.current, [10, 0, 0, 0, 0, 0, 6]) && r.figures.visits.value === 16 && r.figures.visits.previous === 5, { line: r.lines.visits.current, fig: r.figures.visits })
  check("join rate: 3 joins over 14 visits from non-members is 21.4%, against 2 over 5 (40%)", r.figures.joinRate.value === 21.4 && r.figures.joinRate.previous === 40, r.figures.joinRate)
  check("and by day, none where nobody who was not a member came", same(r.lines.joinRate.current, [12.5, null, null, null, null, null, 16.7]), r.lines.joinRate.current)
  check("engagement: 2 members took part, of 12 at the end (16.7%)", r.figures.engagement.value === 16.7, r.figures.engagement)
  check("and by day, over the members at the end of each day", same(r.lines.engagement.current, [0, 9.1, 8.3, 0, 0, 0, 0]), r.lines.engagement.current)
  check("the people who posted and reacted", r.people.posters === 1 && r.people.reactors === 1 && r.people.commenters === 0, r.people)

  const m = r.money
  check("a community that sells has its money", !!m)
  if (m) {
    check("revenue by day, less refunds: $10 on Oct 6, $20 less $5 on Oct 8", same(m.lines.revenue.current, [0, 1000, 0, 1500, 0, 0, 0]) && m.figures.revenue.value === 2500 && m.figures.revenue.previous === 500, { line: m.lines.revenue.current, fig: m.figures.revenue })
    check("paying members at the end of each day", same(m.lines.subscribers.current, [2, 3, 3, 3, 2, 2, 2]) && m.figures.subscribers.value === 2 && m.figures.subscribers.previous === 2, { line: m.lines.subscribers.current, fig: m.figures.subscribers })
    check("monthly revenue at the end of each day, a yearly plan as a twelfth", same(m.lines.mrr.current, [1500, 2500, 2500, 2500, 1500, 1500, 1500]) && m.figures.mrr.value === 1500, { line: m.lines.mrr.current, fig: m.figures.mrr })
    check("the period before, day by day", same(m.lines.subscribers.previous, [1, 2, 2, 2, 2, 2, 2]), m.lines.subscribers.previous)
    check("new paid memberships and cancellations, against the period before", m.figures.newPaid.value === 1 && m.figures.newPaid.previous === 1 && m.figures.cancellations.value === 1 && m.figures.cancellations.previous === 0, [m.figures.newPaid, m.figures.cancellations])
    check("churn: 1 of the 2 paying at the start (50%)", m.churnRate === 50, m.churnRate)
    check("an upgrade: in for free a day before paying", m.upgrades === 1, m.upgrades)
    check("refunds in the period: one, $5", m.refunds.count === 1 && m.refunds.totalCents === 500, m.refunds)
    check("revenue by where it came from", same(m.bySource, [{ key: "memberships", cents: 2500 }]), m.bySource)
  }

  /* ── Before part 184: the same joins, leaves and members ─────────────── */
  console.log("\nbefore part 184")
  const old = await reportFor(week, NY, NOW, "missing")
  check("joins and leaves by New York day from the activity rows themselves", same(old.lines.joined.current, r.lines.joined.current) && same(old.lines.left.current, r.lines.left.current) && same(old.lines.joined.previous, r.lines.joined.previous), { joined: old.lines.joined.current, left: old.lines.left.current })
  check("and the same members, day by day", same(old.lines.members.current, r.lines.members.current) && same(old.lines.members.previous, r.lines.members.previous), old.lines.members.current)
  check("no engagement figure without part 184", old.figures.engagement.value === null && !old.counted.engagement)

  /* ── Today by the hour, in Tokyo ─────────────────────────────────────── */
  console.log("\ntoday by the hour in Tokyo")
  const tokyoNow = Date.parse("2026-10-15T06:30:00.000Z") // 15:30 in Tokyo
  const t2 = seed()
  t2.community_activity.push(
    activity(20, 11, "joined", "2026-10-14T15:00:00Z"), // 00:00 Oct 15 in Tokyo: the first hour
    activity(21, 12, "joined", "2026-10-15T00:10:00Z"), // 09:10: the tenth hour
    activity(22, 2, "joined", "2026-10-14T14:59:00Z"), // 23:59 Oct 14: yesterday, after the point yesterday is cut at
    activity(23, 3, "joined", "2026-10-14T00:30:00Z"), // 09:30 Oct 14: yesterday's tenth hour
  )
  const today = range("2026-10-15", "2026-10-15", "today")
  const h = await reportFor(today, "Asia/Tokyo", tokyoNow, "ready", t2)
  check("sixteen hours so far, by the hour", h.grain === "hour" && h.buckets === 16, { grain: h.grain, buckets: h.buckets })
  check("a join at 00:00 is the first hour, one at 09:10 the tenth", h.lines.joined.current[0] === 1 && h.lines.joined.current[9] === 1 && h.figures.joined.value === 2, h.lines.joined.current)
  check("yesterday is cut at 15:30 too: 09:30 counts, 23:59 does not", h.lines.joined.previous?.[9] === 1 && h.figures.joined.previous === 1, { line: h.lines.joined.previous, fig: h.figures.joined.previous })
  check("active members have no hour line", h.counted.active === false && h.lines.active.current.every((x) => x === null))

  /* ── A week across the clocks going back, in New York ────────────────── */
  console.log("\na week across the end of summer time in New York (Nov 1, 2026)")
  const t4 = seed()
  t4.community_activity.push(
    activity(40, 11, "joined", "2026-11-01T05:30:00Z"), // 01:30 EDT Nov 1, the first of the two 01:30s
    activity(41, 12, "joined", "2026-11-02T04:30:00Z"), // 23:30 EST Nov 1 (it would be Nov 2 at the summer offset)
    activity(42, 2, "joined", "2026-11-02T05:00:00Z"), // 00:00 EST Nov 2
  )
  const dst = await reportFor(range("2026-10-29", "2026-11-04"), NY, Date.parse("2026-11-10T12:00:00.000Z"), "ready", t4)
  check("seven days, one of them 25 hours long", dst.buckets === 7, dst.buckets)
  check("23:30 on the long day is still that day, midnight after it the next", same(dst.lines.joined.current, [0, 0, 0, 2, 1, 0, 0]), dst.lines.joined.current)

  /* ── Twelve months, in New York ──────────────────────────────────────── */
  console.log("\ntwelve months in New York")
  const t3 = seed()
  t3.community_activity.push(activity(30, 11, "joined", "2026-10-01T03:00:00Z")) // Sep 30, 23:00 in New York
  const year = range("2025-11-01", "2026-10-15", "last_12_months")
  const y = await reportFor(year, NY, NOW, "ready", t3)
  check("twelve month buckets", y.grain === "month" && y.buckets === 12, { grain: y.grain, buckets: y.buckets })
  check("23:00 Sep 30 New York is September's, not October's (and 23:59 Oct 4 is October's)", y.lines.joined.current[10] === 2 && y.lines.joined.current[11] === 5, y.lines.joined.current)
  check("active members by month, each once a month", y.lines.active.current[10] === 1 && y.lines.active.current[11] === 3, y.lines.active.current)

  /* ── The client: one request per question, kept, dropped ─────────────── */
  console.log("\nthe client")
  const p30 = range("2026-09-16", "2026-10-15", "last_30_days")
  const a1 = communityAsk(CID, p30, NY, NOW)
  const a2 = communityAsk(CID, p30, NY, NOW + 60_000)
  check("the minute's refresh is the same question, with a later end", a1.question === a2.question && a1.query !== a2.query)
  check("another period is another question", communityAsk(CID, range("2026-10-09", "2026-10-15", "last_7_days"), NY, NOW).question !== a1.question)
  check("All time is compared with nothing", communityAsk(CID, range("2025-06-01", "2026-10-15", "all_time"), NY, NOW).compared === null && !communityAsk(CID, range("2025-06-01", "2026-10-15", "all_time"), NY, NOW).query.includes("cstart"))

  resetCommunityReports()
  const calls: { url: string; signal: AbortSignal }[] = []
  const answers: Array<() => void> = []
  const g = globalThis as unknown as { fetch: typeof fetch }
  const realFetch = g.fetch
  g.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, signal: init.signal as AbortSignal })
    return new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
      answers.push(() => resolve(new Response(JSON.stringify({ ...r, at: Date.now() }), { status: 200 })))
    })
  }) as typeof fetch
  try {
    const one = askCommunityReport(a1)
    const two = askCommunityReport(a2)
    check("two asks for the same question are one request", calls.length === 1)
    one.release()
    check("and it goes on while somebody still waits", !calls[0].signal.aborted)
    answers[0]()
    const got = await two.promise
    two.release()
    check("the answer is kept by its question, with the period it was counted for", keptCommunityReport(a1.question)?.report.buckets === 7 && got.period.preset === "last_30_days" && got.span.start === a1.span.start)
    const seven = communityAsk(CID, range("2026-10-09", "2026-10-15", "last_7_days"), NY, NOW)
    const left = askCommunityReport(seven)
    left.promise.catch(() => {})
    left.release()
    check("a period left before its answer came drops its request", calls.length === 2 && calls[1].signal.aborted)
    check("a period asked ahead is asked once", warmCommunityReport(seven) && !warmCommunityReport(seven) && calls.length === 3)
    const joined = askCommunityReport(seven)
    joined.release()
    check("and is not dropped when the section stops waiting for it", calls.length === 3 && !calls[2].signal.aborted)
    answers[2]()
    await new Promise((res) => setTimeout(res, 0))
    check("so the choice finds it kept", !!keptCommunityReport(seven.question))
    check("an answer that says the same is the same, whenever it was counted", sameReport(r, { ...r, at: r.at + 60_000 }) && !sameReport(r, { ...r, buckets: 8 }))
  } finally {
    g.fetch = realFetch
    resetCommunityReports()
  }

  /* ── The section ─────────────────────────────────────────────────────── */
  console.log("\nthe section")
  const s = readFileSync("components/community/creator/analytics-section.tsx", "utf8")
  check("no progress line above a chart", !/LoadingLine|loading-line/.test(s))
  check("nothing blurs while figures are replaced", !/blur-\[|soft=\{/.test(s))
  check("the cards are /app Analytics' card and report grid", s.includes('"relative bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"') && s.includes('"grid gap-4 md:grid-cols-2 xl:grid-cols-3"'))
  check("the dates, legend and lines drawn are the answer's own period", /labelsFor\(shown\?\.span \?\? ask\.span/.test(s) && /<ChartLegend range=\{drawnPeriod\} compare=\{drawnCompared\} \/>/.test(s))
  check("the minute's refresh is not asked while the section is hidden behind another", /root\.current\?\.offsetParent/.test(s))
  for (const f of ["components/community/creator/analytics-section.tsx", "lib/communities/client/report-cache.ts", "scripts/check-community-analytics-round32.mjs", "scripts/render-community-analytics-round31.tsx"]) {
    const text = readFileSync(f, "utf8")
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
