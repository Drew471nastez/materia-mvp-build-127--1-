import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, boundedJson } from "@/lib/forms/server"
import { validateDefinition } from "@/lib/forms/definition"
import { formTemplate } from "@/lib/forms/templates"
export const dynamic = "force-dynamic"
export async function GET() {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const { data, error } = await actor.db
    .from("native_forms")
    .select(
      "id,title,status,revision,draft,published,updated_at,integration_settings",
    )
    .eq("owner_id", actor.user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100)
  return error
    ? formError(new Error("Forms could not be loaded. Try again."), 503)
    : NextResponse.json({ forms: data || [] }, { headers: NO_STORE })
}
export async function POST(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const body = await boundedJson(request)
    const definition = validateDefinition(
      body.definition || formTemplate(body.template || "contact"),
      false,
    )
    const { data, error } = await actor.db
      .from("native_forms")
      .insert({
        owner_id: actor.user.id,
        title: definition.title,
        draft: definition,
      })
      .select(
        "id,title,status,revision,draft,published,updated_at,integration_settings",
      )
      .single()
    if (error)
      return formError(
        new Error("The form could not be created. Try again."),
        503,
      )
    return NextResponse.json({ form: data }, { status: 201, headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}
