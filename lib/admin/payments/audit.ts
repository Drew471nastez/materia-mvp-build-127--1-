import "server-only"

import { loggable } from "@/lib/admin/plain-reason"

type Db = { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> } }

export async function recordPaymentsAdminAudit(
  db: Db,
  entry: { action: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null },
): Promise<boolean> {
  try {
    const { error } = await db.from("admin_payments_audit_log").insert({
      action: entry.action,
      actor: "admin session",
      before_state: entry.before ?? null,
      after_state: entry.after ?? null,
    })
    if (error) {
      console.error(`[admin payments] audit failed: ${loggable(error)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[admin payments] audit failed: ${loggable(e)}`)
    return false
  }
}
