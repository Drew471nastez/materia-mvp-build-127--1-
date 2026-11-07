import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor, formError, NO_STORE, isMissingSchema } from "@/lib/forms/server"
import { applyLeadFilters, beforeLead, leadCursor, LEAD_COLUMNS, LEAD_COLUMNS_375 } from "@/lib/forms/lead-query"
import { UUID } from "@/lib/forms/actions"
import { FORM_UPLOAD_BUCKET } from "@/lib/forms/uploads-server"
export const dynamic = "force-dynamic"

/*
  GET     the owner's leads, newest first, 50 at a time, with filters and
          search (lib/forms/lead-query.ts) and each booking's time.
  DELETE  ?form=<id>&confirm=all: every lead of one of the owner's forms,
          with their files. Reads and deletes run as the owner (RLS);
          only removing the stored files needs the server's storage key,
          and only for paths the owner's own read returned.
*/

export async function GET(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
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
    if (error) return formError(new Error(isMissingSchema(error) ? "Leads need the database update (SQL part 372 in Admin › SQL updates)." : "Leads could not be loaded. Try again."), 503)
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
    return NextResponse.json(
      {
        leads: rows.map((r) => ({ ...r, booking: bookings.find((b) => b.submission_id === r.id) || null })),
        next: (data || []).length > 50 ? leadCursor(rows[49] as { submitted_at: string; id: string }) : null,
        upgraded,
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
