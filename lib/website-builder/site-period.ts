/**
 * The period the bar above the website's cover shows, in the address and as
 * instants. Kept apart from the counting so the browser can use it without
 * carrying the whole of Analytics with it.
 */
import { boundsOf, compareBounds, todayIn, type RangeValue } from "@/lib/date-range/range"
import { readPeriod, writePeriod } from "@/lib/date-range/params"

export interface Span {
  start: number
  end: number
}

/** The bar's own default, like Shopify's: the last thirty days. */
export const PERIOD_FALLBACK = "last_30_days" as const

/** The period in an address, resolved to instants on the creator's clock. */
export function periodFromParams(params: URLSearchParams, timeZone: string, now: number) {
  const today = todayIn(timeZone, now)
  const { period } = readPeriod(params, today, PERIOD_FALLBACK)
  const span: Span = boundsOf(period, timeZone, now)
  /* All time has no before. */
  const previous: Span | null = period.preset === "all_time" ? null : compareBounds(period, { mode: "previous_period" }, timeZone, now)
  return { period, span, previous }
}

/** The query string that means this period, to Analytics and to this bar's own route. */
export function periodQuery(period: RangeValue, fallback: string): string {
  const params = new URLSearchParams()
  writePeriod(params, period, null, fallback as never)
  return params.toString()
}

/** The Analytics page for the same period (its own default is seven days). */
export function analyticsHref(period: RangeValue): string {
  const q = periodQuery(period, "last_7_days")
  return q ? `/app/analytics?${q}` : "/app/analytics"
}
