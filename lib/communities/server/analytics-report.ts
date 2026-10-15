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
 *   Members            members now, less every join and plus every leave
 *                      after the end of each bucket (membersLine)
 *   Posts, comments,   the posts, comments and reactions made in each
 *   reactions          bucket, whatever became of them since (the nightly
 *                      count's rule)
 *   Active members     members with a day in community_member_days (part
 *                      184): their page's heartbeat or anything they did
 *   Engagement         members who posted, commented or reacted, over the
 *                      members there were at the end of the bucket
 *   Visits             one a visitor a day (part 87), added up each night
 *                      with how they came (part 184), today from the day
 *                      rows themselves; a join rate is joins over visits
 *                      from people who were not members yet
 *   Money              the community's orders (memberships and purchases,
 *                      less refunds), programs sold, event tickets less
 *                      refunds; monthly revenue and subscribers at the end
 *                      of each bucket from the memberships' own dates
 *
 * All of the counting by bucket is community_analytics (SQL part 184), one
 * call a period. Before that part has run, the joins and leaves are read
 * from community_activity here and the rest from the nightly rows
 * (community_daily_stats), so the screen keeps what it showed before.
 */
import { bucketStarts, bucketIndex, type Grain, type Span } from "@/lib/analytics/buckets"
import { monthlyValue } from "@/lib/memberships/state"
import { lineMoney } from "@/lib/analytics/reports"
import { loadGaStatus, loadTracking } from "@/lib/store/tracking-server"
import { MEMBER_SOURCES } from "../types"
import {
  alignTo,
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
import { countVisits, TRAFFIC_DIMENSIONS, type TrafficDimension, type VisitRow } from "./analytics"
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
  left: Counts
  posts: Counts
  comments: Counts
  reactions: Counts
  rsvps: Counts
  lessons: Counts
  contributors: Counts | null
  active: Counts | null
  totals: { contributors: number; posters: number; commenters: number; reactors: number; active: number; courses: number } | null
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
      left: countsOf(d.left),
      posts: countsOf(d.posts),
      comments: countsOf(d.comments),
      reactions: countsOf(d.reactions),
      rsvps: countsOf(d.rsvps),
      lessons: countsOf(d.lessons),
      contributors: countsOf(d.contributors),
      active: d.active === null || d.active === undefined ? null : countsOf(d.active),
      totals: t ? { contributors: num(t.contributors), posters: num(t.posters), commenters: num(t.commenters), reactors: num(t.reactors), active: num(t.active), courses: num(t.courses) } : null,
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

/** Joins and leaves by the viewer's buckets, read from the activity rows themselves. */
async function joinsAndLeaves(db: Db, communityId: string, ownerId: string | null, span: Span, starts: number[]): Promise<{ joined: number[]; left: number[] }> {
  const joined = new Array<number>(starts.length).fill(0)
  const left = new Array<number>(starts.length).fill(0)
  let after: number | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("community_activity").select("id, kind, user_id, created_at").eq("community_id", communityId).in("kind", ["joined", "left"]).gte("created_at", iso(span.start)).lt("created_at", iso(span.end))
    if (after !== null) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) {
      if (!missing(error)) console.error(`[communities] report joins: ${reasonOf(error)}`)
      break
    }
    const rows = (data as { id: number; kind: string; user_id: string | null; created_at: string }[] | null) ?? []
    for (const r of rows) {
      const i = bucketIndex(starts, Date.parse(r.created_at))
      if (i < 0) continue
      if (r.kind === "joined" && r.user_id !== ownerId) joined[i] += 1
      else if (r.kind === "left") left[i] += 1
    }
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return { joined, left }
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
    const [p, cm, re] = await Promise.all([headCount(c("community_feed_posts")), headCount(c("community_feed_comments")), headCount(c("community_reactions"))])
    const i = bucketIndex(starts, Math.min(now, span.end - 1))
    if (i >= 0) {
      posts[keys[i]] = (posts[keys[i]] ?? 0) + p
      comments[keys[i]] = (comments[keys[i]] ?? 0) + cm
      reactions[keys[i]] = (reactions[keys[i]] ?? 0) + re
    }
  }
  const jl = await joinsAndLeaves(db, communityId, ownerId, span, starts)
  const toCounts = (xs: number[]) => Object.fromEntries(keys.map((k, i) => [k, xs[i]]))
  return { joined: toCounts(jl.joined), left: toCounts(jl.left), posts, comments, reactions, rsvps: {}, lessons: {}, contributors: null, active: grain === "hour" ? null : active, totals: null, activeSince: null }
}

/* ── Visits (parts 87 and 184) ───────────────────────────────────────── */

interface Visits {
  counted: boolean
  since: string | null
  visits: number[]
  prospects: number[]
  traffic: Record<TrafficDimension, Counts>
}

const emptyTraffic = (): Record<TrafficDimension, Counts> => ({ source: {}, referrer: {}, device: {}, country: {} })

/** A period's visits by bucket and by where they came from. */
async function visitsOf(db: Db, communityId: string, span: Span, grain: Grain, starts: number[], keys: string[], now: number): Promise<Visits> {
  const out: Visits = { counted: false, since: null, visits: new Array(keys.length).fill(0), prospects: new Array(keys.length).fill(0), traffic: emptyTraffic() }
  const range = dayRange(keys, grain, now)
  const today = iso(now).slice(0, 10)
  const { data: dayRows, error } = await db
    .from("community_daily_stats")
    .select("day, visitors, prospects")
    .eq("community_id", communityId)
    .gte("day", range.from)
    .lte("day", range.to)
    .not("visitors", "is", null)
    .order("day", { ascending: true })
    .limit(800)
  if (error) {
    if (!missing(error)) console.error(`[communities] report visits: ${reasonOf(error)}`)
    return out
  }
  out.counted = true
  const rolled = new Set<string>()
  const index = new Map(keys.map((k, i) => [k, i]))
  const put = (k: string | null, v: number, p: number) => {
    const i = k === null ? undefined : index.get(k)
    if (i === undefined) return false
    out.visits[i] += v
    out.prospects[i] += p
    return true
  }
  if (grain !== "hour") {
    for (const r of (dayRows as { day: string; visitors: number; prospects: number | null }[] | null) ?? []) {
      if (put(dayKey(r.day, grain), num(r.visitors), num(r.prospects))) rolled.add(r.day.slice(0, 10))
    }
    if (rolled.size) {
      const lines: { day: string; dimension: TrafficDimension; key: string; visitors: number }[] = []
      for (let page = 0; page < 20; page++) {
        const { data, error: e } = await db
          .from("community_daily_traffic")
          .select("day, dimension, key, visitors")
          .eq("community_id", communityId)
          .gte("day", range.from)
          .lte("day", range.to)
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
        const k = dayKey(l.day, grain)
        if (k === null || !index.has(k) || !TRAFFIC_DIMENSIONS.includes(l.dimension)) continue
        out.traffic[l.dimension][l.key] = (out.traffic[l.dimension][l.key] ?? 0) + num(l.visitors)
      }
    }
  }
  /* The days the night has not added up yet (today, and yesterday until the count runs), and every day of an hour chart: the day rows themselves, kept three days. */
  const liveFrom = iso(Math.max(span.start, now - 3 * DAY))
  if (span.end > Date.parse(liveFrom)) {
    const rows: (VisitRow & { day: string; created_at: string })[] = []
    for (let page = 0; page < 20; page++) {
      const { data, error: e } = await db
        .from("community_view_days")
        .select("day, created_at, source, referrer, device, country, member")
        .eq("community_id", communityId)
        .gte("created_at", liveFrom)
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
    /* A day's rows go where the nightly count would put them (its UTC date), an hour chart's by the hour they came. */
    const fresh = rows.filter((r) => grain === "hour" || !rolled.has(r.day.slice(0, 10)))
    const counted: typeof fresh = []
    for (const r of fresh) {
      const i = grain === "hour" ? bucketIndex(starts, Date.parse(r.created_at)) : index.get(dayKey(r.day, grain) ?? "") ?? -1
      if (i < 0 || i >= keys.length) continue
      counted.push(r)
      out.visits[i] += 1
      if (r.member !== true) out.prospects[i] += 1
    }
    const t = countVisits(counted)
    for (const d of TRAFFIC_DIMENSIONS) for (const [k, v] of Object.entries(t.counts[d])) out.traffic[d][k] = (out.traffic[d][k] ?? 0) + v
    for (const r of counted) rolled.add(r.day.slice(0, 10))
  }
  /*
    COUNTING BEGAN INSIDE THIS PERIOD: say from when, so the days before it
    are not read as nobody. The nightly count writes every day once it has
    begun, a quiet day as 0, so the first day it holds is when counting
    began; with nothing in the period at all, the first day it ever wrote
    says whether that is "nobody came" or "not counted yet".
  */
  let first = rolled.size ? [...rolled].sort()[0] : null
  if (!first) {
    const { data: earliest } = await db.from("community_daily_stats").select("day").eq("community_id", communityId).not("visitors", "is", null).order("day", { ascending: true }).limit(1)
    first = (earliest as { day: string }[] | null)?.[0]?.day?.slice(0, 10) ?? today
  }
  out.since = first > range.from ? first : null
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

type MembershipRow = { id: string; buyer_id: string | null; status: string; billing_interval: string; amount_cents: number; currency: string | null; created_at: string; started_at: string | null; canceled_at: string | null; ended_at: string | null; trial_end: string | null }

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

/** The products that sell this community: its paid tiers (recurring or once) and the products made for it. */
async function sellingProducts(db: Db, communityId: string): Promise<{ all: string[]; recurring: string[] }> {
  const [tiers, made] = await Promise.all([
    db.from("community_tiers").select("product_id, billing").eq("community_id", communityId).eq("kind", "paid").limit(50),
    db.from("products").select("id, type").eq("community_id", communityId).limit(200),
  ])
  const t = ((tiers.data as { product_id: string | null; billing: string | null }[] | null) ?? []).filter((x) => x.product_id)
  const m = (made.error ? [] : (made.data as { id: string; type: string | null }[] | null) ?? [])
  const all = [...new Set([...t.map((x) => x.product_id as string), ...m.map((x) => x.id)])]
  const recurring = [...new Set([...t.filter((x) => x.billing === "recurring").map((x) => x.product_id as string), ...m.filter((x) => x.type === "membership").map((x) => x.id)])]
  return { all, recurring }
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
  upgradesOf: MembershipRow[]
  payingAtStart: number
}

function moneyWindow(span: Span, starts: number[], members: MembershipRow[], orders: { created_at: string; amount_cents: number | null; refund_amount_cents: number | null; status: string }[], programs: { created_at: string; amount_cents: number | null }[], tickets: { paid_at: string; amount_cents: number | null; refunded_at: string | null }[]): MoneyWindow {
  const n = starts.length
  const w: MoneyWindow = { revenue: new Array(n).fill(0), mrr: new Array(n).fill(0), subscribers: new Array(n).fill(0), newPaid: new Array(n).fill(0), cancellations: new Array(n).fill(0), bySource: { memberships: 0, programs: 0, tickets: 0 }, upgradesOf: [], payingAtStart: 0 }
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
  }
  for (const p of programs) {
    const i = at(p.created_at)
    if (i < 0) continue
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
          let q = db.from("memberships").select("id, buyer_id, status, billing_interval, amount_cents, currency, created_at, started_at, canceled_at, ended_at, trial_end").in("product_id", products.recurring)
          if (after !== null) q = q.gt("id", after)
          return q.order("id", { ascending: true }).limit(PAGE)
        }, "memberships")
      : Promise.resolve([] as MembershipRow[]),
    products.all.length
      ? pages<{ id: string; created_at: string; amount_cents: number | null; refund_amount_cents: number | null; status: string; currency: string | null }>((after) => {
          let q = db.from("orders").select("id, created_at, amount_cents, refund_amount_cents, status, currency").in("product_id", products.all).in("status", ["completed", "refunded"]).gte("created_at", from).lt("created_at", to)
          if (after !== null) q = q.gt("id", after)
          return q.order("id", { ascending: true }).limit(PAGE)
        }, "orders")
      : Promise.resolve([]),
    /* Programs sold on their own (part 102): one row per buyer and program, few enough to read in one go. */
    (async () => {
      const { data, error } = await db.from("community_program_access").select("created_at, amount_cents, currency").eq("community_id", communityId).eq("source", "purchase").gte("created_at", from).lt("created_at", to).limit(10_000)
      if (error) {
        if (!missing(error)) console.error(`[communities] report programs: ${reasonOf(error)}`)
        return null
      }
      return (data as { created_at: string; amount_cents: number | null; currency: string | null }[] | null) ?? []
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
    refunds: { count: refunds?.length ?? 0, totalCents: (refunds ?? []).reduce((t, o) => t + lineMoney({ ...o, status: "refunded" } as never).refunded, 0) },
    bySource: (["memberships", "programs", "tickets"] as const).map((key) => ({ key, cents: c.bySource[key] })).filter((x) => x.cents > 0),
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

  const activeSince = (days: number) => headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", id).eq("status", "active").or(`last_seen_at.gte.${iso(now - days * DAY)},last_active_at.gte.${iso(now - days * DAY)}`))
  const after = (kind: "joined" | "left", from: number) => {
    let x = db.from("community_activity").select("id", { count: "exact", head: true }).eq("community_id", id).eq("kind", kind).gte("created_at", iso(from))
    if (kind === "joined" && owner) x = x.neq("user_id", owner)
    return headCount(x)
  }
  const [a, b, membersNow, active7, active30, joinedAfter, leftAfter, joinedAfterPrev, leftAfterPrev] = await Promise.all([
    counted(db, id, span, tz, grain, true),
    prevSpan ? counted(db, id, prevSpan, tz, grain, false) : Promise.resolve(null),
    headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", id).eq("status", "active")),
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
  const left = lineFor((c) => c.left)
  const members = { cur: membersLine(membersNow, joined.cur, left.cur, joinedAfter, leftAfter), prev: joined.prev && left.prev ? membersLine(membersNow, joined.prev, left.prev, joinedAfterPrev, leftAfterPrev) : null }
  const posts = lineFor((c) => c.posts)
  const comments = lineFor((c) => c.comments)
  const reactions = lineFor((c) => c.reactions)
  const activeLine = lineFor((c) => c.active)
  const contributors = lineFor((c) => c.contributors)

  const [visitsCur, visitsPrev] = await Promise.all([visitsOf(db, id, span, grain, cur.starts, cur.keys, now), prev && prevSpan && prevKeys ? visitsOf(db, id, prevSpan, grain, prev.starts, prevKeys, now) : Promise.resolve(null)])

  const engagementLine = (c: number[], m: number[]) => c.map((x, i) => rate(x, m[i]))
  const activeCounted = ready ? ca?.active !== null : grain !== "hour"
  const lines: Record<CommunityMetric, Line> = {
    members: { current: members.cur, previous: alignTo(members.prev, n) },
    joined: { current: joined.cur, previous: alignTo(joined.prev, n) },
    left: { current: left.cur, previous: alignTo(left.prev, n) },
    visits: { current: visitsCur.visits, previous: alignTo(visitsPrev?.visits, n) },
    joinRate: { current: joined.cur.map((j, i) => rate(j, visitsCur.prospects[i])), previous: visitsPrev ? alignTo(joined.prev?.map((j, i) => rate(j, visitsPrev.prospects[i])), n) : null },
    active: { current: activeCounted ? activeLine.cur : new Array(n).fill(null), previous: activeCounted ? alignTo(activeLine.prev, n) : null },
    posts: { current: posts.cur, previous: alignTo(posts.prev, n) },
    comments: { current: comments.cur, previous: alignTo(comments.prev, n) },
    reactions: { current: reactions.cur, previous: alignTo(reactions.prev, n) },
    engagement: { current: ready ? engagementLine(contributors.cur, members.cur) : new Array(n).fill(null), previous: ready && contributors.prev && members.prev ? alignTo(engagementLine(contributors.prev, members.prev), n) : null },
  }
  const lastOf = (xs: number[] | null) => (xs && xs.length ? xs[xs.length - 1] : null)
  const total = (xs: number[] | null) => (xs ? sum(xs) : null)
  const visitsTotal = sum(visitsCur.visits)
  const prospectsTotal = sum(visitsCur.prospects)
  const prospectsPrev = visitsPrev ? sum(visitsPrev.prospects) : null
  /* Unique members active in the whole period (part 184), not a sum of days, which would count a member once a day. */
  const activeTotal = ready ? (ca?.totals?.active ?? null) : span.end >= now - 60_000 ? await headCount(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", id).eq("status", "active").or(`last_seen_at.gte.${iso(span.start)},last_active_at.gte.${iso(span.start)}`)) : null
  const activePrev = ready ? (cb?.totals?.active ?? null) : null
  const membersEnd = lastOf(members.cur)
  const membersPrevEnd = lastOf(members.prev)
  const figures: Record<CommunityMetric, Figure> = {
    members: { value: membersEnd, previous: membersPrevEnd },
    joined: { value: total(joined.cur), previous: total(joined.prev) },
    left: { value: total(left.cur), previous: total(left.prev) },
    visits: { value: visitsCur.counted ? visitsTotal : null, previous: visitsPrev?.counted ? sum(visitsPrev.visits) : null },
    joinRate: { value: rate(total(joined.cur) ?? 0, prospectsTotal), previous: prospectsPrev === null ? null : rate(total(joined.prev) ?? 0, prospectsPrev) },
    active: { value: activeCounted ? activeTotal : null, previous: activeCounted ? activePrev : null },
    posts: { value: total(posts.cur), previous: total(posts.prev) },
    comments: { value: total(comments.cur), previous: total(comments.prev) },
    reactions: { value: total(reactions.cur), previous: total(reactions.prev) },
    engagement: { value: ready ? rate(ca?.totals?.contributors ?? 0, membersEnd) : null, previous: ready && cb?.totals ? rate(cb.totals.contributors, membersPrevEnd) : null },
  }

  const firstKey = cur.keys[0] ?? ""
  const activeFrom = ready && ca?.activeSince ? ca.activeSince : null
  const [joins, topPosts, contributorsList, events, eventMoney, money, ga] = await Promise.all([
    joinStats(db, id, iso(span.start), iso(span.end)).catch(() => ({ total: 0, bySource: [], invites: [] })),
    topPostsOf(db, id, span),
    ready && ca?.topContributors ? contributorsOf(db, ca.topContributors) : Promise.resolve([]),
    eventsOf(db, id, span),
    loadEventMoney(db, id, iso(span.start), iso(span.end)).catch(() => null),
    moneyOf(db, id, { span, starts: cur.starts }, prev && prevSpan ? { span: prevSpan, starts: prev.starts } : null).catch((e) => (console.error(`[communities] report money: ${reasonOf(e)}`), null)),
    gaOf(db, community.creator_id),
  ])

  return {
    version: 1,
    grain,
    buckets: n,
    firstDay: (community.created_at ?? iso(now)).slice(0, 10),
    figures,
    lines,
    counted: { visits: visitsCur.counted, active: activeCounted, engagement: ready, detail: ready },
    countedSince: {
      visits: visitsCur.counted ? visitsCur.since : null,
      /* Member days began with part 184: a period that starts before the first one says so (none yet: counting starts today). */
      active: ready ? sinceInside(activeFrom ?? iso(now).slice(0, 10), firstDayOf(firstKey)) : null,
    },
    live: { members: membersNow, active7, active30 },
    people: { posters: ca?.totals?.posters ?? 0, commenters: ca?.totals?.commenters ?? 0, reactors: ca?.totals?.reactors ?? 0 },
    money,
    traffic: visitsCur.counted ? trafficRows(visitsCur.traffic, visitsPrev?.counted ? visitsPrev.traffic : null) : null,
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
