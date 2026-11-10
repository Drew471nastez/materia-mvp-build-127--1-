import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { boundedJson, formError, NO_STORE } from "@/lib/forms/server"
import { generateSlots } from "@/lib/forms/slots"
import { readManageToken } from "@/lib/bookings/manage-token"
import { cancelBooking, lengthOf, moveBooking, readBusy, readContext, readFormSettings, readOwnedBooking, type BookingRow } from "@/lib/bookings/server"
import { announce } from "@/lib/bookings/announce-server"
import { bookingIcs, googleAddUrl, locationWords } from "@/lib/bookings/calendar-file"
import { platformOrigin } from "@/lib/onepage/return-address"

/*
  THE VISITOR'S OWN BOOKING, BY THE SIGNED LINK IN THEIR EMAIL (round AR).

  GET  /api/bookings/manage/<token>                       what they booked
  GET  /api/bookings/manage/<token>?slots=1&from=&days=   times they can move to
  POST /api/bookings/manage/<token> { action: "cancel", reason? } | { action: "reschedule", start }

  The token is the booking id signed by the server (lib/bookings/manage-token.ts):
  a changed id fails the signature and is "not found", the same answer as a
  booking that does not exist. The owner is read from the booking row, never
  from the request. Rate limited per address like the public form routes.
  What leaves the server: the form's title, the time, its status and where
  it happens; never the creator's other bookings or the visitor's answers.
*/

async function limit(request: Request, write: boolean) {
  const limited = await rateLimit({
    bucket: write ? "booking-manage-write" : "booking-manage-read",
    subjects: [addressSubject(request)],
    windows: write ? [{ limit: 10, seconds: 600 }] : [{ limit: 120, seconds: 600 }],
    memoryFirst: !write,
    message: "That is a lot of changes from one place. Try again in a few minutes.",
  })
  if (limited) limited.headers.set("Cache-Control", "no-store")
  return limited
}

async function bookingFor(token: string): Promise<BookingRow | null> {
  const id = readManageToken(token)
  if (!id) return null
  const db = createAdminClient()
  const { data } = await db.from("form_bookings").select("owner_id").eq("id", id).maybeSingle()
  if (!data?.owner_id) return null
  return readOwnedBooking(db, data.owner_id, id)
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await limit(request, false)
  if (limited) return limited
  const { token } = await params
  const booking = await bookingFor(token).catch(() => null)
  if (!booking) return formError(new Error("This link is not valid. Use the link in your latest email."), 404)
  const db = createAdminClient()
  const url = new URL(request.url)
  /* ?ics=1: the booking as a calendar file, for "Add to calendar" on the confirmation and this page. */
  if (url.searchParams.get("ics") === "1") {
    const ctx = await readContext(db, booking)
    const text = bookingIcs({
      bookingId: booking.id,
      title: ctx.formTitle,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      location: booking.location || null,
      sequence: booking.reschedule_count || 0,
      cancelled: booking.status === "cancelled" || booking.status === "declined",
      manageUrl: `${platformOrigin()}/booking/${token}`,
    })
    return new Response(text, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="booking.ics"', "Cache-Control": "no-store" } })
  }
  if (url.searchParams.get("slots") === "1") {
    const form = await readFormSettings(db, booking.owner_id, booking.form_id)
    if (!form) return formError(new Error("New times are not available. Reply to your email to change it."), 409)
    const now = Date.now()
    const fromParam = Date.parse(url.searchParams.get("from") || "")
    const from = Number.isFinite(fromParam) ? Math.max(now, fromParam) : now
    const days = Math.max(1, Math.min(42, Number(url.searchParams.get("days")) || 42))
    const to = from + days * 86_400_000
    const read = await readBusy(db, { ownerId: booking.owner_id, formId: booking.form_id, settings: form.settings, fromMs: from, toMs: to, excludeId: booking.id })
    if (read.error) return formError(new Error("Times could not be loaded. Try again."), 503)
    const slots = generateSlots(form.settings, { fromMs: from, toMs: to, nowMs: now, busy: read.busy, perDay: read.perDay, duration: lengthOf(booking), limit: 1500 })
    const horizon = now + form.settings.days_ahead * 86_400_000
    return NextResponse.json({ slots, duration: lengthOf(booking), horizon: new Date(horizon).toISOString(), next: to < horizon ? new Date(to).toISOString() : null }, { headers: NO_STORE })
  }
  const ctx = await readContext(db, booking)
  return NextResponse.json(
    {
      booking: {
        title: ctx.formTitle,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        duration: lengthOf(booking),
        status: booking.status,
        cancelled_by: booking.cancelled_by || null,
        where: booking.status === "cancelled" || booking.status === "declined" ? null : locationWords(booking.location || null),
        can_change: (booking.status === "pending" || booking.status === "confirmed") && Date.parse(booking.starts_at) > Date.now(),
        name: ctx.contact.name,
        google_add_url:
          booking.status === "confirmed"
            ? googleAddUrl({ bookingId: booking.id, title: ctx.formTitle, startsAt: booking.starts_at, endsAt: booking.ends_at, location: booking.location || null, manageUrl: `${platformOrigin()}/booking/${token}` })
            : null,
      },
    },
    { headers: NO_STORE },
  )
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await limit(request, true)
  if (limited) return limited
  const { token } = await params
  try {
    const booking = await bookingFor(token)
    if (!booking) return formError(new Error("This link is not valid. Use the link in your latest email."), 404)
    const body = await boundedJson(request, 1500)
    const db = createAdminClient()
    const action = String(body.action || "")
    if (action !== "cancel" && action !== "reschedule") return formError(new Error("Choose cancel or a new time."))
    const result =
      action === "cancel"
        ? await cancelBooking(db, { ownerId: booking.owner_id, bookingId: booking.id, by: "visitor", reason: typeof body.reason === "string" ? body.reason : undefined })
        : await moveBooking(db, { ownerId: booking.owner_id, bookingId: booking.id, start: typeof body.start === "string" ? body.start : "", by: "visitor" })
    if (!result.ok) return NextResponse.json({ error: result.error, slot_taken: result.taken === true }, { status: result.status, headers: NO_STORE })
    const changed = result.booking
    after(() => announce(db, changed, action === "cancel" ? "cancelled" : "moved", "visitor", { previousStart: result.before.starts_at }).then(() => undefined))
    return NextResponse.json({ booking: { status: changed.status, starts_at: changed.starts_at, ends_at: changed.ends_at } }, { headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}
