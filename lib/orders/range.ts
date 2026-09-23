/**
 * THE DATE RANGE ON THE ORDERS PAGE
 *
 * One range scopes everything on the page: the figures at the top and the
 * orders in the table, so the two always agree. It is remembered (a cookie,
 * so the server draws the page with it) and written into the address (so a
 * link opens the same slice). "Last 30 days" until the creator picks another.
 *
 * A custom range is two calendar days in the viewer's zone, both included:
 * "custom:2025-01-01:2025-03-31".
 */
import { startOfDay } from "./order-view"

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "12m" | "ytd" | "all" | "custom"

export interface Range {
  key: RangeKey
  /** Custom only: yyyy-mm-dd, inclusive. */
  from?: string
  to?: string
}

export const RANGE_COOKIE = "storelib_orders_range"
export const DEFAULT_RANGE: Range = { key: "30d" }

export const RANGE_PRESETS: Array<{ key: Exclude<RangeKey, "custom">; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "12m", label: "Last 12 months" },
  { key: "ytd", label: "This year" },
  { key: "all", label: "All time" },
]

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function validDay(s: string | undefined): s is string {
  if (!s || !ISO_DAY.test(s)) return false
  const [y, m, d] = s.split("-").map(Number)
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d && y >= 2000 && y <= 2100
}

export function parseRange(raw: string | null | undefined): Range | null {
  if (!raw) return null
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    /* Stored plain. */
  }
  if (RANGE_PRESETS.some((p) => p.key === value)) return { key: value as RangeKey }
  const m = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(value)
  if (m && validDay(m[1]) && validDay(m[2])) {
    const [from, to] = m[1] <= m[2] ? [m[1], m[2]] : [m[2], m[1]]
    return { key: "custom", from, to }
  }
  return null
}

export function serializeRange(r: Range): string {
  return r.key === "custom" ? `custom:${r.from}:${r.to}` : r.key
}

/** The start of a calendar day in a zone. Noon UTC of that date is inside it for every real offset. */
export function dayStartIn(isoDay: string, timeZone: string): number {
  const [y, m, d] = isoDay.split("-").map(Number)
  return startOfDay(Date.UTC(y, m - 1, d, 12), timeZone)
}

/** yyyy-mm-dd of an instant, in a zone. */
export function isoDayIn(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

export interface RangeWindow {
  start: number
  end: number
  /** The same length just before, or null when there is nothing before to compare with. */
  previous: { start: number; end: number } | null
}

/**
 * The instants a range covers. `earliest` is the first order's time, which
 * is where "All time" begins.
 */
export function rangeWindow(r: Range, now: number, timeZone: string, earliest?: number | null): RangeWindow {
  const today = startOfDay(now, timeZone)
  const withPrevious = (start: number, end: number): RangeWindow => ({
    start,
    end,
    previous: { start: start - (end - start), end: start },
  })
  switch (r.key) {
    case "today":
      /* Yesterday up to the same time of day, not the hours just before midnight. */
      return { start: today, end: now, previous: { start: startOfDay(today - HOUR, timeZone), end: now - DAY } }
    case "yesterday":
      return withPrevious(startOfDay(today - HOUR, timeZone), today)
    case "7d":
      return withPrevious(startOfDay(today - 6 * DAY + 2 * HOUR, timeZone), now)
    case "30d":
      return withPrevious(startOfDay(today - 29 * DAY + 2 * HOUR, timeZone), now)
    case "90d":
      return withPrevious(startOfDay(today - 89 * DAY + 2 * HOUR, timeZone), now)
    case "12m":
      return withPrevious(startOfDay(today - 364 * DAY + 2 * HOUR, timeZone), now)
    case "ytd": {
      /* This year so far against last year to the same date. */
      const year = Number(isoDayIn(now, timeZone).slice(0, 4))
      const start = dayStartIn(`${year}-01-01`, timeZone)
      const lastStart = dayStartIn(`${year - 1}-01-01`, timeZone)
      return { start, end: now, previous: { start: lastStart, end: lastStart + (now - start) } }
    }
    case "all": {
      const start = earliest != null && earliest < now ? startOfDay(earliest, timeZone) : today
      return { start, end: now, previous: null }
    }
    case "custom": {
      const start = dayStartIn(r.from!, timeZone)
      const lastDay = dayStartIn(r.to!, timeZone)
      const end = Math.min(startOfDay(lastDay + DAY + 2 * HOUR, timeZone), Math.max(now, start + HOUR))
      return withPrevious(start, end)
    }
  }
}

function fmtDay(ms: number, timeZone: string, withYear: boolean): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }).format(
      new Date(ms),
    )
  } catch {
    return new Date(ms).toDateString()
  }
}

/** What the range button says: the preset's name, or the custom days. */
export function rangeLabel(r: Range, timeZone: string): string {
  if (r.key !== "custom") return RANGE_PRESETS.find((p) => p.key === r.key)!.label
  const from = dayStartIn(r.from!, timeZone)
  const to = dayStartIn(r.to!, timeZone)
  const sameYear = r.from!.slice(0, 4) === r.to!.slice(0, 4)
  if (r.from === r.to) return fmtDay(from, timeZone, true)
  return `${fmtDay(from, timeZone, !sameYear)} – ${fmtDay(to, timeZone, true)}`
}

/** "Aug 25 – Sep 23, 2026", the days a window covers, for under the button. */
export function windowLabel(w: { start: number; end: number }, timeZone: string): string {
  const lastMoment = Math.max(w.start, w.end - 1)
  const a = isoDayIn(w.start, timeZone)
  const b = isoDayIn(lastMoment, timeZone)
  if (a === b) return fmtDay(w.start, timeZone, true)
  return `${fmtDay(w.start, timeZone, a.slice(0, 4) !== b.slice(0, 4))} – ${fmtDay(lastMoment, timeZone, true)}`
}

/** What the figures are held against, in words, or null when nothing is. */
export function comparisonLabel(r: Range, w: RangeWindow): string | null {
  if (!w.previous) return null
  switch (r.key) {
    case "today":
      return "compared with yesterday up to now"
    case "yesterday":
      return "compared with the day before"
    case "ytd":
      return "compared with last year to the same date"
    default: {
      const days = Math.max(1, Math.round((w.end - w.start) / DAY))
      return days === 1 ? "compared with the day before" : `compared with the ${days} days before`
    }
  }
}
