/**
 * /admin/ai-runs: lib/admin/ai-runs.ts turns the Storelib AI's run log into
 * what the owner reads. Driven with rows shaped as storelib_ai_runs holds them.
 *
 * Run with:  npm run test:push
 */
import { checkKey, summariseRuns, type AiRunRow } from "@/lib/admin/ai-runs"
import { readFileSync } from "node:fs"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
let id = 0
const row = (p: Partial<AiRunRow>): AiRunRow => ({
  id: ++id, created_at: "2026-10-08T10:00:00Z", install_id: "i", creator_id: "c", page_key: "home", status: "succeeded",
  intent_kind: "LOCAL_EDIT", intent_flags: {}, ops_count: 3, wrote_code: false, pages_built: [], unresolved: [],
  duration_ms: 10_000, model: "gpt-5.6-luna", provider: "openai", input_tokens: 1000, output_tokens: 200, ...p,
})

console.log("\nThe run log, summed up")
const rows = [
  row({ intent_kind: "NEW_SITE_GENERATION", pages_built: ["products", "product", "about", "faq", "contact"], duration_ms: 240_000, model: "gpt-5.6-terra" }),
  row({ intent_kind: "NEW_SITE_GENERATION", pages_built: ["about"], duration_ms: 180_000, unresolved: ["Pricing [pricing-1] has text at 3.1:1 against its background"], model: "gpt-5.6-terra" }),
  row({ intent_kind: "SECTION_REDESIGN", duration_ms: 60_000 }),
  row({ status: "failed", duration_ms: 5_000, unresolved: ["Hero [hero-9] has text at 2.4:1 against its background"] }),
  row({ duration_ms: 8_000 }),
]
const s = summariseRuns(rows)
check("runs, finished and failed are counted", s.runs === 5 && s.succeeded === 4 && s.failed === 1 && s.successRate === 80)
check("the median and the slowest tenth are in seconds", s.medianSeconds === 60 && s.p90Seconds === 240, `${s.medianSeconds} ${s.p90Seconds}`)
check("whole site builds and the pages each made", s.sitesBuilt === 2 && s.pagesPerSiteBuild === 3)
check("runs that ended with a check failing", s.withOpenChecks === 2)
check("the same failure on two sections is one line, counted twice", s.openChecks.length === 1 && s.openChecks[0].count === 2, JSON.stringify(s.openChecks))
check("by kind, busiest first", s.byKind[0].runs === 2 && s.byKind[s.byKind.length - 1].runs === 1 && s.byKind.find((k) => k.kind === "LOCAL_EDIT")?.successRate === 50)
check("tokens add up", s.tokens.input === 5000 && s.tokens.output === 1000)
check("models are counted", s.models.find((m) => m.model === "gpt-5.6-terra")?.runs === 2)
check("an empty window says none, not zero percent", summariseRuns([]).successRate === null && summariseRuns([]).medianSeconds === null)
check("a check's key drops what changes run to run", checkKey('Hero [hero-9] has "Big" at 2.4:1') === 'A section has "…" at n.n:n', checkKey('Hero [hero-9] has "Big" at 2.4:1'))
check("the page is behind the admin cookie and reads with the service role on the server", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>/.test(readFileSync("app/admin/ai-runs/page.tsx", "utf8")) && /createAdminClient\(\)/.test(readFileSync("app/admin/ai-runs/page.tsx", "utf8")))
check("and is in the admin menu", /href: "\/admin\/ai-runs", label: "Storelib AI runs"/.test(readFileSync("app/admin/_console/shell.tsx", "utf8")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
