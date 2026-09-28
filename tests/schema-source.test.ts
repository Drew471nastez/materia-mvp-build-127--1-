/**
 * ===========================================================================
 *  ONE PLACE A DATABASE CHANGE IS WRITTEN, AND A RECORD OF WHAT RAN
 * ===========================================================================
 * supabase/README.md is the rule book. This holds it:
 *
 *   Every run-now part from 62 on has a byte for byte copy in migrations,
 *   a README row and a column in the check after.
 *   Every part in the built files records itself in storelib_applied_parts
 *   (part 67), with the SHA-256 of its text, and the admin compares that
 *   with lib/admin/sql-parts.generated.ts, which must be current.
 *   A part that adds a column to creators or profiles shares it with the
 *   public key or lists it private (lib/security/public-columns).
 *   The nightly job writes production's structure into supabase/schema/.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { SQL_PARTS } from "../lib/admin/sql-parts.generated"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const RN = "supabase/sql/run-now"
const parts = readdirSync(RN).filter((f) => /^\d\d_.*\.sql$/.test(f)).sort()
const numbered = parts.filter((f) => f.slice(0, 2) >= "01" && f.slice(0, 2) <= "90")

console.log("\nEvery part, from 62 on, the same everywhere")
{
  const migrations = readdirSync("supabase/migrations").map((f) => read(`supabase/migrations/${f}`))
  const readme = read(`${RN}/README.md`)
  const after = read(`${RN}/99_check_after.sql`)
  for (const f of numbered.filter((f) => f.slice(0, 2) >= "62" && f.slice(0, 2) < "90")) {
    const text = read(`${RN}/${f}`)
    check(`${f}: a byte for byte copy in migrations`, migrations.includes(text))
    check(`${f}: its README row`, readme.includes(`| \`${f}\` |`))
    check(`${f}: its column in the check after`, new RegExp(`as p${f.slice(0, 2)}_\\w+[,;]`).test(after))
    const lines = text.split("\n")
    check(`${f}: opens with a closed summary and ends by reloading the API`, lines[0].startsWith("/* ") && lines[0].endsWith("*/") && text.trimEnd().endsWith("notify pgrst, 'reload schema';"))
    check(`${f}: no -- comment inside`, !lines.slice(1).some((l) => l.trimStart().startsWith("--")))
  }
}

console.log("\nThe database's own record of what ran")
{
  const gen = new Map(SQL_PARTS.map((p) => [p.part, p]))
  for (const f of numbered) {
    const want = createHash("sha256").update(readFileSync(`${RN}/${f}`)).digest("hex")
    const have = gen.get(f.slice(0, 2))
    check(`${f}: listed with the SHA-256 of its text`, !!have && have.file === f && have.sha256 === want, have ? `${have.sha256.slice(0, 12)} vs ${want.slice(0, 12)}: run python3 scripts/build-run-four.py` : "missing")
  }
  const built = ["run-four/1_of_4_core.sql", "run-four/2_of_4_library_checkout_uploads.sql", "run-four/3_of_4_latest.sql", "run-four/4_of_4_storage_policies_and_check.sql"].map((f) => read(`supabase/sql/${f}`)).join("\n")
  for (const p of SQL_PARTS) {
    check(`part ${p.part} records itself in the built files`, built.includes(`VALUES ('${p.part}', '${p.file}', '${p.sha256}') ON CONFLICT (part) DO UPDATE`))
  }
  const four = ["1_of_4_core.sql", "2_of_4_library_checkout_uploads.sql", "3_of_4_latest.sql", "4_of_4_storage_policies_and_check.sql"].map((f) => read(`supabase/sql/run-four/${f}`))
  check("every built file makes the record table before its first part", four.every((f) => f.indexOf("CREATE TABLE IF NOT EXISTS public.storelib_applied_parts") > -1 && f.indexOf("CREATE TABLE IF NOT EXISTS public.storelib_applied_parts") < (f.indexOf("-- part ") === -1 ? Infinity : f.indexOf("-- part "))))
  check("the record is the server's and the editor's only", read(`${RN}/67_applied_parts.sql`).includes("REVOKE ALL ON public.storelib_applied_parts FROM anon, authenticated;"))
  const system = read("lib/admin/views/system.ts")
  check("the admin compares the record with the parts", system.includes('"storelib_applied_parts"') && system.includes("row.sha256 === p.sha256 ? \"applied\" : \"changed\""))
  check("  and says so on the Health view", read("app/admin/_console/view-platform.tsx").includes("<SqlPartsPanel parts={data.sqlParts} />"))
}

console.log("\nA new column on creators or profiles is decided, not left open")
{
  for (const f of numbered.filter((f) => f.slice(0, 2) >= "64" && f.slice(0, 2) < "90")) {
    const text = read(`${RN}/${f}`)
    const adds = /ALTER TABLE (IF EXISTS )?public\.(creators|profiles) ADD COLUMN/i.test(text)
    check(`${f}: ${adds ? "shares its new column or lists it private" : "adds no column to creators or profiles"}`, !adds || /storelib_share_public_columns\(\)/.test(text))
  }
}

console.log("\nProduction, written into the repository")
{
  const script = "scripts/db/snapshot-schema.sh"
  check("the snapshot script is there and executable", existsSync(script) && (statSync(script).mode & 0o111) !== 0)
  check("  structure only, never rows", read(script).includes("--schema-only"))
  check("  the storage rules too", read(script).includes("where schemaname = 'storage' and tablename = 'objects'"))
  check("  without dump timestamps, so it changes only when the database does", read(script).includes("Dumped (from|by)|Started on|Completed on"))
  const wf = read(".github/workflows/schema-drift.yml")
  check("it runs every night", /cron: "7 3 \* \* \*"/.test(wf))
  check("  and a difference becomes one pull request", wf.includes("peter-evans/create-pull-request") && wf.includes("branch: schema/live-snapshot") && wf.includes("add-paths: supabase/schema/**"))
  check("the rule book is there", ["## The short answer", "## Adding a change", "storelib_applied_parts", "supabase/schema/"].every((s) => read("supabase/README.md").includes(s)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
