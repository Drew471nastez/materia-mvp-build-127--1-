/** Round AY (OnePage drafts): a signed in stranger cannot read another account's unpublished OnePage blocks. */
import { existsSync, readFileSync } from "node:fs"
import { readCode } from "./_source"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "")

console.log("\nThe onboarding name check asks the server, never other people's pages with the browser key")
const modal = readCode("components/onepage/onboarding-modal.tsx")
const check715 = modal.slice(modal.indexOf("const checkAvailability"), modal.indexOf("const timer = setTimeout(checkAvailability"))
check("the check calls /api/onepage/address", /fetch\(`\/api\/onepage\/address\?name=\$\{encodeURIComponent\(slug\)\}`/.test(check715))
check("the check no longer reads onepages by slug with the browser client", !/from\("onepages"\)/.test(check715) && !/\.eq\("slug"/.test(modal))
check("only a name another page or person holds says taken (a refused name or a failed check leaves the step open, as before)", /setUsernameAvailable\(!\(res\.ok && answer\?\.taken === true\)\)/.test(check715))
const route = readCode("app/api/onepage/address/route.ts")
check("the address route says taken: true only when the name is taken", /taken === "taken" \? \{ name: verdict\.value, available: false, taken: true,/.test(route) && (route.match(/taken: true/g) ?? []).length === 1)

console.log("\nNo browser code reads another account's OnePage")
for (const f of ["components/onepage/onboarding-modal.tsx", "components/onepage/onepage-editor.tsx", "components/app/creator-onboarding-modal.tsx"]) {
  const src = readCode(f)
  const reads = [...src.matchAll(/\.from\("onepages"\)\s*\.select\([^)]*\)\s*\.(eq|neq|ilike|in)\("([a-z_]+)"/g)].map((m) => m[2])
  check(`${f}: every select on onepages is by the owner's own id, page id or store (${reads.join(", ") || "none"})`, reads.every((c) => c === "owner_id" || c === "id" || c === "creator_id"))
}

console.log("\nPart 465: the owner reads their own row, the public read policy answers anon only")
const sql = read("supabase/sql/run-now/465_onepage_drafts_owner_only.sql")
const mig = read("supabase/migrations/20271465_onepage_drafts_owner_only.sql")
check("the run-now file and the migration are the same text", sql.length > 0 && sql === mig)
const lines = sql.trim().split("\n")
check("first line is a /* comment */ and the file ends with the schema reload", /^\/\*.*\*\/$/.test(lines[0]) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
check("an owner read policy is created only when none reads auth.uid()", /IF EXISTS \(SELECT 1 FROM pg_policies[^;]*auth\\\.uid\\\(\\\)'\) THEN RETURN; END IF;/.test(sql) && /CREATE POLICY onepages_owner_select ON public\.onepages FOR SELECT TO authenticated USING \(owner_id = \(SELECT auth\.uid\(\)\)\)/.test(sql))
check("public published reads are narrowed to anon, never dropped", /ALTER POLICY %I ON public\.onepages TO anon/.test(sql) && !/DROP POLICY|DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE public\./i.test(sql))
check("nothing is narrowed while no owner read policy exists", /no owner read policy on public\.onepages, public read policies left as they are/.test(sql))
check("a missing table is skipped with a notice", /to_regclass\('public\.onepages'\) IS NULL THEN RAISE NOTICE/.test(sql))
check("no grant changes (part 464 keeps the anon column grants)", !/\bGRANT\b|\bREVOKE\b/.test(sql.split("\n").slice(1).join("\n")))
check("README row and check-after column are there", /465_onepage_drafts_owner_only\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p465_onepage_drafts_owner_only;\s*$/.test(read("supabase/sql/run-now/99_check_after.sql")))
check("the copy has no em dash or banned words", !/—|unlock|elevate|seamless|powerful|effortlessly|supercharge|transform/i.test(sql + check715))

console.log("\nThe readers that still need other people's pages use the server")
check("the name check reads with the service role", /createAdminClient\(\)/.test(readCode("lib/onepage/name-availability.ts")))
check("a team member's OnePage is read with the server's client", /teamStampDb\(admin, userId\)/.test(readCode("lib/team/areas.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
