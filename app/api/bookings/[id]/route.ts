import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor, formError, boundedJson, NO_STORE, isMissingSchema, NEEDS_SQL } from "@/lib/forms/server"
import { UUID } from "@/lib/forms/actions"
import { queueJobs, runFormJobs } from "@/lib/forms/delivery-server"

/*
  PATCH /api/bookings/<id> { decision: "confirm" | "decline" | "cancel" }

  The owner answers a booking request from Leads. The change is made as
  the owner (RLS), only from a state it can follow, so two tabs cannot
  confirm and decline the same request. A confirmation or a decline emails
  the visitor once (one job per booking and kind, retried until sent).
*/
const FROM: Record<string, string[]> = { confirm: ["pending"], decline: ["pending"], cancel: ["pending", "confirmed"] }
const TO: Record<string, string> = { confirm: "confirmed", decline: "declined", cancel: "cancelled" }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Booking not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const body = await boundedJson(request, 500)
    const decision = String(body.decision || "")
    if (!FROM[decision]) return formError(new Error("Choose confirm, decline or cancel."))
    const { data, error } = await actor.db
      .from("form_bookings")
      .update({ status: TO[decision], decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", actor.user.id)
      .in("status", FROM[decision])
      .select("id,form_id,submission_id,status,starts_at")
      .maybeSingle()
    if (error) return formError(new Error(isMissingSchema(error) ? NEEDS_SQL : "The booking did not change. Try again."), 503)
    if (!data) return formError(new Error("This booking was already answered. Reload Leads."), 409)
    if (decision !== "cancel") {
      const admin = createAdminClient()
      const jobs = await queueJobs(admin as never, {
        ownerId: actor.user.id,
        formId: data.form_id,
        submissionId: data.submission_id,
        jobs: [{ provider: decision === "confirm" ? "booking_confirmed" : "booking_declined", state: "ready" }],
      })
      if (jobs.length) after(() => runFormJobs(admin as never, { ids: jobs, until: Date.now() + 20_000 }).then(() => undefined, () => undefined))
    }
    return NextResponse.json({ booking: data }, { headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}
