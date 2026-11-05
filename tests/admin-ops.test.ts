/** The admin console's Operations view: real checks per module, alerts from them, read again every 30 seconds. */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const ops = read("lib/admin/views/ops.ts")
check("the database is timed, not assumed", /const dbProbe = await r\.count\("ops: database"/.test(ops) && /Answered in \$\{dbMs\}ms/.test(ops))
check("payments ask Stripe and count failed webhooks", /buildPaymentsHealth\(r\.db\)/.test(ops) && /failedWebhookProcessing/.test(ops))
check("scheduled jobs from the work they leave", /cronChecks\(r\)/.test(ops))
check("errors from error_events in the last day", /"error_events"/.test(ops))
check("physical commerce: the switch, the job queue, integrations in error", /isPhysicalCommerceEnabled\(\)/.test(ops) && /"commerce_jobs"/.test(ops) && /"commerce_integrations", \(q\) => q\.eq\("status", "error"\)/.test(ops))
check("a check that cannot run says unknown, never ok", (ops.match(/state: "unknown"/g) ?? []).length >= 3)
check("alerts are the modules not fine, worst first", /severity: "critical"/.test(ops) && /severity: "warning"/.test(ops))
const route = read("app/api/admin/platform/[section]/route.ts")
check("behind the admin cookie, as every console view", /"ops",\s*"live",/.test(route) && /case "ops":/.test(route) && /isAdminAuthenticated/.test(route))
check("in the console's navigation", /\{ id: "ops", label: "Operations" \}/.test(read("app/(storelib)/admin/_console/shell.tsx")))
check("read again every 30 seconds while visible", /route\.view === "ops" \? 30_000 : 60_000/.test(read("app/(storelib)/admin/_console/console.tsx")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
