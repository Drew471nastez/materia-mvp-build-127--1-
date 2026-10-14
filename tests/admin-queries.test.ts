/**
 * ===========================================================================
 *  EVERY COLUMN /admin ASKS FOR EXISTS, ACCORDING TO THE REPOSITORY'S SQL
 * ===========================================================================
 * The owner opened /admin and read:
 *
 *     1 query could not be read.
 *     Orders by creator (orders): column orders.creator_id does not exist.
 *
 * `orders` has never had a creator column. An order belongs to a product
 * and a product to a creator; the creator's own Orders page has always gone
 * that way. The admin guessed a name that sounded right, and nothing could
 * catch it before the database did, because a column name is a string.
 *
 * This suite catches the next one. It reads every query under app/admin,
 * app/api/admin and lib/admin (each `.from("…")` chain and each read through
 * the admin's Reader), pulls out every table, every selected column, every
 * embedded table and its columns, every filtered and ordered column, every
 * key written by an insert or update, and every database function called,
 * and checks each against the schema built from supabase/migrations,
 * supabase/sql, sql and scripts (tests/_schema.ts).
 *
 * Tables that were made in the Supabase dashboard rather than in a file are
 * listed below with the columns the rest of the app already reads from them
 * in production. That list is evidence, not a wish: a name goes on it only
 * with the file that proves it.
 *
 * Run with:  npm run test:push
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { hasColumn, loadSchema } from "./_schema"
import { stripComments } from "./_source"
import { EXPECTED_FUNCTIONS, EXPECTED_SCHEMA } from "@/lib/admin/schema-expectations"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const schema = loadSchema()

/**
 * Made outside the repository's SQL, with the columns production code
 * already reads. Each entry names where that is proven.
 */
const OUTSIDE_MIGRATIONS: Record<string, { columns: string[]; evidence: string }> = {
  /* The link page table predates the repository's SQL; only one ALTER of it is in a file. */
  onepages: {
    columns: ["id", "owner_id", "slug", "title", "status", "seller_id", "creator_id"],
    evidence: 'app/(marketing)/l/[slug]/page.tsx selects "id, owner_id", "id, slug, settings, seller_id, creator_id" and "…, title", and filters on status',
  },
}

function hasCol(table: string, col: string): boolean {
  if (hasColumn(schema, table, col)) return true
  const outside = OUTSIDE_MIGRATIONS[table]
  return !!outside && (outside.columns.includes("*") || outside.columns.includes(col))
}
function hasTable(table: string): boolean {
  return schema.tables.has(table) || table in OUTSIDE_MIGRATIONS
}

/* ── Which files ─────────────────────────────────────────────────────────── */

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const FILES = ["app/admin", "app/api/admin", "lib/admin"].flatMap((d) => walk(d))

/* ── Reading a query out of source ───────────────────────────────────────── */

/** The text inside the bracket that opens at `open`, balanced. */
function inside(src: string, open: number): string {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" }
  const close = pairs[src[open]]
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === "\\") i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === "`") quote = c
    else if (c === src[open]) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

/** Split on commas outside brackets and outside strings: a metric name can hold a comma. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  let quote: string | null = null
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null
      cur += ch
      continue
    }
    if (ch === '"' || ch === "`") quote = ch
    if (ch === "(" || ch === "{" || ch === "[") depth++
    if (ch === ")" || ch === "}" || ch === "]") depth--
    if (ch === "," && depth === 0) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

type Use = { file: string; table: string; column: string; how: string }
const uses: Use[] = []
const tableUses: { file: string; table: string }[] = []
const rpcUses: { file: string; fn: string }[] = []

/** Every column a PostgREST select string names, embedded tables included. */
function selectUses(file: string, table: string, select: string, how = "select") {
  for (const raw of splitTop(select)) {
    const item = raw.trim()
    if (!item || item === "*") continue
    const embed = item.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\s*\(([\s\S]*)\)$/)
    if (embed) {
      const child = embed[2]
      tableUses.push({ file, table: child })
      selectUses(file, child, embed[3], `${how} via ${table}`)
      continue
    }
    const col = item.replace(/^\w+:/, "").replace(/::\w+$/, "").replace(/->.*$/, "").trim()
    if (/^\w+$/.test(col)) uses.push({ file, table, column: col, how })
  }
}

/** Filter, order and or() columns inside a chain of calls. */
function filterUses(file: string, table: string, chain: string) {
  for (const m of chain.matchAll(/\.(eq|neq|gt|gte|lt|lte|in|is|not|ilike|like|order|contains|overlaps)\(\s*"([\w.>-]+)"/g)) {
    const col = m[2].replace(/->.*$/, "")
    if (col.includes(".")) continue
    uses.push({ file, table, column: col, how: `.${m[1]}()` })
  }
  for (const m of chain.matchAll(/\.or\(\s*[`"]([^`"]*)[`"]/g)) {
    for (const part of m[1].matchAll(/(?:^|,)\s*(\w+)\.(eq|neq|ilike|like|is|in|gt|gte|lt|lte)\./g)) {
      uses.push({ file, table, column: part[1], how: ".or()" })
    }
  }
  for (const m of chain.matchAll(/\.(insert|update|upsert)\(\s*\{/g)) {
    const body = inside(chain, m.index! + m[0].length - 1)
    for (const entry of splitTop(body)) {
      const key = entry.trim().match(/^(\w+)\s*(?::|$)/)
      if (key) uses.push({ file, table, column: key[1], how: `.${m[1]}()` })
    }
  }
}

/** Named select strings, so `ORDER_COLUMNS` resolves to its text. */
const constants = new Map<string, string>()
const sources = new Map<string, string>()
for (const file of FILES) {
  const src = stripComments(readFileSync(file, "utf8"))
  sources.set(file, src)
  for (const m of src.matchAll(/const (\w+)\s*=\s*\n?\s*"([^"]*)"/g)) constants.set(m[1], m[2])
}
const resolveSelect = (lit: string | undefined, ident: string | undefined) => (lit !== undefined ? lit : ident ? constants.get(ident) ?? null : null)

for (const [file, src] of sources) {
  /* 1. supabase-js chains: .from("t") up to the end of the statement */
  for (const m of src.matchAll(/\.from\(\s*"(\w+)"\s*\)/g)) {
    const table = m[1]
    const start = m.index! + m[0].length
    const rest = src.slice(start)
    const stop = rest.search(/\n\s*\n|;\s*\n|\.from\(|\br\.(rows|page|count)\b/)
    const chain = rest.slice(0, stop < 0 ? 600 : Math.min(stop, 1200))
    tableUses.push({ file, table })
    const sel = chain.match(/^\s*\.select\(\s*(?:"([^"]*)"|(\w+))/) ?? chain.match(/\.select\(\s*(?:"([^"]*)"|(\w+))/)
    if (sel) {
      const text = resolveSelect(sel[1], sel[2])
      if (text !== null) selectUses(file, table, text)
    }
    filterUses(file, table, chain)
  }

  /* 2. the admin's Reader: r.rows / r.page (metric, table, select, shape) and r.count (metric, table, shape) */
  for (const m of src.matchAll(/\b(?:r|this)\.(rows|page|count)(?:<[\s\S]*?>)?\(/g)) {
    const args = inside(src, m.index! + m[0].length - 1)
    const parts = splitTop(args).map((p) => p.trim())
    const table = parts[1]?.match(/^"(\w+)"$/)?.[1]
    if (!table) continue
    tableUses.push({ file, table })
    if (m[1] !== "count") {
      const sel = parts[2]?.match(/^(?:"([^"]*)"|(\w+))$/)
      const text = sel ? resolveSelect(sel[1], sel[2]) : null
      if (text !== null) selectUses(file, table, text)
      filterUses(file, table, parts.slice(3).join(","))
    } else {
      filterUses(file, table, parts.slice(2).join(","))
      const column = parts[3]?.match(/^"(\w+)"$/)?.[1]
      if (column) uses.push({ file, table, column, how: "count" })
    }
  }

  /* 3. database functions */
  for (const m of src.matchAll(/\.rpc(?:<[\s\S]*?>)?\(\s*(?:[^,()]*,\s*)?"(\w+)"/g)) rpcUses.push({ file, fn: m[1] })
}

/* ── The checks ──────────────────────────────────────────────────────────── */

console.log("\nThe reader found the queries it is meant to check\n")
check("it read the admin's files", FILES.length > 20, `${FILES.length} files`)
check("and found queries in them", uses.length > 150, `${uses.length} column uses`)
check(
  "including the reads that go through lib/admin's Reader",
  uses.some((u) => u.file.includes("lib/admin/views") && u.table === "orders"),
)
check(
  "and the columns inside embedded tables",
  uses.some((u) => u.table === "creators" && u.how.includes("via products")),
)

console.log("\nEvery table the admin names exists\n")
{
  const missing = [...new Set(tableUses.filter((t) => !hasTable(t.table)).map((t) => `${t.table} (${t.file})`))]
  check("no query names a table that no SQL file creates", missing.length === 0, missing.join("\n        "))
}

console.log("\nEvery column the admin names exists\n")
{
  const bad = uses.filter((u) => hasTable(u.table) && !hasCol(u.table, u.column))
  const lines = [...new Set(bad.map((u) => `${u.table}.${u.column}  ${u.how}  ${u.file}`))]
  check("no query names a column that no SQL file creates", lines.length === 0, lines.join("\n        "))
}

/**
 * The exact bug, pinned by name: whatever else changes, no admin query asks
 * orders for a creator. And the shapes that replaced it are there.
 */
/* Changed on purpose: orders carries its creator since run-now part 32 (eb4d4b01a), and the Payments center reads a
   creator's orders by it (171abff55). So creator_id is asked for only while the schema's orders has it; seller_id never. */
check(
  "no admin query asks orders for seller_id, nor for creator_id unless the schema has it",
  !uses.some((u) => u.table === "orders" && (u.column === "seller_id" || (u.column === "creator_id" && !hasCol("orders", "creator_id"))))
    && hasCol("orders", "creator_id") && !hasCol("orders", "seller_id"),
)
check(
  "per-creator sales join orders to products",
  /join public\.products p on p\.id = o\.product_id/.test(readFileSync("supabase/sql/RUN_ADMIN_CONSOLE.sql", "utf8")) &&
    /product:products\(creator_id\)/.test(sources.get("lib/admin/sales.ts") ?? ""),
)
check(
  "the moderation dry run counts a creator's orders through their products",
  /\.from\("orders"\)[\s\S]{0,120}\.in\("product_id"/.test(sources.get("app/api/admin/creators/moderate/route.ts") ?? ""),
)
check(
  "the spam purge counts sales through products, not orders.seller_id",
  /\.from\("orders"\)\.select\("product_id"\)\.in\("product_id"/.test(sources.get("app/api/admin/spam-purge/route.ts") ?? ""),
)

console.log("\nEvery database function the admin calls is created somewhere\n")
{
  const missing = [...new Set(rpcUses.filter((u) => !schema.functions.has(u.fn)).map((u) => `${u.fn} (${u.file})`))]
  check("no .rpc() names a function no SQL file creates", missing.length === 0, missing.join("\n        "))
  check("the admin's own functions are among them", EXPECTED_FUNCTIONS.every((f) => schema.functions.has(f)))
}

console.log("\nThe System view checks what the admin actually reads\n")
{
  /* Every column the views read is on the list the System view asks the live database about. */
  const viewUses = uses.filter((u) => u.file.startsWith("lib/admin/views") && !u.file.endsWith("system.ts"))
  const unlisted = [
    ...new Set(
      viewUses
        .filter((u) => {
          const spec = EXPECTED_SCHEMA[u.table]
          return !spec || ![...spec.columns, ...(spec.laterColumns ?? [])].includes(u.column)
        })
        .map((u) => `${u.table}.${u.column}`),
    ),
  ]
  check("every column a view reads is on the System view's list", unlisted.length === 0, unlisted.join(", "))

  /* And nothing on the list is a column nobody created. */
  const phantom: string[] = []
  for (const [table, spec] of Object.entries(EXPECTED_SCHEMA)) {
    for (const col of [...spec.columns, ...(spec.laterColumns ?? [])]) if (!hasCol(table, col)) phantom.push(`${table}.${col}`)
  }
  check("and every column on it exists in the repository's SQL", phantom.length === 0, phantom.join(", "))
}

console.log("\nThe SQL the admin needs is shipped twice, identically, one statement per line\n")
{
  const run = readFileSync("supabase/sql/RUN_ADMIN_CONSOLE.sql", "utf8")
  const migration = readFileSync("supabase/migrations/20260926_admin_console.sql", "utf8")
  check("the migration and the file to paste are the same", run === migration)
  const statements = run.split("\n").filter((l) => l.trim() && !l.trim().startsWith("/*") && !/^\s{2,}\S/.test(l) && !/^[A-Z =]/.test(l.trim()) )
  check("no `--` comments", !/^\s*--/m.test(run))
  check(
    "every statement ends on the line it starts",
    statements.every((l) => l.trim().endsWith(";")),
    statements.filter((l) => !l.trim().endsWith(";")).join("\n        "),
  )
  check("safe to run twice", !/create table (?!if not exists)/i.test(run) && !/create index (?!if not exists)/i.test(run) && !/add column (?!if not exists)/i.test(run))
  check("the new check is added NOT VALID", /check \(status in \(%s\)\) not valid/.test(run))
  check(
    "the totals are not callable by a visitor",
    ["admin_order_totals", "admin_creator_sales", "admin_daily_sales"].every((f) => new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`).test(run)),
  )
  check("the audit table is service role only", /alter table public\.admin_actions enable row level security;/.test(run) && !/create policy/i.test(run))
  check("health and discover tables ship with the admin SQL", /to_regclass\('public\.error_events'\)/.test(run) && /storelib_applied_parts/.test(run) && /platform_settings/.test(run) && /explore_marketplace_enabled/.test(run))
  const health = readFileSync("supabase/sql/RUN_ADMIN_HEALTH.sql", "utf8")
  check("RUN_ADMIN_HEALTH is the health-only slice", /error_events/.test(health) && /storelib_applied_parts/.test(health) && !/admin_actions/.test(health))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
