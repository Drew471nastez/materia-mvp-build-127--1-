// OnePage: the wall clock behind a block's schedule and a countdown's date
// Location: lib/onepage/schedule.ts
//
// A schedule is stored as two instants (ISO strings in UTC, see
// OnePageBlockSchedule in ./types), and the live page compares them with the
// time now (./extra-blocks isScheduledNow). The creator, though, thinks in
// their own day and clock: "show it from Friday at 6pm". Everything here
// converts between the two IN A NAMED TIME ZONE, the creator's own
// (Intl...resolvedOptions().timeZone), not "whatever the Date object does",
// so the picker can say which zone it means and tests can pin a zone.
//
// DAYLIGHT SAVING. A wall time is turned into an instant by guessing the
// zone's offset at that moment, then checking the guess once more, because
// the offset the guess lands on can differ by an hour around a change. A
// wall time that does not exist (2:30 on the night clocks go forward) comes
// out an hour later, which is what a phone's own alarm does.

import { parts, todayIn, ymdOf, type Ymd } from "@/lib/date-range/range"

export { todayIn, type Ymd }

/** The creator's time zone, or UTC where the browser will not say. */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function wallFormat(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    fmtCache.set(timeZone, f)
  }
  return f
}

/** The wall clock in `timeZone` at instant `ms`. */
export function wallAt(ms: number, timeZone: string): { ymd: Ymd; hour: number; minute: number } {
  const p: Record<string, number> = {}
  for (const x of wallFormat(timeZone).formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value)
  return { ymd: ymdOf(p.year, p.month - 1, p.day), hour: p.hour % 24, minute: p.minute }
}

/** How far `timeZone` is ahead of UTC at instant `ms`, in minutes. */
export function zoneOffset(ms: number, timeZone: string): number {
  const w = wallAt(ms, timeZone)
  const { y, m, d } = parts(w.ymd)
  const asUtc = Date.UTC(y, m, d, w.hour, w.minute)
  return Math.round((asUtc - Math.floor(ms / 60_000) * 60_000) / 60_000)
}

/** The instant a wall time in `timeZone` names, as an ISO string. */
export function isoFromWall(ymd: Ymd, hour: number, minute: number, timeZone: string): string {
  const { y, m, d } = parts(ymd)
  const guess = Date.UTC(y, m, d, hour, minute)
  let ms = guess - zoneOffset(guess, timeZone) * 60_000
  /* Checked once more: the offset at the answer can differ from the offset at the guess around a clock change. */
  const again = guess - zoneOffset(ms, timeZone) * 60_000
  if (again !== ms) ms = again
  return new Date(ms).toISOString()
}

/** A stored instant as the creator's wall clock, or null when it is empty or cannot be read. */
export function wallFromIso(iso: string | null | undefined, timeZone: string): { ymd: Ymd; hour: number; minute: number } | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return wallAt(ms, timeZone)
}

/** 18 -> 6 PM. */
export function to12(hour: number): { hour12: number; pm: boolean } {
  const h = ((hour % 24) + 24) % 24
  return { hour12: h % 12 === 0 ? 12 : h % 12, pm: h >= 12 }
}

/** 6 PM -> 18, 12 AM -> 0. */
export function from12(hour12: number, pm: boolean): number {
  const h = ((Math.round(hour12) % 12) + 12) % 12
  return pm ? h + 12 : h
}

/** "6:00 PM" */
export function timeLabel(hour: number, minute: number): string {
  const { hour12, pm } = to12(hour)
  return `${hour12}:${String(minute).padStart(2, "0")} ${pm ? "PM" : "AM"}`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Jan 2, 2030", or "Jan 2" in the year `today` is in. */
export function dayLabel(ymd: Ymd, today?: Ymd): string {
  const { y, m, d } = parts(ymd)
  const sameYear = today ? parts(today).y === y : false
  return sameYear ? `${MONTHS[m]} ${d}` : `${MONTHS[m]} ${d}, ${y}`
}

/** "Jan 2, 6:00 PM" for a stored instant, in the creator's zone. */
export function whenLabel(iso: string | null | undefined, timeZone: string, now: number = Date.now()): string | null {
  const w = wallFromIso(iso, timeZone)
  if (!w) return null
  return `${dayLabel(w.ymd, todayIn(timeZone, now))}, ${timeLabel(w.hour, w.minute)}`
}

/** "Europe/Bucharest, GMT+3": the zone the picker means, said plainly. */
export function zoneLabel(timeZone: string, now: number = Date.now()): string {
  const off = zoneOffset(now, timeZone)
  const sign = off < 0 ? "-" : "+"
  const a = Math.abs(off)
  const gmt = off === 0 ? "GMT" : `GMT${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC"
  return `${timeZone.replace(/_/g, " ")}, ${gmt}`
}
