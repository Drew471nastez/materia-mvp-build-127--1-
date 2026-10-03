/**
 * ===========================================================================
 *  A COMMUNITY EVENT, AS THE EVENT PAGES SEE IT
 * ===========================================================================
 * What lib/communities/server/events.ts hands the pages, and the pure rules
 * both sides share: when the meeting link opens, when an event is over, the
 * month grid, the Google Calendar link and the .ics file. Browser safe.
 *
 * Every time is the stored instant (timestamptz); a page formats it in the
 * viewer's own zone. The event's own zone is the creator's choice and is
 * shown beside it only when it differs.
 */
import type { EventKind, RsvpStatus } from "@/lib/communities/types"
import type { CourseLock } from "../classroom/model"

/** The meeting link opens this long before the start. */
export const JOIN_OPENS_MS = 15 * 60_000
/** An event with no end is treated as an hour long. */
export const DEFAULT_LENGTH_MS = 60 * 60_000

export interface EventHost {
  name: string
  avatarUrl: string | null
}

export interface EventCardView {
  id: string
  title: string
  coverUrl: string | null
  kind: EventKind
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string | null
  online: boolean
  capacity: number | null
  goingCount: number
  cancelled: boolean
  myRsvp: RsvpStatus | null
  locked: CourseLock | null
  hasReplay: boolean
  href: string
}

export interface EventDetailView extends EventCardView {
  /** Sanitized html. */
  description: string | null
  host: EventHost | null
  /** Only for a member the rule lets in, and only from JOIN_OPENS_MS before the start until it ends. */
  meetingUrl: string | null
  livestreamUrl: string | null
  /** When the meeting link opens, for "Join opens at 5:45 PM". Null for an event with no link. */
  joinOpensAt: string | null
  replayVideoId: string | null
  communityId: string
  communityName: string
  /** A few of the people going (real rows) for the avatars row. */
  attendees: EventHost[]
  googleUrl: string
  icsUrl: string
  pageUrl: string
}

export function endOf(e: { startsAt: string; endsAt: string | null }): number {
  const end = e.endsAt ? Date.parse(e.endsAt) : NaN
  return Number.isFinite(end) ? end : Date.parse(e.startsAt) + DEFAULT_LENGTH_MS
}

export function isOver(e: { startsAt: string; endsAt: string | null }, now: number = Date.now()): boolean {
  return now >= endOf(e)
}

export function isLive(e: { startsAt: string; endsAt: string | null }, now: number = Date.now()): boolean {
  return now >= Date.parse(e.startsAt) && now < endOf(e)
}

/** Whether the meeting link may be shown now: from 15 minutes before the start until the end. */
export function joinWindowOpen(e: { startsAt: string; endsAt: string | null }, now: number = Date.now()): boolean {
  return now >= Date.parse(e.startsAt) - JOIN_OPENS_MS && now < endOf(e)
}

/** "Online", "In person", ... for a kind. */
export const KIND_WORDS: Record<EventKind, string> = {
  online: "Online",
  in_person: "In person",
  live: "Live",
  workshop: "Workshop",
  ama: "Q&A",
  meetup: "Meetup",
}

/** "12 going", "12 of 40 going", "Full". */
export function goingLabel(going: number, capacity: number | null): string {
  if (capacity && going >= capacity) return "Full"
  if (capacity) return `${going} of ${capacity} going`
  return `${going} going`
}

/* ── The month grid ─────────────────────────────────────────────────────── */

export interface MonthCell {
  /** YYYY-MM-DD in the viewer's zone. */
  key: string
  day: number
  inMonth: boolean
  today: boolean
}

/** YYYY-MM-DD of an instant in a zone. */
export function dayKey(t: number, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(t)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
  } catch {
    return new Date(t).toISOString().slice(0, 10)
  }
}

/** "2026-10" for a year and a zero based month. */
export function monthKey(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function parseMonth(key: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? "")
  if (!m) return null
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return null
  return { year: Number(m[1]), month }
}

/** Six weeks of days, Monday first, covering the month: the same 42 cells every month, so the grid never jumps. */
export function monthGrid(year: number, month: number, todayKey: string): MonthCell[] {
  const first = new Date(Date.UTC(year, month, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month, 1 - lead + i))
    const key = d.toISOString().slice(0, 10)
    cells.push({ key, day: d.getUTCDate(), inMonth: d.getUTCMonth() === month, today: key === todayKey })
  }
  return cells
}

/** "October 2026". */
export function monthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(year, month, 1))
}

/** The instants a month's grid covers, padded a day each side so any zone's events are in it. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const from = Date.UTC(year, month, 1) - 7 * 86_400_000 - 86_400_000
  const to = Date.UTC(year, month + 1, 1) + 14 * 86_400_000 + 86_400_000
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
}

/* ── Add to calendar ────────────────────────────────────────────────────── */

/** 20261004T170000Z */
export function calendarStamp(t: number): string {
  return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

export function googleCalendarUrl(e: { title: string; startsAt: string; endsAt: string | null; details: string; location: string | null }): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${calendarStamp(Date.parse(e.startsAt))}/${calendarStamp(endOf(e))}`,
    details: e.details,
  })
  if (e.location) params.set("location", e.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Text for an .ics line: backslash, semicolon, comma and newlines escaped (RFC 5545 3.3.11). */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

/** A line folded at 75 octets, continuation lines starting with a space (RFC 5545 3.1). */
export function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ""
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current)
      current = ""
      size = 0
    }
    current += ch
    size += n
  }
  out.push(current)
  return out.join("\r\n ")
}

/**
 * One event as an .ics file. No meeting link in it: the link opens on the
 * event page 15 minutes before the start, for members it is meant for, so
 * the file carries the page instead.
 */
export function eventIcs(e: { id: string; title: string; startsAt: string; endsAt: string | null; description: string; location: string | null; url: string; updatedAt: string; cancelled: boolean }, now: number = Date.now()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Storelib//Communities//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@storelib.com`,
    `DTSTAMP:${calendarStamp(now)}`,
    `LAST-MODIFIED:${calendarStamp(Date.parse(e.updatedAt) || now)}`,
    `DTSTART:${calendarStamp(Date.parse(e.startsAt))}`,
    `DTEND:${calendarStamp(endOf(e))}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    `LOCATION:${icsText(e.location || "Online")}`,
    `URL:${e.url}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(icsFold).join("\r\n") + "\r\n"
}
