import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S NUMBERS OVER TIME
 * ===========================================================================
 * One row per community per day in community_daily_stats, written once a
 * day by the rollup job (jobs/rollup.ts) from counts of real rows: members
 * at the end of the day, who joined, who left, who was active, posts,
 * comments, reactions, RSVPs and lessons completed. The Analytics screen
 * reads those rows (at most 90) and adds today so far from a few live
 * counts. Nothing is estimated and nothing is sampled.
 *
 * Round 31 (SQL part 184): the same nightly run adds up the day's visits
 * (rollupTraffic), and the Analytics screen reads its periods through
 * ./analytics-report.ts, which counts from the rows by the viewer's own
 * days and falls back to these daily rows before part 184 has run.
 *
 * The trending score (jobs/trending.ts) is read from the same rows: what
 * happened in a community over the last seven days, weighted, so Explore
 * can rank communities without counting anything itself.
 */
import { fillDays } from "@/components/community/creator/logic"
import type { AnalyticsView } from "@/components/community/creator/view-types"
import { missing, reasonOf, type Db } from "./db"
import { VIEW_DAYS_KEPT } from "./views"

const DAY = 86_400_000

export function dayStart(day: string): string {
  return `${day.slice(0, 10)}T00:00:00.000Z`
}

export function nextDay(day: string): string {
  return new Date(Date.parse(dayStart(day)) + DAY).toISOString().slice(0, 10)
}

async function headCount(q: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>): Promise<number> {
  const { count, error } = await q
  if (error) throw new Error(reasonOf(error))
  return count ?? 0
}

export interface DayFigures {
  members: number
  new_members: number
  left_members: number
  active_members: number
  posts: number
  comments: number
  reactions: number
  rsvps: number
  lessons_completed: number
}

/**
 * One community's figures for one UTC day, counted from the rows. `members`
 * is the active count now (the rollup runs just after the day ends, so it
 * is the count at its end); `active_members` is members whose last visit
 * was that day or later, which is who was active that day when this runs
 * minutes after midnight.
 */
export async function countDay(db: Db, communityId: string, day: string): Promise<DayFigures> {
  const from = dayStart(day)
  const to = dayStart(nextDay(day))
  const c = (table: string, column = "id") => db.from(table).select(column, { count: "exact", head: true }).eq("community_id", communityId)
  const [members, joined, left, active, posts, comments, reactions, rsvps, lessons] = await Promise.all([
    headCount(c("community_members").eq("status", "active")),
    headCount(c("community_activity").eq("kind", "joined").gte("created_at", from).lt("created_at", to)),
    headCount(c("community_activity").eq("kind", "left").gte("created_at", from).lt("created_at", to)),
    headCount(c("community_members").eq("status", "active").gte("last_active_at", from)),
    headCount(c("community_feed_posts").gte("created_at", from).lt("created_at", to)),
    headCount(c("community_feed_comments").gte("created_at", from).lt("created_at", to)),
    headCount(c("community_reactions").gte("created_at", from).lt("created_at", to)),
    headCount(c("community_event_rsvps", "event_id").gte("created_at", from).lt("created_at", to)),
    headCount(c("community_activity").eq("kind", "lesson_completed").gte("created_at", from).lt("created_at", to)),
  ])
  return { members, new_members: joined, left_members: left, active_members: active, posts, comments, reactions, rsvps, lessons_completed: lessons }
}

/** Counts a day and writes it (again, if it was written before: the same day counted twice is one row). */
export async function rollupDay(db: Db, communityId: string, day: string): Promise<void> {
  const figures = await countDay(db, communityId, day)
  const { error } = await db.from("community_daily_stats").upsert({ community_id: communityId, day: day.slice(0, 10), ...figures }, { onConflict: "community_id,day" })
  if (error) throw new Error(`daily stats ${communityId} ${day}: ${reasonOf(error)}`)
  await rollupTraffic(db, communityId, day)
}

/** The day's visits as the screen counts them: everyone, those who were not members, and each source, site, device and country. */
export interface TrafficDay {
  visitors: number
  prospects: number
  counts: Record<TrafficDimension, Record<string, number>>
}

export type TrafficDimension = "source" | "referrer" | "device" | "country"
export const TRAFFIC_DIMENSIONS: readonly TrafficDimension[] = ["source", "referrer", "device", "country"]

export interface VisitRow {
  source: string | null
  referrer: string | null
  device: string | null
  country: string | null
  member: boolean | null
}

/** Adds visit rows up. A visit with no source is direct; an unknown device or country is not listed. */
export function countVisits(rows: VisitRow[]): TrafficDay {
  const counts: TrafficDay["counts"] = { source: {}, referrer: {}, device: {}, country: {} }
  let prospects = 0
  for (const r of rows) {
    if (r.member !== true) prospects += 1
    const add = (d: TrafficDimension, k: string | null) => {
      if (k) counts[d][k] = (counts[d][k] ?? 0) + 1
    }
    add("source", r.source || "direct")
    add("referrer", r.referrer)
    add("device", r.device)
    add("country", r.country)
  }
  return { visitors: rows.length, prospects, counts }
}

const TRAFFIC_PAGE = 1000
const TRAFFIC_PAGES = 50

/**
 * THE DAY'S VISITS, KEPT AS COUNTS (SQL part 184). The view day rows say how
 * each visitor arrived for three days (part 87 deletes them after); here,
 * just after the day ends, they are added up into community_daily_stats
 * (visitors, prospects) and community_daily_traffic (one row per source,
 * site, device and country), which is all Analytics reads for any day
 * before today. Before part 184 the columns are not there and this does
 * nothing. Never throws: the day's other figures are already written.
 *
 * NEVER A COUNT FROM ROWS THAT ARE GONE (round 33). The day rows are kept
 * VIEW_DAYS_KEPT days; a day older than that (a job held up, a day counted
 * again by hand) would read as nobody and write 0 visitors over the count
 * the night already kept. Such a day is left as it is.
 */
export async function rollupTraffic(db: Db, communityId: string, day: string, now: number = Date.now()): Promise<boolean> {
  const d = day.slice(0, 10)
  if (d < new Date(now - VIEW_DAYS_KEPT * DAY).toISOString().slice(0, 10)) return false
  try {
    const rows: VisitRow[] = []
    for (let page = 0; page < TRAFFIC_PAGES; page++) {
      const { data, error } = await db
        .from("community_view_days")
        .select("visitor_key, source, referrer, device, country, member")
        .eq("community_id", communityId)
        .eq("day", d)
        .order("visitor_key", { ascending: true })
        .range(page * TRAFFIC_PAGE, page * TRAFFIC_PAGE + TRAFFIC_PAGE - 1)
      if (error) {
        if (!missing(error)) console.error(`[communities] traffic read ${communityId} ${d}: ${reasonOf(error)}`)
        return false
      }
      const got = (data as VisitRow[] | null) ?? []
      rows.push(...got)
      if (got.length < TRAFFIC_PAGE) break
    }
    const t = countVisits(rows)
    const { error: statsError } = await db.from("community_daily_stats").update({ visitors: t.visitors, prospects: t.prospects }).eq("community_id", communityId).eq("day", d)
    if (statsError) {
      if (!missing(statsError)) console.error(`[communities] traffic write ${communityId} ${d}: ${reasonOf(statsError)}`)
      return false
    }
    const lines = TRAFFIC_DIMENSIONS.flatMap((dimension) => Object.entries(t.counts[dimension]).map(([key, visitors]) => ({ community_id: communityId, day: d, dimension, key: key.slice(0, 120), visitors })))
    if (lines.length) {
      const { error: lineError } = await db.from("community_daily_traffic").upsert(lines, { onConflict: "community_id,day,dimension,key" })
      if (lineError) {
        if (!missing(lineError)) console.error(`[communities] traffic lines ${communityId} ${d}: ${reasonOf(lineError)}`)
        return false
      }
    }
    return true
  } catch (e) {
    console.error(`[communities] traffic ${communityId} ${d}: ${reasonOf(e)}`)
    return false
  }
}

/**
 * The trending score from seven days of figures: joins count most, then
 * posts, then comments and reactions; a community that is already huge
 * does not win on size alone, because only what happened lately counts.
 */
export function trendingScore(days: Pick<DayFigures, "new_members" | "posts" | "comments" | "reactions" | "rsvps">[]): number {
  const sum = (k: keyof (typeof days)[number]) => days.reduce((n, d) => n + (Number(d[k]) || 0), 0)
  const score = sum("new_members") * 5 + sum("posts") * 3 + sum("comments") * 1.5 + sum("reactions") * 0.5 + sum("rsvps") * 2
  return Math.round(score * 100) / 100
}

type Series = AnalyticsView["series"]

/** The Analytics screen: the last 30 or 90 days from the daily rows, today counted live. */
export async function loadAnalytics(db: Db, community: { id: string; member_count: number }, days: number, now: number = Date.now()): Promise<AnalyticsView> {
  const today = new Date(now).toISOString().slice(0, 10)
  const start = new Date(Date.parse(dayStart(today)) - days * DAY).toISOString().slice(0, 10)
  const todayFrom = dayStart(today)
  const empty: AnalyticsView = {
    days,
    today,
    series: { members: [], newMembers: [], activeMembers: [], posts: [], comments: [], reactions: [] },
    totals: { newMembers: 0, left: 0, posts: 0, comments: 0, reactions: 0, rsvps: 0, lessons: 0 },
    live: { members: community.member_count, newToday: 0, postsToday: 0, commentsToday: 0 },
    rolledUp: false,
    topPosts: [],
  }
  const { data, error } = await db
    .from("community_daily_stats")
    .select("day, members, new_members, left_members, active_members, posts, comments, reactions, rsvps, lessons_completed")
    .eq("community_id", community.id)
    .gte("day", start)
    .lt("day", today)
    .order("day", { ascending: true })
    .limit(days + 1)
  if (error) {
    if (!missing(error)) console.error(`[communities] analytics read: ${reasonOf(error)}`)
    return empty
  }
  const rows = (data as (DayFigures & { day: string })[] | null) ?? []
  const yesterday = new Date(Date.parse(todayFrom) - DAY).toISOString().slice(0, 10)
  const seriesOf = (k: keyof DayFigures) => fillDays(rows.map((r) => ({ day: r.day, value: Number(r[k]) || 0 })), days, yesterday)
  /* A day the rollup has not written has no member count: carry the last known one forward rather than draw a drop to zero. */
  const members = seriesOf("members")
  let lastKnown = rows.length ? 0 : community.member_count
  const written = new Set(rows.map((r) => r.day.slice(0, 10)))
  for (const p of members) {
    if (written.has(p.day)) lastKnown = p.value
    else p.value = lastKnown
  }
  const total = (k: keyof DayFigures) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0)
  const c = (table: string) => db.from(table).select("id", { count: "exact", head: true }).eq("community_id", community.id)
  const since = dayStart(start)
  const [newToday, postsToday, commentsToday, top] = await Promise.all([
    c("community_members").eq("status", "active").gte("joined_at", todayFrom),
    c("community_feed_posts").eq("status", "published").gte("created_at", todayFrom),
    c("community_feed_comments").eq("status", "published").gte("created_at", todayFrom),
    db.from("community_feed_posts").select("id, title, body_text, reaction_count, comment_count").eq("community_id", community.id).eq("status", "published").gte("created_at", since).order("reaction_count", { ascending: false }).order("created_at", { ascending: false }).limit(5),
  ])
  const series: Series = {
    members,
    newMembers: seriesOf("new_members"),
    activeMembers: seriesOf("active_members"),
    posts: seriesOf("posts"),
    comments: seriesOf("comments"),
    reactions: seriesOf("reactions"),
  }
  return {
    days,
    today,
    series,
    totals: { newMembers: total("new_members"), left: total("left_members"), posts: total("posts"), comments: total("comments"), reactions: total("reactions"), rsvps: total("rsvps"), lessons: total("lessons_completed") },
    live: { members: community.member_count, newToday: newToday.count ?? 0, postsToday: postsToday.count ?? 0, commentsToday: commentsToday.count ?? 0 },
    rolledUp: rows.length > 0,
    topPosts: ((top.data as { id: string; title: string | null; body_text: string; reaction_count: number; comment_count: number }[] | null) ?? [])
      .filter((p) => p.reaction_count > 0 || p.comment_count > 0)
      .map((p) => ({ id: p.id, title: p.title || (p.body_text || "").slice(0, 90) || "Post", reactions: p.reaction_count, comments: p.comment_count })),
  }
}
