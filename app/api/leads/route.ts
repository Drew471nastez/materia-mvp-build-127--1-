import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor, formError, NO_STORE, isMissingSchema, formsKnownMissing, formsMissingResponse, logFormsError, noteFormsTables } from "@/lib/forms/server"
import { applyLeadFilters, beforeLead, leadCursor, LEAD_COLUMNS, LEAD_COLUMNS_375 } from "@/lib/forms/lead-query"
import { UUID } from "@/lib/forms/actions"
import { FORM_UPLOAD_BUCKET } from "@/lib/forms/uploads-server"
export const dynamic = "force-dynamic"

/*
  GET     the owner's leads, newest first, 50 at a time, with filters and
          search (lib/forms/lead-query.ts) and each booking's time. With
          totals=1 also the counts Emails › Leads shows over its table
          (all, new, the last seven days). With no forms tables yet (parts
          372 and 375 not run) an empty list marked `missing`, never an
          error: Emails › Leads says so in one sentence.
  DELETE  ?form=<id>&confirm=all: every lead of one of the owner's forms,
          with their files. Reads and deletes run as the owner (RLS);
          only removing the stored files needs the server's storage key,
          and only for paths the owner's own read returned.
*/

export async function GET(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  if (formsKnownMissing()) return NextResponse.json({ leads: [], next: null, upgraded: false, missing: true, totals: null }, { headers: NO_STORE })
  try {
    const params = new URL(request.url).searchParams
    const read = (columns: string) =>
      beforeLead(
        applyLeadFilters(
          actor.db.from("form_submissions").select(columns).eq("owner_id", actor.user.id).order("submitted_at", { ascending: false }).order("id", { ascending: false }).limit(51),
          params,
        ),
        params.get("before"),
      )
    let { data, error } = await read(LEAD_COLUMNS_375)
    let upgraded = true
    if (error && isMissingSchema(error)) {
      upgraded = false
      ;({ data, error } = await read(LEAD_COLUMNS))
    }
    if (noteFormsTables(error)) return NextResponse.json({ leads: [], next: null, upgraded: false, missing: true, totals: null }, { headers: NO_STORE })
    if (error) {
      logFormsError("leads", error)
      return formError(new Error(isMissingSchema(error) ? "Leads need the database update (SQL part 372 in Admin › SQL updates)." : "Leads could not be loaded. Try again."), 503)
    }
    const rows = ((data || []) as unknown as Record<string, unknown>[]).slice(0, 50)
    let bookings: Record<string, unknown>[] = []
    if (upgraded && rows.length) {
      const { data: b } = await actor.db
        .from("form_bookings")
        .select("id,submission_id,starts_at,ends_at,status,visitor_timezone,payment_product_id,payment_status,payment_due_at,payment_note")
        .eq("owner_id", actor.user.id)
        .in("submission_id", rows.map((r) => r.id as string))
      bookings = (b || []) as Record<string, unknown>[]
    }
    let totals: { all: number; fresh: number; week: number } | null = null
    if (params.get("totals") === "1" && !params.get("before")) {
      const count = (narrow: (q: any) => any) => narrow(actor.db.from("form_submissions").select("id", { count: "exact", head: true }).eq("owner_id", actor.user.id)).then((r: { count: number | null }) => r.count ?? 0)
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const [all, fresh, week] = await Promise.all([count((q) => q), count((q) => q.eq("status", "new")), count((q) => q.gte("submitted_at", since))]).catch(() => [0, 0, 0])
      totals = { all, fresh, week }
    }
    return NextResponse.json(
      {
        leads: rows.map((r) => ({ ...r, booking: bookings.find((b) => b.submission_id === r.id) || null })),
        next: (data || []).length > 50 ? leadCursor(rows[49] as { submitted_at: string; id: string }) : null,
        upgraded,
        totals,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    return formError(error)
  }
}

export async function DELETE(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  if (formsKnownMissing()) return formsMissingResponse()
  const params = new URL(request.url).searchParams
  const formId = params.get("form") || ""
  if (!UUID.test(formId) || params.get("confirm") !== "all") return formError(new Error("Choose the form whose leads you want to delete."))
  const { data: form } = await actor.db.from("native_forms").select("id").eq("id", formId).eq("owner_id", actor.user.id).maybeSingle()
  if (!form) return formError(new Error("Form not found."), 404)
  const { data: files } = await actor.db.from("form_uploads").select("id,path").eq("owner_id", actor.user.id).eq("form_id", formId)
  const { error, count } = await actor.db.from("form_submissions").delete({ count: "exact" }).eq("owner_id", actor.user.id).eq("form_id", formId)
  if (error) return formError(new Error("The leads were not deleted. Try again."), 503)
  if (files?.length) {
    const admin = createAdminClient()
    const owned = (files as { id: string; path: string }[]).filter((f) => f.path.startsWith(`${actor.user.id}/${formId}/`))
    await admin.storage.from(FORM_UPLOAD_BUCKET).remove(owned.map((f) => f.path)).catch(() => null)
    await admin.from("form_uploads").delete().in("id", owned.map((f) => f.id)).eq("owner_id", actor.user.id)
  }
  return NextResponse.json({ ok: true, deleted: count ?? null }, { headers: NO_STORE })
}
