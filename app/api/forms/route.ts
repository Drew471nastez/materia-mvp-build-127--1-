import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, boundedJson, isMissingSchema, formsKnownMissing, formsMissingResponse, logFormsError, noteFormsTables } from "@/lib/forms/server"
import { validateDefinition } from "@/lib/forms/definition"
import { formTemplate } from "@/lib/forms/templates"
import { clientForm } from "@/lib/forms/integrations"
import { formKind } from "@/lib/forms/kind"
import { creatorIdOf, formUsages, overviewAdmin, responseCounts, siteFormsOf } from "@/lib/forms/overview-server"
export const dynamic = "force-dynamic"

const COLUMNS = "id,title,status,revision,draft,published,updated_at,integration_settings"
const NO_FORMS = "Forms need the database update (SQL part 372 in Admin › SQL updates)."

/*
  GET            the owner's forms (the pickers and the builder).
  GET ?overview=1 the same, each with its kind, its number of responses and
                 where it is used, and the older website builder's forms
                 (Contacts › Forms, lib/forms/overview-server.ts). A fixed
                 number of reads, whatever the number of forms.
*/
export async function GET(request?: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const overview = request ? new URL(request.url).searchParams.get("overview") === "1" : false
  /* No forms tables yet (parts 372 and 375 not run): an empty list, marked, never an error to retry. The older website forms are still listed. */
  if (formsKnownMissing()) return NextResponse.json({ forms: [], missing: true, ...(overview ? { siteForms: await siteFormsFor(actor.user.id) } : {}) }, { headers: NO_STORE })
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
  if (noteFormsTables(error)) return NextResponse.json({ forms: [], missing: true, ...(overview ? { siteForms: await siteFormsFor(actor.user.id) } : {}) }, { headers: NO_STORE })
  if (error) {
    logFormsError("list", error)
    return formError(new Error(isMissingSchema(error) ? NO_FORMS : "Forms could not be loaded. Try again."), 503)
  }
  const forms = (data || []).map((row: Record<string, unknown>) => clientForm(row)) as unknown as ({ id: string; draft?: unknown; published?: unknown } & Record<string, unknown>)[]
  if (!overview) return NextResponse.json({ forms }, { headers: NO_STORE })
  const ids = forms.map((f) => f.id)
  const admin = overviewAdmin()
  const creatorId = await creatorIdOf(admin, actor.user.id)
  const [counts, usages, siteForms] = await Promise.all([responseCounts(actor.db, actor.user.id, ids), formUsages(admin, actor.user.id, creatorId, ids), siteFormsOf(admin, creatorId)])
  return NextResponse.json(
    {
      forms: forms.map((f) => ({
        ...f,
        kind: formKind((f.published || f.draft) as never),
        responses: counts.get(f.id) ?? 0,
        usages: usages.get(f.id.toLowerCase()) ?? [],
      })),
      siteForms,
    },
    { headers: NO_STORE },
  )
}

async function siteFormsFor(userId: string) {
  const admin = overviewAdmin()
  return siteFormsOf(admin, await creatorIdOf(admin, userId))
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
