import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, boundedJson, isMissingSchema } from "@/lib/forms/server"
import { validateDefinition } from "@/lib/forms/definition"
import { formTemplate } from "@/lib/forms/templates"
import { clientForm } from "@/lib/forms/integrations"
export const dynamic = "force-dynamic"

const COLUMNS = "id,title,status,revision,draft,published,updated_at,integration_settings"
const NO_FORMS = "Forms need the database update (SQL part 372 in Admin › SQL updates)."

export async function GET() {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data, error }: { data: any[] | null; error: any } = await actor.db
    .from("native_forms")
    .select(COLUMNS + ",retention_days")
    .eq("owner_id", actor.user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100)
  if (error && isMissingSchema(error) && /retention_days/.test(String(error.message))) {
    ;({ data, error } = await actor.db.from("native_forms").select(COLUMNS).eq("owner_id", actor.user.id).neq("status", "archived").order("created_at", { ascending: false }).limit(100))
  }
  if (error) return formError(new Error(isMissingSchema(error) ? NO_FORMS : "Forms could not be loaded. Try again."), 503)
  return NextResponse.json({ forms: (data || []).map((row: Record<string, unknown>) => clientForm(row)) }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const body = await boundedJson(request)
    const definition = validateDefinition(body.definition || formTemplate(typeof body.template === "string" ? body.template : "contact"), false)
    const { data, error } = await actor.db
      .from("native_forms")
      .insert({ owner_id: actor.user.id, title: definition.title, draft: definition })
      .select(COLUMNS)
      .single()
    if (error) return formError(new Error(isMissingSchema(error) ? NO_FORMS : "The form could not be created. Try again."), 503)
    return NextResponse.json({ form: clientForm(data) }, { status: 201, headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}
