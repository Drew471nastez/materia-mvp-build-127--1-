import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
/* Wave 8: part 406 (a second business's tagged address keyed as shown in Contacts) is an ordinary part, batched after the 378 it replaces a function of. */
const p406 = catalog.find(row => row.file === "406_creator_people_alias_merge.sql")
assert(p406 && !p406.manual, "part 406 is in the catalog as an ordinary part")
const p378 = catalog.find(row => row.file === "378_creator_contacts.sql")!
const pair = sqlBatch(catalog, [p406!.id, p378.id])
assert(pair.indexOf(p378.sql) < pair.indexOf(p406!.sql), "378 runs before the 406 that replaces its creator_people")
const route = readFileSync("app/api/admin/sql-updates/route.ts", "utf8")
assert(route.indexOf("await requireAdmin()") < route.indexOf("new URL(request.url)"))
assert(!route.includes("export async function POST"), "no generic SQL execution endpoint")
assert(route.includes("no-store, private"))
assert(readFileSync("app/(storelib)/admin/sql-updates/page.tsx", "utf8").includes("await isAdminAuthenticated()"))
const scratch = mkdtempSync(join(tmpdir(), "storelib-sql-build-gate-"))
try {
  writeFileSync(join(scratch, "git"), '#!/bin/sh\ncase "$1" in\ncat-file) exit 0 ;;\ndiff) printf "%s\\n" "$STORELIB_TEST_CHANGED" ;;\n*) exit 1 ;;\nesac\n', { mode: 0o700 })
  const buildGate = (files: string) => spawnSync("bash", ["scripts/vercel/ignore-build.sh"], {
    env: { ...process.env, PATH: `${scratch}:${process.env.PATH}`, STORELIB_TEST_CHANGED: files, VERCEL_GIT_PREVIOUS_SHA: "before", VERCEL_GIT_COMMIT_SHA: "after" },
    encoding: "utf8",
  })
  assert.equal(buildGate("supabase/sql/run-now/233_physical_carrier_prefs.sql").status, 1, "canonical SQL alone must deploy the current catalog")
  assert.equal(buildGate("docs/example.md\nsupabase/sql/run-now/01_schema.sql").status, 1, "other skipped changes cannot hide a catalog change")
  assert.equal(buildGate("supabase/migrations/historical.sql\ndocs/example.md").status, 0, "historical copies still do not require a deployment")
  assert.equal(buildGate("app/(storelib)/admin/sql-updates/page.tsx").status, 1, "runtime changes still deploy")
} finally { rmSync(scratch, { recursive: true, force: true }) }
console.log(`SQL updates: status, tracking, ordering, export safety, auth, and ${catalog.length} exact source hashes passed`)
