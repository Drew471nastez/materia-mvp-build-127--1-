/*
  A BOOKING AS A CALENDAR ENTRY (round AR): the .ics file the visitor's
  confirmation email carries, and the "Add to Google Calendar" address
  beside it. Pure, so tests/onepage-bookings-ar2.test.ts reads the exact
  text.

  The entry's UID is the booking's, and SEQUENCE counts its moves, so a
  calendar that took the first file updates the same entry when the moved
  one arrives, and a cancelled one (STATUS:CANCELLED, METHOD:CANCEL)
  removes it.
*/

export interface StoredLocation {
  kind: "none" | "video" | "google_meet" | "phone" | "in_person"
  value?: string
  /** The Meet address Google made for this booking. */
  meet_url?: string
}

export interface CalendarEntry {
  bookingId: string
  title: string
  description?: string
  startsAt: string
  endsAt: string
  location?: StoredLocation | null
  organizerName?: string
  organizerEmail?: string | null
  attendeeEmail?: string | null
  sequence?: number
  cancelled?: boolean
  manageUrl?: string
}

/** Where the meeting happens, in words and, when there is one, the address to open. */
export function locationWords(location: StoredLocation | null | undefined): { label: string; text: string; url: string | null } | null {
  if (!location) return null
  switch (location.kind) {
    case "google_meet":
      return location.meet_url ? { label: "Google Meet", text: location.meet_url, url: location.meet_url } : { label: "Google Meet", text: "The Meet link is sent before the call.", url: null }
    case "video":
      return location.value ? { label: "Video call", text: location.value, url: location.value } : { label: "Video call", text: "The link is sent before the call.", url: null }
    case "phone":
      return location.value ? { label: "Phone call", text: location.value, url: `tel:${location.value.replace(/[^\d+]/g, "")}` } : { label: "Phone call", text: "You will be called on the number you gave.", url: null }
    case "in_person":
      return location.value ? { label: "In person", text: location.value, url: null } : { label: "In person", text: "The address is sent before the meeting.", url: null }
    default:
      return null
  }
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** RFC 5545 text: backslash, semicolon, comma and line breaks escaped. */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

const enc = new TextEncoder()
/** RFC 5545 lines are at most 75 octets; longer ones continue on a line that starts with a space. */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let chunk = ""
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (size + n > (out.length ? 74 : 75)) {
      out.push(chunk)
      chunk = ""
      size = 0
    }
    chunk += ch
    size += n
  }
  out.push(chunk)
  return out.join("\r\n ")
}

export function bookingIcs(e: CalendarEntry, now = new Date().toISOString()): string {
  const where = locationWords(e.location)
  const details = [e.description, where ? `${where.label}: ${where.text}` : null, e.manageUrl ? `Change or cancel: ${e.manageUrl}` : null].filter(Boolean).join("\n\n")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Storelib//Bookings//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:booking-${e.bookingId}@storelib.com`,
    `SEQUENCE:${Math.max(0, Math.floor(e.sequence || 0))}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${icsText(e.title)}`,
    details ? `DESCRIPTION:${icsText(details)}` : null,
    where ? `LOCATION:${icsText(where.text)}` : null,
    where?.url && /^https:\/\//.test(where.url) ? `URL:${where.url}` : null,
    e.organizerEmail ? `ORGANIZER;CN=${icsText(e.organizerName || "Organizer")}:mailto:${e.organizerEmail}` : null,
    e.attendeeEmail ? `ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:${e.attendeeEmail}` : null,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => !!l)
  return lines.map(foldLine).join("\r\n") + "\r\n"
}

/** Google Calendar's "add this event" address, filled in. */
export function googleAddUrl(e: CalendarEntry): string {
  const where = locationWords(e.location)
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.startsAt)}/${stamp(e.endsAt)}`,
    details: [e.description, e.manageUrl ? `Change or cancel: ${e.manageUrl}` : null].filter(Boolean).join("\n\n"),
    ...(where ? { location: where.text } : {}),
  })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}
