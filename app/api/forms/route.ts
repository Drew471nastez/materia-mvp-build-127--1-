import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, boundedJson, isMissingSchema, formsKnownMissing, formsMissingResponse, logFormsError, noteFormsTables } from "@/lib/forms/server"
import { validateDefinition } from "@/lib/forms/definition"
import { formTemplate } from "@/lib/forms/templates"
import { clientForm } from "@/lib/forms/integrations"
export const dynamic = "force-dynamic"

const COLUMNS = "id,title,status,revision,draft,published,updated_at,integration_settings"
const NO_FORMS = "Forms need the database update (SQL part 372 in Admin › SQL updates)."

export async function GET() {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  /* No forms tables yet (parts 372 and 375 not run): an empty list, marked, never an error to retry. */
  if (formsKnownMissing()) return NextResponse.json({ forms: [], missing: true }, { headers: NO_STORE })
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
  if (noteFormsTables(error)) return NextResponse.json({ forms: [], missing: true }, { headers: NO_STORE })
  if (error) {
    logFormsError("list", error)
    return formError(new Error(isMissingSchema(error) ? NO_FORMS : "Forms could not be loaded. Try again."), 503)
  }
  return NextResponse.json({ forms: (data || []).map((row: Record<string, unknown>) => clientForm(row)) }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  if (formsKnownMissing()) return formsMissingResponse()
  try {
    const body = await boundedJson(request)
    /* publish: true makes it live at once (a pre-chat form made from a WhatsApp or Telegram button: its questions are the template's until edited). */
    const publish = body.publish === true
    const definition = validateDefinition(body.definition || formTemplate(typeof body.template === "string" ? body.template : "contact"), publish)
    const { data, error } = await actor.db
      .from("native_forms")
      .insert({ owner_id: actor.user.id, title: definition.title, draft: definition, ...(publish ? { published: definition, status: "published", revision: 1 } : {}) })
      .select(COLUMNS)
      .single()
    if (noteFormsTables(error)) return formsMissingResponse()
    if (error) {
      logFormsError("create", error)
      return formError(new Error(isMissingSchema(error) ? NO_FORMS : "The form could not be created. Try again."), 503)
    }
    return NextResponse.json({ form: clientForm(data) }, { status: 201, headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}
