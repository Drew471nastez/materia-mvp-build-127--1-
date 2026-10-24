/**
 * The small pieces every rule's words are made from: money, a date on the
 * creator's clock, the periods dedupe keys use, and a title cut to fit.
 * Pure, so the rules stay pure.
 */
import { DAY_MS } from "./policy"
import { formatMinor } from "@/lib/markets/money"

export function money(cents: number, currency: string | null | undefined): string {
  /* A currency nobody recorded is not guessed, and a bare number is not written either (it reads as any currency): nothing, and the sentence goes without it. */
  if (!currency || !/^[a-z]{3}$/i.test(currency)) return ""
  /* In the currency's own decimals (¥2,500 is 2500, not ¥25) and its own word ("25.00 lei"), by the app's one money writer. */
  return formatMinor(cents || 0, currency.toUpperCase(), "en-US")
}

/** "Oct 3", on the creator's clock when their zone is known. */
export function shortDate(at: number | string, timeZone: string | null | undefined): string {
  const date = typeof at === "number" ? new Date(at) : new Date(at)
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: timeZone || "UTC" }).format(date)
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date)
  }
}

/** 2026-09-25, in UTC: the default period of a dedupe key. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** 2026-09: for things worth saying at most once a month. */
export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7)
}

/** 2026-W39, the ISO week, for things worth saying at most once a week. */
export function weekKey(now: number): string {
  const d = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()))
  const weekday = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

export function ageDays(iso: string | null | undefined, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = Date.parse(iso)
  return Number.isFinite(t) ? (now - t) / DAY_MS : Number.POSITIVE_INFINITY
}

export function ageHours(iso: string | null | undefined, now: number): number {
  return ageDays(iso, now) * 24
}

/** A name that fits on a title line, cut at a word where it can be. */
export function clip(text: string | null | undefined, max = 48): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** A product's name as a title says it. */
export function productName(title: string | null | undefined): string {
  return clip(title || "A product", 40)
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** 1st, 2nd, 3rd, 10th, 100th. */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
