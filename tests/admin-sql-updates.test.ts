import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { sqlBatch, sqlStatus, type SqlSource } from "../lib/admin/sql-updates"

const catalog: SqlSource[] = JSON.parse(readFileSync("lib/admin/sql-catalog.generated.json", "utf8"))

assert.equal(new Set(catalog.map(row => row.id)).size, catalog.length, "ledger keys cannot collide")
assert.deepEqual(catalog.map(row => row.file).sort(), readdirSync("supabase/sql/run-now").filter(file => file.endsWith(".sql")).sort(), "every canonical SQL file is listed")
for (const row of catalog) {
  const bytes = readFileSync(`supabase/sql/run-now/${row.file}`)
  assert.equal(row.sql, bytes.toString("utf8"), row.file)
  assert.equal(row.sha256, createHash("sha256").update(bytes).digest("hex"), row.file)
}
const ordinary = catalog.filter(row => !row.manual)
assert(ordinary.some(row => row.id === "92"))
assert(catalog.some(row => row.id === "91_platform_settings" && !row.manual))
assert(catalog.some(row => row.id === "91_storage_policies_to_remove" && row.manual))
assert(catalog.some(row => row.id === "61" && row.manual), "slow analytics maintenance cannot share checkout locks with a batch")
assert(sqlStatus(ordinary, null).every(row => row.state === "unknown"))
assert(sqlStatus(ordinary, []).every(row => row.state === "unrecorded"))
const first = ordinary[0]
const applied = { part: first.id, file: first.file, sha256: first.sha256, applied_at: "2026-01-01T00:00:00Z" }
assert.equal(sqlStatus([first], [applied])[0].state, "applied")
assert.equal(sqlStatus([first], [{ ...applied, sha256: "old" }])[0].state, "changed")
assert.equal(sqlStatus([first], [{ ...applied, file: "other.sql" }])[0].state, "changed")
const batch = sqlBatch(catalog, [ordinary[1].id, first.id])
assert(batch.indexOf(first.sql) < batch.indexOf(ordinary[1].sql), "source ordering, not request ordering")
assert(batch.startsWith("-- Storelib"))
assert(batch.includes("BEGIN;"))
assert(batch.endsWith("COMMIT;\n"))
assert(batch.includes("pg_advisory_xact_lock"))
assert(batch.includes("VALUES ('67', '67_applied_parts.sql'"), "the bootstrap's own execution is recorded too")
assert(batch.indexOf("CREATE TABLE IF NOT EXISTS public.storelib_applied_parts") < batch.indexOf(`-- ${first.file}`))
assert(batch.indexOf(first.sql) < batch.indexOf(`VALUES ('${first.id}', '${first.file}'`), "record follows source execution")
assert.throws(() => sqlBatch(catalog, []))
assert.throws(() => sqlBatch(catalog, ["../../secrets"]))
const manual = catalog.find(row => row.manual)!
assert.throws(() => sqlBatch(catalog, [manual.id, first.id]))
assert.equal(sqlBatch(catalog, [manual.id]), manual.sql, "manual files are copied unchanged, with no automatic tracking")
const route = readFileSync("app/api/admin/sql-updates/route.ts", "utf8")
assert(route.indexOf("await requireAdmin()") < route.indexOf("new URL(request.url)"))
assert(!route.includes("export async function POST"), "no generic SQL execution endpoint")
assert(route.includes("no-store, private"))
assert(readFileSync("app/admin/sql-updates/page.tsx", "utf8").includes("await isAdminAuthenticated()"))
console.log(`SQL updates: status, tracking, ordering, export safety, auth, and ${catalog.length} exact source hashes passed`)
