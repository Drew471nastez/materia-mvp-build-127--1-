import { LEAD_STATUSES } from "./definition"
import { UUID } from "./actions"

/*
  Leads filters, read from the query string and applied to a query that is
  already limited to the signed-in owner (the routes add owner_id, and RLS
  holds it again). Nothing here can widen what a query reads.
*/

export const LEAD_COLUMNS =
  "id,form_id,form_title,form_revision,answers,contact_name,contact_email,contact_phone,score,consent,status,source_kind,source_url,submitted_at"
export const LEAD_COLUMNS_375 = LEAD_COLUMNS + ",notes,source_block"

export function leadCursor(row: { submitted_at: string; id: string }): string {
  return row.submitted_at + "~" + row.id
}

/** Search text safe inside a PostgREST or() filter: no commas, brackets, quotes, wildcards or backslashes. */
export function searchTerm(raw: string | null): string {
  return (raw || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@._+\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function applyLeadFilters(query: any, params: URLSearchParams) {
  if (UUID.test(params.get("form") || "")) query = query.eq("form_id", params.get("form")!)
  if (UUID.test(params.get("lead") || "")) query = query.eq("id", params.get("lead")!)
  if (LEAD_STATUSES.includes(params.get("status") as never)) query = query.eq("status", params.get("status")!)
  if (["onepage", "website", "creator_page", "form"].includes(params.get("source") || "")) query = query.eq("source_kind", params.get("source")!)
  const from = params.get("from") || ""
  const to = params.get("to") || ""
  if (DAY.test(from) && Number.isFinite(Date.parse(from))) query = query.gte("submitted_at", from + "T00:00:00Z")
  if (DAY.test(to) && Number.isFinite(Date.parse(to))) query = query.lt("submitted_at", new Date(Date.parse(to + "T00:00:00Z") + 86_400_000).toISOString())
  const q = searchTerm(params.get("q"))
  if (q) {
    const like = `*${q}*`
    query = query.or(`contact_name.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like},form_title.ilike.${like}`)
  }
  return query
}

export function beforeLead(query: any, cursor: string | null) {
  if (!cursor) return query
  const [time, id] = cursor.split("~")
  if (!time || time.length > 40 || !/^[\dT:+.Z-]+$/.test(time) || !Number.isFinite(Date.parse(time)) || !UUID.test(id || ""))
    throw new Error("The lead cursor is not valid.")
  return query.or(`submitted_at.lt.${time},and(submitted_at.eq.${time},id.lt.${id})`)
}
