/**
 * ===========================================================================
 *  "I TRIED TO DELETE THAT PRODUCT AND IT DIDN'T DELETE IT"
 * ===========================================================================
 * The owner, on an iPhone, in the product editor of "Tech House Master
 * Bundle 2025".
 *
 * WHAT WAS WRONG, three things, each pinned here:
 *
 *   1. The editor's more menu had no Delete at all (View on your page and
 *      Publish or Unpublish), so the only delete was the Products list's.
 *
 *   2. The list deleted in the browser, and only changed the list on the
 *      screen. /app pages are kept by the router for five minutes
 *      (next.config staleTimes) and the list draws the products it was
 *      rendered with, so going back to Products drew the deleted product
 *      again, and its editor, fetched ahead in full, opened with it in it.
 *
 *   3. A product with a paid sale could not be deleted where run-now part 32
 *      has not run: orders referenced products ON DELETE CASCADE and every
 *      paid sale wrote a ledger_events row whose order_id references orders
 *      with no ON DELETE rule, so Postgres refused (23503). Where there was
 *      no ledger row, the delete went through and took the orders with it.
 *
 * WHAT IS PINNED. The server's delete (lib/products/delete-product.ts)
 * against a stand-in database that has the foreign keys of both kinds of
 * database: a product with no orders is deleted; one with orders is deleted
 * with its orders kept where part 32 ran, and archived with its orders kept,
 * and the one line why, where it did not; a delete ownership or row level
 * security refuses is a failure, never a success. Then the list's memory of
 * this tab's changes, so a kept copy of the list never draws a deleted
 * product again, the browser half of the request, and the screens that use
 * them.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { ARCHIVED_FOR_LINKS, ARCHIVED_FOR_SALES, deleteOwnProduct, ordersOutliveProducts } from "@/lib/products/delete-product"
import { deleteProduct, isStale, leaveNotice, rememberDeleted, rememberStatus, takeNotice, withChanges } from "@/lib/products/delete-client"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : ` (${JSON.stringify(detail)})`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

/* ── A database with the foreign keys a real one has ────────────────────── */

const ME = "11111111-1111-4111-8111-111111111111"
const SOMEONE = "22222222-2222-4222-8222-222222222222"
const BUNDLE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

type Product = { id: string; creator_id: string; slug: string; status: string; archived: boolean }
type Order = { id: string; product_id: string | null; amount_cents: number }

interface DbShape {
  products: Product[]
  orders: Order[]
  /** Order ids a ledger_events row points at (orders.id, no ON DELETE rule). */
  ledger: string[]
  /** Run-now part 32: orders.creator_id is there and products -> orders is SET NULL. */
  part32: boolean
  /** Row level security that lets nothing be deleted (no error, no rows). */
  rlsRefuses?: boolean
  /** A foreign key this repository does not know, refusing any product delete. */
  unknownFk?: boolean
  /** A status check from before "archived". */
  noArchivedStatus?: boolean
  /** The orders count cannot be read. */
  ordersUnreadable?: boolean
  calls: string[]
}

function makeDb(shape: Partial<DbShape>): DbShape & { from: (t: string) => any } {
  const db: DbShape = { products: [], orders: [], ledger: [], part32: false, calls: [], ...shape }
  class Query {
    op = "select"
    cols = ""
    opts: { count?: string; head?: boolean } = {}
    filters: Array<[string, unknown]> = []
    patch: Record<string, unknown> = {}
    one = false
    returning: string | null = null
    constructor(readonly table: string) {}
    select(cols: string, opts?: { count?: string; head?: boolean }) {
      if (this.op === "select") {
        this.cols = cols
        this.opts = opts ?? {}
      } else this.returning = cols
      return this
    }
    eq(k: string, v: unknown) {
      this.filters.push([k, v])
      return this
    }
    limit() {
      return this
    }
    maybeSingle() {
      this.one = true
      return this
    }
    delete() {
      this.op = "delete"
      return this
    }
    update(patch: Record<string, unknown>) {
      this.op = "update"
      this.patch = patch
      return this
    }
    matches(row: Record<string, unknown>) {
      return this.filters.every(([k, v]) => row[k] === v)
    }
    then<A, B>(ok: (v: unknown) => A, no?: (e: unknown) => B) {
      return Promise.resolve().then(() => this.run()).then(ok, no)
    }
    run(): { data: unknown; error: unknown; count?: number | null } {
      db.calls.push(`${this.op} ${this.table}${this.op === "select" ? ` ${this.cols}` : ""}`)
      if (this.table === "orders") {
        if (this.op !== "select") throw new Error("the delete must never write orders")
        if (/creator_id/.test(this.cols) && !db.part32) return { data: null, error: { code: "42703", message: "column orders.creator_id does not exist" } }
        if (this.opts.head) {
          if (db.ordersUnreadable) return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" }, count: null }
          return { data: null, error: null, count: db.orders.filter((o) => this.matches(o)).length }
        }
        return { data: db.orders.slice(0, 1), error: null }
      }
      if (this.table !== "products") throw new Error(`unexpected table ${this.table}`)
      const hits = db.products.filter((p) => this.matches(p))
      if (this.op === "select") return { data: this.one ? (hits[0] ?? null) : hits, error: null }
      if (this.op === "update") {
        if (db.noArchivedStatus && this.patch.status === "archived") return { data: null, error: { code: "23514", message: "violates check constraint products_status_check" } }
        for (const p of hits) Object.assign(p, this.patch)
        return { data: hits.map((p) => ({ ...p })), error: null }
      }
      /* delete */
      if (db.rlsRefuses) return { data: [], error: null }
      if (db.unknownFk && hits.length) return { data: null, error: { code: "23503", message: 'update or delete on table "products" violates foreign key constraint' } }
      for (const p of hits) {
        const its = db.orders.filter((o) => o.product_id === p.id)
        if (db.part32) {
          for (const o of its) o.product_id = null
        } else {
          /* ON DELETE CASCADE, and the ledger's order_id with no rule refuses it. */
          if (its.some((o) => db.ledger.includes(o.id))) {
            return { data: null, error: { code: "23503", message: 'update or delete on table "orders" violates foreign key constraint "ledger_events_order_id_fkey" on table "ledger_events"' } }
          }
          db.orders = db.orders.filter((o) => o.product_id !== p.id)
        }
      }
      db.products = db.products.filter((p) => !hits.includes(p))
      return { data: hits.map((p) => ({ id: p.id })), error: null }
    }
  }
  return Object.assign(db, { from: (t: string) => new Query(t) })
}

const bundle = (): Product => ({ id: BUNDLE, creator_id: ME, slug: "tech-house-master-bundle-2025", status: "published", archived: false })
const sales = (): Order[] => [
  { id: "o1", product_id: BUNDLE, amount_cents: 2900 },
  { id: "o2", product_id: BUNDLE, amount_cents: 2900 },
]

async function main() {
  console.log("\n  a product with no orders")
  {
    const db = makeDb({ products: [bundle()] })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("is deleted", r.kind === "deleted", r)
    check("and is gone from the database", db.products.length === 0)
  }
  {
    /* Part 32 or not makes no difference to a product nobody bought. */
    const db = makeDb({ products: [bundle()], part32: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("is deleted on a database that has run part 32 too", r.kind === "deleted" && db.products.length === 0, r)
  }

  console.log("\n  a product with orders, where part 32 has run")
  {
    const db = makeDb({ products: [bundle()], orders: sales(), ledger: ["o1"], part32: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("is deleted", r.kind === "deleted" && db.products.length === 0, r)
    check("and every order is kept, with no product", db.orders.length === 2 && db.orders.every((o) => o.product_id === null && o.amount_cents === 2900), db.orders)
  }

  console.log("\n  a product with orders, where part 32 has not run")
  {
    const db = makeDb({ products: [bundle()], orders: sales(), ledger: ["o1"], part32: false })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("is archived rather than deleted", r.kind === "archived" && r.reason === "sales", r)
    check("with one plain line that says why", r.kind === "archived" && r.message === ARCHIVED_FOR_SALES && !/—/.test(r.message), r)
    check("off every page: archived by status and by the flag", db.products[0]?.status === "archived" && db.products[0]?.archived === true, db.products)
    check("its orders are untouched", db.orders.length === 2 && db.orders.every((o) => o.product_id === BUNDLE), db.orders)
    check("and no delete was even tried, so nothing could cascade", !db.calls.some((c) => c.startsWith("delete")), db.calls)
  }
  {
    /* The owner's own case if the ledger is empty: before, the delete went through and took the orders. */
    const db = makeDb({ products: [bundle()], orders: sales(), ledger: [], part32: false })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("with no ledger row either, the orders are still kept (a cascade would have deleted them)", r.kind === "archived" && db.orders.length === 2, { r, orders: db.orders.length })
  }
  {
    const db = makeDb({ products: [bundle()], orders: sales(), part32: false, noArchivedStatus: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("a status check from before archived: a draft with the flag, off every page just the same",
      r.kind === "archived" && db.products[0]?.status === "draft" && db.products[0]?.archived === true, db.products)
  }
  {
    const db = makeDb({ part32: false })
    check("part 32 is read as orders.creator_id being there", (await ordersOutliveProducts(db)) === false && (await ordersOutliveProducts(makeDb({ part32: true }))) === true)
  }

  console.log("\n  a delete that is refused is never reported as done")
  {
    const db = makeDb({ products: [{ ...bundle(), id: THEIRS, creator_id: SOMEONE }] })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: THEIRS })
    check("another creator's product: not found, and untouched", r.kind === "failed" && r.status === 404 && db.products.length === 1, r)
    check("looked up by the caller's own creator id", db.calls[0] === "select products id, slug, status")
  }
  {
    const db = makeDb({ products: [bundle()], rlsRefuses: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("row level security deleting nothing, with no error: a failure", r.kind === "failed" && db.products.length === 1, r)
  }
  {
    const db = makeDb({ products: [bundle()], ordersUnreadable: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("sales that cannot be counted: a failure, nothing deleted", r.kind === "failed" && db.products.length === 1 && /Nothing was deleted/.test(r.kind === "failed" ? r.error : ""), r)
  }
  {
    const db = makeDb({ products: [bundle()], unknownFk: true, part32: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("a foreign key nobody knew about (23503): archived, since the refused delete changed nothing",
      r.kind === "archived" && r.reason === "linked" && r.message === ARCHIVED_FOR_LINKS && db.products[0]?.status === "archived", r)
  }
  {
    const r1 = await deleteOwnProduct(makeDb({ products: [bundle()] }), { creatorId: "", productId: BUNDLE })
    const r2 = await deleteOwnProduct(makeDb({ products: [bundle()] }), { creatorId: ME, productId: "../products" })
    check("no store on the account, or not a product id: refused before anything is read", r1.kind === "failed" && r2.kind === "failed" && r2.status === 400)
  }

  console.log("\n  the list never draws a deleted product again")
  {
    type Row = { id: string; status: string; archived?: boolean }
    const kept: Row[] = [
      { id: BUNDLE, status: "published", archived: false },
      { id: "p2", status: "published", archived: false },
      { id: "p3", status: "draft", archived: false },
    ]
    check("before anything changed, the kept copy is current", !isStale(kept) && withChanges(kept).length === 3)
    rememberDeleted(BUNDLE)
    const drawn = withChanges(kept)
    check("a copy the router kept from before the delete: the product is not drawn", drawn.length === 2 && !drawn.some((p) => p.id === BUNDLE), drawn.map((p) => p.id))
    check("and the copy is known to be out of date, so the kept pages are dropped", isStale(kept))
    check("a fresh copy, without it, is current", !isStale(kept.filter((p) => p.id !== BUNDLE)))
    rememberStatus("p2", { status: "archived", archived: true })
    const archived = withChanges(kept).find((p) => p.id === "p2")
    check("an archive from the editor is drawn archived on the kept copy", archived?.status === "archived" && archived?.archived === true, archived)
    check("and a fresh copy that already says archived is current", !isStale([{ id: "p2", status: "archived", archived: true }]))
    leaveNotice("Product deleted")
    check("the editor's line is shown once by the list", takeNotice() === "Product deleted" && takeNotice() === null)
  }

  console.log("\n  the browser's half: an answer, or an error, never a guess")
  {
    const real = globalThis.fetch
    const answer = (status: number, body: unknown) => {
      globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch
    }
    answer(200, { ok: true, outcome: "deleted", status: "published", slug: "x" })
    const d = await deleteProduct(BUNDLE)
    check("deleted", d.outcome === "deleted")
    answer(200, { ok: true, outcome: "archived", message: ARCHIVED_FOR_SALES, status: "archived", archived: true })
    const a = await deleteProduct(BUNDLE)
    check("archived, with the line", a.outcome === "archived" && a.message === ARCHIVED_FOR_SALES)
    answer(409, { ok: false, error: "Could not delete the product" })
    let refused = ""
    try {
      await deleteProduct(BUNDLE)
    } catch (e) {
      refused = (e as Error).message
    }
    check("refused: it throws, with the server's words", refused === "Could not delete the product", refused)
    answer(200, { ok: true })
    let odd = ""
    try {
      await deleteProduct(BUNDLE)
    } catch (e) {
      odd = (e as Error).message
    }
    check("an answer that is neither: it throws", odd !== "", odd)
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch")
    }) as typeof fetch
    let offline = ""
    try {
      await deleteProduct(BUNDLE)
    } catch (e) {
      offline = (e as Error).message
    }
    check("no connection: it throws, and says nothing was deleted", /Nothing was deleted/.test(offline), offline)
    globalThis.fetch = real
  }

  console.log("\n  the route")
  {
    const route = strip(read("app/api/products/delete/route.ts"))
    check("the creator is the session's", /supabase\.auth\.getUser\(\)/.test(route) && /\.from\("creators"\)\.select\("id"\)\.eq\("user_id", user\.id\)/.test(route))
    check("and the delete is lib/products/delete-product's", /deleteOwnProduct\(admin, \{ creatorId, productId \}\)/.test(route))
    check("a failure is answered with its status and words", /if \(result\.kind === "failed"\) return NextResponse\.json\(\{ ok: false, error: result\.error \}, \{ status: result\.status \}\)/.test(route))
    check("a deleted product: its caches and its OnePage blocks (#361)", /forgetDeletedProduct\(admin, \{ creatorId, productId/.test(route))
    check("an archived one: its caches only, its blocks kept for a restore", /purgeProductCaches\(\{ creatorId, productId/.test(route))
    const lib = strip(read("lib/products/delete-product.ts"))
    check("the delete is scoped to the caller's creator", /\.delete\(\)\s*\.eq\("id", productId\)\s*\.eq\("creator_id", creatorId\)\s*\.select\("id"\)/.test(lib))
    check("and counts the rows it deleted", /if \(!gone\.data \|\| gone\.data\.length === 0\) return \{ kind: "failed"/.test(lib))
    check("nothing in it deletes or writes an order", lib.includes('from("orders")') && lib.split('from("orders")').slice(1).every((chain) => !/^[^\n]*\.(delete|update|insert|upsert)\(/.test(chain)))
  }

  console.log("\n  the screens")
  {
    const list = strip(read("app/app/products/products-client.tsx"))
    check("the list deletes through the server", /await deleteProduct\(product\.id\)/.test(list))
    check("and no longer deletes in the browser", !/\.from\("products"\)\s*\.delete\(\)/.test(list))
    check("the list is drawn with this tab's changes applied", /useState<Product\[\]>\(\(\) => withChanges\(initialProducts\)\)/.test(list))
    check("a kept copy from before a change drops the router's kept pages", /if \(isStale\(initialProducts\)\) router\.refresh\(\)/.test(list))
    const confirm = list.slice(list.indexOf("const handleDeleteConfirm"), list.indexOf("const showView"))
    check("a delete refreshes the kept pages, only once it went through",
      /router\.refresh\(\)/.test(confirm) && confirm.indexOf("router.refresh()") > confirm.indexOf("await deleteProduct(") && confirm.indexOf("router.refresh()") < confirm.indexOf("catch (error)"))
    check("an archive instead is shown with its line", /showNotification\(result\.message\)/.test(confirm) && /rememberStatus\(product\.id, result\)/.test(confirm))
    check("a refusal is said in the question, which stays open", /setDeleteError\(/.test(confirm) && confirm.indexOf("closeDelete()") < confirm.indexOf("catch (error)") && /role="alert"[^>]*>\s*\{deleteError\}/.test(list))

    const editor = strip(read("app/app/products/new/product-editor.tsx"))
    check("the editor's more menu has Delete, last and apart, in red", /\{ label: "Delete", variant: "destructive" as const, separatorBefore: true, onClick: \(\) => void handleDeleteProduct\(\) \}/.test(editor))
    const del = editor.slice(editor.indexOf("const handleDeleteProduct"), editor.indexOf("const handleRedirectToProduct"))
    check("it asks first", /const sure = await ask\(\{/.test(del) && /if \(!sure\) return/.test(del))
    check("it deletes through the server", /await deleteProduct\(productId\)/.test(del) && !/\.delete\(\)/.test(del))
    check("a refusal is shown and the editor stays: no way back before the answer",
      /showToast\(/.test(del) && del.indexOf("return\n") < del.indexOf("returnToProducts(") && del.indexOf("returnToProducts(") > del.indexOf("await deleteProduct("))
    check("gone or archived, the list is told and the editor goes back to it",
      /rememberDeleted\(productId\)/.test(del) && /rememberStatus\(productId, result\)/.test(del) && /leaveNotice\(/.test(del) && /returnToProducts\(router, null\)/.test(del))
    check("the more button spins while it deletes", /deleting \? <ActivitySpinner/.test(editor))
    check("the editor's publish switch purges the caches too (#361 missed this screen)", /await forgetProduct\(productId, slug\)/.test(editor))

    const course = strip(read("components/app/course-edit-form.tsx"))
    check("the course editor deletes through the server", /await deleteProduct\(product\.id\)/.test(course) && !/\.from\("products"\)\.delete\(\)/.test(course))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
