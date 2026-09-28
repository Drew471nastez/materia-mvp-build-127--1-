/**
 * ===========================================================================
 *  MONEY ROWS ARE WRITTEN BY THE SERVER, AND ONLY THE SERVER
 * ===========================================================================
 * Old database rules let anybody with the public key write their own order
 * ("Anyone can create orders", anon included) or their own library row
 * ("System can insert entitlements"), and the download check trusts both: a
 * completed order or a library row for a product is what opens its files. So
 * a signed in stranger could own any paid product without paying.
 *
 * Run-now part 62 takes INSERT, UPDATE and DELETE on every money table away
 * from signed in users and visitors, and drops every write rule on them. That
 * holds only while the app itself never writes those tables through a
 * visitor's session: a route that did would stop working the day part 62
 * runs. This suite checks both halves.
 *
 * It is a static check. It reads which client each write goes through by the
 * name in front of `.from(...)`, the way this codebase names them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

const MONEY = ["orders", "entitlements", "refunds", "seller_ledger", "ledger_events", "payouts", "subscriptions", "invoices"]
/* The names this codebase gives a client holding the service role. `supabase` is never one of them. */
const SERVER_CLIENTS = new Set(["admin", "adminSupabase", "supabaseAdmin", "adminClient", "db", "ctx.admin", "createAdminClient()", "dbClient", "svc", "service"])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const files = ["app", "lib", "components", "hooks"].flatMap((d) => walk(d))
const write = new RegExp(`([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)?(?:\\(\\))?)\\s*\\.from\\(\\s*"(${MONEY.join("|")})"\\s*\\)\\s*\\.(insert|upsert|update|delete)\\(`, "g")
const offenders: string[] = []
let writes = 0
for (const f of files) {
  const src = readFileSync(f, "utf8")
  for (const m of src.matchAll(write)) {
    writes++
    const receiver = m[1]
    if (!SERVER_CLIENTS.has(receiver)) offenders.push(`${f}: ${receiver}.from("${m[2]}").${m[3]}`)
  }
}
check(`the app writes money tables (${writes} writes found)`, writes > 30, "the scan found almost nothing, so the pattern is broken")
check("every write to a money table goes through the service role", offenders.length === 0, offenders.join("; "))

/* A browser bundle never writes them at all. */
const browserWrites = files
  .filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8").slice(0, 200)))
  .filter((f) => new RegExp(`\\.from\\(\\s*"(${MONEY.join("|")})"\\s*\\)\\s*\\.(insert|upsert|update|delete)\\(`).test(readFileSync(f, "utf8")))
check("no client component writes a money table", browserWrites.length === 0, browserWrites.join(", "))

const part = readFileSync("supabase/sql/run-now/62_money_rows_server_only.sql", "utf8")
const mirror = readFileSync("supabase/migrations/20261012_money_rows_server_only.sql", "utf8")
check("part 62 and its migration are the same text", part === mirror)
for (const t of MONEY) check(`part 62 covers ${t}`, part.includes(`'${t}'`))
check("part 62 takes writes away from visitors and signed in users", part.includes("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated"))
check("part 62 drops every write rule that is not the service role's", part.includes("cmd <> 'SELECT' AND NOT (roles <@ ARRAY['service_role']::name[])"))
check("a rule that allowed everything keeps its read first", part.includes("FOR SELECT TO %s USING (%s)") && part.indexOf("FOR SELECT TO %s USING (%s)") < part.indexOf("DROP POLICY %I ON public.%I"))
check("buyers still read their own orders and library", part.includes('"storelib buyer reads own orders"') && part.includes('"storelib buyer reads own library"'))
check("creators still read the orders of their products", part.includes('"storelib creator reads product orders"'))
check("part 62 opens with its summary and ends by reloading the API schema", part.startsWith("/* ") && part.split("\n")[0].endsWith("*/") && part.trimEnd().endsWith("notify pgrst, 'reload schema';"))
const after = readFileSync("supabase/sql/run-now/99_check_after.sql", "utf8")
check("the check after run says whether part 62 holds", after.includes("as p62_money_rows_server_only"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
