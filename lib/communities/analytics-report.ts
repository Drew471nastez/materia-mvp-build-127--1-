/**
 * ===========================================================================
 *  A COMMUNITY'S ANALYTICS: THE ANSWER, AND THE RULES BOTH SIDES SHARE
 * ===========================================================================
 * The shape lib/communities/server/analytics-report.ts counts and
 * components/community/creator/analytics-section.tsx draws, and the pure
 * pieces both need: where each bucket of the chart starts and its key, how
 * a level is carried across buckets, and a rate that is never invented.
 *
 * THE PERIOD IS THE /app ANALYTICS PERIOD. The same picker (7, 30 and 90
 * days, 12 months, a range of one's own), cut into hours, days or months by
 * lib/analytics/buckets, in the viewer's own time zone, and compared with
 * the period just before. A figure that was not counted for a stretch of
 * the period says when its counting began, never a zero for the days
 * before it.
 */
import { bucketStarts, grainFor, type Grain, type Span } from "@/lib/analytics/buckets"

export type { Grain, Span }

/**
 * The answer's shape. Round 33 added figures and lists (churn, visits from
 * non-members, RSVPs, lessons, DAU and stickiness, new and returning, why
 * members left), so an answer a browser kept from before is not drawn.
 */
export const REPORT_VERSION = 2 as const

/**
 * The figures above each section's chart (round 33: Growth, Traffic,
 * Engagement and Content, each its own chart; Revenue has MoneyMetric).
 * `churn` is members who left over the members there were when the bucket
 * began; `prospects` the visits from people who were not members yet.
 */
export type GrowthMetric = "members" | "joined" | "left" | "churn"
export type TrafficMetric = "visits" | "prospects" | "joinRate"
export type ActivityMetric = "active" | "engagement" | "rsvps" | "lessons"
export type ContentMetric = "posts" | "comments" | "reactions"
export type CommunityMetric = GrowthMetric | TrafficMetric | ActivityMetric | ContentMetric
/** The figures above the paid memberships chart. */
export type MoneyMetric = "revenue" | "mrr" | "subscribers" | "newPaid" | "cancellations"

export const GROWTH_METRICS: readonly GrowthMetric[] = ["members", "joined", "left", "churn"]
export const TRAFFIC_METRICS: readonly TrafficMetric[] = ["visits", "prospects", "joinRate"]
export const ACTIVITY_METRICS: readonly ActivityMetric[] = ["active", "engagement", "rsvps", "lessons"]
export const CONTENT_METRICS: readonly ContentMetric[] = ["posts", "comments", "reactions"]
export const MONEY_METRICS: readonly MoneyMetric[] = ["revenue", "mrr", "subscribers", "newPaid", "cancellations"]

/** A figure and the same figure for the period before; null where there is nothing to divide by, or it was not counted. */
export interface Figure {
  value: number | null
  previous: number | null
}

/** One number per bucket of the chart, and the period before's, bucket by bucket. */
export interface Line {
  current: (number | null)[]
  previous: (number | null)[] | null
}

/** One row of a list: a name, a number, the number before, a quiet note. */
export interface ReportRow {
  key: string
  label: string
  value: number
  previous?: number
  note?: string | null
}

export interface MoneyReport {
  /** The store's currency, lower case: every amount below is in it (rows in another one are converted at their own day's rate). */
  currency: string
  /** Rows in another currency no rate could convert, left out of the money; absent when there are none. */
  unconverted?: number
  figures: Record<MoneyMetric, Figure>
  lines: Record<MoneyMetric, Line>
  /** Members who were already in for free when they started paying. */
  upgrades: number
  /** The share of members paying at the start who cancelled, one decimal; null with nobody paying at the start. */
  churnRate: number | null
  refunds: { count: number; totalCents: number }
  /** Where the revenue came from: memberships and purchases, programs, event tickets. */
  bySource: { key: "memberships" | "programs" | "tickets"; cents: number }[]
  /**
   * Round 39: each tier or product that sells the community, by the name it is sold under ("" when it has none), with
   * its net from the period's orders, the members paying for it at the period's end, and the period before's net.
   * Absent on an answer kept from before.
   */
  byPlan?: { key: string; label: string; cents: number; paying: number; previous?: number }[]
  reasons: { reason: string; count: number }[]
}

export interface TrafficReport {
  source: ReportRow[]
  referrer: ReportRow[]
  device: ReportRow[]
  country: ReportRow[]
}

export interface Contributor {
  userId: string
  name: string
  avatarUrl: string | null
  posts: number
  comments: number
}

export interface Cohort {
  /** "2026-09". */
  month: string
  joined: number
  /** Still members now. */
  stayed: number
  /** Still members, and here in the last 30 days. */
  active: number
}

export interface ProgramProgress {
  id: string
  title: string
  started: number
  completed: number
  /** Average progress of the members who started, 0 to 100. */
  percent: number
  /** Lessons finished in the period. */
  lessons: number
}

export interface EventLine {
  id: string
  title: string
  startsAt: string
  going: number
  /** Tickets checked in at the door; null when the event sold none. */
  checkedIn: number | null
}

export interface GaLine {
  /** The store's Google Analytics measurement ID, when one is connected. */
  id: string | null
  /** When a visitor's page last saw Google take a hit with it (ISO). */
  seenAt: string | null
}

export interface CommunityReport {
  version: typeof REPORT_VERSION
  grain: Grain
  /** How many buckets the chart has; the page labels them itself, in its own language. */
  buckets: number
  /** The day the community was made: where All time starts. */
  firstDay: string
  figures: Record<CommunityMetric, Figure>
  lines: Record<CommunityMetric, Line>
  /** What is counted: false hides a figure the database cannot count yet (SQL part 184). */
  counted: { visits: boolean; /** False for an hour chart of days older than three days: visits are counted by day there. */ visitsByHour: boolean; active: boolean; engagement: boolean; detail: boolean }
  /** The first day a figure was counted, when the period starts before it ("2026-10-15"); null when the whole period is counted. */
  countedSince: { visits: string | null; active: string | null }
  /**
   * Members now, and who was here in the last day, 7 and 30 days (DAU, WAU
   * and MAU, distinct members by when each was last here); stickiness is
   * DAU over MAU, one decimal, null with nobody here in 30 days.
   */
  live: { members: number; active1: number; active7: number; active30: number; stickiness: number | null }
  /**
   * Round 38: the owner is one of the members in Members, and left out of
   * Active members and Engagement (and of what Engagement divides), so a
   * share of members is taken of the others. Absent on an older answer.
   */
  ownerLeftOut?: boolean
  /**
   * The members active in the period, split by when they joined: inside the
   * period (new) or before it (returning). Null before part 184 (no member
   * days to count from).
   */
  activeSplit: { new: number; returning: number } | null
  /** Why members said they left in the period (part 98), most first; null before that part. */
  leaveReasons: { reason: string; count: number }[] | null
  /** Who posted, commented and reacted in the period: distinct members. */
  people: { posters: number; commenters: number; reactors: number }
  money: MoneyReport | null
  traffic: TrafficReport | null
  joins: { bySource: ReportRow[]; invites: ReportRow[] }
  topPosts: { id: string; title: string; reactions: number; comments: number }[]
  topSpaces: { id: string; name: string; slug: string; posts: number; comments: number }[]
  contributors: Contributor[]
  cohorts: Cohort[]
  programs: ProgramProgress[]
  events: EventLine[]
  eventMoney: { sold: number; invited: number; grossCents: number; refundedCents: number; netCents: number; refunds: number; events: number; currency: string } | null
  ga: GaLine
  /** Counted at (ms): a reply the page keeps says how old it is. */
  at: number
}

/* ── Buckets ─────────────────────────────────────────────────────────── */

function partsIn(ms: number, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms))) out[p.type] = p.value
  return out
}

/**
 * A bucket's key as the database writes it (community_analytics, to_char in
 * the same zone): "2026-10-15T09" for an hour, "2026-10-15" for a day,
 * "2026-10" for a month.
 */
export function bucketKey(ms: number, grain: Grain, timeZone: string): string {
  const p = partsIn(ms, timeZone)
  const day = `${p.year}-${p.month}-${p.day}`
  if (grain === "hour") return `${day}T${p.hour === "24" ? "00" : p.hour}`
  if (grain === "day") return day
  return `${p.year}-${p.month}`
}

/** The buckets of a period: where each starts and its key. */
export function bucketsOf(span: Span, timeZone: string, grain: Grain = grainFor(span)): { grain: Grain; starts: number[]; keys: string[] } {
  const starts = bucketStarts(span, grain, timeZone)
  return { grain, starts, keys: starts.map((s) => bucketKey(s, grain, timeZone)) }
}

/**
 * A UTC day ("2026-10-15", how the nightly count and the member days are
 * kept) as the bucket it is drawn in: the same date in the viewer's
 * calendar, or its month. Null for an hour chart, which reads the rows
 * themselves.
 */
export function dayKey(day: string, grain: Grain): string | null {
  if (grain === "hour") return null
  return grain === "day" ? day.slice(0, 10) : day.slice(0, 7)
}

/** Counts by key, in bucket order; a bucket with nothing is 0. */
export function lineOf(keys: string[], counts: Record<string, number> | null | undefined): number[] {
  return keys.map((k) => Number(counts?.[k]) || 0)
}

export function sum(xs: (number | null)[]): number {
  return xs.reduce<number>((n, x) => n + (x ?? 0), 0)
}

/**
 * Members at the end of each bucket, from members now and every join and
 * leave since: walking back from now, each bucket ends with what came after
 * it taken away. `joinedAfter` and `leftAfter` are the joins and leaves from
 * the end of the period until now.
 */
export function membersLine(now: number, joined: number[], left: number[], joinedAfter: number, leftAfter: number): number[] {
  const out = new Array<number>(joined.length).fill(0)
  let level = now - joinedAfter + leftAfter
  for (let i = joined.length - 1; i >= 0; i--) {
    out[i] = Math.max(0, level)
    level = level - (joined[i] ?? 0) + (left[i] ?? 0)
  }
  return out
}

/** A share in percent, one decimal, or null when there is nothing to divide by. */
export function rate(part: number, whole: number | null | undefined): number | null {
  if (!whole || whole <= 0) return null
  return Math.round((part / whole) * 1000) / 10
}

/** The period before's line, as long as this period's: what it lacks is null, what it has over is dropped. */
export function alignTo<T>(xs: T[] | null | undefined, n: number): (T | null)[] | null {
  if (!xs) return null
  return Array.from({ length: n }, (_, i) => (i < xs.length ? xs[i] : null))
}
