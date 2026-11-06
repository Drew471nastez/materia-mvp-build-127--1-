import { NextResponse } from "next/server"
import { formActor, formError, boundedJson, NO_STORE } from "@/lib/forms/server"
import { LEAD_STATUSES } from "@/lib/forms/definition"
import { UUID } from "@/lib/forms/actions"
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Lead not found."), 404)
  try {
    const body = await boundedJson(request, 1000)
    if (!LEAD_STATUSES.includes(body.status))
      return formError(new Error("Choose a valid lead status."))
    const { data, error } = await actor.db
      .from("form_submissions")
      .update({ status: body.status })
      .eq("id", id)
      .eq("owner_id", actor.user.id)
      .select("id,status")
      .maybeSingle()
    if (error) return formError(new Error("The status did not save."), 503)
    if (!data) return formError(new Error("Lead not found."), 404)
    return NextResponse.json({ lead: data }, { headers: NO_STORE })
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
  if (!UUID.test(id)) return formError(new Error("Lead not found."), 404)
  const { error } = await actor.db
    .from("form_submissions")
    .delete()
    .eq("id", id)
    .eq("owner_id", actor.user.id)
  return error
    ? formError(new Error("The lead was not deleted."), 503)
    : NextResponse.json({ ok: true }, { headers: NO_STORE })
}
