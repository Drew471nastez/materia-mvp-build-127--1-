export type SqlUpdate = {
  id: string; file: string; sha256: string; updatedAt: string | null; manual: boolean
  state: "applied" | "unrecorded" | "changed" | "unknown" | "manual"
  appliedAt: string | null
}
export type SqlUpdatesReport = { checkedAt: string; revision: string; ledgerReady: boolean; updates: SqlUpdate[] }
export type SqlSource = Pick<SqlUpdate, "id" | "file" | "sha256" | "updatedAt" | "manual"> & { sql: string }
export type AppliedSql = { part: string; file: string; sha256: string; applied_at: string }

export function sqlStatus(source: SqlSource[], rows: AppliedSql[] | null): SqlUpdate[] {
  const ledger = new Map(rows?.map(row => [row.part, row]))
  return source.map(({ sql: _sql, ...item }) => {
    const row = ledger.get(item.id)
    return { ...item, state: item.manual ? "manual" : rows === null ? "unknown" : !row ? "unrecorded" : row.sha256 === item.sha256 && row.file === item.file ? "applied" : "changed", appliedAt: row?.applied_at ?? null }
  })
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`
const executionRecord = (item: SqlSource) => `INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES (${literal(item.id)}, ${literal(item.file)}, ${literal(item.sha256)}) ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;`

/** No ledger row is written unless every statement in the exported transaction succeeds. */
export function sqlBatch(source: SqlSource[], ids: string[]): string {
  const wanted = new Set(ids)
  const selected = source.filter(item => wanted.has(item.id))
  if (!selected.length || selected.length !== wanted.size) throw new Error("Select known SQL files.")
  if (selected.some(item => item.manual)) {
    if (selected.length !== 1) throw new Error("Copy owner-only, diagnostic, or manual SQL separately.")
    return selected[0].sql
  }
  const bootstrap = source.find(item => item.id === "67")
  if (!bootstrap) throw new Error("SQL tracking bootstrap is missing.")
  return [
    "-- Storelib SQL updates. Review before running in the Supabase SQL editor.",
    "-- Unrecorded does not prove never run. Review dependencies and changed SQL first.",
    "BEGIN;", "SET LOCAL statement_timeout = '120s';", "SET LOCAL lock_timeout = '5s';",
    "SELECT pg_advisory_xact_lock(1937006962, 67);",
    bootstrap.sql,
    executionRecord(bootstrap),
    ...selected.flatMap(item => [
      `-- ${item.file} | SHA-256 ${item.sha256}`,
      item.sql,
      executionRecord(item),
    ]),
    "COMMIT;", "",
  ].join("\n")
}
