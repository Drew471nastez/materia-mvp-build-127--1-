import { platformEmail } from "@/lib/emails/layout"
import { bookingIcs, googleAddUrl, locationWords, type StoredLocation } from "./calendar-file"

/*
  THE BOOKING EMAILS (round AR), in the shared layout (lib/emails/layout).

  The visitor's: confirmed, request received, moved, cancelled. A confirmed
  or moved booking carries an .ics file (the same UID each time, so their
  calendar updates one entry) and an "Add to Google Calendar" link; a
  cancelled one carries the cancelling .ics. Each carries the signed link
  to change or cancel (lib/bookings/manage-token.ts) while the booking is
  active.

  The creator's: moved or cancelled by the visitor. A new booking is the
  existing owner email job (lib/forms/delivery-server.ts).
*/

export type VisitorMailKind = "confirmed" | "requested" | "moved" | "cancelled"

export function when(iso: string, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz || "UTC", timeZoneName: "short" }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

export interface MailBooking {
  id: string
  startsAt: string
  endsAt: string
  visitorTimezone: string | null
  ownerTimezone: string
  location: StoredLocation | null
  sequence: number
  cancelReason?: string | null
}

export interface MailParts {
  subject: string
  html: string
  text: string
  attachments: { filename: string; content: Uint8Array; contentType: string }[]
}

export function visitorBookingMail(input: {
  kind: VisitorMailKind
  title: string
  booking: MailBooking
  hostName: string
  hostEmail?: string | null
  visitorEmail: string
  manageUrl: string | null
  by?: "owner" | "visitor" | "system"
}): MailParts {
  const { kind, booking: b } = input
  const at = when(b.startsAt, b.visitorTimezone)
  const where = kind === "cancelled" ? null : locationWords(b.location)
  const entry = {
    bookingId: b.id,
    title: `${input.title} with ${input.hostName}`,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    location: b.location,
    organizerName: input.hostName,
    organizerEmail: input.hostEmail || null,
    attendeeEmail: input.visitorEmail,
    sequence: b.sequence,
    cancelled: kind === "cancelled",
    manageUrl: input.manageUrl || undefined,
  }
  const subject = (
    kind === "confirmed" ? `Confirmed: ${input.title}, ${at}` : kind === "requested" ? `Request received: ${input.title}` : kind === "moved" ? `New time: ${input.title}, ${at}` : `Cancelled: ${input.title}`
  ).slice(0, 200)
  const heading = kind === "confirmed" ? "Your booking is confirmed" : kind === "requested" ? "Your request is in" : kind === "moved" ? "Your booking has a new time" : "Your booking is cancelled"
  const paragraphs =
    kind === "confirmed"
      ? [`${input.title} with ${input.hostName}, ${at}.`]
      : kind === "requested"
        ? [`You asked for ${input.title} with ${input.hostName}, ${at}.`, `${input.hostName} confirms each request. You will get an email either way.`]
        : kind === "moved"
          ? [`${input.title} with ${input.hostName} is now ${at}.`]
          : [`${input.title} with ${input.hostName}, ${at}, is cancelled${input.by === "visitor" ? " as you asked" : ""}.`, ...(input.by === "owner" && b.cancelReason ? [`${input.hostName} wrote: ${b.cancelReason}`] : [])]
  const facts = [
    { label: "When", value: at },
    ...(where ? [{ label: where.label, value: where.text }] : []),
  ]
  const calendar = kind === "confirmed" || kind === "moved"
  const mail = platformEmail({
    subject,
    heading,
    paragraphs,
    facts: kind === "cancelled" ? null : facts,
    action: where?.url && /^https:\/\//.test(where.url) && kind !== "requested" ? { label: where.label === "Google Meet" ? "Join with Google Meet" : "Join the call", url: where.url } : calendar ? { label: "Add to Google Calendar", url: googleAddUrl(entry) } : null,
    secondary: input.manageUrl && kind !== "cancelled" ? { label: "Change or cancel", url: input.manageUrl } : null,
    closing: calendar && where?.url && /^https:\/\//.test(where.url) ? [{ html: `<a href="${googleAddUrl(entry).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Add to Google Calendar</a>. The attached file adds it to any other calendar.`, text: `Add to Google Calendar: ${googleAddUrl(entry)}` }] : calendar ? ["The attached file adds it to Apple Calendar, Outlook or any other calendar."] : undefined,
    fallback: false,
    sender: { kind: "store", name: input.hostName },
  })
  const attachments =
    calendar || kind === "cancelled"
      ? [{ filename: kind === "cancelled" ? "cancelled.ics" : "booking.ics", content: new TextEncoder().encode(bookingIcs(entry)), contentType: kind === "cancelled" ? "text/calendar; method=CANCEL; charset=utf-8" : "text/calendar; charset=utf-8" }]
      : []
  return { subject, html: mail.html, text: mail.text, attachments }
}

export function ownerChangeMail(input: { kind: "moved" | "cancelled"; title: string; who: string; booking: MailBooking; previousStart?: string | null; link: string }): MailParts {
  const b = input.booking
  const at = when(b.startsAt, b.ownerTimezone)
  const subject = (input.kind === "moved" ? `Booking moved: ${input.who}, ${at}` : `Booking cancelled: ${input.who}`).slice(0, 200)
  const mail = platformEmail({
    subject,
    heading: input.kind === "moved" ? `${input.who} moved their booking` : `${input.who} cancelled their booking`,
    paragraphs: [input.kind === "moved" ? `${input.title} is now ${at}.` : `${input.title}, ${at}, is cancelled and the time is free again.`],
    facts: [
      ...(input.kind === "moved" && input.previousStart ? [{ label: "Was", value: when(input.previousStart, b.ownerTimezone) }] : []),
      { label: input.kind === "moved" ? "Now" : "When", value: at },
      ...(input.kind === "cancelled" && b.cancelReason ? [{ label: "Reason", value: b.cancelReason }] : []),
    ],
    action: { label: "Open bookings", url: input.link },
    fallback: false,
  })
  return { subject, html: mail.html, text: mail.text, attachments: [] }
}
