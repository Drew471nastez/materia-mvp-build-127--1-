import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError } from "@/lib/forms/server"
import { UUID } from "@/lib/forms/actions"
import { creatorIdOf, overviewAdmin } from "@/lib/forms/overview-server"
export const dynamic = "force-dynamic"

/*
  GET  a form from the older website builder (site_forms) and its newest 200
       responses (site_form_submissions), for Contacts › Forms. Read with the
       service role, so the scoping is the WHERE: the form must belong to a
       site of the signed in owner's creator, found from the session. Another
       creator's form answers 404, the same as one that does not exist. Before
       those tables exist (or for a store that never had them) also 404.
*/
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const admin = overviewAdmin()
  const creatorId = await creatorIdOf(admin, actor.user.id)
  if (!creatorId) return formError(new Error("Form not found."), 404)
  const { data: form, error } = await admin.from("site_forms").select("id,site_id,name,fields,created_at,sites!inner(id,name,creator_id)").eq("id", id).eq("sites.creator_id", creatorId).maybeSingle()
  if (error || !form) return formError(new Error("Form not found."), 404)
  const { data: rows } = await admin.from("site_form_submissions").select("id,fields,created_at").eq("form_id", id).eq("site_id", form.site_id).order("created_at", { ascending: false }).limit(200)
  return NextResponse.json(
    {
      form: { id: form.id, name: form.name, site_name: (form.sites as { name?: string | null } | null)?.name ?? null, created_at: form.created_at },
      responses: (rows || []).map((r: { id: string; fields: unknown; created_at: string }) => ({ id: r.id, fields: r.fields && typeof r.fields === "object" && !Array.isArray(r.fields) ? r.fields : {}, created_at: r.created_at })),
    },
    { headers: NO_STORE },
  )
}
