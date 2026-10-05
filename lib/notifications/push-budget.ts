/**
 * ===========================================================================
 *  HOW MUCH A PHONE HEARS IN A DAY, AND WHEN
 * ===========================================================================
 * The push bridge (push-bridge.ts) asks two questions of every push it may
 * send, after the person's switches and levels have said yes:
 *
 *   QUIET HOURS   is it the person's quiet time (their own clock, from the
 *                 time zone their browser told Settings)? Then nothing
 *                 pushes, not even a mention: everything still lands in the
 *                 bell, and one summary push goes when the quiet time ends,
 *                 "2 mentions, 5 new likes and 1 new event".
 *   DAILY CAP     has the person had DAILY_PUSH_CAP pushes today (their own
 *                 day)? Then the low priority ones (likes, comments on their
 *                 post, new posts, events, programs, followers) are held for
 *                 one summary at the end of the afternoon (DIGEST_HOUR), or
 *                 an hour from now when that has passed, never inside quiet
 *                 hours. What is addressed to them (a mention, a reply, a
 *                 direct message, their membership, a message from the
 *                 admins) still goes, and counts.
 *
 * Pushes sent are counted in rate_limit_hits (bucket PUSH_DAY_BUCKET, one
 * row per push, subject the person), kept two days by the sweep in
 * lib/api/rate-limit.ts, so a day can be counted. Pure: the clock maths for
 * any time zone, with Intl alone, so tests hold every rule.
 */

/** Pushes a person gets in their day before the low priority ones are held for a summary. */
export const DAILY_PUSH_CAP = 10
/** Where pushes are counted per person (rate_limit_hits.bucket). */
export const PUSH_DAY_BUCKET = "push-day"
/** The summary of what the cap held goes at this hour of the person's afternoon. */
export const DIGEST_HOUR = 18
/** Never a summary after this hour of the evening when the person has no quiet hours: it waits for the morning. */
export const LATE_HOUR = 22
export const MORNING_HOUR = 8

/** Kinds addressed to the person: they still go past the cap. */
export const CAP_EXEMPT_KINDS: readonly string[] = ["mention", "reply", "dm", "membership", "admin_message"]

const MINUTE = 60_000
const DAY_MINUTES = 1440

export interface Clock {
  /** Minutes after the person's midnight, 0 to 1439. */
  minutes: number
  /** The moment of the person's midnight that began this day (ms). */
  dayStart: number
  /** "2026-10-05": the person's date. */
  day: string
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    formatters.set(tz, f)
  }
  return f
}

/** The person's wall clock at this moment, in their zone (UTC when it is unknown or not a zone). */
export function clockAt(now: number, tz?: string | null): Clock {
  let parts: Record<string, string> = {}
  try {
    parts = Object.fromEntries(formatter(tz || "UTC").formatToParts(new Date(now)).map((p) => [p.type, p.value]))
  } catch {
    parts = Object.fromEntries(formatter("UTC").formatToParts(new Date(now)).map((p) => [p.type, p.value]))
  }
  const h = Number(parts.hour) % 24
  const m = Number(parts.minute)
  const s = Number(parts.second)
  const minutes = h * 60 + m
  const into = (minutes * 60 + s) * 1000 + (now % 1000)
  return { minutes, dayStart: now - into, day: `${parts.year}-${parts.month}-${parts.day}` }
}

export interface Quiet {
  from: number
  to: number
}

/** Whether a minute of the day is inside quiet hours (which may run past midnight). */
export function quietAt(q: Quiet | null | undefined, minutes: number): boolean {
  if (!q || q.from === q.to) return false
  return q.from < q.to ? minutes >= q.from && minutes < q.to : minutes >= q.from || minutes < q.to
}

/** Whether it is the person's quiet time now. */
export function inQuietHours(q: Quiet | null | undefined, now: number, tz?: string | null): boolean {
  return quietAt(q, clockAt(now, tz).minutes)
}

/** The start of the minute this moment is in, by the person's clock (zones are whole minutes). */
function minuteStart(now: number, c: Clock): number {
  return now - ((now - c.dayStart) % MINUTE)
}

/**
 * The next moment a wall clock reads `target` minutes (later today or
 * tomorrow). A day that changes its clocks is out by that hour, which a
 * summary push can live with.
 */
function nextAt(now: number, tz: string | null | undefined, target: number): number {
  const c = clockAt(now, tz)
  const ahead = (target - c.minutes + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES
  return minuteStart(now, c) + ahead * MINUTE
}

/** When this stretch of quiet hours ends (the next time the clock reads `to`). */
export function quietEndsAt(q: Quiet, now: number, tz?: string | null): number {
  return nextAt(now, tz, q.to)
}

/** When this stretch of quiet hours began (the last time the clock read `from`). */
export function quietBeganAt(q: Quiet, now: number, tz?: string | null): number {
  const c = clockAt(now, tz)
  const back = (c.minutes - q.from + DAY_MINUTES) % DAY_MINUTES
  return minuteStart(now, c) - back * MINUTE
}

/**
 * When the summary of what the daily cap held goes: the person's
 * DIGEST_HOUR, or an hour from now when that has passed; moved to the end
 * of quiet hours when it would fall inside them, and to the next morning
 * when it would fall late at night for someone without quiet hours.
 */
export function dailySummaryAt(now: number, tz: string | null | undefined, q: Quiet | null | undefined): number {
  const c = clockAt(now, tz)
  const target = c.dayStart + DIGEST_HOUR * 60 * MINUTE
  let at = Math.max(target, now + 60 * MINUTE)
  const atClock = clockAt(at, tz)
  if (q && quietAt(q, atClock.minutes)) return quietEndsAt(q, at, tz)
  if (!q && (atClock.minutes >= LATE_HOUR * 60 || atClock.minutes < MORNING_HOUR * 60)) at = nextAt(at, tz, MORNING_HOUR * 60)
  return at
}

export type BudgetDecision = { send: true } | { send: false; hold: "quiet" | "daily" }

/**
 * Whether one push goes now, from the person's quiet hours, their zone, how
 * many they had today and what kind it is.
 */
export function budgetDecision(a: { kind: string; quiet: Quiet | null | undefined; tz: string | null | undefined; sentToday: number; now: number }): BudgetDecision {
  if (inQuietHours(a.quiet, a.now, a.tz)) return { send: false, hold: "quiet" }
  if (a.sentToday >= DAILY_PUSH_CAP && !CAP_EXEMPT_KINDS.includes(a.kind)) return { send: false, hold: "daily" }
  return { send: true }
}

/** How many of these push times fall in the person's day so far. */
export function sentToday(times: readonly string[], now: number, tz?: string | null): number {
  const start = clockAt(now, tz).dayStart
  let n = 0
  for (const t of times) {
    const at = Date.parse(t)
    if (Number.isFinite(at) && at >= start && at <= now + MINUTE) n++
  }
  return n
}

/* ── The weekly community digest (an email, asked for in Settings) ──────── */

/** The weekly digest goes on Monday at this hour of the person's morning. */
export const WEEKLY_DIGEST_HOUR = 9
const DAY_MS = 86_400_000

/**
 * When the next weekly digest goes: the coming Monday at WEEKLY_DIGEST_HOUR,
 * the person's time (this Monday when that hour has not come yet), and that
 * Monday's date as the week's name ("2026-10-12"), which keys the job.
 */
export function nextWeeklyDigest(now: number, tz?: string | null): { at: number; week: string } {
  const c = clockAt(now, tz)
  const [y, m, d] = c.day.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  let ahead = (1 - dow + 7) % 7
  if (ahead === 0 && c.minutes >= WEEKLY_DIGEST_HOUR * 60) ahead = 7
  const at = c.dayStart + ahead * DAY_MS + WEEKLY_DIGEST_HOUR * 60 * MINUTE
  const week = new Date(Date.UTC(y, m - 1, d + ahead)).toISOString().slice(0, 10)
  return { at, week }
}
