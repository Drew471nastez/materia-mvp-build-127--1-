/**
 * ===========================================================================
 *  ROUND 38: A COMMUNITY'S FIGURES, MORE EXACT, AND FIVE IN THE ROW
 * ===========================================================================
 * The owner: "Make sure that all analytics and communities are more
 * accurate", "limit things up to 5 maximum", and the purple fills gone.
 *
 * One seeded week in Bucharest (Oct 19 to 25, 2026: summer time ends at
 * 04:00 on the 25th, so the last day is 25 hours long), its rows placed on
 * purpose, read by the real loadCommunityReport, every figure against what
 * was worked out by hand from those rows:
 *
 *   CHURN        of the members there at the start, who left: U2 (left),
 *                U4 (left, came back, left again: once), not U3 (joined
 *                and left inside the week). 2 of 7, not 4 leaves of 7
 *   ENGAGEMENT   the owner posting and liking is not the members taking
 *                part, and the owner is not one of the members it divides
 *   ACTIVE       the owner here every day is not an active member; nor in
 *                Here lately (the last 1, 7 and 30 days)
 *   REVENUE      an order refunded in full is nothing, one refunded in part
 *                its rest; a program sold and refunded in full is no sale; a
 *                module sold on its own is one (it was never counted); the
 *                refunds line counts orders, tickets and programs given back
 *                in the week, each by when it was given back
 *   TIME ZONE    a join at 03:30 on the 25th (still summer time) is day 7,
 *                one at 00:30 on the 26th (winter time) is after the week
 *
 * The SQL function community_analytics (part 274) is answered by a
 * reference written from its definition; part 271's answer (no
 * left_of_start, the owner counted) still gives the figures it gave, and so
 * do the activity rows before part 184. When a Postgres is at hand
 * (R37_PG_HOST, R37_PG_PORT, R37_PG_USER: a superuser), parts 271 and 274
 * are run there on the same rows and must answer as the reference does.
 *
 * Also: the row of five figures and its menu (components/community/creator/
 * analytics-section.tsx), the grey fills (app/(storelib)/app/analytics/analytics-
 * reports.tsx), and part 274's conventions.
 *
 * Run with:  npx tsx --conditions=react-server tests/community-analytics-r38.test.ts
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { loadCommunityReport } from "@/lib/communities/server/analytics-report"
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

const CID = "c0000000-0000-4000-8000-000000000038"
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const OWNER = U(1)
const NOW = Date.parse("2026-10-28T10:00:00.000Z")
const TZ = "Europe/Bucharest"
const at = (iso: string) => new Date(Date.parse(iso)).toISOString()

/* ── The seeded week ─────────────────────────────────────────────────── */

type Row = Record<string, any>
const activity = (id: number, user: number, kind: string, iso: string) => ({ id, community_id: CID, user_id: U(user), kind, target_id: null, created_at: at(iso) })
const member = (n: number, status = "active", extra: Row = {}) => ({ id: `m${n}`, community_id: CID, user_id: U(n), status, role: n === 1 ? "owner" : "member", source: n === 1 ? "owner" : "free", joined_at: at("2026-01-01T00:00:00Z"), last_seen_at: null, last_active_at: null, ...extra })

function seed(): Record<string, Row[]> {
  return {
    communities: [{ id: CID, owner_user_id: OWNER, creator_id: null, created_at: at("2025-06-01T00:00:00Z") }],
    /* Seven members now, the owner among them (member_count counts them so). U2, U3 and U4 left; U10 joined after the week. */
    community_members: [
      member(1, "active", { last_seen_at: at("2026-10-28T09:00:00Z") }), // the owner, here an hour ago
      member(2, "cancelled"),
      member(3, "cancelled"),
      member(4, "cancelled"),
      member(5),
      member(6, "active", { last_seen_at: at("2026-10-28T08:00:00Z") }),
      member(7),
      member(8),
      member(9, "active", { last_active_at: at("2026-10-25T10:00:00Z") }),
      member(10),
    ],
    community_activity: [
      activity(1, 1, "joined", "2026-10-20T08:00:00Z"), // the owner: never a join
      activity(2, 2, "left", "2026-10-20T09:00:00Z"), // day 2: there at the start, left
      activity(3, 3, "joined", "2026-10-21T09:00:00Z"), // day 3: joined
      activity(4, 4, "left", "2026-10-21T10:00:00Z"), // day 3: there at the start, left
      activity(5, 3, "left", "2026-10-22T09:00:00Z"), // day 4: joined inside the week, so no churn
      activity(6, 4, "joined", "2026-10-23T09:00:00Z"), // day 5: came back
      activity(7, 4, "left", "2026-10-24T09:00:00Z"), // day 6: left again, the same person
      activity(8, 5, "joined", "2026-10-25T00:30:00Z"), // 03:30 on the 25th, still summer time: day 7
      activity(9, 10, "joined", "2026-10-25T22:30:00Z"), // 00:30 on the 26th, winter time: after the week
    ],
    community_feed_posts: [
      { id: "p1", community_id: CID, author_id: OWNER, status: "published", removed_reason: null, space_id: null, reaction_count: 1, comment_count: 1, title: "Welcome", body_text: "", created_at: at("2026-10-18T21:30:00Z") }, // the owner, 00:30 on the 19th: day 1
      { id: "p2", community_id: CID, author_id: U(8), status: "removed", removed_reason: "Held for review: a link", space_id: null, reaction_count: 0, comment_count: 0, title: "Buy", body_text: "", created_at: at("2026-10-22T12:00:00Z") }, // held back: never a post
    ],
    community_feed_comments: [{ id: "c1", post_id: "p1", community_id: CID, author_id: U(6), status: "published", removed_reason: null, created_at: at("2026-10-21T12:00:00Z") }], // day 3
    community_reactions: [
      { id: "r1", community_id: CID, user_id: OWNER, target_type: "post", target_id: "p1", created_at: at("2026-10-20T12:00:00Z") }, // the owner likes their own post: day 2
      { id: "r2", community_id: CID, user_id: U(7), target_type: "post", target_id: "p1", created_at: at("2026-10-22T12:00:00Z") }, // day 4
    ],
    community_event_rsvps: [],
    /* The hours began on Oct 1, so they hold the whole week. The owner is here every day. */
    community_member_hours: [
      { community_id: CID, user_id: U(8), hour: at("2026-10-01T10:00:00Z") },
      ...[19, 20, 21, 22, 23, 24, 25].map((d) => ({ community_id: CID, user_id: OWNER, hour: at(`2026-10-${d}T10:00:00Z`) })),
      { community_id: CID, user_id: U(6), hour: at("2026-10-21T10:00:00Z") }, // day 3
      { community_id: CID, user_id: U(7), hour: at("2026-10-22T10:00:00Z") }, // day 4
      { community_id: CID, user_id: U(9), hour: at("2026-10-23T10:00:00Z") }, // day 5
    ],
    community_member_days: [{ community_id: CID, user_id: U(8), day: "2026-09-30" }],
    community_daily_stats: [],
    community_visit_hours: [],
    community_view_days: [],
    community_daily_traffic: [],
    community_events: [],
    community_leave_reasons: [],
    community_spaces: [],
    community_tiers: [{ community_id: CID, product_id: "prod1", billing: "recurring", kind: "paid" }],
    products: [],
    memberships: [],
    orders: [
      { id: "o1", product_id: "prod1", status: "completed", amount_cents: 2000, refund_amount_cents: null, refunded_at: null, currency: "eur", created_at: at("2026-10-20T12:00:00Z") }, // day 2
      { id: "o2", product_id: "prod1", status: "refunded", amount_cents: 3000, refund_amount_cents: 3000, refunded_at: at("2026-10-22T12:00:00Z"), currency: "eur", created_at: at("2026-10-21T12:00:00Z") }, // day 3, all of it back
      { id: "o3", product_id: "prod1", status: "refunded", amount_cents: 4000, refund_amount_cents: 1000, refunded_at: at("2026-10-23T12:00:00Z"), currency: "eur", created_at: at("2026-10-22T12:00:00Z") }, // day 4, 10 of 40 back
      { id: "o4", product_id: "prod1", status: "refunded", amount_cents: 1500, refund_amount_cents: 1500, refunded_at: at("2026-10-23T13:00:00Z"), currency: "eur", created_at: at("2026-10-10T12:00:00Z") }, // sold before, given back in the week
    ],
    community_program_access: [
      { program_id: "pr1", user_id: U(6), community_id: CID, source: "purchase", amount_cents: 2500, currency: "eur", revoked_at: null, created_at: at("2026-10-21T12:00:00Z") }, // day 3
      { program_id: "pr2", user_id: U(7), community_id: CID, source: "purchase", amount_cents: 1200, currency: "eur", revoked_at: at("2026-10-24T12:00:00Z"), created_at: at("2026-10-22T12:00:00Z") }, // refunded in full: no sale
      { program_id: "pr1", user_id: U(9), community_id: CID, source: "grant", amount_cents: null, currency: null, revoked_at: null, created_at: at("2026-10-22T12:00:00Z") }, // given, not sold
    ],
    community_module_access: [{ module_id: "mod1", user_id: U(8), program_id: "pr1", community_id: CID, source: "purchase", amount_cents: 900, currency: "eur", revoked_at: null, created_at: at("2026-10-23T12:00:00Z") }], // day 5
    community_event_tickets: [
      { id: "t1", event_id: "e1", community_id: CID, source: "purchase", status: "paid", amount_cents: 1000, currency: "eur", paid_at: at("2026-10-24T12:00:00Z"), refunded_at: null }, // day 6
      { id: "t2", event_id: "e1", community_id: CID, source: "purchase", status: "refunded", amount_cents: 600, currency: "eur", paid_at: at("2026-10-15T12:00:00Z"), refunded_at: at("2026-10-21T12:00:00Z") }, // sold before, given back in the week
    ],
    profiles: [],
  }
}

/* ── The reference for community_analytics, from its definition (part 274; `v271` is part 271's) ── */

function toChar(ms: number, grain: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const hour = p.hour === "24" ? "00" : p.hour
  return grain === "hour" ? `${p.year}-${p.month}-${p.day}T${hour}` : grain === "day" ? `${p.year}-${p.month}-${p.day}` : `${p.year}-${p.month}`
}
const HELD = (r: Row) => r.status === "removed" && String(r.removed_reason ?? "").startsWith("Held for review:")

function reference(t: Record<string, Row[]>, args: Record<string, any>, v271 = false) {
  const from = Date.parse(args.p_from)
  const to = Date.parse(args.p_to)
  const tz = args.p_tz
  const grain = args.p_grain
  const owner = t.communities[0].owner_user_id
  const notOwner = (u: string | null) => v271 || u !== owner
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
  const took = [...posts.map((r) => ({ user_id: r.author_id, b: r.b, k: "post" })), ...comments.map((r) => ({ user_id: r.author_id, b: r.b, k: "comment" })), ...reactions.map((r) => ({ user_id: r.user_id, b: r.b, k: "reaction" }))].filter((r) => r.user_id && notOwner(r.user_id))
  const firstHour = (t.community_member_hours ?? []).filter((r) => r.community_id === CID).map((r) => Date.parse(r.hour)).sort((x, y) => x - y)[0]
  const cutDay = firstHour === undefined ? null : new Date(firstHour + 86_400_000).toISOString().slice(0, 10)
  const cut = cutDay ? Date.parse(`${cutDay}T00:00:00Z`) : null
  const hours = cut === null ? [] : (t.community_member_hours ?? []).filter((r) => r.community_id === CID && notOwner(r.user_id) && Date.parse(r.hour) >= Math.max(from, cut) && Date.parse(r.hour) < to).map((r) => ({ user_id: r.user_id, b: toChar(Date.parse(r.hour), grain, tz) }))
  const firstDay = toChar(from, "day", tz)
  const lastDay = toChar(to - 1, "day", tz)
  const days = (t.community_member_days ?? []).filter((r) => r.community_id === CID && notOwner(r.user_id) && r.day >= firstDay && r.day <= lastDay && (cutDay === null || r.day < cutDay)).map((r) => ({ user_id: r.user_id, b: grain === "month" ? r.day.slice(0, 7) : r.day }))
  const here = [...hours, ...(grain === "hour" ? [] : days)]
  /* A leave by somebody with no join of theirs earlier in the bucket (or the period): a member when it began. Each person once. */
  const leaves = act.filter((r) => r.kind === "left" && r.user_id)
  const joinedBefore = (l: Row, sameBucket: boolean) => act.some((j) => j.kind === "joined" && j.user_id === l.user_id && (!sameBucket || j.b === l.b) && Date.parse(j.created_at) < Date.parse(l.created_at))
  const ofStart = distinct(leaves.filter((l) => !joinedBefore(l, true)))
  return {
    joined: tally(act.filter((r) => r.kind === "joined" && r.user_id !== owner)),
    joined_by_visit: tally(act.filter((r) => r.kind === "joined" && r.user_id !== owner && !["manual", "platform", "product", "owner"].includes(sourceOf(r.user_id)))),
    left: tally(act.filter((r) => r.kind === "left")),
    ...(v271 ? {} : { left_of_start: ofStart }),
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
      ...(v271 ? {} : { left_of_start: new Set(leaves.filter((l) => !joinedBefore(l, false)).map((l) => l.user_id)).size }),
    },
    active_since: (t.community_member_days ?? []).map((r) => r.day).sort()[0] ?? null,
    active_hours_since: cut === null ? null : new Date(cut).toISOString(),
    ...(args.p_detail ? { top_contributors: [], top_spaces: [], cohorts: [], programs: [] } : {}),
  }
}

function dbOf(t: Record<string, Row[]>, answer: ((args: Record<string, any>) => unknown) | null) {
  const base = fakeDb(t)
  return {
    from: base.from,
    rpc: async (name: string, args: Record<string, any>) => (name === "community_analytics" && answer ? { data: answer(args), error: null } : { data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
  }
}

const WEEK: RangeValue = { start: "2026-10-19", end: "2026-10-25", preset: "custom" }
function question() {
  const b = boundsOf(WEEK, TZ, NOW)
  return { start: b.start, end: Math.max(b.end, b.start + 1), compare: compareBounds(WEEK, { mode: "previous_period" }, TZ, NOW), timeZone: TZ }
}

/** Every figure, by hand from seed(). */
const BY_HAND = {
  members: { line: [7, 6, 6, 5, 6, 5, 6], value: 6 },
  joined: { line: [0, 0, 1, 0, 1, 0, 1], value: 3 },
  churn: { value: 28.6, line: [0, 14.3, 16.7, 16.7, 0, 16.7, 0], every: 57.1 },
  active: { line: [0, 0, 1, 1, 1, 0, 0], value: 3 },
  engagement: { value: 40, line: [0, 0, 20, 25, 0, 0, 0], withOwner: 50 },
  revenue: { line: [0, 2000, 2500, 3000, 900, 1000, 0], value: 9400 },
}

function checkWeek(r: CommunityReport, label: string, part: "274" | "271" | "rows") {
  const F = r.figures
  const L = r.lines
  check(`${label}: seven Bucharest days, the last one 25 hours long`, r.grain === "day" && r.buckets === 7, { grain: r.grain, buckets: r.buckets })
  check(`${label}: members walked back from 7 now: 7 6 6 5 6 5 6`, same(L.members.current, BY_HAND.members.line) && F.members.value === BY_HAND.members.value, { line: L.members.current, fig: F.members })
  check(`${label}: new members by Bucharest day: 03:30 on the 25th is day 7, 00:30 on the 26th after the week, never the owner`, same(L.joined.current, BY_HAND.joined.line) && F.joined.value === BY_HAND.joined.value, { line: L.joined.current, fig: F.joined })
  if (part === "271") {
    check(`${label}: churn as part 271 counts it, every leave over the members at the start (4 of 7)`, F.churn.value === BY_HAND.churn.every, F.churn)
    check(`${label}: engagement as part 271 counts it, the owner among those who took part (3 of 6)`, F.engagement.value === BY_HAND.engagement.withOwner, F.engagement)
    check(`${label}: and the owner not left out of what it divides`, r.ownerLeftOut === false, r.ownerLeftOut)
    return
  }
  check(`${label}: churn: U2 and U4 (once, though U4 left twice) of the 7 there at the start; not U3, who joined in the week`, F.churn.value === BY_HAND.churn.value, F.churn)
  check(`${label}: churn by day: each day's leavers who were there when it began`, same(L.churn.current, BY_HAND.churn.line), L.churn.current)
  if (part === "rows") return
  check(`${label}: active members by Bucharest day, never the owner, though the owner was here every day`, same(L.active.current, BY_HAND.active.line) && F.active.value === BY_HAND.active.value, { line: L.active.current, fig: F.active })
  check(`${label}: engagement: 2 of the 5 members other than the owner took part; the owner's post and like are not the members'`, F.engagement.value === BY_HAND.engagement.value, F.engagement)
  check(`${label}: engagement by day, over the members other than the owner that day`, same(L.engagement.current, BY_HAND.engagement.line), L.engagement.current)
  check(`${label}: who took part: nobody posted (the owner's post and a held one), 1 commented, 1 reacted`, same(r.people, { posters: 0, commenters: 1, reactors: 1 }), r.people)
  check(`${label}: the answer says the owner is left out`, r.ownerLeftOut === true, r.ownerLeftOut)
}

function checkMoney(r: CommunityReport, label: string) {
  const m = r.money
  check(`${label}: revenue: 20 + nothing of an order given back in full + 30 of 40 + a program 25 + a module 9 + a ticket 10; the program refunded in full is no sale`, !!m && m.figures.revenue.value === BY_HAND.revenue.value && same(m.lines.revenue.current, BY_HAND.revenue.line), m ? { fig: m.figures.revenue, line: m.lines.revenue.current } : null)
  check(`${label}: by source: memberships 50, programs 34 (a module among them), tickets 10`, !!m && same(m.bySource, [{ key: "memberships", cents: 5000 }, { key: "programs", cents: 3400 }, { key: "tickets", cents: 1000 }]), m?.bySource)
  check(`${label}: refunds given back in the week: three orders (30, 10, 15), a ticket (6), a program (12)`, !!m && m.refunds.count === 5 && m.refunds.totalCents === 7300, m?.refunds)
  check(`${label}: here lately, never the owner: 1 in the last day, 2 in 7 and 30`, r.live.active1 === 1 && r.live.active7 === 2 && r.live.active30 === 2 && r.live.members === 7, r.live)
}

/* ── Parts 271 and 274 on a Postgres, when there is one ───────────────── */

const PG = { host: process.env.R37_PG_HOST || "", port: process.env.R37_PG_PORT || "5432", user: process.env.R37_PG_USER || "postgres" }
const PSQL = ["/usr/bin/psql", "/usr/local/bin/psql", "/opt/homebrew/bin/psql"].find((p) => existsSync(p)) ?? null
function psql(db: string, args: string[], input?: string): string {
  return execFileSync(PSQL as string, ["-h", PG.host, "-p", PG.port, "-U", PG.user, "-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] })
}
const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
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
  const users = new Set<string>(t.community_member_hours.map((r) => r.user_id))
  for (const u of users) out.push(`INSERT INTO auth.users VALUES (${lit(u)});`)
  out.push(`INSERT INTO public.communities VALUES (${lit(CID)}, ${lit(OWNER)});`)
  for (const r of t.community_activity) out.push(`INSERT INTO public.community_activity (community_id, user_id, kind, target_id, created_at) VALUES (${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.kind)}, NULL, ${lit(r.created_at)});`)
  for (const r of t.community_members) out.push(`INSERT INTO public.community_members VALUES (${lit(r.id)}, ${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.status)}, ${lit(r.role)}, ${lit(r.source)}, ${lit(r.joined_at)}, NULL, NULL);`)
  for (const r of t.community_feed_posts) out.push(`INSERT INTO public.community_feed_posts VALUES (${lit(uuid(r.id))}, ${lit(r.community_id)}, ${lit(r.author_id)}, ${lit(r.status)}, ${lit(r.removed_reason)}, NULL, ${lit(r.created_at)});`)
  for (const r of t.community_feed_comments) out.push(`INSERT INTO public.community_feed_comments VALUES (${lit(uuid(r.id))}, ${lit(uuid(r.post_id))}, ${lit(r.community_id)}, ${lit(r.author_id)}, ${lit(r.status)}, ${lit(r.removed_reason)}, ${lit(r.created_at)});`)
  for (const r of t.community_reactions) out.push(`INSERT INTO public.community_reactions VALUES (${lit(uuid(r.id))}, ${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.created_at)});`)
  for (const r of t.community_member_days) out.push(`INSERT INTO public.community_member_days VALUES (${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.day)});`)
  return out.join("\n")
}

async function onPostgres(): Promise<void> {
  console.log("\nparts 271 and 274 on a Postgres")
  if (!PSQL || !PG.host) {
    console.log(`  skipped  ${!PSQL ? "no psql here" : "R37_PG_HOST is not set"}`)
    return
  }
  const db = `r38_${process.pid}`
  try {
    psql("postgres", ["-c", `CREATE DATABASE ${db}`])
  } catch (e) {
    console.log(`  skipped  no Postgres answers at ${PG.host}:${PG.port} (${String((e as Error).message).split("\n")[0]})`)
    return
  }
  try {
    const t = seed()
    psql(db, [], schemaAndRows(t))
    psql(db, ["-1", "-f", "supabase/sql/run-now/271_community_analytics_tracking.sql"])
    for (const r of t.community_member_hours) psql(db, ["-c", `INSERT INTO public.community_member_hours VALUES (${lit(r.community_id)}, ${lit(r.user_id)}, ${lit(r.hour)})`])
    const q = question()
    const ask = (from: number, to: number, grain: string) => {
      const args = { p_community: CID, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_tz: TZ, p_grain: grain, p_detail: false }
      return { got: JSON.parse(psql(db, ["-At", "-c", `select public.community_analytics(${lit(CID)}, ${lit(args.p_from)}, ${lit(args.p_to)}, ${lit(TZ)}, ${lit(grain)}, false)`]).trim()), args }
    }
    const norm = (x: any) => JSON.parse(JSON.stringify(x, (k, v) => (k === "active_hours_since" && v ? new Date(v).toISOString() : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)))
    const spans = [
      ["the week by day", q.start, q.end, "day"],
      ["the week before by day", q.compare!.start, q.compare!.end, "day"],
      ["the year by month", Date.parse("2025-11-01T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z"), "month"],
      ["Oct 25, 25 hours, by the hour", Date.parse("2026-10-24T21:00:00Z"), Date.parse("2026-10-25T22:00:00Z"), "hour"],
    ] as const
    for (const [what, from, to, grain] of spans) {
      const { got, args } = ask(from, to, grain)
      check(`part 271, ${what}: its answer is the reference's for part 271`, same(norm(got), norm(reference(t, args, true))), { got: norm(got), want: norm(reference(t, args, true)) })
    }
    const part = "supabase/sql/run-now/274_community_analytics_accuracy.sql"
    psql(db, ["-1", "-f", part])
    psql(db, ["-1", "-f", part])
    check("part 274 runs, and runs again", true)
    check("community_analytics: not for anon", psql(db, ["-At", "-c", "select has_function_privilege('anon', 'public.community_analytics(uuid,timestamptz,timestamptz,text,text,boolean)', 'EXECUTE')"]).trim() === "f")
    const answers = new Map<string, unknown>()
    for (const [what, from, to, grain] of spans) {
      const { got, args } = ask(from, to, grain)
      check(`part 274, ${what}: its answer is the reference's`, same(norm(got), norm(reference(t, args))), { got: norm(got), want: norm(reference(t, args)) })
      if (grain === "day") answers.set(args.p_from, got)
    }
    const r = await loadCommunityReport(dbOf(t, (a) => ({ ...(answers.get(a.p_from) as object), ...(a.p_detail ? { top_contributors: [], top_spaces: [], cohorts: [], programs: [] } : {}) })), t.communities[0] as any, q, NOW)
    checkWeek(r, "with part 274 answering", "274")
  } finally {
    try {
      psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`])
    } catch {
      /* Left for the next run's name to differ. */
    }
  }
}

async function main() {
  console.log("the week of Oct 19 in Bucharest, every figure against the rows by hand")
  const t = seed()
  const q = question()
  const r = await loadCommunityReport(dbOf(t, (a) => reference(t, a)), t.communities[0] as any, q, NOW)
  checkWeek(r, "part 274", "274")
  checkMoney(r, "part 274")
  check("the week before: nobody left, churn 0 of 7", r.figures.churn.previous === 0, r.figures.churn)

  console.log("\nwith part 271's answer: the figures it gave")
  const r271 = await loadCommunityReport(dbOf(t, (a) => reference(t, a, true)), t.communities[0] as any, q, NOW)
  checkWeek(r271, "part 271", "271")

  console.log("\nbefore part 184: the activity rows themselves")
  const rows = await loadCommunityReport(dbOf(t, null), t.communities[0] as any, q, NOW)
  checkWeek(rows, "the rows", "rows")
  checkMoney(rows, "the rows")

  await onPostgres()

  console.log("\nfive figures in the row")
  const sectionSrc = raw("components/community/creator/analytics-section.tsx")
  const { defaultShown, shownFigures, SHOWN_MAX, FIGURES } = await import("@/lib/communities/analytics-figures")
  check("never more than five", SHOWN_MAX === 5 && shownFigures(FIGURES, null, true, null).length === 5 && shownFigures(FIGURES, ["churn", "joined", "joinRate", "members", "active", "visitors"], true, null).length === 5)
  check("a community that sells: Members, Active members, Visitors, Engagement, Revenue", same(defaultShown(FIGURES, true), ["members", "active", "visitors", "engagement", "revenue"]))
  check("one that sells nothing: Join rate in Revenue's place, in the row's order", same(defaultShown(FIGURES.filter((k) => k !== "revenue"), false), ["members", "active", "visitors", "joinRate", "engagement"]))
  check("before part 184: what there is", same(defaultShown(["members", "joined", "active", "churn"], false), ["members", "joined", "active", "churn"]))
  check("the owner's row, each figure in its place, filled up from the defaults when one is gone", same(shownFigures(FIGURES.filter((k) => k !== "revenue"), ["churn", "active", "visitors", "engagement", "revenue"], false, null), ["churn", "active", "visitors", "engagement", "members"]))
  check("a figure opened from the address stands in the last place", same(shownFigures(FIGURES, null, true, "joined"), ["members", "active", "visitors", "engagement", "joined"]))
  check("kept in this browser, every read and write in a try", /window\.localStorage\.getItem\(SHOWN_KEY\)/.test(sectionSrc) && /window\.localStorage\.setItem\(SHOWN_KEY/.test(sectionSrc))
  check("the others in the /app action list at the row's end, outside the row's scroll", /<ResponsiveActionMenu[\s\S]{0,200}title=\{tt\("Other figures"\)\}/.test(sectionSrc) && /\{hidden\.length \? <FigureMenu/.test(sectionSrc))
  check("the row draws only the five", /\{shown\.map\(\(t\) => \(\s*<MetricTab/.test(sectionSrc))

  console.log("\nthe grey fills")
  const reports = raw("app/(storelib)/app/analytics/analytics-reports.tsx")
  const commerce = raw("app/(storelib)/app/analytics/commerce-reports.tsx")
  check("the fill is the light grey gradient the rows had before round 34, class for class", reports.includes('"bg-[linear-gradient(180deg,#f8f9fb_0%,#eff1f4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(16,24,40,0.045),0_1px_2px_rgba(16,24,40,0.05)]"'))
  check("no violet fill left: no ROW_BAR, no Fill in the accent", !/ROW_BAR|rgba\(139,92,246,0\.10\)/.test(reports) && !/<(Report)?Fill[^>]*ACCENT/.test(reports + commerce))
  /* Changed on purpose (round 39): the top posts are Analytics' own rows (ReportList), so their fill is the rows' GREY_FILL itself. */
  check("the community's top posts use the same fill", /function PostList[\s\S]{0,200}<ReportList/.test(sectionSrc) && /data-fill="grey"/.test(reports))
  check("dark: a graphite step for [data-fill=\"grey\"], never violet", /\[data-fill="grey"\][^{]*\{\s*background-image: linear-gradient\(180deg, #2a2a2f 0%, #242428 100%\) !important;/.test(raw("app/theme-dark.css")))

  console.log("\npart 274")
  const part = raw("supabase/sql/run-now/274_community_analytics_accuracy.sql")
  const lines = part.trimEnd().split("\n")
  check("one statement a line, a comment first and the schema reload last", lines[0].startsWith("/* ") && lines[0].endsWith(" */") && lines[lines.length - 1] === "notify pgrst, 'reload schema';" && lines.slice(1).every((l) => /;$/.test(l)))
  check("safe to run again: the function replaced, nothing created twice", /CREATE OR REPLACE FUNCTION public\.community_analytics\(p_community uuid, p_from timestamptz, p_to timestamptz, p_tz text DEFAULT 'UTC', p_grain text DEFAULT 'day', p_detail boolean DEFAULT false\)/.test(part) && !/CREATE TABLE|CREATE INDEX|DROP /.test(part))
  check("the function: the same arguments, server only", /REVOKE ALL ON FUNCTION public\.community_analytics\(uuid, timestamptz, timestamptz, text, text, boolean\) FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT EXECUTE ON FUNCTION public\.community_analytics\(uuid, timestamptz, timestamptz, text, text, boolean\) TO service_role;/.test(part))
  check("the migration is the same text", raw("supabase/migrations/20270211_community_analytics_accuracy.sql") === part)
  check("listed in the README and checked after", /`274_community_analytics_accuracy\.sql`/.test(raw("supabase/sql/run-now/README.md")) && /as p274_community_analytics_accuracy/.test(raw("supabase/sql/run-now/99_check_after.sql")))
  check("carried into the four files", raw("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 274_community_analytics_accuracy.sql"))

  console.log("\nwords")
  for (const f of ["components/community/creator/analytics-section.tsx", "lib/communities/server/analytics-report.ts", "supabase/sql/run-now/274_community_analytics_accuracy.sql", "scripts/check-community-analytics-round38.mjs"]) {
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
