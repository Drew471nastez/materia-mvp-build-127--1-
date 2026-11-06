import { NextResponse } from "next/server"
import { formActor, formError, NO_STORE } from "@/lib/forms/server"
import {
  applyLeadFilters,
  beforeLead,
  leadCursor,
} from "@/lib/forms/lead-query"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const params = new URL(request.url).searchParams
    let query = actor.db
      .from("form_submissions")
      .select(
        "id,form_id,form_title,form_revision,answers,contact_name,contact_email,contact_phone,score,consent,status,source_kind,source_url,submitted_at",
      )
      .eq("owner_id", actor.user.id)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(51)
    query = beforeLead(applyLeadFilters(query, params), params.get("before"))
    const { data, error } = await query
    if (error)
      return formError(new Error("Leads could not be loaded. Try again."), 503)
    const rows = data || []
    return NextResponse.json(
      {
        leads: rows.slice(0, 50),
        next: rows.length > 50 ? leadCursor(rows[49]) : null,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    return formError(error)
  }
}
