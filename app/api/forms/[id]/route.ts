import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, boundedJson } from "@/lib/forms/server"
import { validateDefinition } from "@/lib/forms/definition"
import { UUID } from "@/lib/forms/actions"
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const body = await boundedJson(request)
    if (typeof body.updated_at !== "string")
      return formError(new Error("Reload the form before saving."), 409)
    const { data: current, error: readError } = await actor.db
      .from("native_forms")
      .select("id,revision,updated_at")
      .eq("id", id)
      .eq("owner_id", actor.user.id)
      .maybeSingle()
    if (readError)
      return formError(new Error("The form could not be read."), 503)
    if (!current) return formError(new Error("Form not found."), 404)
    const definition = validateDefinition(
      body.definition,
      body.publish === true,
    )
    const changes: Record<string, unknown> = {
      draft: definition,
      title: definition.title,
      updated_at: new Date().toISOString(),
    }
    if (body.publish === true) {
      changes.published = definition
      changes.status = "published"
      changes.revision = current.revision + 1
    }
    if (body.integrations) {
      changes.integration_settings = {
        webhook: { prepared: body.integrations.webhook?.prepared === true },
        google_sheets: {
          prepared: body.integrations.google_sheets?.prepared === true,
        },
      }
    }
    const { data, error } = await actor.db
      .from("native_forms")
      .update(changes)
      .eq("id", id)
      .eq("owner_id", actor.user.id)
      .eq("updated_at", body.updated_at)
      .select(
        "id,title,status,revision,draft,published,updated_at,integration_settings",
      )
      .maybeSingle()
    if (error)
      return formError(new Error("The form did not save. Try again."), 503)
    if (!data)
      return formError(
        new Error(
          "This form changed in another session. Reload it before saving.",
        ),
        409,
      )
    return NextResponse.json({ form: data }, { headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404)
  const { error } = await actor.db
    .from("native_forms")
    .update({
      status: "archived",
      published: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", actor.user.id)
  return error
    ? formError(new Error("The form was not archived."), 503)
    : NextResponse.json({ ok: true }, { headers: NO_STORE })
}
