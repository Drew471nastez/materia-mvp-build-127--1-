/**
 * THE DATE RANGE ON THE ORDERS PAGE
 *
 * One range scopes everything on the page: the figures at the top and the
 * orders in the table, so the two always agree. It is the same period and
 * comparison every page in /app picks with (lib/date-range), remembered in a
 * cookie so the server draws the page with it, and written into the address
 * so a link opens the same slice. "Last 30 days" until the creator picks
 * another.
 *
 * The cookie holds the same query string the address does:
 * "range=custom&from=2025-01-01&to=2025-03-31&compare=previous_year".
 * Addresses and cookies from before the shared picker ("30d",
 * "custom:2025-01-01:2025-03-31", ?period=7d) still open what they meant.
 */
import { readPeriod, writePeriod } from "../date-range/params"
import { boundsOf, compareBounds, todayIn, type CompareValue, type PresetId, type RangeValue, type Ymd } from "../date-range/range"

export const RANGE_COOKIE = "storelib_orders_range"
export const DEFAULT_PRESET: PresetId = "last_30_days"

/**
 * The older spellings. "ytd" names Year to date, which the picker no longer
 * offers, so it reads as that retired period and opens on the last 30 days
 * (lib/date-range/range resolveValue), the same as ?range=year_to_date.
 */
const LEGACY: Record<string, string> = {
  "7d": "last_7_days",
  "30d": "last_30_days",
  "90d": "last_90_days",
  "12m": "last_12_months",
  ytd: "year_to_date",
  all: "all_time",
}

/** Rewrite the older spellings of a range into the shared one, in place. */
function modernize(params: URLSearchParams): URLSearchParams {
  const range = params.get("range") ?? params.get("period")
  params.delete("period")
  if (!range) return params
  const custom = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(range)
  if (custom) {
    params.set("range", "custom")
    params.set("from", custom[1])
    params.set("to", custom[2])
  } else {
    params.set("range", LEGACY[range] ?? range)
  }
  return params
}

function fromCookie(raw: string | null | undefined): URLSearchParams {
  if (!raw) return new URLSearchParams()
  let text = raw
  try {
    text = decodeURIComponent(raw)
  } catch {
    /* Stored plain. */
  }
  return modernize(text.includes("=") ? new URLSearchParams(text) : new URLSearchParams({ range: text }))
}

/**
 * The period and comparison to show: the address first (a shared link),
 * then what this creator chose last time, then the last 30 days. The address
 * and the cookie are taken part by part, so a link that only says
 * ?compare=none keeps the creator's own range.
 */
export function readOrdersPeriod(
  address: URLSearchParams,
  cookie: string | null | undefined,
  today: Ymd,
  firstDay?: Ymd,
): { period: RangeValue; compare: CompareValue } {
  const merged = fromCookie(cookie)
  const linked = modernize(new URLSearchParams(address))
  const take = (keys: string[]) => {
    for (const k of keys) {
      const v = linked.get(k)
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
  }
  if (linked.has("range")) take(["range", "from", "to"])
  if (linked.has("compare")) take(["compare", "cfrom", "cto"])
  return readPeriod(merged, today, DEFAULT_PRESET, firstDay)
}

/** What the cookie stores. Empty for the default, which is what no cookie means. */
export function serializePeriod(period: RangeValue, compare: CompareValue): string {
  const params = new URLSearchParams()
  writePeriod(params, period, compare, DEFAULT_PRESET)
  return params.toString()
}

/** The first order's calendar day where the creator is, which is where "All time" begins. */
export function firstDayOf(earliest: number | null, timeZone: string): Ymd | undefined {
  return earliest == null || !Number.isFinite(earliest) ? undefined : todayIn(timeZone, earliest)
}

export interface RangeWindow {
  start: number
  end: number
  /** The window it is compared with, or null when there is none. */
  previous: { start: number; end: number } | null
}

/**
 * The instants a period covers, up to now, and the ones it is held against.
 * "All time" is compared with nothing: there is no before the first order.
 */
export function rangeWindow(period: RangeValue, compare: CompareValue, now: number, timeZone: string): RangeWindow {
  const { start, end } = boundsOf(period, timeZone, now)
  const previous = period.preset === "all_time" ? null : compareBounds(period, compare, timeZone, now)
  return { start, end, previous }
}
