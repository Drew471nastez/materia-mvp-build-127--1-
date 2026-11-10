import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor, formError, boundedJson, NO_STORE, isMissingSchema, NEEDS_SQL } from "@/lib/forms/server"
import { UUID } from "@/lib/forms/actions"
import { queueJobs, runFormJobs } from "@/lib/forms/delivery-server"
import { cancelBooking, moveBooking, readOwnedBooking, readContext } from "@/lib/bookings/server"
import { announce } from "@/lib/bookings/announce-server"
import { locationWords } from "@/lib/bookings/calendar-file"

/*
  GET   /api/bookings/<id>   one booking with who booked and their answers
  PATCH /api/bookings/<id>   { decision: "confirm" | "decline" | "cancel" | "reschedule", start?, reason? }

  The creator answers or changes a booking from /app/bookings or Leads.
  Every read and write names the signed in user as the owner, so an id
  from another creator is "not found" (round AR test: ownership). Confirm
  and decline are made as the owner (RLS), only from a state they can
  follow, so two tabs cannot confirm and decline the same request; cancel
  and reschedule go through lib/bookings/server.ts with the owner's id.
  The visitor hears about each (a job for confirm and decline, retried
  until sent; an email with a new .ics for a move or a cancel), and the
  Google Calendar event follows (lib/bookings/announce.ts).
*/
const FROM: Record<string, string[]> = { confirm: ["pending"], decline: ["pending"] }
const TO: Record<string, string> = { confirm: "confirmed", decline: "declined" }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Booking not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const booking = await readOwnedBooking(actor.db, actor.user.id, id)
    if (!booking) return formError(new Error("Booking not found."), 404)
    const ctx = await readContext(actor.db, booking)
    return NextResponse.json(
      {
        booking: {
          ...booking,
          form_title: ctx.formTitle,
          owner_timezone: ctx.settings?.timezone || null,
          where: locationWords(booking.location || null),
          contact: ctx.contact,
          answers: ctx.answers.map((a) => ({ id: a.field_id, label: a.label, type: a.type, value: a.type === "file" ? a.file?.name || "File" : a.value })),
        },
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    return formError(error, 503)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Booking not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const body = await boundedJson(request, 1000)
    const decision = String(body.decision || "")
    const admin = createAdminClient()

    if (decision === "cancel" || decision === "reschedule") {
      const result =
        decision === "cancel"
          ? await cancelBooking(admin, { ownerId: actor.user.id, bookingId: id, by: "owner", reason: typeof body.reason === "string" ? body.reason : undefined })
          : await moveBooking(admin, { ownerId: actor.user.id, bookingId: id, start: typeof body.start === "string" ? body.start : "", by: "owner" })
      if (!result.ok) return NextResponse.json({ error: result.error, slot_taken: result.taken === true }, { status: result.status, headers: NO_STORE })
      const changed = result.booking
      after(() => announce(admin, changed, decision === "cancel" ? "cancelled" : "moved", "owner", { previousStart: result.before.starts_at }).then(() => undefined))
      return NextResponse.json({ booking: { id: changed.id, status: changed.status, starts_at: changed.starts_at, ends_at: changed.ends_at } }, { headers: NO_STORE })
    }

    if (!FROM[decision]) return formError(new Error("Choose confirm, decline, cancel or reschedule."))
    const { data, error } = await actor.db
      .from("form_bookings")
      .update({ status: TO[decision], decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", actor.user.id)
      .in("status", FROM[decision])
      .select("id,form_id,submission_id,status,starts_at,ends_at")
      .maybeSingle()
    if (error) return formError(new Error(isMissingSchema(error) ? NEEDS_SQL : "The booking did not change. Try again."), 503)
    if (!data) return formError(new Error("This booking was already answered. Reload and try again."), 409)
    const jobs = await queueJobs(admin as never, {
      ownerId: actor.user.id,
      formId: data.form_id,
      submissionId: data.submission_id,
      jobs: [{ provider: decision === "confirm" ? "booking_confirmed" : "booking_declined", state: "ready" }],
    })
    after(async () => {
      /* The Google event first, so a Meet made for it is in the confirmation email. */
      const row = await readOwnedBooking(admin, actor.user.id, id).catch(() => null)
      if (row) await announce(admin, row, decision === "confirm" ? "confirmed" : "declined", "owner")
      if (jobs.length) await runFormJobs(admin as never, { ids: jobs, until: Date.now() + 20_000 }).catch(() => undefined)
    })
    return NextResponse.json({ booking: data }, { headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}
