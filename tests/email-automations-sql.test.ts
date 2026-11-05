/**
 * The one part that holds everything the Emails page, the composer, the
 * automation builder and the engine need from the database
 * (supabase/sql/run-now/46_email_automations_complete.sql), held against the
 * code: every email table the code reads or writes is created there, every
 * function it calls is made there with its grants, every column the flow
 * and campaign code selects exists in it, and it keeps the part format (one
 * whole statement per line, safe to run twice). It was also run twice on a
 * fresh Postgres 16 and on two older shapes of the schema; see the commit.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const root = process.cwd()
const sql = readFileSync(join(root, "supabase/sql/run-now/46_email_automations_complete.sql"), "utf8")
const lines = sql.split("\n").filter((l) => l.trim())

const TABLES = [
  "subscribers",
  "email_segments",
  "email_campaigns",
  "campaign_recipients",
  "email_events",
  "email_usage",
  "email_flows",
  "scheduled_flow_emails",
  "email_flow_runs",
  "email_flow_jobs",
  "email_flow_sends",
  "checkout_starts",
  "site_contact_messages",
]
const FUNCTIONS = ["enroll_email_flow", "claim_email_flow_jobs", "email_flow_health", "email_flow_step_stats", "email_flow_totals", "increment_email_usage"]

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}
const code = ["lib/automations", "lib/email-campaigns", "lib/contacts", "app/api/automations", "app/api/email", "app/(storelib)/app/emails", "components/email", "app/api/cron/process-scheduled-emails"]
  .flatMap((d) => walk(join(root, d)))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n")

/* A later part may add a column to one of these tables (part 129 gives checkout_starts its return_path): those count too, from the parts themselves. */
const laterParts = readdirSync(join(root, "supabase/sql/run-now"))
  .filter((f) => /^\d+_.*\.sql$/.test(f) && Number.parseInt(f, 10) > 46)
  .map((f) => readFileSync(join(root, "supabase/sql/run-now", f), "utf8"))
  .join("\n")

/** The columns of a table as the part creates it, plus every column it, or a later part, adds. */
function columnsOf(table: string): Set<string> {
  const out = new Set<string>()
  const create = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\((.*)\\);`).exec(sql)
  if (create) {
    let depth = 0
    let cur = ""
    const parts: string[] = []
    for (const ch of create[1]) {
      if (ch === "(") depth++
      if (ch === ")") depth--
      if (ch === "," && depth === 0) {
        parts.push(cur)
        cur = ""
      } else cur += ch
    }
    parts.push(cur)
    for (const p of parts) out.add(p.trim().split(/\s+/)[0])
  }
  for (const m of sql.matchAll(new RegExp(`ALTER TABLE public\\.${table} ADD COLUMN IF NOT EXISTS ([a-z_]+)`, "g"))) out.add(m[1])
  for (const m of laterParts.matchAll(new RegExp(`ALTER TABLE public\\.${table} ADD COLUMN IF NOT EXISTS ([a-z_]+)`, "g"))) out.add(m[1])
  return out
}

console.log("\nThe part's format")
check("every statement on one line: each line is a whole statement or a comment", lines.every((l) => /^\/\*.*\*\/$/.test(l) || /;\s*$/.test(l)), lines.find((l) => !(/^\/\*.*\*\/$/.test(l) || /;\s*$/.test(l)))?.slice(0, 80))
check("tables made only when missing", !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql))
check("columns added only when missing", !/ADD COLUMN (?!IF NOT EXISTS)/.test(sql))
check("indexes made only when missing", !/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql))
check("every policy dropped before it is made", [...sql.matchAll(/CREATE POLICY "([^"]+)" ON (public\.[a-z_]+)/g)].every((m) => sql.includes(`DROP POLICY IF EXISTS "${m[1]}" ON ${m[2]};`)))
check("every trigger dropped before it is made", [...sql.matchAll(/CREATE TRIGGER ([a-z_]+) [A-Z ]+ ON (public\.[a-z_]+)/g)].every((m) => sql.includes(`DROP TRIGGER IF EXISTS ${m[1]} ON ${m[2]};`)))
check("every check dropped before it is added, and added NOT VALID", [...sql.matchAll(/ADD CONSTRAINT ([a-z_]+) CHECK[^;]*;/g)].every((m) => sql.includes(`DROP CONSTRAINT IF EXISTS ${m[1]};`) && /NOT VALID;$/.test(m[0])))
check("functions replaced, never made bare", !/CREATE FUNCTION/.test(sql))
check("no DROP TABLE, no DELETE, no TRUNCATE", !/DROP TABLE|DELETE FROM|TRUNCATE/i.test(sql))
check("no em dash and none of the banned words", !/—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(sql))

console.log("\nWhat the code uses is all here")
const used = new Set([...code.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]))
/* email_usage is reached through increment_email_usage, below, not read by name. */
for (const t of TABLES) check(`${t}: the code uses it and the part creates it`, (used.has(t) || t === "email_usage") && sql.includes(`CREATE TABLE IF NOT EXISTS public.${t} (`))
for (const fn of FUNCTIONS) {
  check(`${fn}: called by the code, made here, with its grants`, code.includes(`rpc("${fn}"`) && sql.includes(`CREATE OR REPLACE FUNCTION public.${fn}(`) && new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(`).test(sql))
}
/* Every column the automation and campaign code selects by name. */
const selects: Array<[string, string]> = []
for (const m of code.matchAll(/\.from\("([a-z_]+)"\)\s*\.select\("([^"]+)"/g)) {
  if (!TABLES.includes(m[1])) continue
  for (const c of m[2].split(",")) {
    const col = c.trim()
    if (/^[a-z_]+$/.test(col)) selects.push([m[1], col])
  }
}
const missing = selects.filter(([t, c]) => !columnsOf(t).has(c))
check(`every column selected on these tables exists in the part (${selects.length} checked)`, selects.length > 40 && missing.length === 0, JSON.stringify(missing.slice(0, 10)))
check("the engine's run, job and send columns are all there", ["dedupe_key", "current_step_id", "exit_reason", "context", "source_detail"].every((c) => columnsOf("email_flow_runs").has(c)) && ["after_step_id", "claimed_by", "claimed_until", "max_attempts"].every((c) => columnsOf("email_flow_jobs").has(c)) && ["token", "provider_id", "opened_at", "clicked_at"].every((c) => columnsOf("email_flow_sends").has(c)))
check("an automated email's event can be written with no campaign", sql.includes("ALTER TABLE public.email_events ALTER COLUMN campaign_id DROP NOT NULL;"))

console.log("\nWho may do what")
check("sign-ups go through the server: the open insert policies are taken off", /DROP POLICY IF EXISTS "Anyone can subscribe via public forms" ON public\.subscribers;/.test(sql) && !/CREATE POLICY "Anyone/.test(sql))
check("campaigns are read and deleted from the browser, never written: the delete skips one being sent", /REVOKE INSERT, UPDATE ON public\.email_campaigns FROM authenticated;/.test(sql) && /FOR DELETE TO authenticated USING \(status NOT IN \('queued', 'sending'\)/.test(sql))
check("the builder saves flows with the creator's own session, so a creator manages their own", /CREATE POLICY "Users can manage their own flows" ON public\.email_flows FOR ALL TO authenticated USING \(creator_id IN/.test(sql) && /WITH CHECK \(creator_id IN/.test(sql))
check("nobody but the server adds to the older delayed email queue", /REVOKE INSERT, UPDATE, DELETE ON public\.scheduled_flow_emails FROM authenticated;/.test(sql))
check("the engine's tables are read only from the browser", ["email_flow_runs", "email_flow_jobs", "email_flow_sends"].every((t) => sql.includes(`REVOKE INSERT, UPDATE, DELETE ON public.${t} FROM authenticated;`)))
check("the engine's writing functions are server only", ["enroll_email_flow", "claim_email_flow_jobs", "increment_email_usage"].every((fn) => new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(sql)))

console.log("\nListed where the parts are listed")
const readme = readFileSync(join(root, "supabase/sql/run-now/README.md"), "utf8")
const after = readFileSync(join(root, "supabase/sql/run-now/99_check_after.sql"), "utf8")
const four = readFileSync(join(root, "supabase/sql/run-four/3_of_4_latest.sql"), "utf8")
check("in the README's table", readme.includes("`46_email_automations_complete.sql`"))
check("with its column in the check after", after.includes("as p46_email_automations_complete"))
check("and in the four files", four.includes("-- part 46_email_automations_complete.sql"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
