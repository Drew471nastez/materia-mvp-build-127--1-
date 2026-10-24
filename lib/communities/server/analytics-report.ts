import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S ANALYTICS FOR ANY PERIOD, COUNTED FROM ITS ROWS
 * ===========================================================================
 * What app/api/app/community/<id>/analytics answers for a period the /app
 * date picker chose, in the viewer's time zone, with the period before it
 * (lib/communities/analytics-report.ts has the shape and the shared rules).
 * Every figure is counted from rows; where a figure could not be counted
 * for part of the period, the answer says from when it was.
 *
 * WHERE EACH FIGURE COMES FROM
 *
 *   Joined, left       community_activity (joined, left), the owner's own
 *                      join left out
 *   Churn              members who left and had been members when the
 *                      period began (no join of theirs earlier in it), each
 *                      person once, over the members there were then (part
 *                      274's left_of_start; before it, every leave)
 *   Members            members now, less every join and plus every leave
 *                      after the end of each bucket (membersLine)
 *   Posts, comments,   the posts, comments and reactions made in each
 *   reactions          bucket, whatever became of them since (the nightly
 *                      count's rule), except one the safety check held back
 *                      before anybody saw it (round 37)
 *   Active members     members other than the owner (part 274) with an hour
 *                      in community_member_hours (part 271) in the bucket, so a day is the viewer's day;
 *                      before the hours, a day in community_member_days
 *                      (part 184). Their page's heartbeat or anything they did
 *   Engagement         members who posted, commented or reacted (from those
 *                      rows, part 271), the owner never one of them (part
 *                      274), over the members other than the owner at the
 *                      end of the bucket
 *   Visits             one a visitor a UTC day (part 87), each in the bucket
 *                      of the moment it came: the visit rows for the days
 *                      they are kept, the nightly hours (part 271) before
 *                      that, and before the hours the nightly day counts by
 *                      their noon (visitsOf). A join rate is the joins a
 *                      visitor made themselves (part 271) over visits from
 *                      people who were not members yet
 *   Money              the community's orders (memberships and purchases,
 *                      renewals included, less refunds; a disputed one is no
 *                      sale), programs and single modules sold (one taken
 *                      back by a full refund is no sale), event tickets less
 *                      refunds;
 *                      monthly revenue and subscribers at the end of each
 *                      bucket from the memberships' own dates
 *
 * All of the counting by bucket is community_analytics (SQL parts 184 and
 * 271), one call a period. Before part 184 has run, the joins and leaves
 * are read from community_activity here and the rest from the nightly rows
 * (community_daily_stats), so the screen keeps what it showed before.
 *
 * ROUND 38'S AUDIT, every figure against rows worked out by hand
 * (tests/community-analytics-r38.test.ts): churn counted a member who
 * joined and left inside the period, over members who were not there when
 * it began (it could pass 100%); the owner was an active member and one who
 * took part, so a community where only the owner posted read as engaged;
 * modules sold one by one were no revenue at all, and a program refunded in
 * full stayed revenue; the refunds line counted orders only.
 *
 * WHAT IS NOT COUNTED, ON PURPOSE (round 37's audit): the owner and the
 * store's own account looking at their community; a page drawn ahead of a
 * click (a prefetch) or by a program (a crawler, a link preview, a headless
 * browser); a second visit the same UTC day, whatever the device, for a
 * signed in visitor. Two limits remain, and are said here so nobody reads
 * them as bugs: a visitor on the community's own domain is never signed in
 * there, so they count as a visitor who is not a member yet (and a member
 * signed out on storelib.com too); and the same person signed out on two
 * browsers is two visitors.
 */
import { bucketStarts, bucketIndex, type Grain, type Span } from "@/lib/analytics/buckets"
import { monthlyValue } from "@/lib/memberships/state"
import { lineMoney } from "@/lib/analytics/reports"
import { loadGaStatus, loadTracking } from "@/lib/store/tracking-server"
import { MEMBER_SOURCES } from "../types"
import {
  REPORT_VERSION,
  alignTo,
  bucketKey,
  bucketsOf,
  dayKey,
  lineOf,
  membersLine,
  rate,
  sum,
  type ActivityMetric,
  type CommunityMetric,
  type CommunityReport,
  type Contributor,
  type Figure,
  type GrowthMetric,
  type Line,
  type MoneyMetric,
  type MoneyReport,
  type ReportRow,
  type TrafficReport,
} from "../analytics-report"
import { countVisits, NOT_HELD, TRAFFIC_DIMENSIONS, type TrafficDimension, type VisitRow } from "./analytics"
import { VIEW_DAYS_KEPT } from "./views"
import { joinStats, loadEventMoney } from "./stats"
import { cancellationsWithReasons } from "./membership-lifecycle"
import { missing, reasonOf, type Db } from "./db"

const DAY = 86_400_000
const PAGE = 1000
const MAX_PAGES = 50
/** The longest period counted: All time on a community made in 2020 is still one call. */
export const MAX_SPAN_MS = 800 * DAY

export interface ReportCommunity {
  id: string
  owner_user_id?: string | null
  creator_id?: string | null
  created_at?: string | null
  member_count?: number | null
}

export interface ReportQuestion {
  start: number
  end: number
  /** The period it is compared with, or null for none (All time). */
  compare: Span | null
  timeZone: string
}

type Counts = Record<string, number>

/** What community_analytics answers for one period (SQL part 184). */
interface Counted {
  joined: Counts
  /** Joins a visitor made themselves (part 271), what the join rate divides; null before that part. */
  joinedByVisit: Counts | null
  left: Counts
  /** Leaves by members who were there when the bucket began (part 274); null before that part. */
  leftOfStart: Counts | null
  posts: Counts
  comments: Counts
  reactions: Counts
  rsvps: Counts
  lessons: Counts
  contributors: Counts | null
  active: Counts | null
  /** `leftOfStart`: the members there when the period began who left in it, each once (part 274); null before that part. */
  totals: { contributors: number; posters: number; commenters: number; reactors: number; active: number; courses: number; leftOfStart: number | null } | null
  activeSince: string | null
  topContributors?: { user_id: string; posts: number; comments: number }[]
  topSpaces?: { id: string; name: string; slug: string; posts: number; comments: number }[]
  cohorts?: { month: string; joined: number; stayed: number; active: number }[]
  programs?: { id: string; title: string; started: number; completed: number; percent: number; lessons: number }[]
}

async function headCount(q: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>): Promise<number> {
  try {
    const { count, error } = await q
    if (error) {
      if (!missing(error)) console.error(`[communities] report count: ${reasonOf(error)}`)
      return 0
    }
    return count ?? 0
  } catch (e) {
    console.error(`[communities] report count: ${reasonOf(e)}`)
    return 0
  }
}

const iso = (ms: number) => new Date(ms).toISOString()
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0)
const countsOf = (v: unknown): Counts => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, num(n)])) : {})

/** One period through community_analytics; null before part 184 (or when it fails, said in the log). */
async function counted(db: Db, communityId: string, span: Span, timeZone: string, grain: Grain, detail: boolean): Promise<Counted | null> {
  try {
    const { data, error } = await db.rpc("community_analytics", { p_community: communityId, p_from: iso(span.start), p_to: iso(span.end), p_tz: timeZone, p_grain: grain, p_detail: detail })
    if (error) {
      if (!missing(error)) console.error(`[communities] analytics: ${reasonOf(error)}`)
      return null
    }
    if (!data || typeof data !== "object") return null
    const d = data as Record<string, unknown>
    const t = (d.totals ?? null) as Record<string, unknown> | null
    return {
      joined: countsOf(d.joined),
      joinedByVisit: d.joined_by_visit && typeof d.joined_by_visit === "object" ? countsOf(d.joined_by_visit) : null,
      left: countsOf(d.left),
      leftOfStart: d.left_of_start && typeof d.left_of_start === "object" ? countsOf(d.left_of_start) : null,
      posts: countsOf(d.posts),
      comments: countsOf(d.comments),
      reactions: countsOf(d.reactions),
      rsvps: countsOf(d.rsvps),
      lessons: countsOf(d.lessons),
      contributors: countsOf(d.contributors),
      active: d.active === null || d.active === undefined ? null : countsOf(d.active),
      totals: t ? { contributors: num(t.contributors), posters: num(t.posters), commenters: num(t.commenters), reactors: num(t.reactors), active: num(t.active), courses: num(t.courses), leftOfStart: t.left_of_start === undefined || t.left_of_start === null ? null : num(t.left_of_start) } : null,
      activeSince: typeof d.active_since === "string" ? d.active_since : null,
      topContributors: Array.isArray(d.top_contributors) ? (d.top_contributors as Counted["topContributors"]) : undefined,
      topSpaces: Array.isArray(d.top_spaces) ? (d.top_spaces as Counted["topSpaces"]) : undefined,
      cohorts: Array.isArray(d.cohorts) ? (d.cohorts as Counted["cohorts"]) : undefined,
      programs: Array.isArray(d.programs) ? (d.programs as Counted["programs"]) : undefined,
    }
  } catch (e) {
    console.error(`[communities] analytics: ${reasonOf(e)}`)
    return null
  }
}

/** The UTC days a set of bucket keys covers: from the first day of the first to the last day of the last (no later than today). */
function dayRange(keys: string[], grain: Grain, now: number): { from: string; to: string } {
  const today = iso(now).slice(0, 10)
  const first = keys[0] ?? today
  const last = keys[keys.length - 1] ?? today
  if (grain === "month") {
    const [y, m] = last.split("-").map(Number)
    const end = iso(Date.UTC(y, m, 0)).slice(0, 10)
    return { from: `${first}-01`, to: end < today ? end : today }
  }
  return { from: first.slice(0, 10), to: last.slice(0, 10) < today ? last.slice(0, 10) : today }
}

/* ── Before part 184: the nightly rows ───────────────────────────────── */

type DailyRow = { day: string; members: number; new_members: number; left_members: number; active_members: number; posts: number; comments: number; reactions: number }

/**
 * Joins and leaves by the viewer's buckets, read from the activity rows
 * themselves, with part 274's rule for churn: a leave by somebody with no
 * join earlier in the bucket (or the period) was a member when it began.
 */
async function joinsAndLeaves(db: Db, communityId: string, ownerId: string | null, span: Span, starts: number[]): Promise<{ joined: number[]; left: number[]; leftOfStart: number[]; leftOfStartTotal: number }> {
  const joined = new Array<number>(starts.length).fill(0)
  const left = new Array<number>(starts.length).fill(0)
  const leftOfStart = new Array<number>(starts.length).fill(0)
  /* Who joined so far, by bucket and in the whole period; who already counted as leaving. */
  const joinedIn = new Set<string>()
  const joinedAny = new Set<string>()
  const leftIn = new Set<string>()
  const leftAny = new Set<string>()
  let after: number | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("community_activity").select("id, kind, user_id, created_at").eq("community_id", communityId).in("kind", ["joined", "left"]).gte("created_at", iso(span.start)).lt("created_at", iso(span.end))
    if (after !== null) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) {
      if (!missing(error)) console.error(`[communities] report joins: ${reasonOf(error)}`)
      break
    }
    const rows = ((data as { id: number; kind: string; user_id: string | null; created_at: string }[] | null) ?? []).slice().sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at) || x.id - y.id)
    for (const r of rows) {
      const i = bucketIndex(starts, Date.parse(r.created_at))
      if (i < 0) continue
      if (r.kind === "joined" && r.user_id !== ownerId) {
        joined[i] += 1
        if (r.user_id) {
          joinedIn.add(`${i}:${r.user_id}`)
          joinedAny.add(r.user_id)
        }
      } else if (r.kind === "left") {
        left[i] += 1
        if (r.user_id && !joinedIn.has(`${i}:${r.user_id}`) && !leftIn.has(`${i}:${r.user_id}`)) {
          leftOfStart[i] += 1
          leftIn.add(`${i}:${r.user_id}`)
        }
        if (r.user_id && !joinedAny.has(r.user_id)) leftAny.add(r.user_id)
      }
    }
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return { joined, left, leftOfStart, leftOfStartTotal: leftAny.size }
}

/** The nightly rows in a period's buckets, and today so far from live counts. */
async function fromDailyRows(db: Db, communityId: string, ownerId: string | null, span: Span, grain: Grain, starts: number[], keys: string[], now: number): Promise<Counted> {
  const range = dayRange(keys, grain, now)
  const { data, error } = await db
    .from("community_daily_stats")
    .select("day, members, new_members, left_members, active_members, posts, comments, reactions")
    .eq("community_id", communityId)
    .gte("day", range.from)
    .lte("day", range.to)
    .order("day", { ascending: true })
    .limit(800)
  if (error && !missing(error)) console.error(`[communities] report daily rows: ${reasonOf(error)}`)
  const rows = ((data as DailyRow[] | null) ?? [])
  const add = (into: Counts, k: string | null, v: number) => {
    if (k && keys.includes(k)) into[k] = (into[k] ?? 0) + v
  }
  const posts: Counts = {}
  const comments: Counts = {}
  const reactions: Counts = {}
  const active: Counts = {}
  for (const r of rows) {
    const k = dayKey(r.day, grain)
    add(posts, k, num(r.posts))
    add(comments, k, num(r.comments))
    add(reactions, k, num(r.reactions))
    /* A month's active members is its busiest day: the nightly rows hold no one twice across days. */
    if (k && keys.includes(k)) active[k] = Math.max(active[k] ?? 0, num(r.active_members))
  }
  /* Today, which no nightly row holds yet: counted live and put in the bucket it falls in. */
  const todayStart = Date.parse(`${iso(now).slice(0, 10)}T00:00:00.000Z`)
  if (span.end > todayStart) {
    const from = iso(Math.max(todayStart, span.start))
    const c = (table: string) => db.from(table).select("id", { count: "exact", head: true }).eq("community_id", communityId).gte("created_at", from).lt("created_at", iso(span.end))
    const [p, cm, re] = await Promise.all([headCount(c("community_feed_posts").or(NOT_HELD)), headCount(c("community_feed_comments").or(NOT_HELD)), headCount(c("community_reactions"))])
    const i = bucketIndex(starts, Math.min(now, span.end - 1))
    if (i >= 0) {
      posts[keys[i]] = (posts[keys[i]] ?? 0) + p
      comments[keys[i]] = (comments[keys[i]] ?? 0) + cm
      reactions[keys[i]] = (reactions[keys[i]] ?? 0) + re
    }
  }
  const jl = await joinsAndLeaves(db, communityId, ownerId, span, starts)
  const toCounts = (xs: number[]) => Object.fromEntries(keys.map((k, i) => [k, xs[i]]))
  return { joined: toCounts(jl.joined), joinedByVisit: null, left: toCounts(jl.left), leftOfStart: toCounts(jl.leftOfStart), posts, comments, reactions, rsvps: {}, lessons: {}, contributors: null, active: grain === "hour" ? null : active, totals: { contributors: 0, posters: 0, commenters: 0, reactors: 0, active: 0, courses: 0, leftOfStart: jl.leftOfStartTotal }, activeSince: null }
}

/* ── Visits (parts 87, 184 and 271) ──────────────────────────────────── */

interface Visits {
  counted: boolean
  since: string | null
  visits: number[]
  prospects: number[]
  traffic: Record<TrafficDimension, Counts>
  /** False for an hour chart of days counted only by day (before part 271, older than the days the visit rows are kept): the hours have no line. */
  hourly?: boolean
}

const emptyTraffic = (): Record<TrafficDimension, Counts> => ({ source: {}, referrer: {}, device: {}, country: {} })

/**
 * A PERIOD'S VISITS BY BUCKET, IN THE VIEWER'S OWN HOURS (round 37). Each
 * visit is one row a visitor a UTC day (part 87), kept VIEW_DAYS_KEPT days
 * with the moment it came. Three sources, each for the days it is exact for:
 *
 *   the visit rows      every UTC day from VIEW_DAYS_KEPT days ago: each
 *                       visit goes in the bucket its own moment falls in
 *   the hours (271)     older days, from the first day the nightly count
 *                       kept them: each hour's visitors in the bucket that
 *                       hour falls in, so a day starts at midnight where the
 *                       viewer is, not in London
 *   the day counts      older days from before part 271: the whole UTC day
 *                       in the bucket its noon falls in (an hour chart of
 *                       such a day has no line, only its total)
 *
 * Where visitors came from (sources, sites, devices, countries) is kept by
 * the UTC day for older days and placed by the same noon rule.
 */
async function visitsOf(db: Db, communityId: string, span: Span, grain: Grain, starts: number[], keys: string[], now: number): Promise<Visits> {
  const out: Visits = { counted: false, since: null, visits: new Array(keys.length).fill(0), prospects: new Array(keys.length).fill(0), traffic: emptyTraffic() }
  const today = iso(now).slice(0, 10)
  const fromDay = iso(span.start).slice(0, 10)
  const toDay = iso(Math.min(span.end, now + 1) - 1).slice(0, 10)
  /* From this UTC day on, every visit row is still there (the cron deletes the days before it). */
  const keptFrom = iso(now - VIEW_DAYS_KEPT * DAY).slice(0, 10)
  const keptStart = Date.parse(`${keptFrom}T00:00:00.000Z`)
  const { data: dayRows, error } = await db
    .from("community_daily_stats")
    .select("day, visitors, prospects")
    .eq("community_id", communityId)
    .gte("day", fromDay)
    .lte("day", toDay)
    .not("visitors", "is", null)
    .order("day", { ascending: true })
    .limit(800)
  if (error) {
    if (!missing(error)) console.error(`[communities] report visits: ${reasonOf(error)}`)
    return out
  }
  out.counted = true
  const counted = new Set<string>()
  const add = (i: number, v: number, p: number) => {
    if (i < 0 || i >= keys.length) return
    out.visits[i] += v
    out.prospects[i] += p
  }
  /* A whole UTC day's count goes where its noon falls. */
  const noon = (day: string) => {
    const t = Date.parse(`${day.slice(0, 10)}T12:00:00.000Z`)
    return t >= span.start && t < span.end ? t : null
  }

  /* The first UTC day the hours hold whole (part 271); null before that part, or before its first night. */
  let hoursFrom: string | null = null
  const first = await db.from("community_visit_hours").select("hour").eq("community_id", communityId).order("hour", { ascending: true }).limit(1)
  if (!first.error) {
    const h = (first.data as { hour: string }[] | null)?.[0]?.hour
    if (h) hoursFrom = iso(Date.parse(h)).slice(0, 10)
  } else if (!missing(first.error)) console.error(`[communities] report visit hours: ${reasonOf(first.error)}`)
  const byHours = (day: string) => hoursFrom !== null && day >= hoursFrom
  let byDayOnly = false

  for (const r of (dayRows as { day: string; visitors: number; prospects: number | null }[] | null) ?? []) {
    const d = r.day.slice(0, 10)
    counted.add(d)
    if (d >= keptFrom || byHours(d)) continue
    if (grain === "hour") {
      /* An hour chart of a day counted only by day: its total, no line. */
      byDayOnly = true
      add(0, num(r.visitors), num(r.prospects))
      continue
    }
    const t = noon(d)
    if (t !== null) add(bucketIndex(starts, t), num(r.visitors), num(r.prospects))
  }

  /* Older days the hours hold: each hour where it falls in the viewer's day. */
  if (hoursFrom !== null) {
    const from = Math.max(span.start, Date.parse(`${hoursFrom}T00:00:00.000Z`))
    const to = Math.min(span.end, keptStart)
    for (let page = 0; from < to && page < 20; page++) {
      const { data, error: e } = await db
        .from("community_visit_hours")
        .select("hour, visitors, prospects")
        .eq("community_id", communityId)
        .gte("hour", iso(from))
        .lt("hour", iso(to))
        .order("hour", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (e) {
        if (!missing(e)) console.error(`[communities] report visit hours: ${reasonOf(e)}`)
        break
      }
      const got = (data as { hour: string; visitors: number; prospects: number }[] | null) ?? []
      for (const h of got) add(bucketIndex(starts, Date.parse(h.hour)), num(h.visitors), num(h.prospects))
      if (got.length < PAGE) break
    }
  }

  /* Where older days' visitors came from: kept by the UTC day, placed by its noon. */
  const oldTo = keptFrom > fromDay ? iso(keptStart - DAY).slice(0, 10) : null
  if (oldTo !== null && counted.size) {
    const lines: { day: string; dimension: TrafficDimension; key: string; visitors: number }[] = []
    for (let page = 0; page < 20; page++) {
      const { data, error: e } = await db
        .from("community_daily_traffic")
        .select("day, dimension, key, visitors")
        .eq("community_id", communityId)
        .gte("day", fromDay)
        .lte("day", oldTo < toDay ? oldTo : toDay)
        .order("day", { ascending: true })
        .order("dimension", { ascending: true })
        .order("key", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (e) break
      const got = (data as typeof lines | null) ?? []
      lines.push(...got)
      if (got.length < PAGE) break
    }
    for (const l of lines) {
      if ((grain !== "hour" && noon(l.day) === null) || !TRAFFIC_DIMENSIONS.includes(l.dimension)) continue
      out.traffic[l.dimension][l.key] = (out.traffic[l.dimension][l.key] ?? 0) + num(l.visitors)
    }
  }

  /* The last VIEW_DAYS_KEPT days: the visit rows themselves, each in the bucket of the moment it came. */
  const liveFrom = Math.max(span.start, keptStart)
  if (span.end > liveFrom) {
    const rows: (VisitRow & { day: string; created_at: string })[] = []
    for (let page = 0; page < 20; page++) {
      const { data, error: e } = await db
        .from("community_view_days")
        .select("day, created_at, source, referrer, device, country, member")
        .eq("community_id", communityId)
        .gte("day", keptFrom)
        .gte("created_at", iso(liveFrom))
        .lt("created_at", iso(span.end))
        .order("created_at", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (e) {
        if (!missing(e)) console.error(`[communities] report live visits: ${reasonOf(e)}`)
        break
      }
      const got = (data as typeof rows | null) ?? []
      rows.push(...got)
      if (got.length < PAGE) break
    }
    const inside: typeof rows = []
    for (const r of rows) {
      const i = bucketIndex(starts, Date.parse(r.created_at))
      if (i < 0 || i >= keys.length) continue
      inside.push(r)
      add(i, 1, r.member === true ? 0 : 1)
      counted.add(r.day.slice(0, 10))
    }
    const t = countVisits(inside)
    for (const d of TRAFFIC_DIMENSIONS) for (const [k, v] of Object.entries(t.counts[d])) out.traffic[d][k] = (out.traffic[d][k] ?? 0) + v
  }
  if (byDayOnly) out.hourly = false
  /*
    COUNTING BEGAN INSIDE THIS PERIOD: say from when, so the days before it
    are not read as nobody. The nightly count writes every day once it has
    begun, a quiet day as 0, so the first day it holds is when counting
    began; with nothing in the period at all, the first day it ever wrote
    says whether that is "nobody came" or "not counted yet".
  */
  let since = counted.size ? [...counted].sort()[0] : null
  if (!since) {
    const { data: earliest } = await db.from("community_daily_stats").select("day").eq("community_id", communityId).not("visitors", "is", null).order("day", { ascending: true }).limit(1)
    since = (earliest as { day: string }[] | null)?.[0]?.day?.slice(0, 10) ?? today
  }
  out.since = since > fromDay ? since : null
  return out
}

function trafficRows(cur: Record<TrafficDimension, Counts>, prev: Record<TrafficDimension, Counts> | null): TrafficReport {
  const rows = (d: TrafficDimension): ReportRow[] =>
    Object.entries(cur[d])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([key, value]) => ({ key, label: key, value, ...(prev ? { previous: prev[d][key] ?? 0 } : {}) }))
  return { source: rows("source"), referrer: rows("referrer"), device: rows("device"), country: rows("country") }
}

/* ── Money ───────────────────────────────────────────────────────────── */

type MembershipRow = { id: string; buyer_id: string | null; product_id?: string | null; status: string; billing_interval: string; amount_cents: number; currency: string | null; created_at: string; started_at: string | null; canceled_at: string | null; ended_at: string | null; trial_end: string | null }

async function pages<T extends { id: string | number }>(ask: (after: string | number | null) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>, what: string): Promise<T[] | null> {
  const out: T[] = []
  let after: string | number | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await ask(after)
    if (error) {
      if (missing(error)) return out.length ? out : null
      console.error(`[communities] report ${what}: ${reasonOf(error)}`)
      return out
    }
    const rows = (data as T[] | null) ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return out
}

/**
 * The products that sell this community: its paid tiers (recurring or once) and the products made for it, with the
 * name each is sold under (round 39, Revenue by plan): the tier's own name, else the product's title.
 */
async function sellingProducts(db: Db, communityId: string): Promise<{ all: string[]; recurring: string[]; names: Map<string, string> }> {
  const [tiers, made] = await Promise.all([
    db.from("community_tiers").select("product_id, billing, name").eq("community_id", communityId).eq("kind", "paid").limit(50),
    db.from("products").select("id, type, title").eq("community_id", communityId).limit(200),
  ])
  const t = ((tiers.data as { product_id: string | null; billing: string | null; name?: string | null }[] | null) ?? []).filter((x) => x.product_id)
  const m = (made.error ? [] : (made.data as { id: string; type: string | null; title?: string | null }[] | null) ?? [])
  const all = [...new Set([...t.map((x) => x.product_id as string), ...m.map((x) => x.id)])]
  const recurring = [...new Set([...t.filter((x) => x.billing === "recurring").map((x) => x.product_id as string), ...m.filter((x) => x.type === "membership").map((x) => x.id)])]
  const names = new Map<string, string>()
  for (const x of m) if (x.title?.trim()) names.set(x.id, x.title.trim())
  for (const x of t) if (x.name?.trim()) names.set(x.product_id as string, x.name.trim())
  return { all, recurring, names }
}

/** Paying at a moment: started, not ended, out of any trial. */
function payingAt(m: MembershipRow, t: number): boolean {
  if (m.status === "incomplete") return false
  const started = Date.parse(m.started_at ?? m.created_at)
  if (!(started <= t)) return false
  const ended = m.ended_at ? Date.parse(m.ended_at) : m.status === "canceled" || m.status === "expired" ? Date.parse(m.canceled_at ?? m.created_at) : Infinity
  if (ended <= t) return false
  if (m.trial_end && Date.parse(m.trial_end) > t) return false
  return true
}

const monthly = (m: MembershipRow) => monthlyValue({ status: "active", billing_interval: m.billing_interval, amount_cents: m.amount_cents })

interface MoneyWindow {
  revenue: number[]
  mrr: number[]
  subscribers: number[]
  newPaid: number[]
  cancellations: number[]
  bySource: { memberships: number; programs: number; tickets: number }
  /** Round 39: each product's net from its orders in the period, and who pays for it at the period's end. */
  byPlan: Map<string, { cents: number; paying: number }>
  upgradesOf: MembershipRow[]
  payingAtStart: number
}

/** A program or a single module sold (parts 102 and 217): its row is marked revoked when the payment is refunded in full. */
type ContentSale = { created_at: string; amount_cents: number | null; currency: string | null; revoked_at?: string | null }

function moneyWindow(span: Span, starts: number[], members: MembershipRow[], orders: { created_at: string; amount_cents: number | null; refund_amount_cents: number | null; status: string; product_id?: string | null }[], programs: ContentSale[], tickets: { paid_at: string; amount_cents: number | null; refunded_at: string | null }[]): MoneyWindow {
  const n = starts.length
  const w: MoneyWindow = { revenue: new Array(n).fill(0), mrr: new Array(n).fill(0), subscribers: new Array(n).fill(0), newPaid: new Array(n).fill(0), cancellations: new Array(n).fill(0), bySource: { memberships: 0, programs: 0, tickets: 0 }, byPlan: new Map(), upgradesOf: [], payingAtStart: 0 }
  const plan = (id: string | null | undefined) => {
    if (!id) return null
    let x = w.byPlan.get(id)
    if (!x) w.byPlan.set(id, (x = { cents: 0, paying: 0 }))
    return x
  }
  const inSpan = (at: number) => at >= span.start && at < span.end
  const at = (iso: string) => {
    const t = Date.parse(iso)
    return inSpan(t) ? bucketIndex(starts, t) : -1
  }
  for (const o of orders) {
    const i = at(o.created_at)
    if (i < 0) continue
    const net = lineMoney(o as never).net
    w.revenue[i] += net
    w.bySource.memberships += net
    const p = plan(o.product_id)
    if (p) p.cents += net
  }
  for (const p of programs) {
    const i = at(p.created_at)
    /* Taken back by a full refund (learn-checkout, module-sales revokeRefunded*): no sale, as a refunded ticket. */
    if (i < 0 || p.revoked_at) continue
    const cents = Math.max(0, num(p.amount_cents))
    w.revenue[i] += cents
    w.bySource.programs += cents
  }
  for (const t of tickets) {
    const i = at(t.paid_at)
    if (i < 0 || t.refunded_at) continue
    const cents = Math.max(0, num(t.amount_cents))
    w.revenue[i] += cents
    w.bySource.tickets += cents
  }
  /* Levels at the end of each bucket (now, for one still running); flows in the bucket they happened in. */
  const ends = starts.map((s, i) => Math.min(i + 1 < n ? starts[i + 1] : span.end, span.end) - 1)
  for (const m of members) {
    for (let i = 0; i < n; i++) {
      if (payingAt(m, ends[i])) {
        w.subscribers[i] += 1
        w.mrr[i] += monthly(m)
      }
    }
    if (payingAt(m, span.start - 1)) w.payingAtStart += 1
    if (n > 0 && payingAt(m, ends[n - 1])) {
      const p = plan(m.product_id)
      if (p) p.paying += 1
    }
    if (m.status !== "incomplete") {
      const s = at(m.started_at ?? m.created_at)
      if (s >= 0) {
        w.newPaid[s] += 1
        w.upgradesOf.push(m)
      }
    }
    if (m.canceled_at) {
      const c = at(m.canceled_at)
      if (c >= 0) w.cancellations[c] += 1
    }
  }
  return w
}

async function moneyOf(db: Db, communityId: string, cur: { span: Span; starts: number[] }, prev: { span: Span; starts: number[] } | null): Promise<MoneyReport | null> {
  const products = await sellingProducts(db, communityId)
  const from = iso(Math.min(cur.span.start, prev?.span.start ?? cur.span.start))
  const to = iso(cur.span.end)
  const [members, orders, programs, tickets, refunds, why] = await Promise.all([
    products.recurring.length
      ? pages<MembershipRow>((after) => {
          let q = db.from("memberships").select("id, buyer_id, product_id, status, billing_interval, amount_cents, currency, created_at, started_at, canceled_at, ended_at, trial_end").in("product_id", products.recurring)
          if (after !== null) q = q.gt("id", after)
          return q.order("id", { ascending: true }).limit(PAGE)
        }, "memberships")
      : Promise.resolve([] as MembershipRow[]),
    products.all.length
      ? pages<{ id: string; created_at: string; amount_cents: number | null; refund_amount_cents: number | null; status: string; currency: string | null; product_id?: string | null }>((after) => {
          let q = db.from("orders").select("id, product_id, created_at, amount_cents, refund_amount_cents, status, currency").in("product_id", products.all).in("status", ["completed", "refunded"]).gte("created_at", from).lt("created_at", to)
          if (after !== null) q = q.gt("id", after)
          return q.order("id", { ascending: true }).limit(PAGE)
        }, "orders")
      : Promise.resolve([]),
    /*
      Programs sold on their own (part 102) and single modules of a program
      (part 217, round 38: they were never counted): one row per buyer and
      program or module, few enough to read in one go. A row taken back by a
      full refund carries revoked_at.
    */
    (async () => {
      const sold = async (table: string) => {
        const { data, error } = await db.from(table).select("created_at, amount_cents, currency, revoked_at").eq("community_id", communityId).eq("source", "purchase").gte("created_at", from).lt("created_at", to).limit(10_000)
        if (error) {
          if (!missing(error)) console.error(`[communities] report ${table}: ${reasonOf(error)}`)
          return null
        }
        return (data as ContentSale[] | null) ?? []
      }
      const [programRows, moduleRows] = await Promise.all([sold("community_program_access"), sold("community_module_access")])
      return programRows === null && moduleRows === null ? null : [...(programRows ?? []), ...(moduleRows ?? [])]
    })(),
    pages<{ id: string; paid_at: string; amount_cents: number | null; refunded_at: string | null; currency: string | null }>((after) => {
      let q = db.from("community_event_tickets").select("id, paid_at, amount_cents, refunded_at, currency").eq("community_id", communityId).eq("source", "purchase").gte("paid_at", from).lt("paid_at", to)
      if (after !== null) q = q.gt("id", after)
      return q.order("id", { ascending: true }).limit(PAGE)
    }, "tickets"),
    products.all.length
      ? pages<{ id: string; amount_cents: number | null; refund_amount_cents: number | null; status: string; refunded_at: string | null }>((after) => {
          let q = db.from("orders").select("id, amount_cents, refund_amount_cents, status, refunded_at").in("product_id", products.all).eq("status", "refunded").gte("refunded_at", iso(cur.span.start)).lt("refunded_at", to)
          if (after !== null) q = q.gt("id", after)
          return q.order("id", { ascending: true }).limit(PAGE)
        }, "refunds")
      : Promise.resolve([]),
    cancellationsWithReasons(db, communityId, { since: iso(cur.span.start), until: to, limit: 5 }).catch(() => null),
  ])
  /*
    THE REFUNDS LINE COUNTS EVERY PAYMENT GIVEN BACK IN THE PERIOD (round
    38): orders, as before, and now event tickets, programs and modules,
    each by when it was given back.
  */
  const [ticketRefunds, contentRefunds] = await Promise.all([
    (async () => {
      const { data, error } = await db.from("community_event_tickets").select("amount_cents").eq("community_id", communityId).eq("source", "purchase").gte("refunded_at", iso(cur.span.start)).lt("refunded_at", to).limit(10_000)
      return error ? [] : ((data as { amount_cents: number | null }[] | null) ?? [])
    })(),
    (async () => {
      const back = async (table: string) => {
        const { data, error } = await db.from(table).select("amount_cents").eq("community_id", communityId).eq("source", "purchase").gte("revoked_at", iso(cur.span.start)).lt("revoked_at", to).limit(10_000)
        return error ? [] : ((data as { amount_cents: number | null }[] | null) ?? [])
      }
      const [a, b] = await Promise.all([back("community_program_access"), back("community_module_access")])
      return [...a, ...b]
    })(),
  ])
  const otherRefunds = [...ticketRefunds, ...contentRefunds]
  const soldAnything = products.all.length > 0 || (programs?.length ?? 0) > 0 || (tickets?.length ?? 0) > 0
  if (!soldAnything) return null
  const ms = members ?? []
  const c = moneyWindow(cur.span, cur.starts, ms, orders ?? [], programs ?? [], tickets ?? [])
  const p = prev ? moneyWindow(prev.span, prev.starts, ms, orders ?? [], programs ?? [], tickets ?? []) : null
  const n = cur.starts.length
  const line = (k: keyof Pick<MoneyWindow, "revenue" | "mrr" | "subscribers" | "newPaid" | "cancellations">): Line => ({ current: c[k], previous: p ? alignTo(p[k], n) : null })
  const last = (xs: number[]) => (xs.length ? xs[xs.length - 1] : 0)
  const fig = (k: MoneyMetric, level: boolean): Figure => {
    const cur = level ? last(c[k]) : sum(c[k])
    const before = p ? (level ? last(p[k]) : sum(p[k])) : null
    return { value: cur, previous: before }
  }
  /* Upgrades: members who were in for free before they started paying (ten minutes is a checkout, not a free membership). */
  let upgrades = 0
  const buyers = [...new Set(c.upgradesOf.map((m) => m.buyer_id).filter((v): v is string => !!v))]
  for (let i = 0; i < buyers.length; i += 200) {
    const { data } = await db.from("community_members").select("user_id, joined_at").eq("community_id", communityId).in("user_id", buyers.slice(i, i + 200))
    const joined = new Map(((data as { user_id: string; joined_at: string | null }[] | null) ?? []).map((r) => [r.user_id, r.joined_at]))
    for (const m of c.upgradesOf) {
      const j = m.buyer_id ? joined.get(m.buyer_id) : null
      if (j && Date.parse(j) < Date.parse(m.started_at ?? m.created_at) - 10 * 60_000) upgrades += 1
    }
  }
  const currency = (ms.find((m) => m.currency)?.currency ?? orders?.find((o) => o.currency)?.currency ?? programs?.find((o) => o.currency)?.currency ?? tickets?.find((o) => o.currency)?.currency ?? "usd").toLowerCase()
  const cancelled = sum(c.cancellations)
  return {
    currency,
    figures: { revenue: fig("revenue", false), mrr: fig("mrr", true), subscribers: fig("subscribers", true), newPaid: fig("newPaid", false), cancellations: fig("cancellations", false) },
    lines: { revenue: line("revenue"), mrr: line("mrr"), subscribers: line("subscribers"), newPaid: line("newPaid"), cancellations: line("cancellations") },
    upgrades,
    churnRate: rate(cancelled, c.payingAtStart),
    refunds: { count: (refunds?.length ?? 0) + otherRefunds.length, totalCents: (refunds ?? []).reduce((t, o) => t + lineMoney({ ...o, status: "refunded" } as never).refunded, 0) + otherRefunds.reduce((t, x) => t + Math.max(0, num(x.amount_cents)), 0) },
    bySource: (["memberships", "programs", "tickets"] as const).map((key) => ({ key, cents: c.bySource[key] })).filter((x) => x.cents > 0),
    /*
      REVENUE BY PLAN (round 39): each tier or product that sells the community, by the name it is sold under, with its
      net from this period's orders (refunds taken off, as in Revenue) and the members paying for it at the period's
      end. Programs, modules and tickets are not plans: they stay in By source.
    */
    byPlan: [...c.byPlan]
      .filter(([, x]) => x.cents !== 0 || x.paying > 0)
      .map(([key, x]) => ({ key, label: products.names.get(key) ?? "", cents: x.cents, paying: x.paying, ...(p ? { previous: p.byPlan.get(key)?.cents ?? 0 } : {}) }))
      .sort((a, b) => b.cents - a.cents || b.paying - a.paying || a.label.localeCompare(b.label)),
    reasons: (why?.counts ?? []).filter((x) => x.count > 0).map((x) => ({ reason: x.reason ?? "none", count: x.count })).sort((a, b) => b.count - a.count),
  }
}

/* ── The lists ───────────────────────────────────────────────────────── */

async function topPostsOf(db: Db, communityId: string, span: Span): Promise<CommunityReport["topPosts"]> {
  const { data, error } = await db
    .from("community_feed_posts")
    .select("id, title, body_text, reaction_count, comment_count")
    .eq("community_id", communityId)
    .eq("status", "published")
    .gte("created_at", iso(span.start))
    .lt("created_at", iso(span.end))
    .order("reaction_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(25)
  if (error) return []
  return ((data as { id: string; title: string | null; body_text: string | null; reaction_count: number; comment_count: number }[] | null) ?? [])
    .filter((p) => p.reaction_count > 0 || p.comment_count > 0)
    .sort((a, b) => b.reaction_count + b.comment_count - (a.reaction_count + a.comment_count))
    .slice(0, 10)
    .map((p) => ({ id: p.id, title: (p.title || "").trim() || (p.body_text || "").trim().slice(0, 90) || "Post", reactions: p.reaction_count, comments: p.comment_count }))
}

async function contributorsOf(db: Db, rows: NonNullable<Counted["topContributors"]>): Promise<Contributor[]> {
  if (!rows.length) return []
  const { data } = await db.from("profiles").select("id, display_name, username, avatar_url").in("id", rows.map((r) => r.user_id))
  const who = new Map(((data as { id: string; display_name: string | null; username: string | null; avatar_url: string | null }[] | null) ?? []).map((p) => [p.id, p]))
  return rows.map((r) => {
    const p = who.get(r.user_id)
    return { userId: r.user_id, name: (p?.display_name || "").trim() || (p?.username ? `@${p.username}` : "A member"), avatarUrl: p?.avatar_url ?? null, posts: num(r.posts), comments: num(r.comments) }
  })
}

async function eventsOf(db: Db, communityId: string, span: Span): Promise<CommunityReport["events"]> {
  const { data, error } = await db
    .from("community_events")
    .select("id, title, starts_at, going_count, status")
    .eq("community_id", communityId)
    .neq("status", "cancelled")
    .gte("starts_at", iso(span.start))
    .lt("starts_at", iso(span.end))
    .order("starts_at", { ascending: false })
    .limit(12)
  if (error) return []
  const rows = (data as { id: string; title: string; starts_at: string; going_count: number }[] | null) ?? []
  if (!rows.length) return []
  const sold = new Map<string, number>()
  const arrived = new Map<string, number>()
  const { data: tickets, error: te } = await db.from("community_event_tickets").select("event_id, attended_at").in("event_id", rows.map((r) => r.id)).eq("status", "paid").limit(5000)
  if (!te) {
    for (const t of (tickets as { event_id: string; attended_at: string | null }[] | null) ?? []) {
      sold.set(t.event_id, (sold.get(t.event_id) ?? 0) + 1)
      if (t.attended_at) arrived.set(t.event_id, (arrived.get(t.event_id) ?? 0) + 1)
    }
  }
  return rows.map((r) => ({ id: r.id, title: r.title, startsAt: r.starts_at, going: num(r.going_count), checkedIn: sold.has(r.id) ? arrived.get(r.id) ?? 0 : null }))
}

async function gaOf(db: Db, creatorId: string | null | undefined): Promise<CommunityReport["ga"]> {
  if (!creatorId) return { id: null, seenAt: null }
  try {
    const { tracking } = await loadTracking(db, creatorId)
    if (!tracking.ga4) return { id: null, seenAt: null }
    const status = await loadGaStatus(db, creatorId, tracking.ga4)
    return { id: tracking.ga4, seenAt: status.seenAt }
  } catch {
    return { id: null, seenAt: null }
  }
}

/* ── New and returning, and why members left (round 33) ──────────────── */

/**
 * Of the members active in the period, how many joined inside it: the
 * period's joins (never the owner's) that also have a member day in it
 * (community_member_days, read for those members only, by the same first
 * and last day community_analytics reads). The rest of the active members
 * joined before the period: returning.
 */
async function newActiveOf(db: Db, communityId: string, ownerId: string | null, span: Span, timeZone: string): Promise<number | null> {
  const joiners = new Set<string>()
  let after: number | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("community_activity").select("id, user_id").eq("community_id", communityId).eq("kind", "joined").gte("created_at", iso(span.start)).lt("created_at", iso(span.end))
    if (after !== null) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) return null
    const rows = (data as { id: number; user_id: string | null }[] | null) ?? []
    for (const r of rows) if (r.user_id && r.user_id !== ownerId) joiners.add(r.user_id)
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  if (!joiners.size) return 0
  const first = bucketKey(span.start, "day", timeZone)
  const last = bucketKey(span.end - 1, "day", timeZone)
  const ids = [...joiners]
  const here = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("community_member_days").select("user_id").eq("community_id", communityId).in("user_id", ids.slice(i, i + 200)).gte("day", first).lte("day", last).limit(20_000)
    if (error) return null
    for (const r of (data as { user_id: string }[] | null) ?? []) here.add(r.user_id)
  }
  return here.size
}

/** Why members said they left in the period (community_leave_reasons, part 98), most first; null before that part. */
async function leaveReasonsOf(db: Db, communityId: string, span: Span): Promise<{ reason: string; count: number }[] | null> {
  try {
    const { data, error } = await db.from("community_leave_reasons").select("reason").eq("community_id", communityId).gte("created_at", iso(span.start)).lt("created_at", iso(span.end)).limit(10_000)
    if (error) {
      if (!missing(error)) console.error(`[communities] report leave reasons: ${reasonOf(error)}`)
      return null
    }
    const counts = new Map<string, number>()
    for (const r of (data as { reason: string | null }[] | null) ?? []) counts.set(r.reason || "none", (counts.get(r.reason || "none") ?? 0) + 1)
    return [...counts].map(([reason, count]) => ({ reason, count })).sort((x, y) => y.count - x.count || x.reason.localeCompare(y.reason))
  } catch (e) {
    console.error(`[communities] report leave reasons: ${reasonOf(e)}`)
    return null
  }
}

/* ── The answer ──────────────────────────────────────────────────────── */

/** The first day a bucket key covers: "2026-10" is "2026-10-01", "2026-10-15T09" is "2026-10-15". */
function firstDayOf(key: string): string {
  return key.length === 7 ? `${key}-01` : key.slice(0, 10)
}

/** The day counting began, when it began after the period's first day; null when the whole period was counted. */
export function sinceInside(firstCounted: string, periodFirstDay: string): string | null {
  return firstCounted.slice(0, 10) > periodFirstDay ? firstCounted.slice(0, 10) : null
}

const SOURCES = MEMBER_SOURCES.filter((s) => s !== "owner")

export async function loadCommunityReport(db: Db, community: ReportCommunity, q: ReportQuestion, now: number = Date.now()): Promise<CommunityReport> {
  const span: Span = { start: q.start, end: Math.max(q.end, q.start + 1) }
  const tz = q.timeZone
  const cur = bucketsOf(span, tz)
  const grain = cur.grain
  const prevSpan = q.compare && q.compare.end > q.compare.start ? q.compare : null
  const prev = prevSpan ? { grain, starts: bucketStarts(prevSpan, grain, tz) } : null
  const prevKeys = prev ? bucketsOf(prevSpan as Span, tz, grain).keys : null
  const id = community.id
  const owner = community.owner_user_id ?? null
  const n = cur.keys.length

  /* Here lately: members, never the owner (round 38), as the active members of the chart. */
  const activeSince = (days: number) => headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", id).eq("status", "active").neq("role", "owner").or(`last_seen_at.gte.${iso(now - days * DAY)},last_active_at.gte.${iso(now - days * DAY)}`))
  const after = (kind: "joined" | "left", from: number) => {
    let x = db.from("community_activity").select("id", { count: "exact", head: true }).eq("community_id", id).eq("kind", kind).gte("created_at", iso(from))
    if (kind === "joined" && owner) x = x.neq("user_id", owner)
    return headCount(x)
  }
  const [a, b, membersNow, ownerMembers, active1, active7, active30, joinedAfter, leftAfter, joinedAfterPrev, leftAfterPrev] = await Promise.all([
    counted(db, id, span, tz, grain, true),
    prevSpan ? counted(db, id, prevSpan, tz, grain, false) : Promise.resolve(null),
    headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", id).eq("status", "active")),
    /* Whether the owner is one of the members counted (a member row of their own): left out of what engagement divides. */
    headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", id).eq("status", "active").eq("role", "owner")),
    activeSince(1),
    activeSince(7),
    activeSince(30),
    after("joined", span.end),
    after("left", span.end),
    prevSpan ? after("joined", prevSpan.end) : Promise.resolve(0),
    prevSpan ? after("left", prevSpan.end) : Promise.resolve(0),
  ])
  const ready = a !== null
  const [ca, cb] = ready
    ? [a, b]
    : await Promise.all([fromDailyRows(db, id, owner, span, grain, cur.starts, cur.keys, now), prev && prevSpan && prevKeys ? fromDailyRows(db, id, owner, prevSpan, grain, prev.starts, prevKeys, now) : Promise.resolve(null)])

  const lineFor = (pick: (c: Counted) => Counts | null): { cur: number[]; prev: number[] | null } => ({
    cur: lineOf(cur.keys, ca ? pick(ca) : null),
    prev: cb && prevKeys ? lineOf(prevKeys, pick(cb)) : null,
  })
  const joined = lineFor((c) => c.joined)
  /* What the join rate divides (part 271): the joins a visitor made themselves, never one the team, Storelib or a product made. Before that part, every join. */
  const visitJoins = ca?.joinedByVisit ? lineFor((c) => c.joinedByVisit ?? c.joined) : joined
  const left = lineFor((c) => c.left)
  const members = { cur: membersLine(membersNow, joined.cur, left.cur, joinedAfter, leftAfter), prev: joined.prev && left.prev ? membersLine(membersNow, joined.prev, left.prev, joinedAfterPrev, leftAfterPrev) : null }
  const posts = lineFor((c) => c.posts)
  const comments = lineFor((c) => c.comments)
  const reactions = lineFor((c) => c.reactions)
  const activeLine = lineFor((c) => c.active)
  const contributors = lineFor((c) => c.contributors)
  const rsvps = lineFor((c) => c.rsvps)
  const lessons = lineFor((c) => c.lessons)
  /* Members when each bucket began: its end, less who joined in it, plus who left in it. */
  const startsOf = (m: number[], j: number[], l: number[]) => m.map((x, i) => x - (j[i] ?? 0) + (l[i] ?? 0))
  /*
    CHURN IS OF THE MEMBERS AT THE START (round 38): who left and had been a
    member when the bucket began, over the members there were then. Someone
    who joined and left inside it is in neither (part 274; the fallback
    counts the same from the rows). Without part 274, every leave, as before.
  */
  const leftOfStart = lineFor((c) => c.leftOfStart ?? c.left)
  const churnLine = (m: number[], j: number[], l: number[], ls: number[]) => startsOf(m, j, l).map((s, i) => rate(ls[i] ?? 0, s))
  const leftOfStartTotal = (c: Counted | null, l: number[] | null) => (c?.totals?.leftOfStart ?? (l ? sum(l) : 0))

  const [visitsCur, visitsPrev] = await Promise.all([visitsOf(db, id, span, grain, cur.starts, cur.keys, now), prev && prevSpan && prevKeys ? visitsOf(db, id, prevSpan, grain, prev.starts, prevKeys, now) : Promise.resolve(null)])

  /*
    THE OWNER IS NOT ONE OF THE MEMBERS WHO TOOK PART (part 274), so they are
    not one of the members it divides by either. With part 271 alone the
    owner is still counted among those who took part, and in what it divides.
  */
  const ownerOut = ready && ca?.leftOfStart !== null && ca?.leftOfStart !== undefined ? Math.min(1, ownerMembers) : 0
  const others = (m: number | null | undefined) => (m === null || m === undefined ? m : Math.max(0, m - ownerOut))
  const engagementLine = (c: number[], m: number[]) => c.map((x, i) => rate(x, others(m[i])))
  const activeCounted = ready ? ca?.active !== null : grain !== "hour"
  const activeFigure = ready || grain !== "hour"
  /*
    A PERIOD BEFORE THAT WAS NOT COUNTED WHOLE IS NOT A COMPARISON. Visits
    and member days began with part 184; a period before that began reads
    as nothing to compare with (no percentage), never as zero, which would
    read as growth from nobody.
  */
  const prevVisits = visitsPrev && visitsPrev.counted && visitsPrev.since === null ? visitsPrev : null
  const prevFirstDay = prevKeys?.[0] ? (prevKeys[0].length === 7 ? `${prevKeys[0]}-01` : prevKeys[0].slice(0, 10)) : null
  const prevActive = ready && !!ca?.activeSince && !!prevFirstDay && ca.activeSince.slice(0, 10) <= prevFirstDay
  const lines: Record<CommunityMetric, Line> = {
    members: { current: members.cur, previous: alignTo(members.prev, n) },
    joined: { current: joined.cur, previous: alignTo(joined.prev, n) },
    left: { current: left.cur, previous: alignTo(left.prev, n) },
    churn: { current: churnLine(members.cur, joined.cur, left.cur, leftOfStart.cur), previous: members.prev && joined.prev && left.prev ? alignTo(churnLine(members.prev, joined.prev, left.prev, leftOfStart.prev ?? left.prev), n) : null },
    prospects: { current: visitsCur.hourly === false ? new Array(n).fill(null) : visitsCur.prospects, previous: visitsCur.hourly === false || prevVisits?.hourly === false ? null : alignTo(prevVisits?.prospects, n) },
    rsvps: { current: ready ? rsvps.cur : new Array(n).fill(null), previous: ready && rsvps.prev ? alignTo(rsvps.prev, n) : null },
    lessons: { current: ready ? lessons.cur : new Array(n).fill(null), previous: ready && lessons.prev ? alignTo(lessons.prev, n) : null },
    visits: { current: visitsCur.hourly === false ? new Array(n).fill(null) : visitsCur.visits, previous: visitsCur.hourly === false || prevVisits?.hourly === false ? null : alignTo(prevVisits?.visits, n) },
    joinRate: { current: visitsCur.hourly === false ? new Array(n).fill(null) : visitJoins.cur.map((j, i) => rate(j, visitsCur.prospects[i])), previous: prevVisits && prevVisits.hourly !== false && visitsCur.hourly !== false ? alignTo(visitJoins.prev?.map((j, i) => rate(j, prevVisits.prospects[i])), n) : null },
    active: { current: activeCounted ? activeLine.cur : new Array(n).fill(null), previous: activeCounted && (prevActive || !ready) ? alignTo(activeLine.prev, n) : null },
    posts: { current: posts.cur, previous: alignTo(posts.prev, n) },
    comments: { current: comments.cur, previous: alignTo(comments.prev, n) },
    reactions: { current: reactions.cur, previous: alignTo(reactions.prev, n) },
    engagement: { current: ready ? engagementLine(contributors.cur, members.cur) : new Array(n).fill(null), previous: ready && contributors.prev && members.prev ? alignTo(engagementLine(contributors.prev, members.prev), n) : null },
  }
  const lastOf = (xs: number[] | null) => (xs && xs.length ? xs[xs.length - 1] : null)
  const total = (xs: number[] | null) => (xs ? sum(xs) : null)
  const visitsTotal = sum(visitsCur.visits)
  const prospectsTotal = sum(visitsCur.prospects)
  const prospectsPrev = prevVisits ? sum(prevVisits.prospects) : null
  const countedFrom = visitsCur.since ? (grain === "hour" ? null : dayKey(visitsCur.since, grain)) : null
  /* Unique members active in the whole period (part 184), not a sum of days, which would count a member once a day. */
  const activeTotal = ready ? (ca?.totals?.active ?? null) : span.end >= now - 60_000 ? await headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", id).eq("status", "active").neq("role", "owner").or(`last_seen_at.gte.${iso(span.start)},last_active_at.gte.${iso(span.start)}`)) : null
  const activePrev = prevActive ? (cb?.totals?.active ?? null) : null
  const membersEnd = lastOf(members.cur)
  const membersPrevEnd = lastOf(members.prev)
  const figures: Record<CommunityMetric, Figure> = {
    members: { value: membersEnd, previous: membersPrevEnd },
    joined: { value: total(joined.cur), previous: total(joined.prev) },
    left: { value: total(left.cur), previous: total(left.prev) },
    /* Member churn: who left in the period over the members there were when it began (the paid churn rate is the money's). */
    churn: { value: rate(leftOfStartTotal(ca, left.cur), startsOf(members.cur, joined.cur, left.cur)[0]), previous: members.prev && joined.prev && left.prev ? rate(leftOfStartTotal(cb, left.prev), startsOf(members.prev, joined.prev, left.prev)[0]) : null },
    visits: { value: visitsCur.counted ? visitsTotal : null, previous: prevVisits ? sum(prevVisits.visits) : null },
    prospects: { value: visitsCur.counted ? prospectsTotal : null, previous: prospectsPrev },
    rsvps: { value: ready ? sum(rsvps.cur) : null, previous: ready && rsvps.prev ? sum(rsvps.prev) : null },
    lessons: { value: ready ? sum(lessons.cur) : null, previous: ready && lessons.prev ? sum(lessons.prev) : null },
    /* Joins over visits from non-members, both from the buckets visits were counted in: joins before counting began had no visits to come from. */
    joinRate: { value: rate(sum(visitJoins.cur.filter((_, i) => countedFrom === null || cur.keys[i] >= countedFrom)), prospectsTotal), previous: prospectsPrev === null ? null : rate(total(visitJoins.prev) ?? 0, prospectsPrev) },
    /* Unique members in the period: counted for an hour chart too (from whole days), though its line is by day only. */
    active: { value: activeFigure ? activeTotal : null, previous: activeFigure ? activePrev : null },
    posts: { value: total(posts.cur), previous: total(posts.prev) },
    comments: { value: total(comments.cur), previous: total(comments.prev) },
    reactions: { value: total(reactions.cur), previous: total(reactions.prev) },
    engagement: { value: ready ? rate(ca?.totals?.contributors ?? 0, others(membersEnd)) : null, previous: ready && cb?.totals ? rate(cb.totals.contributors, others(membersPrevEnd)) : null },
  }

  const firstKey = cur.keys[0] ?? ""
  const activeFrom = ready && ca?.activeSince ? ca.activeSince : null
  const [joins, topPosts, contributorsList, events, eventMoney, money, ga, newActive, leaveReasons] = await Promise.all([
    joinStats(db, id, iso(span.start), iso(span.end)).catch(() => ({ total: 0, bySource: [], invites: [] })),
    topPostsOf(db, id, span),
    ready && ca?.topContributors ? contributorsOf(db, ca.topContributors) : Promise.resolve([]),
    eventsOf(db, id, span),
    loadEventMoney(db, id, iso(span.start), iso(span.end)).catch(() => null),
    moneyOf(db, id, { span, starts: cur.starts }, prev && prevSpan ? { span: prevSpan, starts: prev.starts } : null).catch((e) => (console.error(`[communities] report money: ${reasonOf(e)}`), null)),
    gaOf(db, community.creator_id),
    ready && activeTotal !== null ? newActiveOf(db, id, owner, span, tz) : Promise.resolve(null),
    leaveReasonsOf(db, id, span),
  ])
  const activeSplit = newActive !== null && activeTotal !== null ? { new: Math.min(newActive, activeTotal), returning: Math.max(0, activeTotal - newActive) } : null

  return {
    version: REPORT_VERSION,
    grain,
    buckets: n,
    firstDay: (community.created_at ?? iso(now)).slice(0, 10),
    figures,
    lines,
    counted: { visits: visitsCur.counted, visitsByHour: visitsCur.hourly !== false, active: activeCounted, engagement: ready, detail: ready },
    countedSince: {
      visits: visitsCur.counted ? visitsCur.since : null,
      /* Member days began with part 184: a period that starts before the first one says so (none yet: counting starts today). */
      active: ready ? sinceInside(activeFrom ?? iso(now).slice(0, 10), firstDayOf(firstKey)) : null,
    },
    live: { members: membersNow, active1, active7, active30, stickiness: rate(active1, active30) },
    ownerLeftOut: ownerOut > 0,
    activeSplit,
    leaveReasons,
    people: { posters: ca?.totals?.posters ?? 0, commenters: ca?.totals?.commenters ?? 0, reactors: ca?.totals?.reactors ?? 0 },
    money,
    traffic: visitsCur.counted ? trafficRows(visitsCur.traffic, prevVisits ? prevVisits.traffic : null) : null,
    joins: {
      bySource: SOURCES.map((s) => ({ key: s, label: s, value: joins.bySource.find((x) => x.source === s)?.count ?? 0 })).filter((r) => r.value > 0).sort((x, y) => y.value - x.value),
      invites: joins.invites.map((i) => ({ key: i.id, label: i.label, value: i.uses, note: i.revoked ? "off" : null })),
    },
    topPosts,
    topSpaces: ready ? (ca?.topSpaces ?? []).map((s) => ({ id: s.id, name: s.name, slug: s.slug, posts: num(s.posts), comments: num(s.comments) })) : [],
    contributors: contributorsList,
    cohorts: ready ? (ca?.cohorts ?? []).map((c) => ({ month: c.month, joined: num(c.joined), stayed: num(c.stayed), active: num(c.active) })) : [],
    programs: ready ? (ca?.programs ?? []).map((p) => ({ id: p.id, title: p.title, started: num(p.started), completed: num(p.completed), percent: num(p.percent), lessons: num(p.lessons) })) : [],
    events,
    eventMoney,
    ga,
    at: now,
  }
}

export type { ActivityMetric, GrowthMetric }
