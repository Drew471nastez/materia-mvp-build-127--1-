import type { BookingSettings } from "./definition"

/*
  APPOINTMENT TIMES, from weekly availability in the owner's time zone.

  Availability is wall-clock time where the owner lives ("Mondays 09:00 to
  17:00, Europe/London"). Every slot is turned into an exact instant (UTC)
  here, with the zone's own rules for that date, so a slot on the Monday
  after the clocks change is still 09:00 for the owner. A wall time the
  clocks skip (02:30 on a spring-forward night) is not offered; a wall time
  that happens twice takes the first. The visitor's browser shows each
  instant in its own zone.

  The same function decides what the public slots route lists and what the
  submit route accepts, so a time that was never offered cannot be booked.
*/

export interface Interval {
  start: number
  end: number
}
export interface Slot {
  start: string
  end: string
}

const DAY_MS = 86_400_000
const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    formatters.set(tz, f)
  }
  return f
}

/** The zone's wall clock at this instant, as if it were UTC. */
export function wallClock(tz: string, utcMs: number): number {
  const parts = formatter(tz).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
}

/** Offset of the zone from UTC at this instant, in ms. */
export function zoneOffset(tz: string, utcMs: number): number {
  const whole = Math.floor(utcMs / 1000) * 1000
  return wallClock(tz, whole) - whole
}

/**
 * The instant a wall time happens in a zone. Null when the clocks skip it;
 * the earlier one when it happens twice.
 */
export function zonedInstant(tz: string, y: number, m: number, d: number, h: number, mi: number): number | null {
  const wall = Date.UTC(y, m - 1, d, h, mi)
  const candidates = [zoneOffset(tz, wall - 12 * 3_600_000), zoneOffset(tz, wall), zoneOffset(tz, wall + 12 * 3_600_000)]
    .map((offset) => wall - offset)
    .filter((utc, i, all) => all.indexOf(utc) === i && wallClock(tz, utc) === wall)
  return candidates.length ? Math.min(...candidates) : null
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * Free slots whose start falls in [fromMs, toMs), after the notice period
 * and within the booking horizon, not touching a busy interval (each slot
 * holds its own buffer after it, as a kept booking does).
 */
export function generateSlots(
  settings: Pick<BookingSettings, "duration" | "buffer" | "timezone" | "weekly" | "notice_hours" | "days_ahead">,
  opts: { fromMs: number; toMs: number; nowMs: number; busy?: Interval[]; limit?: number },
): Slot[] {
  const tz = settings.timezone
  const earliest = Math.max(opts.fromMs, opts.nowMs + settings.notice_hours * 3_600_000)
  const latest = Math.min(opts.toMs, opts.nowMs + settings.days_ahead * DAY_MS)
  if (latest <= earliest || !settings.weekly.length) return []
  const step = settings.duration + settings.buffer
  const durationMs = settings.duration * 60_000
  const bufferMs = settings.buffer * 60_000
  const busy = (opts.busy || []).slice().sort((a, b) => a.start - b.start)
  const limit = opts.limit ?? 2000
  const out: Slot[] = []
  /* Walk the owner's local calendar dates that can hold a slot in range. */
  const firstWall = wallClock(tz, earliest) - DAY_MS
  const lastWall = wallClock(tz, latest) + DAY_MS
  for (let day = Math.floor(firstWall / DAY_MS) * DAY_MS; day <= lastWall; day += DAY_MS) {
    const date = new Date(day)
    const y = date.getUTCFullYear(),
      m = date.getUTCMonth() + 1,
      d = date.getUTCDate(),
      weekday = date.getUTCDay()
    const windows = settings.weekly.filter((w) => w.day === weekday).sort((a, b) => minutes(a.start) - minutes(b.start))
    for (const w of windows) {
      const close = minutes(w.end)
      for (let at = minutes(w.start); at + settings.duration <= close; at += step) {
        const start = zonedInstant(tz, y, m, d, Math.floor(at / 60), at % 60)
        if (start === null || start < earliest || start >= latest) continue
        const end = start + durationMs
        const hold = end + bufferMs
        if (busy.some((b) => b.start < hold && start < b.end)) continue
        if (out.some((s) => s.start === new Date(start).toISOString())) continue
        out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })
        if (out.length >= limit) return out
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** Whether this exact start is one the settings offer and nothing holds. */
export function slotOffered(
  settings: Parameters<typeof generateSlots>[0],
  startIso: string,
  nowMs: number,
  busy: Interval[] = [],
): Slot | null {
  const start = Date.parse(startIso)
  if (!Number.isFinite(start) || new Date(start).toISOString() !== startIso) return null
  const found = generateSlots(settings, { fromMs: start, toMs: start + 1, nowMs, busy })
  return found.find((s) => s.start === startIso) || null
}
