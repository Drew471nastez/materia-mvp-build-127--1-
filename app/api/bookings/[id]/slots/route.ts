import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor, formError, NO_STORE } from "@/lib/forms/server"
import { UUID } from "@/lib/forms/actions"
import { generateSlots } from "@/lib/forms/slots"
import { lengthOf, readBusy, readFormSettings, readOwnedBooking } from "@/lib/bookings/server"

/*
  GET /api/bookings/<id>/slots?from=<ISO>&days=<1..42>

  The free times the creator can move one of their bookings to: the form's
  hours, the booking's own length, every other booking and Google busy
  time blocking, the booking itself not. The notice period and the daily
  limit are the visitor's rules, so they do not bind the creator here.
*/
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Booking not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const booking = await readOwnedBooking(actor.db, actor.user.id, id).catch(() => null)
  if (!booking) return formError(new Error("Booking not found."), 404)
  const admin = createAdminClient()
  const form = await readFormSettings(admin, actor.user.id, booking.form_id)
  if (!form) return formError(new Error("This booking form is no longer taking bookings."), 409)
  const url = new URL(request.url)
  const now = Date.now()
  const fromParam = Date.parse(url.searchParams.get("from") || "")
  const from = Number.isFinite(fromParam) ? Math.max(now, fromParam) : now
  const days = Math.max(1, Math.min(42, Number(url.searchParams.get("days")) || 42))
  const to = from + days * 86_400_000
  const settings = { ...form.settings, notice_hours: 0, max_per_day: undefined }
  const read = await readBusy(admin, { ownerId: actor.user.id, formId: booking.form_id, settings, fromMs: from, toMs: to, excludeId: booking.id })
  if (read.error) return formError(new Error("Times could not be loaded. Try again."), 503)
  const slots = generateSlots(settings, { fromMs: from, toMs: to, nowMs: now, busy: read.busy, duration: lengthOf(booking), limit: 1500 })
  const horizon = now + settings.days_ahead * 86_400_000
  return NextResponse.json({ slots, duration: lengthOf(booking), owner_timezone: settings.timezone, horizon: new Date(horizon).toISOString(), next: to < horizon ? new Date(to).toISOString() : null }, { headers: NO_STORE })
}
