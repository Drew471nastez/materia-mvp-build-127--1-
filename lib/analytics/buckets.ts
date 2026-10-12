/**
 * TIME, CUT INTO BUCKETS, IN THE VIEWER'S ZONE
 *
 * Shared by the Analytics reports (lib/analytics/reports.ts) and the Orders
 * metrics (lib/orders/metrics.ts), so a "day" on one page is the same day on
 * the other: it starts at the viewer's midnight, not the server's.
 */
import { startOfDay } from "../orders/order-view"
import { appLocale, zoned } from "@/lib/i18n/format"

const HOUR = 3_600_000
const DAY = 24 * HOUR

export interface Span {
  start: number
  end: number
}

export type Grain = "hour" | "day" | "month"

/**
 * The stretches of time to read: the period and its comparison, as one
 * stretch when they touch or overlap, as two when they do not, so a
 * comparison with last year does not mean reading the whole year between.
 */
export function spansToRead(cur: Span, prev: Span | null): Span[] {
  if (!prev || prev.end <= prev.start) return [cur]
  const [a, b] = prev.start <= cur.start ? [prev, cur] : [cur, prev]
  if (b.start <= a.end) return [{ start: a.start, end: Math.max(a.end, b.end) }]
  return [a, b]
}

export function previousWindow(w: Span): Span {
  const length = w.end - w.start
  return { start: w.start - length, end: w.start }
}

export function grainFor(w: Span): Grain {
  const length = w.end - w.start
  if (length <= 2 * DAY + HOUR) return "hour"
  if (length <= 92 * DAY) return "day"
  return "month"
}

function monthStart(ms: number, timeZone: string): number {
  const day = startOfDay(ms, timeZone)
  const dom = Number(new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(new Date(day + HOUR)))
  return startOfDay(day - (dom - 1) * DAY + HOUR, timeZone)
}

/** Where each bucket of the window starts, in the viewer's zone. */
export function bucketStarts(w: Span, grain: Grain, timeZone: string): number[] {
  const out: number[] = []
  if (grain === "hour") {
    /*
      On the viewer's clock, not UTC's. `w.start % HOUR` is a UTC hour, which
      is also a local hour almost everywhere, and not in India, Nepal, Iran,
      Newfoundland or central Australia: there every bucket ran from half
      past to half past and "9 am" held the visits from 9:30 to 10:30.
    */
    const midnight = startOfDay(w.start, timeZone)
    for (let t = midnight + Math.floor((w.start - midnight) / HOUR) * HOUR; t < w.end; t += HOUR) out.push(t)
  } else if (grain === "day") {
    for (let t = startOfDay(w.start, timeZone); t < w.end; t = startOfDay(t + DAY + 2 * HOUR, timeZone)) out.push(t)
  } else {
    for (let t = monthStart(w.start, timeZone); t < w.end; t = monthStart(t + 32 * DAY, timeZone)) out.push(t)
  }
  return out.length > 0 ? out : [w.start]
}

export function bucketIndex(starts: number[], at: number): number {
  let lo = 0
  let hi = starts.length - 1
  if (at < starts[0]) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= at) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function bucketLabel(ms: number, grain: Grain, timeZone: string): string {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(appLocale(), zoned({ ...o, timeZone })).format(new Date(ms))
  if (grain === "hour") return fmt({ hour: "numeric" }).replace(" AM", " am").replace(" PM", " pm")
  if (grain === "day") return fmt({ month: "short", day: "numeric" })
  return fmt({ month: "short", year: "2-digit" }).replace(" ", " ’")
}

