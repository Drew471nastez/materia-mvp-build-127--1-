/**
 * DATABASE LOAD (round r48-db)
 *
 * 1. SQL PART 353, ROW LEVEL SECURITY. Every policy in the public schema that
 *    called auth.uid(), auth.jwt() or auth.role() bare now calls
 *    (select auth.x()), which Postgres works out once per query. The fixture
 *    is pg_policies read from local Postgres 16 (scripts/sql-harness) before
 *    and after the part: each changed policy keeps its command and roles, and
 *    its new text is its old text word for word once each (select auth.x())
 *    is read as auth.x(). The part checks the same on the database it runs on
 *    and puts a policy back if not.
 * 2. SQL PART 353, PRODUCT COUNTERS. A view or a sale counted no longer moves
 *    products.updated_at (the sitemap's lastmod); every other change does.
 * 3. THE ORDERS PAGE'S PRODUCTS. Five columns instead of `*`, a page of 1,000
 *    at a time (one read stopped at 1,000), `*` again only when the database
 *    refuses a column.
 * 4. THE /app SHELL'S "FIRST SALE". One lookup by the order's own creator,
 *    not a join through products under every orders policy (one of which
 *    reads auth.users, which a signed in user may not read).
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { CREATOR_PRODUCT_CEILING, CREATOR_PRODUCT_COLUMNS, CREATOR_PRODUCT_PAGE, OrdersReadError, readCreatorProducts } from "../lib/orders/load-rows"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}`}`)
  }
}

const PART = "supabase/sql/run-now/353_rls_initplan_and_product_counters.sql"
const WRAPPED = /\( SELECT auth\.(uid|jwt|role|email)\(\) AS (uid|jwt|role|email)\)/g
const BARE = /auth\.(uid|jwt|role|email)\(\)/
const unwrap = (s: string | null) => (s === null ? null : s.replace(WRAPPED, (_m, fn) => `auth.${fn}()`))
const hasBare = (s: string | null) => s !== null && BARE.test(s.replace(WRAPPED, ""))
/* The part's own text change, as its regexp_replace calls make it: already wrapped calls kept, bare ones wrapped. */
const wrapLikeThePart = (s: string | null) =>
  s === null ? null : s.replace(WRAPPED, (_m, fn) => `\u0001${fn}\u0002`).replace(/auth\.(uid|jwt|role|email)\(\)/g, (_m, fn) => `( SELECT auth.${fn}() AS ${fn})`).replace(/\u0001(uid|jwt|role|email)\u0002/g, (_m, fn) => `( SELECT auth.${fn}() AS ${fn})`)

type Policy = { table: string; policy: string; cmd: string; roles: string; before: { using: string | null; check: string | null }; after: { using: string | null; check: string | null } }

/* A products table answering the way PostgREST does: a page per range, an error for a column it does not have. */
function productsDb(count: number, opts: { missing?: string; failAt?: number } = {}) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, title: `Product ${i}`, type: "digital", thumbnail_url: i % 2 ? `https://cdn.example.com/${i}.jpg` : null, gallery_urls: [`https://cdn.example.com/g${i}.jpg`], description: "x".repeat(2000), created_at: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString() }))
  const calls: { columns: string; from: number; to: number; eq: [string, unknown][]; order: string[] }[] = []
  const db = {
    calls,
    from(table: string) {
      if (table !== "products") throw new Error(`unexpected table ${table}`)
      const call = { columns: "", from: 0, to: 0, eq: [] as [string, unknown][], order: [] as string[] }
      const q: any = {
        select(columns: string) {
          call.columns = columns
          return q
        },
        eq(col: string, v: unknown) {
          call.eq.push([col, v])
          return q
        },
        order(col: string, o: { ascending: boolean }) {
          call.order.push(`${col} ${o.ascending ? "asc" : "desc"}`)
          return q
        },
        range(a: number, b: number) {
          call.from = a
          call.to = b
          calls.push(call)
          if (opts.missing && call.columns.split(",").map((c) => c.trim()).includes(opts.missing)) return Promise.resolve({ data: null, error: { code: "42703", message: `column products.${opts.missing} does not exist` } })
          if (opts.failAt !== undefined && calls.length - 1 === opts.failAt) return Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } })
          return Promise.resolve({ data: rows.slice(a, b + 1), error: null })
        },
      }
      return q
    },
  }
  return db
}

async function run() {
  console.log("\n1. Part 353: every policy keeps its meaning")
  const fixture = JSON.parse(readFileSync("tests/fixtures/db-r48-policies.json", "utf8")) as { total_public_policies: number; changed: Policy[] }
  const changed = fixture.changed
  check(`the fixture holds the policies the part changed (${changed.length} of ${fixture.total_public_policies})`, changed.length >= 150 && fixture.total_public_policies > changed.length)
  check("  on the tables the audit named (DB-13) among them", ["email_events", "site_rum_events", "campaign_recipients", "digital_assets", "ai_memories", "store_offers", "orders", "products"].filter((t) => changed.some((p) => p.table === t)).length >= 6, [...new Set(changed.map((p) => p.table))].slice(0, 20))
  const before = changed.filter((p) => hasBare(p.before.using) || hasBare(p.before.check))
  check("each one called auth.* bare before", before.length === changed.length, changed.filter((p) => !before.includes(p)).map((p) => `${p.table}.${p.policy}`))
  const stillBare = changed.filter((p) => hasBare(p.after.using) || hasBare(p.after.check))
  check("none calls auth.* bare after", stillBare.length === 0, stillBare.map((p) => `${p.table}.${p.policy}`))
  const differs = changed.filter((p) => unwrap(p.after.using) !== unwrap(p.before.using) || unwrap(p.after.check) !== unwrap(p.before.check))
  check("each after text is its before text word for word, once (select auth.x()) reads as auth.x()", differs.length === 0, differs.slice(0, 3))
  const usingKept = changed.filter((p) => (p.before.using === null) !== (p.after.using === null) || (p.before.check === null) !== (p.after.check === null))
  check("  no USING or WITH CHECK added or taken away", usingKept.length === 0, usingKept.map((p) => `${p.table}.${p.policy}`))
  const asStored = changed.filter((p) => wrapLikeThePart(p.before.using) !== p.after.using || wrapLikeThePart(p.before.check) !== p.after.check)
  check("  and Postgres stored exactly the text the part's replacement makes", asStored.length === 0, asStored.slice(0, 2))
  const buyers = changed.find((p) => p.table === "orders" && p.policy === "Buyers can view own orders")
  check("an orders policy, spelled out: the buyer's own orders, by id or by the account's address", !!buyers && buyers.after.using === "((buyer_id = ( SELECT auth.uid() AS uid)) OR (buyer_email = (( SELECT users.email\n   FROM auth.users\n  WHERE (users.id = ( SELECT auth.uid() AS uid))))::text))" && buyers.cmd === "SELECT" && buyers.roles === "{authenticated}", buyers)
  const sample = changed.find((p) => p.table === "onepage_billing" && p.policy === "System can manage billing")
  check("a service role policy keeps its test: auth.role() = 'service_role'", !!sample && sample.before.using === "(auth.role() = 'service_role'::text)" && sample.after.using === "(( SELECT auth.role() AS role) = 'service_role'::text)", sample)

  console.log("\n2. Part 353: the file")
  const part = readFileSync(PART, "utf8")
  const code = part.replace(/^\/\*[\s\S]*?\*\/\n/, "")
  const lines = code.trim().split("\n")
  check("one whole statement per line, two DO blocks then the schema reload", lines.length === 3 && lines.slice(0, 2).every((l) => /^DO \$do\$[\s\S]*END \$do\$;$/.test(l)) && lines[2] === "notify pgrst, 'reload schema';", lines.map((l) => l.slice(0, 60)))
  check("policies change only through ALTER POLICY (name, command and roles kept); none dropped or made", /ALTER POLICY %I ON public\.%I/.test(code) && !/\b(DROP|CREATE) POLICY\b/i.test(code))
  check("  public schema only (storage is part 90's)", /p\.schemaname = 'public'/.test(code) && !/storage\./.test(code))
  check("  each one read back and put back as it was unless it matches word for word", /IF NOT coalesce\(same, false\) THEN RAISE EXCEPTION/.test(code) && /EXCEPTION WHEN OTHERS THEN kept := kept \+ 1; RAISE NOTICE/.test(code) && /regexp_replace\(p\.qual, wrapped, 'auth\.\\1\(\)', 'g'\) IS NOT DISTINCT FROM regexp_replace\(r\.qual, wrapped, 'auth\.\\1\(\)', 'g'\)/.test(code))
  check("  the wrap is (select auth.x()), and calls already wrapped are kept", /bare, '\( SELECT auth\.\\1\(\) AS \\1\)'/.test(code) && /wrapped, chr\(1\) \|\| '\\1' \|\| chr\(2\)/.test(code))
  check("no index dropped, no row written", !/\bDROP INDEX\b|\bDELETE FROM\b|\bINSERT INTO\b|\bUPDATE public\./i.test(code))
  check("counters: updated_at kept only when views or sales_count alone changed", /IF \(NEW\.views IS DISTINCT FROM OLD\.views OR NEW\.sales_count IS DISTINCT FROM OLD\.sales_count\) AND \(to_jsonb\(NEW\) - ARRAY\['views', 'sales_count', 'updated_at', 'is_on_sale'\]\) = \(to_jsonb\(OLD\) - ARRAY\['views', 'sales_count', 'updated_at', 'is_on_sale'\]\) THEN RETURN NEW; END IF; NEW\.updated_at = now\(\); RETURN NEW;/.test(code))
  check("  the trigger is swapped only while it still calls update_updated_at_column", /t\.tgfoid = to_regprocedure\('public\.update_updated_at_column\(\)'\)\) THEN DROP TRIGGER set_products_updated_at ON public\.products; CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public\.products FOR EACH ROW EXECUTE FUNCTION public\.storelib_products_updated_at\(\);/.test(code))
  check("  and skipped with a notice where products or its columns are missing", /public\.products does not exist here/.test(code) && /products has no views, sales_count or updated_at column here/.test(code))
  check("the migration is a byte copy", readFileSync("supabase/migrations/20271107_rls_initplan_and_product_counters.sql", "utf8") === part)
  check("the README has its row and the check after its column", /\| `353_rls_initplan_and_product_counters\.sql` \|/.test(readFileSync("supabase/sql/run-now/README.md", "utf8")) && /* Changed on purpose (round 48, part 354 follows it) */ /as p353_rls_initplan_and_product_counters[;,]/.test(readFileSync("supabase/sql/run-now/99_check_after.sql", "utf8")))
  check("  and the bundles carry it", /part 353: % policies now read the signed in user once per query/.test(readFileSync("supabase/sql/run-four/3_of_4_latest.sql", "utf8")) && /part 353: % policies now read/.test(readFileSync("supabase/sql/all-in-two/1_of_2_everything.sql", "utf8")))

  console.log("\n3. The Orders page reads five columns of its products, a page at a time")
  check("the columns are what productsOf draws", CREATOR_PRODUCT_COLUMNS === "id, title, type, thumbnail_url, gallery_urls" && CREATOR_PRODUCT_PAGE === 1000 && CREATOR_PRODUCT_CEILING === 20_000)
  {
    const db = productsDb(2500)
    const list = await readCreatorProducts(db, "creator-1")
    check("2,500 products: every one comes back (one read used to stop at 1,000)", list.length === 2500 && list[2499].id === "p2499", list.length)
    check("  in three reads of 1,000, newest first, by the creator", db.calls.length === 3 && db.calls.map((c) => `${c.from}-${c.to}`).join() === "0-999,1000-1999,2000-2999" && db.calls.every((c) => c.columns === CREATOR_PRODUCT_COLUMNS && c.order.join() === "created_at desc,id desc" && c.eq.length === 1 && c.eq[0][0] === "creator_id" && c.eq[0][1] === "creator-1"), db.calls.map((c) => c.columns))
    check("  each named with a title, a type and a picture, never the description", list[1].title === "Product 1" && list[1].type === "digital" && list[1].thumbnail_url === "https://cdn.example.com/1.jpg" && list[0].thumbnail_url === "https://cdn.example.com/g0.jpg" && !("description" in list[0]))
  }
  {
    const db = productsDb(40)
    await readCreatorProducts(db, "creator-1")
    check("a small store is still one read", db.calls.length === 1)
  }
  {
    const db = productsDb(30, { missing: "gallery_urls" })
    const list = await readCreatorProducts(db, "creator-1")
    check("a database without one of the columns is read with * as before", list.length === 30 && db.calls.length === 2 && db.calls[1].columns === "*")
  }
  {
    const db = productsDb(30, { failAt: 0 })
    let threw: unknown = null
    try {
      await readCreatorProducts(db, "creator-1")
    } catch (e) {
      threw = e
    }
    check("a failed read stops the page (OrdersReadError), never an empty list", threw instanceof OrdersReadError && db.calls.length === 1)
  }
  const loadRows = readCode("lib/orders/load-rows.ts")
  check("no products read with * in lib/orders/load-rows except the fallback", !/from\("products"\)\.select\("\*"\)/.test(loadRows) && /answer = await read\("\*"\)/.test(loadRows) && /const productsRead = readCreatorProducts\(admin, creatorId\)/.test(loadRows))

  console.log("\n4. The /app shell's first sale: one lookup by the order's creator")
  const layout = readCode("app/(storelib)/app/layout.tsx")
  check("no orders read through products on the caller's client", !/from\("orders"\)/.test(layout) && !/products!inner\(creator_id\)/.test(layout))
  check("  the store's own orders, one id, failed, pending and disputed left out", /scopedOrders\(admin, "id", scope, creatorId, null\)\.not\("status", "in", "\(failed,pending,disputed\)"\)\.limit\(1\)/.test(layout) && /storeHasSale\(creator\.id\)/.test(layout))
  check("  by orders.creator_id, through the product before part 32 (byCreator)", /await byCreator\(async \(scope\) =>/.test(layout) && /from "@\/lib\/analytics\/creator-orders"/.test(layout))
  check("  a failed read is no sale, as before (the ring only decorates)", /catch \{\s*return \{ data: null \}/.test(layout) && /\{ data: aSale \}/.test(layout))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) {
    console.log(`Failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
