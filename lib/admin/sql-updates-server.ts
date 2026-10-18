import "server-only"
import { createHash } from "node:crypto"
import catalog from "./sql-catalog.generated.json"
import { createAdminClient } from "@/lib/supabase/admin"
import { sqlStatus, type AppliedSql, type SqlUpdatesReport } from "./sql-updates"

export { catalog }
export const revision = createHash("sha256").update(catalog.map(row => `${row.id}:${row.file}:${row.sha256}:${row.manual}`).join("\n")).digest("hex")

export async function readSqlUpdates(): Promise<SqlUpdatesReport> {
  let rows: AppliedSql[] | null = null
  try {
    const db = createAdminClient()
    const collected: AppliedSql[] = []
    for (let offset = 0; ; offset += 500) {
      const result = await db.from("storelib_applied_parts").select("part,file,sha256,applied_at").order("part").range(offset, offset + 499).abortSignal(AbortSignal.timeout(10000))
      if (result.error) throw new Error("SQL history unavailable")
      collected.push(...result.data)
      if (result.data.length < 500) break
    }
    rows = collected
  } catch { /* Missing history or unavailable database is unknown, never an empty success. */ }
  return { checkedAt: new Date().toISOString(), revision, ledgerReady: rows !== null, updates: sqlStatus(catalog, rows) }
}
