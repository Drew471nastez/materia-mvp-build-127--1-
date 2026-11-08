import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, formsKnownMissing, formsMissingResponse, logFormsError, noteFormsTables } from "@/lib/forms/server"
import { UUID } from "@/lib/forms/actions"
import { formInsights } from "@/lib/forms/insights"
import type { FormDefinition } from "@/lib/forms/definition"
export const dynamic = "force-dynamic"

/*
  GET  one of the owner's forms, worked out from its responses
       (lib/forms/insights.ts): totals, the last 12 weeks, where responses
       came from, where the follow up stands, and a quiz's scores. Reads at
       most READ_CAP responses, newest first (form_submissions_form index);
       past that the answer says it is capped. Owner only: the form and its
       responses are both read with owner_id = the signed in user (and RLS).
*/
const READ_CAP = 5000

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  if (formsKnownMissing()) return formsMissingResponse()
  const { data: form, error: formReadError } = await actor.db.from("native_forms").select("id,draft,published").eq("id", id).eq("owner_id", actor.user.id).maybeSingle()
  if (noteFormsTables(formReadError)) return formsMissingResponse()
  if (formReadError) {
    logFormsError("insights form", formReadError)
    return formError(new Error("Insights could not be loaded. Try again."), 503)
  }
  if (!form) return formError(new Error("Form not found."), 404)
  const { data, error } = await actor.db
    .from("form_submissions")
    .select("submitted_at,score,status,source_kind,contact_email,contact_phone")
    .eq("owner_id", actor.user.id)
    .eq("form_id", id)
    .order("submitted_at", { ascending: false })
    .limit(READ_CAP + 1)
  if (error) {
    logFormsError("insights", error)
    return formError(new Error("Insights could not be loaded. Try again."), 503)
  }
  const rows = (data || []) as { submitted_at: string }[]
  const def = (form.published || form.draft || {}) as Partial<FormDefinition>
  const insights = formInsights(rows.slice(0, READ_CAP), { quiz: def.mode === "quiz", results: def.results, capped: rows.length > READ_CAP })
  return NextResponse.json({ insights }, { headers: NO_STORE })
}
