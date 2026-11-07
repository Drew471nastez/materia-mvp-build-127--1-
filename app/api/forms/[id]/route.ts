import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, boundedJson, isMissingSchema, NEEDS_SQL, formsKnownMissing, formsMissingResponse, logFormsError, noteFormsTables } from "@/lib/forms/server"
import { validateDefinition } from "@/lib/forms/definition"
import { UUID } from "@/lib/forms/actions"
import { clientForm, mergeIntegrations } from "@/lib/forms/integrations"

const COLUMNS = "id,title,status,revision,draft,published,updated_at,integration_settings"

/*
  PATCH saves the draft, and with publish: true makes it the version every
  page shows. updated_at is the optimistic lock: a save from a stale tab is
  a 409, never an overwrite. Integrations are merged over what is stored so
  the sealed webhook secret is never lost or sent to the browser.
*/
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  if (formsKnownMissing()) return formsMissingResponse()
  try {
    const body = await boundedJson(request, 128 * 1024)
    if (typeof body.updated_at !== "string") return formError(new Error("Reload the form before saving."), 409)
    const { data: current, error: readError } = await actor.db
      .from("native_forms")
      .select("id,revision,updated_at,integration_settings")
      .eq("id", id)
      .eq("owner_id", actor.user.id)
      .maybeSingle()
    if (noteFormsTables(readError)) return formsMissingResponse()
    if (readError) {
      logFormsError("read for save", readError)
      return formError(new Error("The form could not be read. Try again."), 503)
    }
    if (!current) return formError(new Error("Form not found."), 404)
    const definition = validateDefinition(body.definition, body.publish === true)
    const changes: Record<string, unknown> = { draft: definition, title: definition.title, updated_at: new Date().toISOString() }
    if (body.publish === true) {
      changes.published = definition
      changes.status = "published"
      changes.revision = current.revision + 1
    }
    if (body.integrations) changes.integration_settings = mergeIntegrations(current.integration_settings, body.integrations)
    if ("retention_days" in body) {
      const days = body.retention_days
      if (days !== null && !(Number.isInteger(days) && days >= 7 && days <= 3650)) return formError(new Error("Keep responses for 7 to 3650 days, or forever."))
      changes.retention_days = days
    }
    const write = (values: Record<string, unknown>) =>
      actor.db.from("native_forms").update(values).eq("id", id).eq("owner_id", actor.user.id).eq("updated_at", body.updated_at).select(COLUMNS).maybeSingle()
    let { data, error } = await write(changes)
    if (error && isMissingSchema(error) && "retention_days" in changes) {
      if (changes.retention_days !== null) return formError(new Error(NEEDS_SQL), 503)
      delete changes.retention_days
      ;({ data, error } = await write(changes))
    }
    if (error) {
      logFormsError("save", error)
      return formError(new Error("The form did not save. Try again."), 503)
    }
    if (!data) return formError(new Error("This form changed in another session. Reload it before saving."), 409)
    return NextResponse.json({ form: { ...clientForm(data), retention_days: changes.retention_days ?? body.retention_days ?? null } }, { headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}

/** Archive: the form stops taking responses at once; its leads stay until deleted in Leads. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404)
  const { data, error } = await actor.db
    .from("native_forms")
    .update({ status: "archived", published: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", actor.user.id)
    .select("id")
    .maybeSingle()
  if (noteFormsTables(error)) return formsMissingResponse()
  if (error) {
    logFormsError("archive", error)
    return formError(new Error("The form was not archived. Try again."), 503)
  }
  if (!data) return formError(new Error("Form not found."), 404)
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
