/**
 * DATABASE LOAD AND STORE ISOLATION (round rel-db, SQL part 334)
 *
 * 1. THE INDEXES. Every index in supabase/sql/run-now/334_database_load_and_isolation.sql
 *    is in supabase/sql/RUN_REL_DB_INDEXES_CONCURRENTLY.sql with the same name and
 *    definition, is made only when its table and columns are there, and has the
 *    read or the delete it was made for still in the code or the schema.
 * 2. STORE ISOLATION. The functions the part closes to the public key are called by
 *    the app with the service role only; the policies it drops are not what any
 *    browser or session client reads or writes through; the public key's columns of
 *    digital_assets are the ones the product page asks for.
 * 3. THE COPIES. The migration is the part, the README has its row with the lock
 *    warning, the check after has its column, and every bundle carries it.
 * 4. ROUND TRIPS. withOrderCurrency asks the store's currency and its changes side by
 *    side, never one after the other, and the Orders page's figures share the store's
 *    currency read through storeCurrencyOnce. scripts/measure-speed18.mjs
 *    ONLY="app-orders (signed in)" counts the page: 20 round trips before, 17 after.
 *    A community space's delete and kind change ask whether it holds anything with two
 *    LIMIT 1 reads side by side, where two exact counts ran one after the other.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { withOrderCurrency } from "../lib/store/currency-at-read"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/^\s*\/\/.*$/gm, "")

const PART = "supabase/sql/run-now/334_database_load_and_isolation.sql"
const MIGRATION = "supabase/migrations/20271031_database_load_and_isolation.sql"
const CONCURRENT = "supabase/sql/RUN_REL_DB_INDEXES_CONCURRENTLY.sql"
const part = read(PART)
const lines = part.trimEnd().split("\n")

/* What each index is for: a query in the code, or the foreign key whose delete searched the table. */
const SERVES: Record<string, { file: string; has: string } | { fk: string }> = {
  commerce_order_events_creator_kind_idx: { file: "lib/emails/activity-server.ts", has: '.from("commerce_order_events").select("idempotency_key, message, created_at").eq("creator_id", creatorId).eq("kind", "email.sent").gte("created_at", since)' },
  email_flow_sends_creator_status_idx: { file: "lib/emails/activity-server.ts", has: '.from("email_flow_sends").select("flow_id, sent_at").eq("creator_id", creatorId).eq("status", "sent").gte("sent_at", since)' },
  onepages_seller_idx: { file: "lib/attribution/server.ts", has: '.from("onepages").select("id").eq("seller_id", creatorId).eq("status", "published")' },
  onepages_creator_idx: { file: "lib/attribution/server.ts", has: '.from("onepages").select("id").eq("creator_id", creatorId).eq("status", "published")' },
  community_messages_community_created_idx: { file: "lib/communities/server/orphans.ts", has: 'admin.from("community_messages").select("body, attachments").eq("community_id", communityId).or(by).gte("created_at", sinceIso)' },
  community_direct_messages_community_created_idx: { file: "lib/communities/server/orphans.ts", has: 'admin.from("community_direct_messages").select("body, attachments").eq("community_id", communityId).or(by).gte("created_at", sinceIso)' },
  community_chat_group_messages_community_created_idx: { file: "lib/communities/server/orphans.ts", has: 'admin.from("community_chat_group_messages").select("body, attachments").eq("community_id", communityId).or(by).gte("created_at", sinceIso)' },
  community_messages_reply_idx: { fk: "community_messages.reply_to_id" },
  community_direct_messages_reply_idx: { fk: "community_direct_messages.reply_to_id" },
  community_chat_group_messages_reply_idx: { fk: "community_chat_group_messages.reply_to_id" },
  campaign_recipients_subscriber_idx: { fk: "campaign_recipients.subscriber_id" },
  email_recipients_subscriber_idx: { fk: "email_recipients.subscriber_id" },
  community_notifications_community_idx: { fk: "community_notifications.community_id" },
  community_space_reads_space_idx: { fk: "community_space_reads.space_id" },
  checkout_starts_product_idx: { fk: "checkout_starts.product_id" },
  community_members_source_product_idx: { fk: "community_members.source_product_id" },
  course_enrollments_product_idx: { fk: "course_enrollments.product_id" },
  review_requests_product_idx: { fk: "review_requests.product_id" },
  seller_notifications_order_idx: { fk: "seller_notifications.order_id" },
  inventory_reservations_variant_idx: { fk: "inventory_reservations.variant_id" },
  product_channel_listings_product_idx: { fk: "product_channel_listings.product_id" },
}

/* Every SQL file that could create a table: the migrations, the old scripts and the run-now parts. */
function sqlFiles(): string[] {
  const out: string[] = []
  for (const dir of ["supabase/migrations", "scripts", "supabase/sql/run-now"]) {
    for (const f of readdirSync(dir)) if (f.endsWith(".sql") && statSync(join(dir, f)).isFile()) out.push(join(dir, f))
  }
  return out
}
const ALL_SQL = sqlFiles()
  .filter((f) => f !== PART && f !== MIGRATION)
  .map((f) => read(f))
  .join("\n")

console.log("\nTHE INDEXES")
const made = [...part.matchAll(/CREATE INDEX IF NOT EXISTS (\w+) ON (public\.(\w+) \(([^)]*)\)(?: WHERE [^;]*)?);/g)].map((m) => ({ name: m[1], on: m[2], table: m[3], cols: m[4].split(",").map((c) => c.trim()) }))
const concurrent = read(CONCURRENT)
check("twenty one indexes, each one named once", made.length === 21 && new Set(made.map((m) => m.name)).size === 21, made.length)
check("every index has a reason written down here", made.every((m) => SERVES[m.name]) && Object.keys(SERVES).length === made.length)
for (const m of made) {
  const line = lines.find((l) => l.includes(`CREATE INDEX IF NOT EXISTS ${m.name} ON`)) ?? ""
  check(`${m.name}: the same definition, CONCURRENTLY, in the lock free file`, concurrent.includes(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${m.name} ON ${m.on};`))
  check(
    `${m.name}: made only when ${m.table} and its columns are there, and not twice`,
    line.includes(`IF to_regclass('public.${m.table}') IS NULL THEN RAISE NOTICE`) &&
      m.cols.every((c) => line.includes(`table_name = '${m.table}' AND column_name = '${c}'`)) &&
      line.includes(`IF to_regclass('public.${m.name}') IS NOT NULL THEN RETURN; END IF;`),
  )
  const why = SERVES[m.name]
  if (why && "file" in why) check(`${m.name}: its read is still at ${why.file}`, existsSync(why.file) && code(why.file).includes(why.has))
  if (why && "fk" in why) {
    const [t, c] = why.fk.split(".")
    const fk = new RegExp(`\\b${c}\\s+uuid[^,;]*REFERENCES\\s+(public\\.)?\\w+`, "i")
    const inTable = new RegExp(`CREATE TABLE IF NOT EXISTS (public\\.)?${t}\\s*\\(([^;]*)`, "gi")
    const bodies = [...ALL_SQL.matchAll(inTable)].map((x) => x[2])
    const added = new RegExp(`ALTER TABLE (IF EXISTS )?(public\\.)?${t}[^;]*ADD COLUMN (IF NOT EXISTS )?${c}\\s+uuid[^;]*REFERENCES`, "i").test(ALL_SQL)
    check(`${m.name}: ${why.fk} is a foreign key, so a delete of its parent searched ${t}`, added || bodies.some((b) => fk.test(b)))
  }
}
check("the lock free file runs nothing but CREATE INDEX CONCURRENTLY", concurrent.split("\n").filter((l) => l.trim() && !l.startsWith("--")).every((l) => l.startsWith("CREATE INDEX CONCURRENTLY IF NOT EXISTS ")))

console.log("\nSTORE ISOLATION")
const closed = [...part.matchAll(/REVOKE ALL ON FUNCTION public\.(\w+)\(([^)]*)\) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO service_role;/g)].map((m) => m[1])
check("fourteen functions closed to the public key and signed in accounts, kept for the service role", closed.length === 14, closed)
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) {
      if (f !== "node_modules" && !f.startsWith(".")) walk(p, out)
    } else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}
const source = [...walk("app"), ...walk("lib"), ...walk("components")]
const texts = new Map(source.map((f) => [f, code(f)]))
const browserish = (f: string, t: string) => f.startsWith("components/") || /^["']use client["']/m.test(t)
for (const fn of closed) {
  const calls = source.filter((f) => texts.get(f)!.includes(`rpc("${fn}"`) || texts.get(f)!.includes(`rpc('${fn}'`))
  const bad = calls.filter((f) => {
    const t = texts.get(f)!
    if (browserish(f, t)) return true
    /* Each call goes through the service role: a client made by createAdminClient, or a db the route handed in from one. */
    return !/createAdminClient|supabaseAdmin|\bdb\b|\badmin\b/.test(t)
  })
  check(`${fn}: never called from the browser, only through the service role`, bad.length === 0, bad)
}
const dropped = [...part.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.(\w+);/g)].map((m) => ({ policy: m[1], table: m[2] }))
check("six policies that opened every store's rows are dropped", dropped.length === 6, dropped)
const INSERT_ONLY = new Set(["seller_notifications", "payment_connection_events", "download_events"])
const sessionClients = /@\/lib\/supabase\/(client|server)"|createPublicReadClient|createBrowserClient/
for (const { table } of dropped) {
  const users = source.filter((f) => new RegExp(`from\\(["']${table}["']\\)`).test(texts.get(f)!))
  /* A file that reaches the table through a session client is one that would lose a row: only the server's own client may (the owner's own SELECT policies stay). */
  const viaSession = users.filter((f) => {
    const t = texts.get(f)!
    if (browserish(f, t)) return true
    if (!sessionClients.test(t)) return false
    const flat = t.replace(/\s+/g, " ")
    /* An INSERT policy dropped: only an insert through the session would miss it. An ALL policy dropped: any use but the owner's own read of their customers. */
    if (INSERT_ONLY.has(table)) return new RegExp(`supabase\\s*\\.from\\(["']${table}["']\\)\\s*\\.(insert|upsert)`).test(flat)
    if (table === "customers") return new RegExp(`supabase\\s*\\.from\\(["']${table}["']\\)\\s*\\.(insert|upsert|update|delete)`).test(flat)
    return new RegExp(`supabase\\s*\\.from\\(["']${table}["']\\)`).test(flat)
  })
  check(`${table}: written only by the server, so dropping "${dropped.find((d) => d.table === table)!.policy}" takes nothing from the app`, viaSession.length === 0, viaSession)
}
const pageCache = code("lib/commerce/product-page-cache.ts")
check(
  "the product page reads digital_assets through the public key with exactly the columns it is given",
  /createPublicReadClient\(\)\s*\n\s*const \{ data \} = await supabase\s*\n\s*\.from\("digital_assets"\)\s*\n\s*\.select\("id, file_name"\)\s*\n\s*\.eq\("product_id", productId\)\s*\n\s*\.order\("created_at"/.test(pageCache) &&
    part.includes("GRANT SELECT (id, product_id, file_name, created_at) ON public.digital_assets TO anon;") &&
    part.includes('ALTER POLICY "Anyone can view digital assets metadata" ON public.digital_assets TO anon;'),
)
/* lib/handoff/coverage.ts is the business handoff's list of every table and what happens to it; it names the copies but never reads them. */
check("nothing in the app reads the indexability view or the partitioned copies", source.filter((f) => f !== "lib/handoff/coverage.ts").every((f) => !/storefront_indexability|_partitioned\b/.test(texts.get(f)!)))
check(
  "the partitioned copies and every partition of theirs get row level security and lose public access",
  /c\.relname IN \('analytics_events_partitioned', 'onepage_views_partitioned'\)/.test(part) && /pg_inherits/.test(part) && part.includes("ENABLE ROW LEVEL SECURITY', t); EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', t);"),
)
check(
  "a statement timeout only where none is set, past the app's 60s request deadline, and a notice where the editor may not",
  part.includes("('anon', '3s'), ('authenticated', '8s'), ('service_role', '120s')") &&
    part.includes("c LIKE 'statement_timeout=%'") &&
    part.includes("EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE") &&
    /rpc: 60_000/.test(code("lib/net/deadline.ts")),
)

console.log("\nTHE COPIES")
check("the migration is the part, byte for byte", read(MIGRATION) === part)
check("every line of the part is one whole statement", lines.slice(1).every((l) => /;$/.test(l)) && lines[0].startsWith("/*") && lines[0].endsWith("*/"))
check("no row changes: no INSERT, UPDATE or DELETE of data", !/\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/.test(part))
const readme = read("supabase/sql/run-now/README.md")
check("the README has its row, with the lock warning and the lock free file", /\| `334_database_load_and_isolation\.sql` \|[^\n]*RUN_REL_DB_INDEXES_CONCURRENTLY\.sql[^\n]*\| 48 \| 27,0\d\d \|/.test(readme))
const after = read("supabase/sql/run-now/99_check_after.sql")
check("the check after has its column, naming every index", /* Changed on purpose (round 43 merge): later parts (338, 341) have columns after it. */ / as p334_database_load_and_isolation[,;]/.test(after) && made.every((m) => after.includes(`'${m.name}'`)))
for (const f of ["supabase/sql/run-four/3_of_4_latest.sql", "supabase/sql/all-in-two/1_of_2_everything.sql", "supabase/sql/all-in-three/2_of_3_latest.sql"]) {
  check(`${f} carries the part`, read(f).includes(lines[1]) && read(f).includes(lines[lines.length - 3]))
}

console.log("\nROUND TRIPS")
async function sideBySide() {
  const started: string[] = []
  let open = 0
  let most = 0
  const answer = (table: string, data: unknown) => ({
    eq() {
      return this
    },
    order() {
      return this
    },
    limit() {
      return this
    },
    maybeSingle() {
      return this
    },
    then(resolve: (v: unknown) => void) {
      started.push(table)
      open++
      most = Math.max(most, open)
      setTimeout(() => {
        open--
        resolve({ data, error: null })
      }, 5)
    },
  })
  const db = {
    from(table: string) {
      return {
        select() {
          if (table === "store_settings") return answer(table, { currency: "RON", default_country: "RO" })
          return answer(table, [{ created_at: "2026-06-01T00:00:00Z", from_currency: "EUR", to_currency: "RON", previous_currency: "EUR", restored_at: null }])
        },
      }
    },
  }
  type Row = { created_at: string; currency?: string }
  const rows = await withOrderCurrency<Row>(db, "creator-1", [{ created_at: "2026-01-01T00:00:00Z" }, { created_at: "2026-09-01T00:00:00Z" }])
  check("the store's currency and its changes are asked side by side, one wave, not two", started.length === 2 && most === 2, { started, most })
  check("and the answer is the same: the currency of the day each order was placed", rows[0].currency === "EUR" && rows[1].currency === "RON", rows)
  const given = await withOrderCurrency<Row>(db, "creator-1", [{ created_at: "2026-01-01T00:00:00Z" }], "RON")
  check("a caller that already has the store's currency asks for the changes alone", started.length === 3 && started[2] === "store_currency_changes" && given[0].currency === "EUR")
  const none = await withOrderCurrency(db, "creator-1", [{ created_at: "2026-01-01T00:00:00Z", currency: "usd" }])
  check("rows that all carry a currency ask nothing", started.length === 3 && none[0].currency === "usd")
}
const paged = code("lib/orders/paged.ts")
const once = code("lib/store/currency-at-read.ts")
check("the figures read the store's currency through the request's shared read", /const store = \(await storeCurrencyOnce\(db, creatorId\)/.test(paged) && !/readStoreCurrency\(/.test(paged))
check("the shared reads live for one request (React's cache), keyed by the client, then the store", /const answers = cache\(\(\) => new WeakMap<object, Map<string, Promise<unknown>>>\(\)\)/.test(once) && /once\(db, `currency:\$\{creatorId\}`/.test(once) && /once\(db, `changes:\$\{creatorId\}`/.test(once))

const creatorCode = code("lib/communities/server/creator.ts")
const spaceUsedFn = creatorCode.slice(creatorCode.indexOf("async function spaceUsed("), creatorCode.indexOf("export async function updateSpace("))
check(
  "a space's delete and kind change ask for its first post and first message side by side, never an exact count of either",
  /db\.from\(table\)\.select\("id"\)\.eq\("space_id", spaceId\)\.limit\(1\)/.test(spaceUsedFn) &&
    /Promise\.all\(\[first\("community_feed_posts"\), first\("community_messages"\)\]\)/.test(spaceUsedFn) &&
    (creatorCode.match(/if \(await spaceUsed\(db, space\.id\)\) return no\(409,/g) ?? []).length === 2 &&
    !/const used = \(await count\(/.test(creatorCode),
)
check("a read that fails keeps the space (never deleted on an unanswered question); a table not there yet holds nothing", /\(error \? !NO_TABLE\.has\(error\.code \?\? ""\) :/.test(spaceUsedFn) && /\(\) => true,/.test(spaceUsedFn))

sideBySide().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
})
