import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor, formError, boundedJson, NO_STORE, isMissingSchema, NEEDS_SQL, formsKnownMissing, formsMissingResponse, noteFormsTables } from "@/lib/forms/server"
import { LEAD_STATUSES } from "@/lib/forms/definition"
import { UUID } from "@/lib/forms/actions"
import { FORM_UPLOAD_BUCKET } from "@/lib/forms/uploads-server"

/* The owner changes a lead's status and notes only. Answers and consent are never writable (column grants, part 372 and 375). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Lead not found."), 404)
  try {
    const body = await boundedJson(request, 12_000)
    const changes: Record<string, unknown> = {}
    if ("status" in body) {
      if (!LEAD_STATUSES.includes(body.status)) return formError(new Error("Choose a valid lead status."))
      changes.status = body.status
    }
    if ("notes" in body) {
      if (body.notes !== null && typeof body.notes !== "string") return formError(new Error("Notes must be text."))
      const notes = typeof body.notes === "string" ? body.notes.replace(/\r\n/g, "\n").slice(0, 5000) : null
      changes.notes = notes && notes.trim() ? notes : null
      changes.updated_at = new Date().toISOString()
    }
    if (!Object.keys(changes).length) return formError(new Error("Nothing to save."))
    const { data, error } = await actor.db.from("form_submissions").update(changes).eq("id", id).eq("owner_id", actor.user.id).select("id,status").maybeSingle()
    if (noteFormsTables(error)) return formsMissingResponse()
    if (error) return formError(new Error(isMissingSchema(error) || error.code === "42501" ? NEEDS_SQL : "That did not save. Try again."), 503)
    if (!data) return formError(new Error("Lead not found."), 404)
    return NextResponse.json({ lead: { ...data, ...("notes" in changes ? { notes: changes.notes } : {}) } }, { headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Lead not found."), 404)
  if (formsKnownMissing()) return formsMissingResponse()
  const { data: files } = await actor.db.from("form_uploads").select("id,path").eq("owner_id", actor.user.id).eq("submission_id", id)
  const { data, error } = await actor.db.from("form_submissions").delete().eq("id", id).eq("owner_id", actor.user.id).select("id")
  if (error) return formError(new Error("The lead was not deleted."), 503)
  if (!data?.length) return formError(new Error("Lead not found."), 404)
  if (files?.length) {
    const admin = createAdminClient()
    const owned = (files as { id: string; path: string }[]).filter((f) => f.path.startsWith(`${actor.user.id}/`))
    await admin.storage.from(FORM_UPLOAD_BUCKET).remove(owned.map((f) => f.path)).catch(() => null)
    await admin.from("form_uploads").delete().in("id", owned.map((f) => f.id)).eq("owner_id", actor.user.id)
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
