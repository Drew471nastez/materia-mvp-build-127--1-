import type { BookingContext, Db } from "./server"
import type { MailParts } from "./emails"
import { ownerChangeMail, visitorBookingMail, when } from "./emails"
import { locationWords } from "./calendar-file"
import type { EventInput } from "@/lib/google-calendar/api"
import { answerText } from "@/lib/forms/definition"

/*
  WHO HEARS ABOUT A BOOKING, AND HOW (round AR).

                       creator: bell + phone   creator: email   visitor: email    Google event
    new                yes                     job (owner_email) job*             written when confirmed
    confirmed          (they did it)           no                job               written
    declined           (they did it)           no                job               removed
    moved by visitor   yes                     yes               yes, new .ics     moved
    moved by creator   no                      no                yes, new .ics     moved
    cancelled visitor  yes                     yes               yes, cancel .ics  removed
    cancelled creator  no                      no                yes, cancel .ics  removed

  * a new booking queues booking_confirmed (confirmed at once) or
    visitor_email (waiting for the creator) in form_integration_jobs, so it
    is retried until sent (lib/forms/delivery-server.ts).

  The bell row is notifyUser (lib/notifications/user-inbox.ts), which also
  pushes it to the Storelib app and any browser the creator turned on
  (lib/notifications/push-bridge.ts; a "booking:" key pushes at once). Its
  key names the booking and the change, so a retried request never tells
  twice. Every channel is tried; one failing never stops the others.

  The senders are passed in, so tests/onepage-bookings-ar2.test.ts counts
  exactly what each change sends.
*/

export type BookingChange = "new" | "confirmed" | "declined" | "moved" | "cancelled"

export interface AnnounceDeps {
  notify: (n: { userId: string; kind: "system"; source: "system"; title: string; body: string; url: string; dedupeKey: string }) => Promise<unknown>
  email: (m: MailParts & { to: string; fromName: string; replyTo?: string | null }) => Promise<{ success: boolean }>
  sync: (input: { ownerId: string; booking: { id: string; status: string; google_event_id: string | null; google_calendar_id: string | null }; event: EventInput }) => Promise<unknown>
  identity: (ownerId: string) => Promise<{ fromName: string; sellerEmail: string | null; replyTo: string | null }>
  manageUrl: (bookingId: string) => string | null
  origin: string
}

export interface Announced {
  bell: boolean
  ownerEmail: boolean
  visitorEmail: boolean
  calendar: boolean
}

/** The text a Google event carries: who, how to reach them, and their answers. */
export function eventFor(ctx: BookingContext, origin: string): EventInput {
  const b = ctx.booking
  const where = locationWords(b.location || null)
  const who = ctx.contact.name || ctx.contact.email || "Someone"
  const lines = [
    `Booked through Storelib by ${who}${ctx.contact.email ? ` (${ctx.contact.email})` : ""}${ctx.contact.phone ? `, ${ctx.contact.phone}` : ""}.`,
    ...ctx.answers.filter((a) => a.type !== "file" && a.type !== "consent").map((a) => `${a.label}: ${answerText(a) || "No answer"}`),
    `${origin}/app/bookings?booking=${b.id}`,
  ]
  return {
    bookingId: b.id,
    title: `${ctx.formTitle}: ${who}`.slice(0, 300),
    description: lines.join("\n").slice(0, 7000),
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    timeZone: ctx.settings?.timezone || "UTC",
    location: b.location?.kind === "google_meet" ? null : where?.text || null,
    attendeeEmail: ctx.contact.email,
    attendeeName: ctx.contact.name,
    meet: b.location?.kind === "google_meet" && !b.location.meet_url,
  }
}

export async function announceBooking(deps: AnnounceDeps, ctx: BookingContext, change: BookingChange, by: "owner" | "visitor" | "system", extra: { previousStart?: string | null } = {}): Promise<Announced> {
  const b = ctx.booking
  const out: Announced = { bell: false, ownerEmail: false, visitorEmail: false, calendar: false }
  const ownerTz = ctx.settings?.timezone || "UTC"
  const who = ctx.contact.name || ctx.contact.email || "Someone"
  const link = `${deps.origin}/app/bookings?booking=${b.id}`
  const identity = await deps.identity(b.owner_id).catch(() => ({ fromName: "", sellerEmail: null, replyTo: null }))
  const hostName = identity.fromName || "Your host"
  const tell = by !== "owner" && (change === "new" || change === "moved" || change === "cancelled")
  const safely = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      return true
    } catch (e) {
      console.warn("[bookings] a notice was not sent:", b.id, change, e instanceof Error ? e.message.slice(0, 200) : "error")
      return false
    }
  }

  if (tell) {
    const title = change === "new" ? (b.status === "confirmed" ? "New booking" : "New booking request") : change === "moved" ? "Booking moved" : "Booking cancelled"
    const body = `${who}, ${ctx.formTitle}, ${when(b.starts_at, ownerTz)}`.slice(0, 200)
    const key = change === "moved" ? `booking:moved:${b.id}:${b.reschedule_count || 0}` : `booking:${change}:${b.id}`
    out.bell = await safely(() => deps.notify({ userId: b.owner_id, kind: "system", source: "system", title, body, url: `/app/bookings?booking=${b.id}`, dedupeKey: key }))
  }

  const mailBooking = {
    id: b.id,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    visitorTimezone: b.visitor_timezone,
    ownerTimezone: ownerTz,
    location: b.location || null,
    sequence: b.reschedule_count || 0,
    cancelReason: b.cancel_reason || null,
  }

  if (by === "visitor" && (change === "moved" || change === "cancelled") && identity.sellerEmail) {
    const mail = ownerChangeMail({ kind: change, title: ctx.formTitle, who, booking: mailBooking, previousStart: extra.previousStart, link })
    out.ownerEmail = await safely(async () => {
      const sent = await deps.email({ ...mail, to: identity.sellerEmail!, fromName: "Storelib Bookings", replyTo: ctx.contact.email })
      if (!sent.success) throw new Error("not sent")
    })
  }

  if ((change === "moved" || change === "cancelled") && ctx.contact.email) {
    const mail = visitorBookingMail({
      kind: change,
      title: ctx.formTitle,
      booking: mailBooking,
      hostName,
      hostEmail: identity.replyTo || identity.sellerEmail,
      visitorEmail: ctx.contact.email,
      manageUrl: change === "cancelled" ? null : deps.manageUrl(b.id),
      by,
    })
    out.visitorEmail = await safely(async () => {
      const sent = await deps.email({ ...mail, to: ctx.contact.email!, fromName: hostName, replyTo: identity.replyTo || identity.sellerEmail })
      if (!sent.success) throw new Error("not sent")
    })
  }

  if (change !== "new" || b.status === "confirmed") {
    out.calendar = await safely(() =>
      deps.sync({
        ownerId: b.owner_id,
        booking: { id: b.id, status: b.status, google_event_id: b.google_event_id || null, google_calendar_id: b.google_calendar_id || null },
        event: eventFor(ctx, deps.origin),
      }),
    )
  }
  return out
}
