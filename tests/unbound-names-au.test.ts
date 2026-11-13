/** Round AU: names used but never defined fail the suite (scripts/check-unbound-names.mjs). */
import { readFileSync } from "node:fs"
import { unboundNames, UNBOUND_CODES } from "../scripts/check-unbound-names.mjs"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

console.log("\nA name used but never defined fails the suite")
const log = [
  "lib/github-sync/own-install.ts(12,21): error TS2304: Cannot find name 'routeUser'.",
  "components/store-builder/sections-sidebar.tsx(1409,16): error TS2552: Cannot find name 'FooterSettingsForm'. Did you mean 'AboutSettingsForm'?",
  "lib/x.ts(1,20): error TS2307: Cannot find module '@/lib/gone' or its corresponding type declarations.",
  "components/app/a.tsx(9,15): error TS2322: Type 'string' is not assignable to type 'number'.",
  "components/app/b.tsx(3,1): error TS2305: Module '\"@/lib/types\"' has no exported member 'Course'.",
].join("\n")
const found: { file: string; line: number; code: string }[] = unboundNames(log)
check("a missing name, a misspelt name and a missing module are found", found.map((f) => f.code).join(",") === "TS2304,TS2552,TS2307")
check("with the file and line", found[0].file === "lib/github-sync/own-install.ts" && found[0].line === 12)
check("other type errors are left to the type check", !found.some((f) => f.code === "TS2322" || f.code === "TS2305"))
check("the codes it fails on", ["TS2304", "TS2552", "TS2307"].every((c) => (UNBOUND_CODES as string[]).includes(c)))
const runner = read("scripts/run-push-tests.mjs")
check("the suite runs it before any test", runner.indexOf("scripts/check-unbound-names.mjs") > 0 && runner.indexOf("scripts/check-unbound-names.mjs") < runner.indexOf("const SUITES = ["))

console.log("\nThe two crashes it found")
const own = read("lib/github-sync/own-install.ts")
check("ownInstall imports routeUser and createClient", /import \{ routeUser \} from "@\/lib\/auth\/route-user"/.test(own) && /import \{ createClient \} from "@\/lib\/supabase\/server"/.test(own))
const sidebar = read("components/store-builder/sections-sidebar.tsx")
check("choosing Footer on the sections page no longer names a form that does not exist", !/FooterSettingsForm/.test(sidebar.replace(/\/\*[\s\S]*?\*\//g, "")) && /The footer has no settings yet\./.test(sidebar))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
