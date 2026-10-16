/**
 * THE READS THAT SEARCHED A WHOLE TABLE, AND THE TWO CODE PATHS THAT ASKED TOO MUCH
 *
 * 1. SQL part 187 (supabase/sql/run-now/187_hot_path_indexes.sql): one index
 *    per read that had none, each on a column its table really has (read out
 *    of the file that creates it), each made only when the table is there and
 *    the index is not, with a notice when the table is missing.
 * 2. The same indexes, same names and same definitions, in
 *    supabase/sql/RUN_HOT_PATH_INDEXES_CONCURRENTLY.sql, for a large table:
 *    CONCURRENTLY, outside a transaction, one statement per line.
 * 3. The part's copies: the migration, the README row (with the lock warning)
 *    and its column in the check after.
 * 4. Each index still has the read it was made for, at the place named.
 * 5. The code: the wishlist reads its creators' profiles in one query, not
 *    one per item, and "More from seller" reads the card's columns, not `*`.
 *
 * Run: node --experimental-strip-types tests/db-indexes.test.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
let names: Set<string> | null = null

const PART = "supabase/sql/run-now/187_hot_path_indexes.sql"
const CONCURRENT = "supabase/sql/RUN_HOT_PATH_INDEXES_CONCURRENTLY.sql"
const MIGRATION = "supabase/migrations/20270126_hot_path_indexes.sql"

type Wanted = {
  name: string
  table: string
  column: string
  /** The ON clause, exactly as both files write it. */
  on: string
  /** Where the table is created, and the column in it. */
  schema: { file: string; has: RegExp }
  /** The read it serves: a file and the text of the query there. */
  serves: { file: string; has: string }[]
}

const WANTED: Wanted[] = [
  {
    name: "orders_stripe_session_idx",
    table: "orders",
    column: "stripe_session_id",
    on: "public.orders (stripe_session_id) WHERE stripe_session_id IS NOT NULL",
    schema: { file: "scripts/004_create_orders_entitlements.sql", has: /CREATE TABLE IF NOT EXISTS public\.orders \([^;]*\bstripe_session_id TEXT/ },
    serves: [
      { file: "app/api/stripe/webhook/route.ts", has: '.eq("stripe_session_id", session.id)' },
      { file: "lib/orders/owned.ts", has: '.eq("stripe_session_id", row.stripe_session_id)' },
      { file: "lib/checkout/fulfil-cart-session.ts", has: '.eq("stripe_session_id", sessionId)' },
      { file: "app/purchase/success/page.tsx", has: '.eq("stripe_session_id", sessionId)' },
    ],
  },
  {
    name: "orders_stripe_payment_intent_idx",
    table: "orders",
    column: "stripe_payment_intent_id",
    on: "public.orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL",
    schema: { file: "scripts/004_create_orders_entitlements.sql", has: /CREATE TABLE IF NOT EXISTS public\.orders \([^;]*\bstripe_payment_intent_id TEXT/ },
    serves: [
      { file: "lib/stripe/refund-sync.ts", has: '.eq("stripe_payment_intent_id", paymentIntentId)' },
      { file: "lib/stripe/disputes.ts", has: '.eq("stripe_payment_intent_id", ctx.paymentIntentId)' },
      { file: "lib/physical/orders-server.ts", has: '.eq("stripe_payment_intent_id", paymentIntentId)' },
    ],
  },
  {
    name: "commerce_checkouts_receipt_token_idx",
    table: "commerce_checkouts",
    column: "receipt_token",
    on: "public.commerce_checkouts (receipt_token) WHERE receipt_token IS NOT NULL",
    schema: { file: "supabase/sql/run-now/78_physical_commerce.sql", has: /CREATE TABLE IF NOT EXISTS public\.commerce_checkouts \([^;]*\n  receipt_token text,/ },
    serves: [
      { file: "lib/physical/orders-server.ts", has: 'q.eq("receipt_token", where.receiptToken)' },
      { file: "lib/support/cases-server.ts", has: '.eq("receipt_token", token)' },
    ],
  },
  {
    name: "commerce_checkouts_session_fingerprint_idx",
    table: "commerce_checkouts",
    column: "session_fingerprint",
    on: "public.commerce_checkouts (session_fingerprint) WHERE session_fingerprint IS NOT NULL",
    schema: { file: "supabase/sql/run-now/78_physical_commerce.sql", has: /CREATE TABLE IF NOT EXISTS public\.commerce_checkouts \([^;]*\n  session_fingerprint text,/ },
    serves: [{ file: "lib/receipts/physical-order.ts", has: '.eq("session_fingerprint", cartFingerprint(' }],
  },
  {
    name: "profiles_email_idx",
    table: "profiles",
    column: "email",
    on: "public.profiles (email)",
    schema: { file: "scripts/001_create_profiles.sql", has: /\n\s+email TEXT NOT NULL,/ },
    serves: [
      { file: "lib/checkout/fulfil-cart-session.ts", has: 'from("profiles").select("id").eq("email", buyerEmail)' },
      { file: "lib/checkout/fulfil-payment.ts", has: 'from("profiles").select("id").eq("email", g.email.toLowerCase())' },
      { file: "app/api/auth/request-password-reset/route.ts", has: '.eq("email", cleanEmail)' },
    ],
  },
  {
    name: "membership_invoices_order_idx",
    table: "membership_invoices",
    column: "order_id",
    on: "public.membership_invoices (order_id) WHERE order_id IS NOT NULL",
    schema: { file: "supabase/sql/run-now/75_memberships.sql", has: /CREATE TABLE IF NOT EXISTS public\.membership_invoices \([^;]*\border_id uuid,/ },
    serves: [{ file: "lib/library/library-extras.ts", has: 'from("membership_invoices").select("order_id, membership:memberships(billing_interval)").in("order_id"' }],
  },
  {
    name: "community_bookmarks_post_idx",
    table: "community_bookmarks",
    column: "post_id",
    on: "public.community_bookmarks (post_id)",
    schema: { file: "supabase/sql/run-now/81_communities.sql", has: /CREATE TABLE IF NOT EXISTS public\.community_bookmarks \([^;]*\bpost_id uuid NOT NULL/ },
    serves: [{ file: "lib/communities/server/feed-rank-load.ts", has: 'from("community_bookmarks").select("post_id").eq("community_id", communityId).in("post_id"' }],
  },
  {
    name: "community_feed_posts_space_any_status_idx",
    table: "community_feed_posts",
    column: "space_id",
    on: "public.community_feed_posts (space_id) WHERE space_id IS NOT NULL",
    schema: { file: "supabase/sql/run-now/81_communities.sql", has: /CREATE TABLE IF NOT EXISTS public\.community_feed_posts \([^;]*\bspace_id uuid REFERENCES public\.community_spaces/ },
    serves: [{ file: "lib/communities/server/creator.ts", has: 'from("community_feed_posts").select("id", { count: "exact", head: true }).eq("space_id", s.id)' }],
  },
]

const part = read(PART)
const partLines = part.split("\n")
const concurrent = read(CONCURRENT)
const concurrentStatements = concurrent.split("\n").filter((l) => l.trim() && !l.trimStart().startsWith("--"))

console.log("\n1. The part")
{
  check("opens with a closed summary", partLines[0].startsWith("/* ") && partLines[0].endsWith(" */"))
  check("ends by reloading the API", part.trimEnd().endsWith("notify pgrst, 'reload schema';"))
  check("no -- comment inside", !partLines.slice(1).some((l) => l.trimStart().startsWith("--")))
  const body = partLines.slice(1).filter((l) => l.trim() && l !== "notify pgrst, 'reload schema';")
  check("one whole statement per line, each a DO block", body.every((l) => l.startsWith("DO $do$ BEGIN ") && l.endsWith(" END $do$;")), body.find((l) => !l.endsWith(" END $do$;")))
  check("one line per index, nothing else", body.length === WANTED.length, String(body.length))
  check("builds indexes and nothing else", !/\b(ALTER|DROP|UPDATE|DELETE|INSERT|GRANT|REVOKE|CREATE TABLE|CREATE OR REPLACE|CREATE UNIQUE)\b/i.test(body.join("\n")))
  check("never CONCURRENTLY inside the part (it would fail in a transaction)", !/CONCURRENTLY/.test(body.join("\n")))
  check("names its lock and the file that avoids it", partLines[0].includes("stops writes to its table") && partLines[0].includes("RUN_HOT_PATH_INDEXES_CONCURRENTLY.sql") && partLines[0].includes("Safe to run again"))
  for (const w of WANTED) {
    const line = body.find((l) => l.includes(`CREATE INDEX IF NOT EXISTS ${w.name} ON `)) ?? ""
    check(`${w.name}: made in the part`, !!line)
    check(`${w.name}:   on ${w.on}`, line.includes(`CREATE INDEX IF NOT EXISTS ${w.name} ON ${w.on};`))
    check(`${w.name}:   skipped with a notice when ${w.table} is missing`, line.includes(`IF to_regclass('public.${w.table}') IS NULL THEN RAISE NOTICE '${w.name} skipped: public.${w.table} does not exist here`) && line.indexOf("RETURN; END IF;") < line.indexOf("CREATE INDEX"))
    check(`${w.name}:   no lock taken when it is already there`, line.includes(`IF to_regclass('public.${w.name}') IS NOT NULL THEN RETURN; END IF; CREATE INDEX`))
  }
  check("every index name is new to the repository", WANTED.every((w) => !otherSqlNames().has(w.name)), WANTED.filter((w) => otherSqlNames().has(w.name)).map((w) => w.name).join(", "))
}

console.log("\n2. CONCURRENTLY, for a large table")
{
  check("the file is there", existsSync(CONCURRENT))
  check("one CREATE INDEX CONCURRENTLY per index, and nothing else to run", concurrentStatements.length === WANTED.length && concurrentStatements.every((l) => l.startsWith("CREATE INDEX CONCURRENTLY IF NOT EXISTS ") && l.endsWith(";")))
  check("no transaction and no DO block (CONCURRENTLY refuses both)", !/^\s*(BEGIN|COMMIT|DO\b|START TRANSACTION)/im.test(concurrentStatements.join("\n")))
  check("says to run it one line at a time, or with psql", concurrent.includes("ONE LINE AT A TIME") && concurrent.includes("psql"))
  check("says what to do with an index a failed run left invalid", concurrent.includes("DROP INDEX CONCURRENTLY IF EXISTS") && concurrent.includes("indisvalid"))
  for (const w of WANTED) {
    check(`${w.name}: the same name and definition`, concurrentStatements.includes(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${w.name} ON ${w.on};`))
  }
}

console.log("\n3. The part's copies")
{
  check("a byte for byte copy in migrations", existsSync(MIGRATION) && read(MIGRATION) === part)
  const readme = read("supabase/sql/run-now/README.md")
  const row = readme.split("\n").find((l) => l.startsWith("| `187_hot_path_indexes.sql` |")) ?? ""
  check("its README row", !!row)
  const bytes = Buffer.byteLength(part).toLocaleString("en-US")
  const lines = part.split("\n").length - (part.endsWith("\n") ? 1 : 0)
  check("  with its lines and bytes", row.endsWith(`| ${lines} | ${bytes} |`), row.slice(-24))
  check("  warning that a plain CREATE INDEX stops writes while it builds", row.includes("stops inserts, updates and deletes") && row.includes("RUN_HOT_PATH_INDEXES_CONCURRENTLY.sql"))
  const after = read("supabase/sql/run-now/99_check_after.sql")
  const col = after.slice(after.lastIndexOf(", ("), after.indexOf("as p187_hot_path_indexes"))
  check("its column in the check after", /as p187_hot_path_indexes;\s*$/.test(after))
  for (const w of WANTED) check(`  the check after asks for ${w.name}`, col.includes(`to_regclass('public.${w.name}') is not null`) && col.includes(`'${w.name}'`))
  check("  and that none of them is left invalid", col.includes("not i.indisvalid"))
  check("listed in the built files", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 187_hot_path_indexes.sql") && read("lib/admin/sql-parts.generated.ts").includes("187_hot_path_indexes.sql"))
}

console.log("\n4. Each index: a real column, and the read it serves")
for (const w of WANTED) {
  check(`${w.table}.${w.column} is in ${w.schema.file}`, w.schema.has.test(read(w.schema.file)))
  for (const s of w.serves) check(`  ${w.name} serves ${s.file}`, read(s.file).includes(s.has))
}
{
  /* None of these was already indexed under another name. */
  const sql = allSql()
  const already = (table: string, column: string) =>
    new RegExp(`create (unique )?index[^;]*\\bon (public\\.)?${table}\\s*(using \\w+\\s*)?\\(\\s*${column}\\s*[,)]`, "i").test(sql) ||
    new RegExp(`alter table[^;]*${table}[^;]*add (constraint \\w+ )?unique \\(\\s*${column}\\s*\\)`, "i").test(sql)
  for (const w of WANTED) {
    if (w.name === "community_feed_posts_space_any_status_idx") {
      /* There is one, but only over published posts: a count of every post in a space cannot use it. */
      const only = [...sql.matchAll(/create index[^;]*\bon (?:public\.)?community_feed_posts\s*\(\s*space_id\b[^;]*;/gi)].map((m) => m[0])
      check("the only index led by community_feed_posts.space_id before this part is over published posts only", only.length > 0 && only.every((t) => /where status = 'published'/i.test(t)), only.join(" | "))
      check("  and the Spaces count asks for every status", !/eq\("space_id", s\.id\)\)?\.eq\("status"/.test(read("lib/communities/server/creator.ts")))
    } else check(`no index led by ${w.table}.${w.column} before this part`, !already(w.table, w.column))
  }
}

console.log("\n5. The code")
{
  const route = read("app/api/wishlist/route.ts")
  const loop = route.indexOf("for (const item of shown)")
  const profileRead = route.indexOf('.from("profiles")')
  check("wishlist: the creators' profiles are read before the loop over items", loop > 0 && profileRead > 0 && profileRead < loop)
  check("  in one read per 200 creators, by id", route.includes('.select("id, display_name, username, avatar_url")') && route.includes(".in(\"id\", creatorUserIds.slice(i, i + 200))"))
  check("  each creator once", route.includes("[...new Set(shown.map((item) => item.products?.creators?.user_id)"))
  const getEnd = route.indexOf("export async function POST")
  check("  no profile read inside the loop", getEnd > loop && !route.slice(loop, getEnd).includes(".from(") && !route.slice(0, getEnd).includes(".single()"))
  check("  only items still on sale, as before", route.includes("if (!item.products || !isPubliclyVisible(item.products as { status?: string | null })) continue"))

  const cache = read("lib/commerce/product-page-cache.ts")
  const start = cache.indexOf("export const cachedMoreFromCreator")
  const fn = cache.slice(start, cache.indexOf("export const cachedReviews"))
  check("More from seller: no longer `*`", start > 0 && !fn.includes('select("*")') && fn.includes(".select(MORE_FROM_CREATOR_COLUMNS)"))
  const columns = (cache.match(/export const MORE_FROM_CREATOR_COLUMNS = "([^"]+)"/)?.[1] ?? "").split(",").map((c) => c.trim())
  const page = read("app/(marketing)/p/[slug]/page.tsx")
  const mapped = page.slice(page.indexOf("moreProducts.map((p) => ({"), page.indexOf("}))", page.indexOf("moreProducts.map((p) => ({")))
  const used = [...new Set([...mapped.matchAll(/\bp\.(\w+)/g)].map((m) => m[1]).concat([...mapped.matchAll(/\(p as \{ (\w+)\?/g)].map((m) => m[1])))]
  check("  the card's fields are read from the rows", used.length >= 8, used.join(","))
  for (const f of used) check(`  reads ${f}, which the card draws`, columns.includes(f), columns.join(","))
  check("  and nothing else reads those rows", (page.match(/\bmoreProducts\b/g) ?? []).length === 3)
  const explore = read("app/(marketing)/explore/[category]/page.tsx")
  check("  every column is one Explore's catalogue already names", columns.every((c) => new RegExp(`\\b${c}\\b`).test(explore.slice(explore.indexOf('.from("products")'), explore.indexOf('.eq("status", "published")', explore.indexOf('.from("products")'))))))
}

function allSql(): string {
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) walk(p)
      else if (f.name.endsWith(".sql")) files.push(p)
    }
  }
  for (const d of ["supabase/migrations", "supabase/sql", "scripts", "sql"]) if (existsSync(d)) walk(d)
  const mine = new Set([PART, CONCURRENT, MIGRATION].map((p) => join(p)))
  /* The built files repeat part 187; they are not "before" it. */
  return files
    .filter((f) => !mine.has(f) && !/supabase\/sql\/(run-four|all-in-two|all-in-three|all-last-three-days|all-last-14-days)\//.test(f) && !f.endsWith("99_check_after.sql"))
    .map((f) => read(f))
    .join("\n")
}

function otherSqlNames(): Set<string> {
  if (!names) names = new Set([...allSql().matchAll(/create (?:unique )?index (?:concurrently )?(?:if not exists )?"?(\w+)"?/gi)].map((m) => m[1].toLowerCase()))
  return names
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
