/**
 * ===========================================================================
 *  DATES AND NUMBERS IN THE CREATOR'S LANGUAGE AND TIME ZONE
 * ===========================================================================
 * Every date the dashboard writes is in the time zone chosen in Settings
 * (lib/account/time-zone: the account's, written to localStorage by the
 * /app layout before anything renders) and in the dashboard's language:
 * "12 oct. 2026, 09:40" in French, "12.10.2026, 09:40" in German.
 *
 * The browser side only: the server renders /app's client pages after the
 * language is known (LanguageProvider), and its own pages ask
 * lib/i18n/server for the request's language.
 */
import { activeLanguage, activeLocale } from "./text"

const ZONE_KEY = "storelib_timezone"

function validZone(zone: string | null | undefined): zone is string {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The creator's time zone: the one chosen in Settings, else the device's, else UTC. */
export function appTimeZone(): string {
  if (typeof window !== "undefined") {
    try {
      const chosen = window.localStorage.getItem(ZONE_KEY)
      if (validZone(chosen)) return chosen
    } catch {
      /* Storage refused: the device's zone. */
    }
  }
  try {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (validZone(device)) return device
  } catch {
    /* No Intl zone data. */
  }
  return "UTC"
}

/** The locale tag dates and numbers are written in ("pl-PL"). */
export function appLocale(): string {
  return activeLocale()
}

export { activeLanguage as appLanguage }

type DateInput = Date | string | number

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let f = formatters.get(key)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, options)
    } catch {
      f = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" })
    }
    formatters.set(key, f)
  }
  return f
}

/**
 * A date or time in the dashboard's language and the creator's zone. Any
 * Intl option may be given; a timeZone given on purpose (a date-only value
 * kept at UTC midnight) is kept.
 */
export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ""
  return dateFormatter(appLocale(), { timeZone: appTimeZone(), ...options }).format(d)
}

/** "Oct 12, 2026" / "12 oct 2026" / "12.10.2026". */
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  return formatDateTime(value, options)
}

/** "9:40 AM" / "09:40". */
export function formatTime(value: DateInput, options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }): string {
  return formatDateTime(value, options)
}

/** Options for Date#toLocale*String: the creator's zone unless one is given. */
export function zoned(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions {
  return { timeZone: appTimeZone(), ...options }
}

const numberFormats = new Map<string, Intl.NumberFormat>()
/** 1,234.5 / 1.234,5 / 1 234,5 in the dashboard's language. */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  const locale = appLocale()
  const key = `${locale}|${JSON.stringify(options)}`
  let f = numberFormats.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, options)
    } catch {
      f = new Intl.NumberFormat("en-US", options)
    }
    numberFormats.set(key, f)
  }
  return f.format(value)
}

/** 0.125 → "12.5%" / "12,5 %". */
export function formatPercent(fraction: number, maximumFractionDigits = 1): string {
  return formatNumber(fraction, { style: "percent", maximumFractionDigits })
}

/** "3 minutes ago", "in 2 days", "yesterday" in the dashboard's language. */
export function formatRelative(value: DateInput, now: number = Date.now()): string {
  const d = toDate(value)
  const seconds = Math.round((d.getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  let rtf: Intl.RelativeTimeFormat
  try {
    rtf = new Intl.RelativeTimeFormat(appLocale(), { numeric: "auto" })
  } catch {
    rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })
  }
  if (abs < 45) return rtf.format(0, "second")
  if (abs < 45 * 60) return rtf.format(Math.round(seconds / 60), "minute")
  if (abs < 22 * 3600) return rtf.format(Math.round(seconds / 3600), "hour")
  if (abs < 26 * 86400) return rtf.format(Math.round(seconds / 86400), "day")
  if (abs < 320 * 86400) return rtf.format(Math.round(seconds / (30 * 86400)), "month")
  return rtf.format(Math.round(seconds / (365 * 86400)), "year")
}

/** January..December (or Jan..Dec) in the dashboard's language. */
export function monthNames(style: "long" | "short" = "long"): string[] {
  const f = dateFormatter(appLocale(), { month: style, timeZone: "UTC" })
  return Array.from({ length: 12 }, (_, m) => f.format(new Date(Date.UTC(2024, m, 15))))
}

/**
 * Weekday names starting on Sunday (index 0), as Date#getDay counts.
 * 2024-09-01 was a Sunday.
 */
export function weekdayNames(style: "long" | "short" | "narrow" = "short"): string[] {
  const f = dateFormatter(appLocale(), { weekday: style, timeZone: "UTC" })
  return Array.from({ length: 7 }, (_, d) => f.format(new Date(Date.UTC(2024, 8, 1 + d))))
}

/** The language's own list: "A, B and C" / "A, B y C" / "A, B i C". */
export function formatList(items: string[], type: "conjunction" | "disjunction" = "conjunction"): string {
  try {
    return new Intl.ListFormat(appLocale(), { style: "long", type }).format(items)
  } catch {
    return items.join(", ")
  }
}
