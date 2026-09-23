/**
 * ===========================================================================
 *  A PERIOD OF TIME, THE ONE WAY EVERY /app PAGE PICKS ONE
 * ===========================================================================
 * Analytics, the dashboard, orders, payouts, emails and the OnePage stats all
 * chose a period in their own way: seven different lists of presets, "last 7
 * days" meaning seven days on one page and now-minus-168-hours on another,
 * a custom range that parsed "2025-12-31" as UTC midnight and so left the
 * last day out. This is the single definition they share, drawn by
 * components/app/date-range-picker.tsx.
 *
 * A RANGE IS TWO CALENDAR DAYS, start and end, both included, as the
 * creator's clock reads them (their time zone, from lib/orders/time-zone.ts).
 * Turning that into instants is `boundsOf`, and nothing else does it.
 *
 * Pure: no React, no Date.now() unless handed one, so the tests run it.
 */

/** "2025-12-31". */
export type Ymd = string

export interface DateRange {
  start: Ymd
  end: Ymd
}

export type PresetId =
  | "today" | "yesterday"
  | "last_7_days" | "last_30_days" | "last_90_days" | "last_365_days" | "last_12_months"
  | "last_week" | "last_month" | "last_quarter" | "last_year"
  | "week_to_date" | "month_to_date" | "quarter_to_date" | "year_to_date"
  | "bfcm" | "bfcm_last_year"
  | "q1" | "q2" | "q3" | "q4"
  | "all_time"

export interface RangeValue extends DateRange {
  /** Which preset made it, or "custom". Kept so "Today" stays today tomorrow. */
  preset: PresetId | "custom"
}

export type CompareMode = "none" | "previous_period" | "previous_year" | "custom"

export interface CompareValue {
  mode: CompareMode
  /** Only for "custom". */
  range?: DateRange
}

const DAY = 86_400_000

/* ── calendar days ─────────────────────────────────────────────────────── */

export function isYmd(v: unknown): v is Ymd {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export function ymdOf(y: number, m: number, d: number): Ymd {
  const t = new Date(Date.UTC(y, m, d))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`
}

export function parts(v: Ymd): { y: number; m: number; d: number } {
  const [y, m, d] = v.split("-").map(Number)
  return { y, m: m - 1, d }
}

export function addDays(v: Ymd, n: number): Ymd {
  const { y, m, d } = parts(v)
  return ymdOf(y, m, d + n)
}

/** Whole days from a to b: addDays(a, daysBetween(a, b)) === b. */
export function daysBetween(a: Ymd, b: Ymd): number {
  const pa = parts(a)
  const pb = parts(b)
  return Math.round((Date.UTC(pb.y, pb.m, pb.d) - Date.UTC(pa.y, pa.m, pa.d)) / DAY)
}

/** Days in a range, both ends included. */
export function lengthOf(r: DateRange): number {
  return daysBetween(r.start, r.end) + 1
}

/** The same day a year earlier; 29 February becomes 28. */
export function minusYear(v: Ymd): Ymd {
  const { y, m, d } = parts(v)
  const last = new Date(Date.UTC(y - 1, m + 1, 0)).getUTCDate()
  return ymdOf(y - 1, m, Math.min(d, last))
}

export function ordered(a: Ymd, b: Ymd): DateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a }
}

/* ── the creator's clock ───────────────────────────────────────────────── */

function wallClock(ms: number, timeZone: string): number {
  let p: Intl.DateTimeFormatPart[]
  try {
    p = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(ms))
  } catch {
    return ms
  }
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"))
}

/** The calendar day it is at `ms`, on the creator's clock. */
export function todayIn(timeZone: string, ms: number): Ymd {
  const w = new Date(wallClock(ms, timeZone))
  return ymdOf(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate())
}

/** The instant a day begins in that zone. Correct across a DST change. */
export function midnightOf(v: Ymd, timeZone: string): number {
  const { y, m, d } = parts(v)
  const guess = Date.UTC(y, m, d)
  let t = guess - (wallClock(guess, timeZone) - guess)
  t = guess - (wallClock(t, timeZone) - t)
  return t
}

/**
 * The instants a range covers: from the first moment of its first day to the
 * first moment after its last day, capped at `now` so "Today" ends now.
 * `end` is exclusive.
 */
export function boundsOf(r: DateRange, timeZone: string, now?: number): { start: number; end: number } {
  const start = midnightOf(r.start, timeZone)
  const end = midnightOf(addDays(r.end, 1), timeZone)
  return { start, end: now !== undefined ? Math.min(end, Math.max(start, now)) : end }
}

/* ── presets ───────────────────────────────────────────────────────────── */

function quarterOf(m: number) {
  return Math.floor(m / 3)
}

/** The Friday after the fourth Thursday of November, through the Monday. */
function bfcmOf(year: number): DateRange {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay()
  const thanksgiving = 1 + ((4 - first + 7) % 7) + 21
  return { start: ymdOf(year, 10, thanksgiving + 1), end: ymdOf(year, 10, thanksgiving + 4) }
}

/** A preset as days, on the day `today`. Never reaches past today. */
export function presetRange(id: PresetId, today: Ymd, firstDay: Ymd = "2020-01-01"): DateRange {
  const { y, m } = parts(today)
  const cap = (r: DateRange): DateRange => ({ start: r.start, end: r.end > today ? today : r.end })
  const weekday = new Date(Date.UTC(y, m, parts(today).d)).getUTCDay()
  switch (id) {
    case "today": return { start: today, end: today }
    case "yesterday": { const d = addDays(today, -1); return { start: d, end: d } }
    case "last_7_days": return { start: addDays(today, -6), end: today }
    case "last_30_days": return { start: addDays(today, -29), end: today }
    case "last_90_days": return { start: addDays(today, -89), end: today }
    case "last_365_days": return { start: addDays(today, -364), end: today }
    case "last_12_months": return { start: ymdOf(y - 1, m + 1, 1), end: today }
    case "last_week": { const sun = addDays(today, -weekday - 7); return { start: sun, end: addDays(sun, 6) } }
    case "last_month": return { start: ymdOf(y, m - 1, 1), end: ymdOf(y, m, 0) }
    case "last_quarter": { const q = quarterOf(m); return { start: ymdOf(y, q * 3 - 3, 1), end: ymdOf(y, q * 3, 0) } }
    case "last_year": return { start: ymdOf(y - 1, 0, 1), end: ymdOf(y - 1, 11, 31) }
    case "week_to_date": return { start: addDays(today, -weekday), end: today }
    case "month_to_date": return { start: ymdOf(y, m, 1), end: today }
    case "quarter_to_date": return { start: ymdOf(y, quarterOf(m) * 3, 1), end: today }
    case "year_to_date": return { start: ymdOf(y, 0, 1), end: today }
    case "bfcm": {
      const thisYear = bfcmOf(y)
      return thisYear.start <= today ? cap(thisYear) : bfcmOf(y - 1)
    }
    case "bfcm_last_year": {
      const thisYear = bfcmOf(y)
      return thisYear.start <= today ? bfcmOf(y - 1) : bfcmOf(y - 2)
    }
    case "q1": case "q2": case "q3": case "q4": {
      const q = Number(id[1]) - 1
      /* This year's quarter once it has begun, otherwise last year's. */
      const year = ymdOf(y, q * 3, 1) <= today ? y : y - 1
      return cap({ start: ymdOf(year, q * 3, 1), end: ymdOf(year, q * 3 + 3, 0) })
    }
    case "all_time": return { start: firstDay < today ? firstDay : today, end: today }
  }
}

export const PRESET_LABEL: Record<PresetId, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  last_365_days: "Last 365 days",
  last_12_months: "Last 12 months",
  last_week: "Last week",
  last_month: "Last month",
  last_quarter: "Last quarter",
  last_year: "Last year",
  week_to_date: "Week to date",
  month_to_date: "Month to date",
  quarter_to_date: "Quarter to date",
  year_to_date: "Year to date",
  bfcm: "Black Friday Cyber Monday",
  bfcm_last_year: "Black Friday Cyber Monday, last year",
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
  all_time: "All time",
}

/**
 * The list the picker opens to. The periods people choose most are rows of
 * their own, one tap and done; the rarer ones sit behind a row that opens
 * its own list; and a range of one's own is the last row, a second step with
 * the calendar in it.
 */
export type PresetGroup =
  | { kind: "item"; id: PresetId }
  | { kind: "group"; label: string; children: PresetId[] }
  | { kind: "custom" }

export const PRESET_MENU: PresetGroup[][] = [
  [{ kind: "item", id: "today" }, { kind: "item", id: "yesterday" }],
  [
    { kind: "item", id: "last_7_days" },
    { kind: "item", id: "last_30_days" },
    { kind: "item", id: "last_90_days" },
    { kind: "item", id: "last_12_months" },
  ],
  [{ kind: "item", id: "month_to_date" }, { kind: "item", id: "year_to_date" }, { kind: "item", id: "all_time" }],
  [
    { kind: "group", label: "Quarters", children: ["q1", "q2", "q3", "q4"] },
    { kind: "group", label: "Black Friday Cyber Monday", children: ["bfcm", "bfcm_last_year"] },
    {
      kind: "group",
      label: "More periods",
      children: ["last_week", "last_month", "last_quarter", "last_year", "week_to_date", "quarter_to_date", "last_365_days"],
    },
  ],
  [{ kind: "custom" }],
]

export function isPreset(v: unknown): v is PresetId {
  return typeof v === "string" && v in PRESET_LABEL
}

/** A saved or linked value, re-read against today: a preset moves with the calendar. */
export function resolveValue(v: Partial<RangeValue> | null | undefined, today: Ymd, fallback: PresetId = "last_30_days", firstDay?: Ymd): RangeValue {
  if (v && isPreset(v.preset)) return { preset: v.preset, ...presetRange(v.preset, today, firstDay) }
  if (v && v.preset === "custom" && isYmd(v.start) && isYmd(v.end)) {
    const r = ordered(v.start, v.end)
    return { preset: "custom", start: r.start, end: r.end > today ? today : r.end }
  }
  return { preset: fallback, ...presetRange(fallback, today, firstDay) }
}

/* ── comparison ────────────────────────────────────────────────────────── */

export const COMPARE_LABEL: Record<CompareMode, string> = {
  none: "No comparison",
  previous_period: "Previous period",
  previous_year: "Previous year",
  custom: "Custom",
}

/**
 * The range a period is compared against, or null for none.
 *
 * Previous period is the same number of days, ending the day before. A
 * period that runs to today is compared with the same stretch of time: today
 * until now against yesterday until the same hour is `boundsOf` with a `now`
 * moved back by the gap, which callers get from `compareBounds`.
 */
export function compareRange(r: DateRange, c: CompareValue): DateRange | null {
  if (c.mode === "none") return null
  if (c.mode === "custom") return c.range && isYmd(c.range.start) && isYmd(c.range.end) ? ordered(c.range.start, c.range.end) : null
  if (c.mode === "previous_year") return { start: minusYear(r.start), end: minusYear(r.end) }
  const n = lengthOf(r)
  return { start: addDays(r.start, -n), end: addDays(r.start, -1) }
}

/**
 * The comparison's instants. When the period is still running (it ends
 * today), the comparison is cut at the same point into its own last day, so
 * a morning is compared with a morning and not with a whole day.
 */
export function compareBounds(r: DateRange, c: CompareValue, timeZone: string, now: number): { start: number; end: number } | null {
  const cr = compareRange(r, c)
  if (!cr) return null
  const current = boundsOf(r, timeZone, now)
  const full = boundsOf(r, timeZone)
  const cb = boundsOf(cr, timeZone)
  const running = current.end < full.end
  if (!running || c.mode === "custom") return cb
  const elapsed = current.end - current.start
  return { start: cb.start, end: Math.min(cb.end, cb.start + elapsed) }
}

/* ── words ─────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function monthName(m: number, long = false): string {
  return (long ? MONTHS_LONG : MONTHS)[((m % 12) + 12) % 12]
}

/** "January 1, 2025", for the date boxes. */
export function longDate(v: Ymd): string {
  const { y, m, d } = parts(v)
  return `${MONTHS_LONG[m]} ${d}, ${y}`
}

/**
 * What the button says: "Jan 1–Dec 31, 2025", "Dec 28, 2024–Jan 3, 2025",
 * "Mar 4, 2025" for one day. The year is written once when both ends share it.
 */
export function rangeLabel(r: DateRange): string {
  const a = parts(r.start)
  const b = parts(r.end)
  if (r.start === r.end) return `${MONTHS[a.m]} ${a.d}, ${a.y}`
  if (a.y === b.y) {
    if (a.m === b.m) return `${MONTHS[a.m]} ${a.d}–${b.d}, ${a.y}`
    return `${MONTHS[a.m]} ${a.d}–${MONTHS[b.m]} ${b.d}, ${a.y}`
  }
  return `${MONTHS[a.m]} ${a.d}, ${a.y}–${MONTHS[b.m]} ${b.d}, ${b.y}`
}

/** A preset's own name where one made it, the dates otherwise. */
export function valueLabel(v: RangeValue): string {
  return v.preset === "custom" ? rangeLabel(v) : PRESET_LABEL[v.preset]
}

/**
 * Read what somebody typed into a date box: "January 1, 2025", "Jan 1 2025",
 * "2025-01-01", "1/31/2025". Null when it is not a date.
 */
export function parseTyped(text: string): Ymd | null {
  const t = text.trim().replace(/\s+/g, " ")
  if (isYmd(t)) return t
  const iso = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(t)
  if (iso) {
    const v = ymdOf(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return isYmd(v) && v === `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}` ? v : null
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (us) {
    const v = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
    return isYmd(v) ? v : null
  }
  const words = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(t)
  if (words) {
    const name = words[1].toLowerCase()
    const m = MONTHS_LONG.findIndex((x) => x.toLowerCase().startsWith(name.slice(0, 3)))
    if (m < 0) return null
    const v = `${words[3]}-${String(m + 1).padStart(2, "0")}-${words[2].padStart(2, "0")}`
    return isYmd(v) ? v : null
  }
  return null
}

/**
 * The size of a chart bucket for a range: hours for one or two days, days up
 * to three months, weeks up to a year and a bit, months beyond.
 */
export function grainOf(r: DateRange): "hour" | "day" | "week" | "month" {
  const n = lengthOf(r)
  if (n <= 2) return "hour"
  if (n <= 92) return "day"
  if (n <= 400) return "week"
  return "month"
}
