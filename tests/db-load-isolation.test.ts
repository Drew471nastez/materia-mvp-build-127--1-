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
 *
 * ROUND TWO (round rel2-db, SQL part 443)
 * 5. THE INDEXES. Every index of supabase/sql/run-now/443_database_load_round_two.sql
 *    is on a column some SQL file declares a foreign key, one column each, partial
 *    only on its own column, made only when its table and column are there and no
 *    index of that name or led by that column is, and is in
 *    supabase/sql/RUN_REL2_DB_INDEXES_CONCURRENTLY.sql with the same definition.
 *    The tables the header leaves out on purpose get none.
 * 6. THE GRANTS. community_space_counts is SECURITY INVOKER and the service role's
 *    only; cleanup_expired_auth_codes is closed to the public key; the open INSERT
 *    policies go from the four tables whose every writer in the app uses the
 *    service role, and onepage_views and onepage_clicks, which
 *    app/api/onepage/track writes with the visitor's client, are not touched.
 * 7. ONE READ FOR A COMMUNITY'S SPACES. loadSpaces asks community_space_counts once
 *    and answers what the two exact counts per space answered; where the function
 *    is missing (PGRST202, 42883) it asks those counts as before; any other failure
 *    reads as 0 for every space and asks nothing more.
 * 8. THE COPIES of part 443: migration, README row, check column, bundles, catalog.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { withOrderCurrency } from "../lib/store/currency-at-read"
import { loadSpaces } from "../lib/communities/server/creator"

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


console.log("\nROUND TWO: THE INDEXES (part 443)")
const PART2 = "supabase/sql/run-now/443_database_load_round_two.sql"
const MIGRATION2 = "supabase/migrations/20271443_database_load_round_two.sql"
const CONCURRENT2 = "supabase/sql/RUN_REL2_DB_INDEXES_CONCURRENTLY.sql"
const part2 = read(PART2)
const lines2 = part2.trimEnd().split("\n")
const SQL_BUT_443 = sqlFiles()
  .filter((f) => f !== PART2 && f !== MIGRATION2 && !f.endsWith("99_check_after.sql"))
  .map((f) => read(f))
  .join("\n")
const made2 = [...part2.matchAll(/CREATE INDEX IF NOT EXISTS (\w+) ON (public\.(\w+) \((\w+)\)(?: WHERE (\w+) IS NOT NULL)?);/g)].map((m) => ({ name: m[1], on: m[2], table: m[3], col: m[4], partialOn: m[5] ?? null }))
const concurrent2 = read(CONCURRENT2)
check("eighty eight indexes, each named once, each on one column", made2.length === 88 && new Set(made2.map((m) => m.name)).size === 88, made2.length)
check("no index of part 443 has the name of one made anywhere else", made2.every((m) => !new RegExp(`\\b${m.name}\\b`).test(SQL_BUT_443)))
const fkBad: string[] = []
const guardBad: string[] = []
for (const m of made2) {
  const line = lines2.find((l) => l.includes(`CREATE INDEX IF NOT EXISTS ${m.name} ON`)) ?? ""
  if (m.partialOn && m.partialOn !== m.col) guardBad.push(`${m.name}: partial on another column`)
  if (!concurrent2.includes(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${m.name} ON ${m.on};`)) guardBad.push(`${m.name}: not in the lock free file`)
  if (
    !(
      line.includes(`IF to_regclass('public.${m.table}') IS NULL THEN RAISE NOTICE 'part 443:`) &&
      line.includes(`table_name = '${m.table}' AND column_name = '${m.col}') THEN RAISE NOTICE`) &&
      line.includes(`IF to_regclass('public.${m.name}') IS NOT NULL THEN RETURN; END IF;`) &&
      line.includes(`WHERE i.indrelid = 'public.${m.table}'::regclass AND a.attname = '${m.col}' AND i.indisvalid`) &&
      line.includes(`already has an index led by ${m.col}'; RETURN; END IF; CREATE INDEX`)
    )
  )
    guardBad.push(`${m.name}: guard`)
  const body = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${m.table}\\s*\\(([^;]*)`, "gi")
  const inBody = [...SQL_BUT_443.matchAll(body)].some((x) => new RegExp(`(^|[\\s,(])${m.col}\\s+uuid[^,]*REFERENCES`, "im").test(x[1]) || new RegExp(`FOREIGN KEY\\s*\\(${m.col}\\)\\s*REFERENCES`, "i").test(x[1]))
  const added = new RegExp(`ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:public\\.)?${m.table}\\b[^;]*?(ADD COLUMN (?:IF NOT EXISTS )?${m.col}\\s+uuid[^;,]*REFERENCES|FOREIGN KEY\\s*\\(${m.col}\\)\\s*REFERENCES)`, "i").test(SQL_BUT_443)
  if (!inBody && !added) fkBad.push(`${m.table}.${m.col}`)
}
check("every index is on a column declared a foreign key, so a delete of its parent searched the table", fkBad.length === 0, fkBad)
check("every index is made only when its table and column are there, never twice, never beside an index led by its column, and is in the lock free file", guardBad.length === 0, guardBad)
check("the lock free file runs nothing but CREATE INDEX CONCURRENTLY, one line per index of the part", concurrent2.split("\n").filter((l) => l.trim() && !l.startsWith("--")).length === made2.length && concurrent2.split("\n").filter((l) => l.trim() && !l.startsWith("--")).every((l) => l.startsWith("CREATE INDEX CONCURRENTLY IF NOT EXISTS ")))
const WANTED: Array<[string, string]> = [
  ["community_spaces", "pinned_message_id"], ["store_theme_installs", "parent_install_id"], ["theme_publish_history", "install_id"], ["refunds", "order_id"], ["refunds", "entitlement_id"],
  ["notifications", "conversation_id"], ["notifications", "actor_id"], ["onepage_lead_magnets", "onepage_id"], ["course_progress", "course_id"], ["course_enrollments", "last_lesson_id"],
  ["product_bundles", "variant_id"], ["entitlements", "creator_id"], ["library_items", "user_id"], ["orders", "fulfillment_location_id"], ["products", "shipping_profile_id"], ["fulfillments", "package_id"],
]
check("the deletes the round named are covered: an account, a store, a website, products with variants and courses, refunds, notifications, OnePage, a pinned message, locations and shipping", WANTED.every(([t, c]) => made2.some((m) => m.table === t && m.col === c)), WANTED.filter(([t, c]) => !made2.some((m) => m.table === t && m.col === c)))
const SKIPPED = ["product_views", "site_rum_events", "site_rum_counters", "site_rum_daily", "site_web_vitals", "activity_push_queue", "ai_site_job_events", "shipping_zones"]
check("the tables left out on purpose are named in the header and get no index", SKIPPED.every((t) => lines2[0].includes(t.replace(/_/g, " ")) || lines2[0].includes(t)) && made2.every((m) => !SKIPPED.includes(m.table)), SKIPPED.filter((t) => made2.some((m) => m.table === t)))
check("a nullable column's index covers only the rows that are set, as the lock free file says too", made2.filter((m) => m.partialOn).length > 40 && made2.filter((m) => m.partialOn).every((m) => concurrent2.includes(`(${m.col}) WHERE ${m.col} IS NOT NULL;`)))

console.log("\nROUND TWO: THE GRANTS (part 443)")
const fnLine = lines2.find((l) => l.includes("FUNCTION public.community_space_counts(p_community_id uuid)")) ?? ""
check(
  "community_space_counts: SECURITY INVOKER, made only when its tables and columns are there, the service role's only",
  /LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp/.test(fnLine) &&
    fnLine.includes("REVOKE ALL ON FUNCTION public.community_space_counts(uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.community_space_counts(uuid) TO service_role;") &&
    fnLine.includes("to_regclass('public.community_messages') IS NULL") &&
    fnLine.includes("table_name = 'community_spaces' AND column_name = 'kind'") &&
    !/SECURITY DEFINER/.test(fnLine),
)
check(
  "the function counts by the old rule: every feed post of the space, and the messages of a chat space only",
  fnLine.includes("FROM public.community_feed_posts fp WHERE fp.space_id IN (SELECT x.id FROM public.community_spaces x WHERE x.community_id = p_community_id) GROUP BY fp.space_id") &&
    fnLine.includes("FROM public.community_messages cm WHERE cm.space_id IN (SELECT x.id FROM public.community_spaces x WHERE x.community_id = p_community_id AND x.kind = 'chat') GROUP BY cm.space_id") &&
    !/status/.test(fnLine.slice(fnLine.indexOf("$body$"))),
)
const rpcCallers = source.filter((f) => /rpc\(["']community_space_counts["']/.test(texts.get(f)!))
check("only the community admin's server code calls it", rpcCallers.length === 1 && rpcCallers[0] === "lib/communities/server/creator.ts", rpcCallers)
const spacesCallers = source.filter((f) => /\bloadSpaces\(/.test(texts.get(f)!) && f !== "lib/communities/server/creator.ts")
check(
  "and every caller of loadSpaces hands it the service role's client",
  spacesCallers.length > 0 &&
    spacesCallers.every((f) => {
      const t = texts.get(f)!
      return !browserish(f, t) && /loadSpaces\((ctx\.db|gate\.ctx\.admin)/.test(t)
    }) &&
    /return staffContext\(admin\(\), key/.test(creatorCode) &&
    /teamStaffContext\(admin\(\), key/.test(creatorCode),
  spacesCallers,
)
check(
  "cleanup_expired_auth_codes is the service role's, and nothing in the app calls it",
  part2.includes("REVOKE ALL ON FUNCTION public.cleanup_expired_auth_codes() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.cleanup_expired_auth_codes() TO service_role;") &&
    source.every((f) => !texts.get(f)!.includes("cleanup_expired_auth_codes")),
)
const CLOSED = ["auth_recovery_requests", "onepage_leads", "product_views", "blog_post_views"]
for (const t of CLOSED) {
  check(
    `${t}: its INSERT policies open to anybody are dropped by what they allow, not by one name`,
    part2.includes(`FROM pg_policies WHERE schemaname = 'public' AND tablename = '${t}' AND cmd = 'INSERT' AND coalesce(with_check, 'true') = 'true' AND roles && ARRAY['public', 'anon', 'authenticated']::name[] LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.${t}', r.policyname);`),
  )
  /* Every write to the table in the app: the client it goes through is the service role's. */
  const writers = source.filter((f) => new RegExp(`from\\(["']${t}["']\\)\\s*\\.(insert|upsert)`).test(texts.get(f)!.replace(/\s+/g, " ")))
  const viaSession = writers.filter((f) => {
    const t2 = texts.get(f)!
    if (browserish(f, t2)) return true
    const flat = t2.replace(/\s+/g, " ")
    const vars = [...flat.matchAll(new RegExp(`(\\w+)\\s*\\.from\\(["']${t}["']\\)\\s*\\.(?:insert|upsert)`, "g"))].map((m) => m[1])
    return vars.some((v) => {
      if (v === "db" && f === "lib/onepage/signup-server.ts") {
        /* saveLead(db, ...): every route that calls it makes db with createAdminClient. */
        const callers = source.filter((g) => g !== f && /\bsaveLead\(/.test(texts.get(g)!))
        return callers.length === 0 || callers.some((g) => !/const db = createAdminClient\(\)/.test(texts.get(g)!))
      }
      return !new RegExp(`const ${v} = createAdminClient\\(\\)`).test(flat)
    })
  })
  check(`${t}: every write in the app goes through the service role (${writers.length} ${writers.length === 1 ? "file" : "files"})`, viaSession.length === 0, viaSession)
}
check("auth_recovery_requests is never written by the app at all, only cleared by the account deletion", source.every((f) => !/from\(["']auth_recovery_requests["']\)\s*\.(insert|upsert)/.test(texts.get(f)!)))
const track = code("app/api/onepage/track/route.ts")
check(
  "onepage_views and onepage_clicks keep their policies: app/api/onepage/track writes them with the visitor's client",
  /const supabase = await createClient\(\)/.test(track) &&
    /await supabase\.from\("onepage_views"\)\.insert\(/.test(track) &&
    /await supabase\.from\("onepage_clicks"\)\.insert\(/.test(track) &&
    !/onepage_views|onepage_clicks/.test(lines2.slice(1).join("\n")),
)

console.log("\nROUND TWO: THE COPIES (part 443)")
check("the migration is the part, byte for byte", read(MIGRATION2) === part2)
check("every line of the part is one whole statement", lines2.slice(1).every((l) => /;$/.test(l)) && lines2[0].startsWith("/*") && lines2[0].endsWith("*/"))
check("no row changes: no INSERT, UPDATE or DELETE of data", !/\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/.test(part2))
check("the README has its row, with the lock warning and the lock free file", /\| `443_database_load_round_two\.sql` \|[^\n]*RUN_REL2_DB_INDEXES_CONCURRENTLY\.sql[^\n]*\| 96 \| 113,\d{3} \|/.test(readme))
check("the check after has its column, naming every index, the function and the four tables", / as p443_database_load_round_two[,;]/.test(after) && made2.every((m) => after.includes(`('${m.table}', '${m.col}', '${m.name}')`)) && after.includes("to_regprocedure('public.community_space_counts(uuid)')") && after.includes("'auth_recovery_requests', 'onepage_leads', 'product_views', 'blog_post_views'"))
for (const f of ["supabase/sql/run-four/3_of_4_latest.sql", "supabase/sql/all-in-two/1_of_2_everything.sql", "supabase/sql/all-in-three/2_of_3_latest.sql"]) {
  check(`${f} carries part 443`, read(f).includes(lines2[1]) && read(f).includes(lines2[lines2.length - 2]))
}
check("the admin's SQL catalog lists the part and the lock free file", read("lib/admin/sql-catalog.generated.json").includes("443_database_load_round_two.sql") && read("lib/admin/sql-catalog.generated.json").includes("RUN_REL2_DB_INDEXES_CONCURRENTLY.sql"))
check("the applied parts list has it", /part: "443", file: "443_database_load_round_two\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))

console.log("\nROUND TWO: ONE READ FOR A COMMUNITY'S SPACES")
type SpaceFixture = { id: string; kind: string }
const SPACES: SpaceFixture[] = [
  { id: "s-feed", kind: "feed" },
  { id: "s-chat", kind: "chat" },
  { id: "s-both", kind: "chat" },
  { id: "s-empty", kind: "feed" },
]
const POSTS: Record<string, number> = { "s-feed": 7, "s-both": 2 }
const MESSAGES: Record<string, number> = { "s-chat": 11, "s-both": 5, "s-feed": 4 }
function spacesDb(rpc: () => { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls = { rpc: 0, counts: 0, rpcArgs: null as unknown }
  const db = {
    rpc(name: string, args: unknown) {
      calls.rpc++
      calls.rpcArgs = { name, args }
      return Promise.resolve(rpc())
    },
    from(table: string) {
      if (table === "community_spaces") {
        const rows = SPACES.map((s, i) => ({ ...s, slug: s.id, name: s.id, description: null, icon: null, position: i, post_role: "member", comments_enabled: true, view_access: {}, archived_at: null }))
        const q = { eq: () => q, order: () => q, limit: () => Promise.resolve({ data: rows, error: null }) }
        return { select: () => q }
      }
      return {
        select: () => ({
          eq: (_k: string, id: string) => {
            calls.counts++
            return Promise.resolve({ count: (table === "community_feed_posts" ? POSTS : MESSAGES)[id] ?? 0, error: null })
          },
        }),
      }
    },
  }
  return { db, calls }
}
async function spaceCountsChecks() {
  const old = spacesDb(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.community_space_counts(p_community_id) in the schema cache" } }))
  const before = (await loadSpaces(old.db, "c-1")).map((s) => [s.id, s.posts])
  check("without the function: the counts are asked as before, two for a chat space and one for a feed", old.calls.rpc === 1 && old.calls.counts === SPACES.length + SPACES.filter((s) => s.kind === "chat").length, old.calls)
  check("and the posts are what they were: a feed's posts, a chat's messages when it has no posts", JSON.stringify(before) === JSON.stringify([["s-feed", 7], ["s-chat", 11], ["s-both", 2], ["s-empty", 0]]), before)
  /* What community_space_counts answered on the harness for the same rows: bigint as numbers or strings, the messages of a chat space only. */
  const grouped = spacesDb(() => ({ data: [{ space_id: "s-feed", posts: 7, messages: 0 }, { space_id: "s-chat", posts: "0", messages: "11" }, { space_id: "s-both", posts: 2, messages: 5 }, { space_id: "s-empty", posts: 0, messages: 0 }], error: null }))
  const after = (await loadSpaces(grouped.db, "c-1")).map((s) => [s.id, s.posts])
  check("with the function: one read for the whole community, no count per space", grouped.calls.rpc === 1 && grouped.calls.counts === 0 && JSON.stringify(grouped.calls.rpcArgs) === JSON.stringify({ name: "community_space_counts", args: { p_community_id: "c-1" } }), grouped.calls)
  check("and the same posts on every space as the counts gave", JSON.stringify(after) === JSON.stringify(before), { before, after })
  const pg = spacesDb(() => ({ data: null, error: { code: "42883", message: "function public.community_space_counts(uuid) does not exist" } }))
  const viaPg = (await loadSpaces(pg.db, "c-1")).map((s) => [s.id, s.posts])
  check("Postgres's own missing function code (42883) falls back the same way", JSON.stringify(viaPg) === JSON.stringify(before) && pg.calls.counts > 0)
  const down = spacesDb(() => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }))
  const quiet = console.error
  console.error = () => {}
  const failed = await loadSpaces(down.db, "c-1").finally(() => {
    console.error = quiet
  })
  check("any other failure: every space still listed, each at 0 as a failed count read, and no burst of counts after it", failed.length === SPACES.length && failed.every((s) => s.posts === 0) && down.calls.counts === 0, down.calls)
}

sideBySide()
  .then(spaceCountsChecks)
  .then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
})
