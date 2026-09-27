/**
 * ===========================================================================
 *  PART 54 AGAINST A REAL POSTGRES
 * ===========================================================================
 * supabase/sql/run-now/61_analytics_one_pipeline.sql is run twice on a
 * throwaway database built from the repository's own SQL for the tables it
 * touches (tests/fixtures/analytics-sql/schema.sql: analytics_events as
 * scripts/023 and migrations/20260212 made it, then parts 04, 25 and 32), and
 * the answers are read back:
 *
 *   the second run changes nothing, and the backfill places old page views
 *   on their property exactly where the address says, and nowhere else;
 *   the reports' own counts (analytics_visit_tally, analytics_all_time) are
 *   the same before and after the part on rows with no OnePage view;
 *   a day's rollup equals the raw rows it was made from, counted another
 *   way, and running it again changes nothing (fixtures/rollup_check.sql);
 *   OnePage page views are left out of the Storelib counts and nothing else;
 *   the whole of 99_check_after.sql runs, and its p60 column reads true.
 *
 * It needs a Postgres it may create a database in: ANALYTICS_PG_HOST (a
 * host or a socket directory) and ANALYTICS_PG_USER, a superuser. Without
 * one it says so and checks only what it can read.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const FIX = "tests/fixtures/analytics-sql"
const PART = "supabase/sql/run-now/61_analytics_one_pipeline.sql"

console.log("\nThe part, as text")
{
  const part = read(PART)
  const lines = part.trimEnd().split("\n")
  check("one statement per line, a comment first", lines[0].startsWith("/*") && lines.slice(1).every((l) => l.trimEnd().endsWith(";")))
  check("columns are added, never dropped", /ADD COLUMN IF NOT EXISTS property_type text/.test(part) && !/DROP COLUMN/i.test(part))
  check("the event type check allows link_click, and does not recheck old rows", /analytics_events_event_type_check CHECK \(event_type IN \([^)]*'link_click'\)\) NOT VALID;/.test(part))
  check("the backfill touches only rows it has not placed yet", /WHERE e\.property_type IS NULL AND e\.event_type = 'view'/.test(part) && /FROM typed t WHERE e\.id = t\.id AND e\.property_type IS NULL/.test(part))
  check("the rollup and its days are server only; creators may read their own rows",
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.analytics_property_daily FROM anon, authenticated/.test(part) && /GRANT EXECUTE ON FUNCTION public\.analytics_refresh_property_day\(date, uuid\) TO service_role/.test(part))
}

const PSQL = ["/usr/bin/psql", "/usr/lib/postgresql/16/bin/psql", "/usr/local/bin/psql"].find((p) => existsSync(p))
const HOST = process.env.ANALYTICS_PG_HOST
const USER = process.env.ANALYTICS_PG_USER || "storelib"

function psql(db: string, args: string[]): { out: string; err: string } {
  try {
    const out = execFileSync(PSQL!, ["-h", HOST!, "-U", USER, "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    return { out, err: "" }
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string }
    throw new Error(`${x.stderr || ""}${x.stdout || ""}`.slice(0, 2000))
  }
}
/** Runs a file and returns psql's notices too (they go to stderr). */
function runFile(db: string, file: string): string {
  return execFileSync("/bin/sh", ["-c", `"$0" -h "$1" -U "$2" -d "$3" -v ON_ERROR_STOP=1 -X -q -f "$4" 2>&1`, PSQL!, HOST!, USER, db, join(root, file)], { encoding: "utf8" })
}

let reachable = false
if (PSQL && HOST) {
  try {
    psql("postgres", ["-tAc", "select 1"])
    reachable = true
  } catch {
    reachable = false
  }
}

if (!reachable) {
  console.log(`\n  skipped  the Postgres run: ${!PSQL ? "no psql here" : !HOST ? "ANALYTICS_PG_HOST is not set" : "no Postgres answers at ANALYTICS_PG_HOST"}`)
} else {
  const db = `analytics_part54_${process.pid}`
  psql("postgres", ["-c", `drop database if exists ${db}`, "-c", `create database ${db}`])
  try {
    console.log("\nPart 61 on a database with the tables it touches")
    for (const f of [`${FIX}/schema.sql`, "supabase/sql/run-now/04_event_and_email_types.sql", "supabase/sql/run-now/25_analytics_speed.sql", "supabase/sql/run-now/32_orders_keep_sales.sql", `${FIX}/legacy_rows.sql`]) runFile(db, f)
    const before = psql(db, ["-tA", "-f", join(root, `${FIX}/tally_snapshot.sql`)]).out.trim()
    const first = runFile(db, PART)
    const second = runFile(db, PART)
    const after = psql(db, ["-tA", "-f", join(root, `${FIX}/tally_snapshot.sql`)]).out.trim()
    check("the first run places the five old page views that have an address", /analytics_events: 5 old page views placed on a property/.test(first), first.split("\n").filter((l) => /placed/.test(l)).join(" "))
    check("the second run changes nothing", /analytics_events: 0 old page views placed on a property/.test(second) && !/ERROR/.test(second))
    check("the reports' counts are the same before and after the part", before === after && before.length > 10, { before, after })

    const placed = psql(db, ["-tA", "-F", "|", "-c", "select right(id::text, 1), coalesce(property_type, '-'), coalesce(property_id::text, '-'), coalesce(path, '-') from analytics_events order by id"]).out.trim().split("\n")
    const want = [
      "1|creator_page|-|-", // storelib.com/ana
      "2|website|aaaaaaaa-5555-0000-0000-000000000001|-", // ana.storelib.com, her only install
      "3|-|-|-", // no address: unknown
      "4|-|-|-", // a Buy with no address
      "5|website|-|-", // bee.com: Bee has two installs, so no id
      "6|creator_page|-|-", // a domain connected for the creator page
      "7|creator_page|-|-", // localhost
      "8|-|-|-", // store_view, a name nothing reads
    ]
    check("old rows are placed where their address says, and the path is left empty", placed.join(",") === want.join(","), placed)

    console.log("\nThe rollup against the raw rows")
    const rollup = runFile(db, `${FIX}/rollup_check.sql`)
    for (const line of rollup.split("\n").filter((l) => /NOTICE:\s+ok:/.test(l))) console.log(`        ${line.replace(/^.*NOTICE:\s+/, "")}`)
    check("re-running the same days changes nothing", /ok: re-running the same days changed nothing/.test(rollup))
    check("each day's rollup equals its raw rows, breakdowns included", (rollup.match(/rolled up equals the raw rows/g) ?? []).length === 2)
    check("OnePage views are left out of the Storelib counts, and only they are", /ok: the Storelib counts leave out the \d+ OnePage views/.test(rollup))
    check("analytics_rollup_days names the days that were rolled up", /ok: analytics_rollup_days holds \{2026-09-24,2026-09-25\}/.test(rollup))

    console.log("\nThe check after")
    const check99 = psql(db, ["-x", "-f", join(root, "supabase/sql/run-now/99_check_after.sql")]).out
    check("the whole of 99_check_after.sql runs", /p51_email_flows_trigger_rules/.test(check99))
    check("  and p60 reads true", /p61_analytics_one_pipeline\s*\|\s*t/.test(check99), check99.split("\n").find((l) => /p60/.test(l)))
  } catch (e) {
    check("the Postgres run finished", false, (e as Error).message)
  } finally {
    try {
      psql("postgres", ["-c", `drop database if exists ${db}`])
    } catch {
      /* left for the next run's drop */
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
