import { LEAD_STATUSES } from "./definition"
import { UUID } from "./actions"
export function leadCursor(row: { submitted_at: string; id: string }): string {
  return row.submitted_at + "~" + row.id
}
export function applyLeadFilters(query: any, params: URLSearchParams) {
  if (UUID.test(params.get("form") || ""))
    query = query.eq("form_id", params.get("form")!)
  if (LEAD_STATUSES.includes(params.get("status") as never))
    query = query.eq("status", params.get("status")!)
  return query
}
export function beforeLead(query: any, cursor: string | null) {
  if (!cursor) return query
  const [time, id] = cursor.split("~")
  if (
    !time ||
    time.length > 40 ||
    !/^[\dT:+.Z-]+$/.test(time) ||
    !Number.isFinite(Date.parse(time)) ||
    !UUID.test(id || "")
  )
    throw new Error("The lead cursor is not valid.")
  return query.or(
    `submitted_at.lt.${time},and(submitted_at.eq.${time},id.lt.${id})`,
  )
}
