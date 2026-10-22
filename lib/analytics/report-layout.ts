import "server-only"

/**
 * ===========================================================================
 *  THE REPORTS A SELLER ADDED TO ANALYTICS, KEPT WITH THE SELLER
 * ===========================================================================
 * analytics_report_layouts (supabase/sql/run-now part 254): one row per
 * creator, `reports` the ids in the seller's order (lib/analytics/sections
 * REPORT_IDS). Server only: the table is closed to every client role, and
 * only the signed in seller's own row is ever read or written, found from
 * their session (app/app/analytics/page.tsx, app/api/analytics/layout).
 *
 * Until part 254 has run the table is not there: a read answers null (the
 * page then uses the browser's copy) and a write says so, never an error
 * page.
 */
import type { createAdminClient } from "@/lib/supabase/admin"
import { normalizeReports, type ReportId } from "./sections"

type Admin = ReturnType<typeof createAdminClient>

export const LAYOUT_TABLE = "analytics_report_layouts"

/** A table or column the database does not have yet. */
export function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || /does not exist|could not find the table|schema cache/i.test(error.message ?? "")
}

/** The seller's saved reports, by their user id: null when nothing was ever saved, or the table is not there yet. */
export async function readReportLayout(admin: Admin, userId: string): Promise<ReportId[] | null> {
  try {
    const { data, error } = await admin.from(LAYOUT_TABLE).select("reports, creators!inner(user_id)").eq("creators.user_id", userId).maybeSingle()
    if (error || !data) return null
    return normalizeReports((data as { reports?: unknown }).reports)
  } catch {
    return null
  }
}

export type LayoutWrite = { ok: true; reports: ReportId[] } | { ok: false; reason: "not_ready" | "error" }

/** The seller's reports, saved in their order. Anything not a known report is dropped. */
export async function writeReportLayout(admin: Admin, creatorId: string, raw: unknown): Promise<LayoutWrite> {
  const reports = normalizeReports(raw)
  const { error } = await admin.from(LAYOUT_TABLE).upsert({ creator_id: creatorId, reports, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (!error) return { ok: true, reports }
  return { ok: false, reason: missingTable(error) ? "not_ready" : "error" }
}
