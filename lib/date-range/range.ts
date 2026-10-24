import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
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
  | "last_7_days" | "last_30_days" | "last_90_days" | "last_12_months"
  | "month_to_date"
  | "all_time"

/**
 * Periods the picker offered once and does not any more: the quarters, Black
 * Friday Cyber Monday, the "More periods" list and Year to date. A link, a
 * cookie or a saved choice that still names one opens on the last 30 days
 * (resolveValue), never on an error and never on a period nobody can pick.
 */
export const RETIRED_PRESETS: readonly string[] = [
  "year_to_date", "quarter_to_date", "week_to_date",
  "last_week", "last_month", "last_quarter", "last_year", "last_365_days",
  "bfcm", "bfcm_last_year",
  "q1", "q2", "q3", "q4",
]

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

/* One formatter per zone: making one costs far more than using it, and the chart's days ask per row. */
const wallFormats = new Map<string, Intl.DateTimeFormat>()

function wallClock(ms: number, timeZone: string): number {
  let p: Intl.DateTimeFormatPart[]
  try {
    let f = wallFormats.get(timeZone)
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      })
      if (wallFormats.size > 50) wallFormats.clear()
      wallFormats.set(timeZone, f)
    }
    p = f.formatToParts(new Date(ms))
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

/** Whether an instant is the very start of a day in that zone: the end of a finished period, not a "now". */
export function isMidnightIn(ms: number, timeZone: string): boolean {
  if (!Number.isFinite(ms)) return false
  return midnightOf(todayIn(timeZone, ms), timeZone) === ms
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

/** A preset as days, on the day `today`. Never reaches past today. */
export function presetRange(id: PresetId, today: Ymd, firstDay: Ymd = "2020-01-01"): DateRange {
  const { y, m } = parts(today)
  switch (id) {
    case "today": return { start: today, end: today }
    case "yesterday": { const d = addDays(today, -1); return { start: d, end: d } }
    case "last_7_days": return { start: addDays(today, -6), end: today }
    case "last_30_days": return { start: addDays(today, -29), end: today }
    case "last_90_days": return { start: addDays(today, -89), end: today }
    case "last_12_months": return { start: ymdOf(y - 1, m + 1, 1), end: today }
    case "month_to_date": return { start: ymdOf(y, m, 1), end: today }
    case "all_time": return { start: firstDay < today ? firstDay : today, end: today }
  }
}

export const PRESET_LABEL: Record<PresetId, string> = {
  get today() { return tt("Today") },
  get yesterday() { return tt("Yesterday") },
  get last_7_days() { return tt("Last 7 days") },
  get last_30_days() { return tt("Last 30 days") },
  get last_90_days() { return tt("Last 90 days") },
  get last_12_months() { return tt("Last 12 months") },
  get month_to_date() { return tt("Month to date") },
  get all_time() { return tt("All time") },
}

/**
 * The list the picker opens to. Every period is a row of its own, one tap
 * and done, and a range of one's own is the last row, a second step with the
 * calendar in it. No row opens a list of its own.
 */
export type PresetGroup = { kind: "item"; id: PresetId } | { kind: "custom" }

export const PRESET_MENU: PresetGroup[][] = [
  [{ kind: "item", id: "today" }, { kind: "item", id: "yesterday" }],
  [
    { kind: "item", id: "last_7_days" },
    { kind: "item", id: "last_30_days" },
    { kind: "item", id: "last_90_days" },
    { kind: "item", id: "last_12_months" },
  ],
  [{ kind: "item", id: "month_to_date" }, { kind: "item", id: "all_time" }],
  [{ kind: "custom" }],
]

/** Own keys only: "toString" is in every object and is not a period. */
export function isPreset(v: unknown): v is PresetId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PRESET_LABEL, v)
}

/** Where a period the picker no longer offers opens instead. */
export const RETIRED_FALLBACK: PresetId = "last_30_days"

/**
 * A saved or linked value, re-read against today: a preset moves with the
 * calendar. A retired period (RETIRED_PRESETS) opens on the last 30 days;
 * anything else that cannot be read opens on the page's own default.
 */
export function resolveValue(v: Partial<RangeValue> | null | undefined, today: Ymd, fallback: PresetId = "last_30_days", firstDay?: Ymd): RangeValue {
  if (v && isPreset(v.preset)) return { preset: v.preset, ...presetRange(v.preset, today, firstDay) }
  if (v && v.preset === "custom" && isYmd(v.start) && isYmd(v.end)) {
    const r = ordered(v.start, v.end)
    return { preset: "custom", start: r.start, end: r.end > today ? today : r.end }
  }
  const to = v && typeof v.preset === "string" && RETIRED_PRESETS.includes(v.preset) ? RETIRED_FALLBACK : fallback
  return { preset: to, ...presetRange(to, today, firstDay) }
}

/* ── comparison ────────────────────────────────────────────────────────── */

export const COMPARE_LABEL: Record<CompareMode, string> = {
  get none() { return tt("No comparison") },
  get previous_period() { return tt("Previous period") },
  get previous_year() { return tt("Previous year") },
  get custom() { return tt("Custom") },
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
  /*
    The same time of day on its own last day, on the clock: not the
    period's elapsed milliseconds counted from the comparison's start. A
    period with a 25 hour day in it (the clocks going back) cut its
    comparison an hour late, and one with a 23 hour day an hour early.
  */
  const wall = wallClock(current.end, timeZone)
  const timeOfDay = ((wall % 86_400_000) + 86_400_000) % 86_400_000
  const { y, m, d } = parts(cr.end)
  const guess = Date.UTC(y, m, d) + timeOfDay
  let at = guess - (wallClock(guess, timeZone) - guess)
  at = guess - (wallClock(at, timeZone) - at)
  return { start: cb.start, end: Math.max(cb.start, Math.min(cb.end, at)) }
}

/* ── words ─────────────────────────────────────────────────────────────── */

/* English fallbacks for a browser without Intl; monthName() asks Intl first. i18n-ignore-start */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
/* i18n-ignore-end */

/** A month's name in the dashboard's language ("Oct", "octubre", "paź"). */
export function monthName(m: number, long = false): string {
  const i = ((m % 12) + 12) % 12
  try {
    return new Intl.DateTimeFormat(appLocale(), { month: long ? "long" : "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, i, 15)))
  } catch {
    return (long ? MONTHS_LONG : MONTHS)[i]
  }
}

const utc = (v: Ymd) => {
  const { y, m, d } = parts(v)
  return new Date(Date.UTC(y, m, d, 12))
}

/** "January 1, 2025" / "1 de enero de 2025" / "1. Januar 2025", for the date boxes. */
export function longDate(v: Ymd): string {
  try {
    return new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(utc(v))
  } catch {
    const { y, m, d } = parts(v)
    return `${MONTHS_LONG[m]} ${d}, ${y}`
  }
}

/**
 * What the button says: "Jan 1–Dec 31, 2025", "Dec 28, 2024–Jan 3, 2025",
 * "Mar 4, 2025" for one day, in the dashboard's language: Intl writes the
 * year once when both ends share it, and puts the day first where the
 * language does ("1–31 dic 2025").
 */
export function rangeLabel(r: DateRange): string {
  /* English keeps its own form, "Jan 1–Dec 31, 2025"; other languages take Intl's. */
  if (appLocale() !== "en-US") {
    try {
      const f = new Intl.DateTimeFormat(appLocale(), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      if (r.start === r.end) return f.format(utc(r.start))
      const ranged = f as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string }
      if (typeof ranged.formatRange === "function") return ranged.formatRange(utc(r.start), utc(r.end))
    } catch {
      /* An old Intl: the English form below. */
    }
  }
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
  /* 31/1/2025 in English is m/d/y; everywhere else d/m/y, and d.m.y in German and Polish. */
  const dayFirst = !appLocale().startsWith("en-US")
  const numeric = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t)
  if (numeric) {
    const [first, second] = [numeric[1], numeric[2]]
    const [mm, dd] = dayFirst ? [second, first] : [first, second]
    const v = `${numeric[3]}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
    return isYmd(v) ? v : null
  }
  /* Words: "January 1, 2025", "1 de enero de 2025", "1. Januar 2025", "1 stycznia 2025". */
  const tokens = (t as string).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,]/g, " ").split(" ").filter((w) => w && !/^(de|di|del|of|the)$/.test(w))
  const year = tokens.find((w) => /^\d{4}$/.test(w))
  const day = tokens.find((w) => /^\d{1,2}$/.test(w))
  const word = tokens.find((w) => /^\p{L}{3,}$/u.test(w))
  if (year && day && word && tokens.length === 3) {
    const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "")
    const names: string[][] = [MONTHS_LONG.map(plain)]
    try {
      for (const style of ["long", "short"] as const) {
        const f = new Intl.DateTimeFormat(appLocale(), { month: style, day: "numeric", timeZone: "UTC" })
        names.push(Array.from({ length: 12 }, (_, i) => plain(f.formatToParts(new Date(Date.UTC(2024, i, 15))).find((p) => p.type === "month")?.value ?? "")))
      }
    } catch {
      /* English names only. */
    }
    let m = -1
    for (const list of names) {
      m = list.findIndex((x) => x && (x === word || (word.length >= 3 && x.startsWith(word.slice(0, Math.max(3, Math.min(word.length, x.length)))))))
      if (m >= 0) break
    }
    if (m < 0) return null
    const v = `${year}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`
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
