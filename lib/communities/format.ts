/**
 * HOW COMMUNITY NUMBERS, PRICES AND TIMES READ. Every figure here is formatted
 * from a value the caller computed from real rows; nothing is rounded up.
 * Pure and browser safe: prices use the memberships' own money words
 * (lib/memberships/state.ts) so a community and a membership say "$19/month"
 * the same way, and times are formatted in the viewer's zone from the stored
 * timestamp.
 */
import { money, pricePer } from "@/lib/memberships/state"
import type { TierBilling, TierKind } from "./types"

/** 999 -> "999", 1250 -> "1.2k", 12400 -> "12k", 1250000 -> "1.2M". Rounded down, never up. */
export function compactCount(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))
  if (v < 1000) return String(v)
  const [div, unit] = v < 1_000_000 ? [1000, "k"] : [1_000_000, "M"]
  const scaled = v / div
  if (scaled >= 10) return `${Math.floor(scaled)}${unit}`
  const one = Math.floor(scaled * 10) / 10
  return `${one % 1 === 0 ? one.toFixed(0) : one.toFixed(1)}${unit}`
}

/** "1 member", "12 members", "1.2k members". */
export function memberCountLabel(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))
  return `${compactCount(v)} ${v === 1 ? "member" : "members"}`
}

export function postCountLabel(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))
  return `${compactCount(v)} ${v === 1 ? "post" : "posts"}`
}

export interface PriceFacts {
  kind?: TierKind | null
  billing?: TierBilling | null
  /** A recurring tier: the membership plan's prices. */
  monthlyCents?: number | null
  yearlyCents?: number | null
  /** A one time tier: the community product's price. */
  priceCents?: number | null
  currency?: string | null
}

/** "Free", "$19/month", "$190/year", "$49" (one time), or "" for a paid tier with no price yet. */
export function priceLine(p: PriceFacts): string {
  const currency = p.currency || "usd"
  if (p.kind === "free") return "Free"
  if (p.billing === "recurring" || (!p.billing && (p.monthlyCents || p.yearlyCents))) {
    if (p.monthlyCents && p.monthlyCents > 0) return pricePer(p.monthlyCents, "month", currency)
    if (p.yearlyCents && p.yearlyCents > 0) return pricePer(p.yearlyCents, "year", currency)
  }
  if (p.priceCents && p.priceCents > 0) return money(p.priceCents, currency)
  /* A paid tier with no price yet has no line, rather than a wrong "Free". */
  return p.kind === "paid" ? "" : "Free"
}

/** The words of a join that starts a free trial. */
export const JOIN_TRIAL_LABEL = "Start free trial"

/**
 * The one button on a community's public page (round AF: "Join $24/month", never "Join for"):
 *
 *   one plan           "Join free", "Join $24/month", or "Start free trial" when it has one
 *   several plans      "Join free" when one of them is free, else "Choose plan": the press opens the plan picker
 */
export function joinButtonLabel(s: { isMember: boolean; pending?: boolean; approvalRequired?: boolean; priceLine?: string | null; trialDays?: number; plans?: number; anyFree?: boolean }): string {
  if (s.isMember) return "Open community"
  if (s.pending) return "Request sent"
  if (s.approvalRequired) return "Request to join"
  if ((s.plans ?? 0) > 1) return s.anyFree ? "Join free" : "Choose plan"
  if (s.priceLine === "Free") return "Join free"
  if ((s.trialDays ?? 0) > 0) return JOIN_TRIAL_LABEL
  if (!s.priceLine) return "Join"
  return `Join ${s.priceLine}`
}

/* Newer ICU puts a narrow no break space before AM/PM; one plain space reads the same and renders the same on server and client. */
const plainSpaces = (s: string) => s.replace(/[\u202f\u00a0]/g, " ")

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5m", "3h", "2d", then "Mar 4" (this year) or "Mar 4, 2025". */
export function relativeTime(iso: string | null | undefined, now: number = Date.now(), timeZone?: string): string {
  if (!iso) return ""
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const ago = now - t
  if (ago < 45_000) return "just now"
  if (ago < HOUR) return `${Math.max(1, Math.floor(ago / MINUTE))}m`
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h`
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d`
  const sameYear = new Date(t).getUTCFullYear() === new Date(now).getUTCFullYear()
  return plainSpaces(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone }).format(t))
}

function zoneName(t: number, timeZone: string | undefined, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(t).find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    return ""
  }
}

/**
 * An event's time in the viewer's zone: "Tue, Mar 4, 6:00 PM to 7:00 PM GMT+1",
 * or with both dates when it runs past midnight. `timeZone` is the viewer's
 * (left out, the runtime's own); the event's stored timezone is the
 * creator's, for display beside it when they differ.
 */
export function eventTime(startsAt: string, endsAt?: string | null, opts: { timeZone?: string; locale?: string } = {}): string {
  const locale = opts.locale || "en-US"
  const start = Date.parse(startsAt)
  if (!Number.isFinite(start)) return ""
  const end = endsAt ? Date.parse(endsAt) : NaN
  let date: Intl.DateTimeFormat
  let time: Intl.DateTimeFormat
  try {
    date = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: opts.timeZone })
    time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: opts.timeZone })
  } catch {
    date = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" })
    time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
  }
  const zone = zoneName(start, opts.timeZone, locale)
  const head = `${date.format(start)}, ${time.format(start)}`
  if (!Number.isFinite(end) || end <= start) return plainSpaces(zone ? `${head} ${zone}` : head)
  const sameDay = date.format(start) === date.format(end)
  const tail = sameDay ? time.format(end) : `${date.format(end)}, ${time.format(end)}`
  return plainSpaces(`${head} to ${tail}${zone ? ` ${zone}` : ""}`)
}

/** The calendar chip beside an event: { month: "Mar", day: "4", weekday: "Tue" } in the viewer's zone. */
export function eventDateBadge(startsAt: string, timeZone?: string): { month: string; day: string; weekday: string } {
  const t = Date.parse(startsAt)
  if (!Number.isFinite(t)) return { month: "", day: "", weekday: "" }
  const part = (o: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("en-US", { ...o, timeZone }).format(t)
    } catch {
      return new Intl.DateTimeFormat("en-US", o).format(t)
    }
  }
  return { month: part({ month: "short" }), day: part({ day: "numeric" }), weekday: part({ weekday: "short" }) }
}
