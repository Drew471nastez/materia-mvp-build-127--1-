/**
 * ===========================================================================
 *  REVIEWS › ANALYTICS: THE ARITHMETIC
 * ===========================================================================
 * A period (the last 7, 30 or 90 days, the last 12 months, or two dates the
 * store picked) and the period of the same length right before it, which
 * every number is compared with. Over each:
 *
 *   volume        reviews written, by day, week or month (granularity: a
 *                 day up to 31 days, a week up to 120, else a month)
 *   average       the mean rating of the reviews written in each bucket;
 *                 a bucket with none has no average (a gap, never a zero).
 *                 The trend line reads it over the last seven days at each
 *                 day (ratingTrend), so one review does not swing it from
 *                 five to one and back
 *   distribution  how many of each rating
 *   verified      the share tied to a real order
 *   media         the share with a photo or a video
 *   requests      emails due in the period: how many went, how many the
 *                 provider refused (delivery = went / went or failed), how
 *                 many led to a review (submission = reviewed / went), and
 *                 how many reminders went
 *
 * Reviews count by when they were written, whatever the store did with them
 * after, so a period's numbers do not change when a review is approved.
 * Times are UTC days; the page draws the labels in the store's language.
 *
 * Pure: no database.
 */

export const DAY_MS = 86_400_000

export const RANGE_KEYS = ["7d", "30d", "90d", "12m"] as const
export type RangeKey = (typeof RANGE_KEYS)[number] | "custom"

export interface Period {
  /** Inclusive, ms. */
  from: number
  /** Exclusive, ms. */
  to: number
}

export type Granularity = "day" | "week" | "month"

const startOfUtcDay = (t: number) => Math.floor(t / DAY_MS) * DAY_MS

/** The period a key names, ending at the end of today (UTC). */
export function periodFor(key: RangeKey, now = Date.now(), custom?: { from?: string | null; to?: string | null }): Period {
  const end = startOfUtcDay(now) + DAY_MS
  if (key === "custom" && custom) {
    const a = Date.parse(String(custom.from ?? ""))
    const b = Date.parse(String(custom.to ?? ""))
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const from = startOfUtcDay(Math.min(a, b))
      /* The last day picked is included; at most two years, never past today. */
      const to = Math.min(end, startOfUtcDay(Math.max(a, b)) + DAY_MS)
      return { from: Math.max(from, to - 731 * DAY_MS), to: Math.max(to, from + DAY_MS) }
    }
  }
  const days = key === "7d" ? 7 : key === "90d" ? 90 : key === "12m" ? 365 : 30
  return { from: end - days * DAY_MS, to: end }
}

/** The period of the same length right before. */
export function previousPeriod(p: Period): Period {
  return { from: p.from - (p.to - p.from), to: p.from }
}

export function granularityFor(p: Period): Granularity {
  const days = Math.round((p.to - p.from) / DAY_MS)
  return days <= 31 ? "day" : days <= 120 ? "week" : "month"
}

export interface Bucket {
  start: number
  end: number
}

/** The period cut into days, seven day weeks counted from its first day, or calendar months (UTC), the first and last cut to the period. */
export function bucketsFor(p: Period, g: Granularity = granularityFor(p)): Bucket[] {
  const out: Bucket[] = []
  if (g === "month") {
    let d = new Date(p.from)
    while (d.getTime() < p.to) {
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
      out.push({ start: d.getTime(), end: Math.min(next, p.to) })
      d = new Date(next)
    }
    return out
  }
  const step = g === "week" ? 7 * DAY_MS : DAY_MS
  for (let t = p.from; t < p.to; t += step) out.push({ start: t, end: Math.min(t + step, p.to) })
  return out
}

export interface ReviewPoint {
  created_at: string
  rating: number
  verified?: boolean
  media?: boolean
}

export interface SeriesPoint extends Bucket {
  count: number
  /** One decimal; null when nothing was written in the bucket. */
  average: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function inPeriod(iso: string | null | undefined, p: Period): boolean {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) && t >= p.from && t < p.to
}

/** Reviews written in each bucket, and their mean rating. */
export function reviewSeries(reviews: readonly ReviewPoint[], p: Period, g: Granularity = granularityFor(p)): SeriesPoint[] {
  const buckets = bucketsFor(p, g)
  const sums = buckets.map(() => ({ n: 0, sum: 0 }))
  for (const r of reviews) {
    const t = Date.parse(r.created_at)
    if (!Number.isFinite(t) || t < p.from || t >= p.to) continue
    /* Buckets are in order: the last whose start is at or before t. */
    let lo = 0
    let hi = buckets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (buckets[mid].start <= t) lo = mid
      else hi = mid - 1
    }
    sums[lo].n++
    sums[lo].sum += r.rating
  }
  return buckets.map((b, i) => ({ ...b, count: sums[i].n, average: sums[i].n ? round1(sums[i].sum / sums[i].n) : null }))
}

/** The rolling window the trend reads at each day: seven days. A week or a month is read on its own. */
export const TREND_DAYS = 7

/**
 * The mean rating at each bucket: by day, of the reviews written in the
 * seven days up to that day's end (reviews before the period count for its
 * first days); by week or month, of that bucket's own. Null where there
 * are none in the window.
 */
export function ratingTrend(reviews: readonly ReviewPoint[], p: Period, g: Granularity = granularityFor(p)): SeriesPoint[] {
  const own = reviewSeries(reviews, p, g)
  if (g !== "day") return own
  const times = reviews.map((r) => ({ t: Date.parse(r.created_at), rating: r.rating })).filter((r) => Number.isFinite(r.t))
  return own.map((b) => {
    const from = b.end - TREND_DAYS * DAY_MS
    const inWindow = times.filter((r) => r.t >= from && r.t < b.end)
    const sum = inWindow.reduce((a, r) => a + r.rating, 0)
    return { ...b, count: inWindow.length, average: inWindow.length ? round1(sum / inWindow.length) : null }
  })
}

/** How many of each rating, five first. */
export function distribution(ratings: readonly number[]): { stars: 5 | 4 | 3 | 2 | 1; count: number; share: number }[] {
  const total = ratings.filter((r) => r >= 1 && r <= 5).length
  return ([5, 4, 3, 2, 1] as const).map((stars) => {
    const count = ratings.filter((r) => r === stars).length
    return { stars, count, share: total ? count / total : 0 }
  })
}

/** A part of a whole as 0 to 1, or null when the whole is nothing (shown as "No data", never 0%). */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : null
}

export interface RequestPoint {
  status: string
  skip_reason?: string | null
  sent_at?: string | null
  reminded_at?: string | null
}

export interface Funnel {
  /** Emails that went. */
  sent: number
  /** Emails the provider refused for good. */
  failed: number
  reminders: number
  /** Reviews written from a request that went. */
  reviewed: number
  /** Cancelled by the store, or skipped by the rules (already reviewed, unsubscribed, a duplicate). */
  stopped: number
  deliveryRate: number | null
  submissionRate: number | null
}

export function requestFunnel(rows: readonly RequestPoint[]): Funnel {
  let sent = 0
  let failed = 0
  let reminders = 0
  let reviewed = 0
  let stopped = 0
  for (const r of rows) {
    if (r.sent_at) sent++
    else if (r.status === "failed") failed++
    else if (r.status === "skipped") stopped++
    if (r.reminded_at) reminders++
    if (r.status === "reviewed" && r.sent_at) reviewed++
  }
  return { sent, failed, reminders, reviewed, stopped, deliveryRate: share(sent, sent + failed), submissionRate: share(reviewed, sent) }
}

export interface PeriodSummary {
  count: number
  average: number | null
  verifiedShare: number | null
  mediaShare: number | null
  funnel: Funnel
}

export function summarize(reviews: readonly ReviewPoint[], requests: readonly (RequestPoint & { due_at?: string | null })[], p: Period): PeriodSummary {
  const mine = reviews.filter((r) => inPeriod(r.created_at, p))
  const sum = mine.reduce((a, r) => a + r.rating, 0)
  return {
    count: mine.length,
    average: mine.length ? round1(sum / mine.length) : null,
    verifiedShare: share(mine.filter((r) => r.verified !== false).length, mine.length),
    mediaShare: share(mine.filter((r) => r.media).length, mine.length),
    funnel: requestFunnel(requests.filter((r) => inPeriod(r.due_at ?? r.sent_at ?? null, p))),
  }
}

/** This period against the one before: the difference, and as a share of before (null when before was nothing). */
export function change(now: number | null, before: number | null): { delta: number | null; relative: number | null } {
  if (now === null || before === null) return { delta: null, relative: null }
  return { delta: now - before, relative: before !== 0 ? (now - before) / Math.abs(before) : null }
}

/** The headroom the chart's top line sits at: a round number above the highest count, so the grid reads 0, n/3, 2n/3, n. */
export function niceMax(n: number): number {
  if (n <= 3) return 3
  const steps = [3, 6, 9, 12, 15, 30, 45, 60, 90, 120, 150, 300, 450, 600, 900, 1200, 1500, 3000, 6000, 9000, 12000, 15000, 30000]
  return steps.find((s) => s >= n) ?? Math.ceil(n / 30000) * 30000
}
