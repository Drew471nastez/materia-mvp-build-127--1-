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
 *      And with or without part 32, a delete cascades to every buyer's
 *      entitlement and to the product's files.
 *
 * THE RULE NOW (the owner's priority: buyers' data first). A product with
 * any sale, meaning any order of any status or any entitlement, is always
 * archived and never deleted, with or without part 32. Only a product
 * nobody has bought, claimed or been given is deleted.
 *
 * WHAT IS PINNED. The server's delete (lib/products/delete-product.ts)
 * against a stand-in database with the foreign keys a real one has, both
 * before and after part 32: sales are archived with orders, entitlements
 * and files untouched; no sales is deleted; a delete ownership or row level
 * security refuses is a failure, never a success. The question asked before
 * the press says which it will be. Then the list's memory of this tab's
 * changes, the browser half of the request, and the screens that use them.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { ARCHIVED_FOR_LINKS, ARCHIVED_FOR_SALES, deleteOwnProduct, previewDelete, productHasSales } from "@/lib/products/delete-product"
import { deleteProduct, deleteQuestion, isStale, leaveNotice, previewProductDelete, rememberDeleted, rememberStatus, takeNotice, withChanges } from "@/lib/products/delete-client"
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

/* ── A database with the foreign keys a real one has ────────────────────── */

const ME = "11111111-1111-4111-8111-111111111111"
const SOMEONE = "22222222-2222-4222-8222-222222222222"
const BUNDLE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

type Product = { id: string; creator_id: string; slug: string; status: string; archived: boolean }
type Order = { id: string; product_id: string | null; amount_cents: number; status: string }
type Entitlement = { id: string; product_id: string; buyer_id: string }
type Asset = { id: string; product_id: string; file_path: string }
/* A OnePage lead magnet link (subscriber_digital_products), open until it expires. */
type LeadLink = { id: string; product_id: string; expires_at: string }

interface DbShape {
  products: Product[]
  orders: Order[]
  entitlements: Entitlement[]
  digital_assets: Asset[]
  subscriber_digital_products: LeadLink[]
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
  /** A count of this table cannot be read. */
  unreadable?: string
  /** This table is not in the database at all. */
  missing?: string
  calls: string[]
}

function makeDb(shape: Partial<DbShape>): DbShape & { from: (t: string) => any } {
  const db: DbShape = { products: [], orders: [], entitlements: [], digital_assets: [], subscriber_digital_products: [], ledger: [], part32: false, calls: [], ...shape }
  class Query {
    op = "select"
    cols = ""
    opts: { count?: string; head?: boolean } = {}
    filters: Array<[string, unknown]> = []
    after: Array<[string, string]> = []
    patch: Record<string, unknown> = {}
    one = false
    constructor(readonly table: string) {}
    select(cols: string, opts?: { count?: string; head?: boolean }) {
      if (this.op === "select") {
        this.cols = cols
        this.opts = opts ?? {}
      }
      return this
    }
    eq(k: string, v: unknown) {
      this.filters.push([k, v])
      return this
    }
    gt(k: string, v: string) {
      this.after.push([k, v])
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
    matches(row: object) {
      return (
        this.filters.every(([k, v]) => (row as Record<string, unknown>)[k] === v) &&
        this.after.every(([k, v]) => String((row as Record<string, unknown>)[k]) > v)
      )
    }
    then<A, B>(ok: (v: unknown) => A, no?: (e: unknown) => B) {
      return Promise.resolve().then(() => this.run()).then(ok, no)
    }
    run(): { data: unknown; error: unknown; count?: number | null } {
      db.calls.push(`${this.op} ${this.table}${this.op === "select" ? ` ${this.cols}` : ""}`)
      if (this.table === "orders" || this.table === "entitlements" || this.table === "digital_assets" || this.table === "subscriber_digital_products") {
        if (this.op !== "select") throw new Error(`the delete must never write ${this.table}`)
        if (db.missing === this.table) return { data: null, error: { code: "42P01", message: `relation "${this.table}" does not exist` }, count: null }
        if (db.unreadable === this.table) return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" }, count: null }
        const rows = (db[this.table] as object[]).filter((r) => this.matches(r))
        return this.opts.head ? { data: null, error: null, count: rows.length } : { data: rows, error: null }
      }
      if (this.table !== "products") throw new Error(`unexpected table ${this.table}`)
      const hits = db.products.filter((p) => this.matches(p))
      if (this.op === "select") return { data: this.one ? (hits[0] ?? null) : hits, error: null }
      if (this.op === "update") {
        if (db.noArchivedStatus && this.patch.status === "archived") return { data: null, error: { code: "23514", message: "violates check constraint products_status_check" } }
        for (const p of hits) Object.assign(p, this.patch)
        return { data: hits.map((p) => ({ ...p })), error: null }
      }
      /* delete, with the database's own rules */
      if (db.rlsRefuses) return { data: [], error: null }
      if (db.unknownFk && hits.length) return { data: null, error: { code: "23503", message: 'update or delete on table "products" violates foreign key constraint' } }
      for (const p of hits) {
        const its = db.orders.filter((o) => o.product_id === p.id)
        if (db.part32) {
          for (const o of its) o.product_id = null
        } else {
          if (its.some((o) => db.ledger.includes(o.id))) {
            return { data: null, error: { code: "23503", message: 'update or delete on table "orders" violates foreign key constraint "ledger_events_order_id_fkey" on table "ledger_events"' } }
          }
          db.orders = db.orders.filter((o) => o.product_id !== p.id)
        }
        /* ON DELETE CASCADE, before and after part 32: the buyers' access and the files go with it. */
        db.entitlements = db.entitlements.filter((e) => e.product_id !== p.id)
        db.digital_assets = db.digital_assets.filter((a) => a.product_id !== p.id)
        db.subscriber_digital_products = db.subscriber_digital_products.filter((l) => l.product_id !== p.id)
      }
      db.products = db.products.filter((p) => !hits.includes(p))
      return { data: hits.map((p) => ({ id: p.id })), error: null }
    }
  }
  return Object.assign(db, { from: (t: string) => new Query(t) })
}

const bundle = (): Product => ({ id: BUNDLE, creator_id: ME, slug: "tech-house-master-bundle-2025", status: "published", archived: false })
const sales = (status = "completed"): Order[] => [
  { id: "o1", product_id: BUNDLE, amount_cents: 2900, status },
  { id: "o2", product_id: BUNDLE, amount_cents: 2900, status },
]
const access = (): Entitlement[] => [
  { id: "e1", product_id: BUNDLE, buyer_id: "buyer-1" },
  { id: "e2", product_id: BUNDLE, buyer_id: "buyer-2" },
]
const files = (): Asset[] => [{ id: "f1", product_id: BUNDLE, file_path: "c1/tech-house.zip" }]

async function main() {
  console.log("\n  a product nobody bought is deleted")
  for (const part32 of [false, true]) {
    const db = makeDb({ products: [bundle()], digital_assets: files(), part32 })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check(`deleted, and gone from the database (part 32 ${part32 ? "run" : "not run"})`, r.kind === "deleted" && db.products.length === 0, r)
  }

  console.log("\n  a product with sales is archived, never deleted")
  for (const part32 of [false, true]) {
    const db = makeDb({ products: [bundle()], orders: sales(), entitlements: access(), digital_assets: files(), ledger: ["o1"], part32 })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    const tag = `(part 32 ${part32 ? "run" : "not run"})`
    check(`archived, not deleted ${tag}`, r.kind === "archived" && r.reason === "sales" && db.products.length === 1, r)
    check(`with one plain line that says why ${tag}`, r.kind === "archived" && r.message === ARCHIVED_FOR_SALES && !/—/.test(r.message))
    check(`off every page: archived by status and by the flag ${tag}`, db.products[0]?.status === "archived" && db.products[0]?.archived === true, db.products)
    check(`its orders untouched ${tag}`, db.orders.length === 2 && db.orders.every((o) => o.product_id === BUNDLE), db.orders)
    check(`every buyer keeps their access ${tag}`, db.entitlements.length === 2 && db.entitlements.every((e) => e.product_id === BUNDLE), db.entitlements)
    check(`and the files are still there ${tag}`, db.digital_assets.length === 1, db.digital_assets)
    check(`no delete was even tried ${tag}`, !db.calls.some((c) => c.startsWith("delete")), db.calls)
  }
  for (const status of ["pending", "refunded", "failed", "disputed"]) {
    const db = makeDb({ products: [bundle()], orders: sales(status), part32: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check(`an order of any status counts as a sale: ${status}`, r.kind === "archived" && db.products.length === 1, r)
  }
  {
    /* A free claim, a gift or an import: in somebody's library with no order at all. */
    const db = makeDb({ products: [bundle()], entitlements: access(), part32: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("an entitlement with no order counts too, so a free claim is never taken back", r.kind === "archived" && db.entitlements.length === 2, r)
  }
  {
    /*
      A OnePage lead magnet emailed this month: the email says the file is
      there for 30 days, and a delete would cascade the link away. Archived.
      One that has expired promises nothing any more, so it no longer stops a delete.
    */
    const now = Date.now()
    const open = makeDb({ products: [bundle()], subscriber_digital_products: [{ id: "l1", product_id: BUNDLE, expires_at: new Date(now + 86_400_000).toISOString() }], part32: true })
    const r = await deleteOwnProduct(open, { creatorId: ME, productId: BUNDLE })
    check("a lead magnet link still open counts as a claim: archived, and the link kept", r.kind === "archived" && open.subscriber_digital_products.length === 1, r)
    const expired = makeDb({ products: [bundle()], subscriber_digital_products: [{ id: "l2", product_id: BUNDLE, expires_at: new Date(now - 86_400_000).toISOString() }], part32: true })
    const gone = await deleteOwnProduct(expired, { creatorId: ME, productId: BUNDLE })
    check("an expired one does not stop the delete", gone.kind === "deleted", gone)
    const noLeads = makeDb({ products: [bundle()], missing: "subscriber_digital_products", part32: true })
    const r3 = await deleteOwnProduct(noLeads, { creatorId: ME, productId: BUNDLE })
    check("a database without the lead magnet table deletes as before", r3.kind === "deleted", r3)
    const unread = makeDb({ products: [bundle()], unreadable: "subscriber_digital_products", part32: true })
    const r4 = await deleteOwnProduct(unread, { creatorId: ME, productId: BUNDLE })
    check("and one whose links cannot be counted deletes nothing", r4.kind === "failed" && unread.products.length === 1, r4)
  }
  {
    const db = makeDb({ products: [bundle()], orders: sales(), noArchivedStatus: true })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check("a status check from before archived: a draft with the flag, off every page just the same",
      r.kind === "archived" && db.products[0]?.status === "draft" && db.products[0]?.archived === true, db.products)
  }

  console.log("\n  the question before the press says which it will be")
  {
    const sold = await previewDelete(makeDb({ products: [bundle()], orders: sales() }), { creatorId: ME, productId: BUNDLE })
    const none = await previewDelete(makeDb({ products: [bundle()] }), { creatorId: ME, productId: BUNDLE })
    const theirs = await previewDelete(makeDb({ products: [{ ...bundle(), creator_id: SOMEONE }] }), { creatorId: ME, productId: BUNDLE })
    check("with sales: it will be archived", sold.kind === "ready" && sold.hasSales === true, sold)
    check("without: it will be deleted", none.kind === "ready" && none.hasSales === false, none)
    check("somebody else's product: nothing is said about it", theirs.kind === "failed" && theirs.status === 404, theirs)
    const a = deleteQuestion("Tech House Master Bundle 2025", "archive")
    check("the archive question says archived, why, and that buyers keep their access",
      a.title === "Archive Tech House Master Bundle 2025?" && /has sales/.test(a.body) && /archived, not deleted/.test(a.body) && /buyers keep their access/.test(a.body) && a.confirm === "Archive", a)
    const d = deleteQuestion("Tech House Master Bundle 2025", "delete")
    check("the delete question is the plain one", d.title === "Delete Tech House Master Bundle 2025?" && d.body === "It comes off your page and cannot be brought back." && d.confirm === "Delete", d)
    const u = deleteQuestion("Tech House Master Bundle 2025", "unknown")
    check("not known in time: words that are true either way", /If it has sales it is archived instead/.test(u.body) && !/cannot be brought back/.test(u.body), u)
    const all = [a, d, u].map((q) => `${q.title} ${q.body} ${q.confirm}`).join(" ")
    check("no dash and no banned word in any of it", !/[–—]/.test(all) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all))
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
  for (const table of ["orders", "entitlements"]) {
    const db = makeDb({ products: [bundle()], unreadable: table })
    const r = await deleteOwnProduct(db, { creatorId: ME, productId: BUNDLE })
    check(`${table} that cannot be counted: a failure, nothing deleted`, r.kind === "failed" && db.products.length === 1 && /Nothing was deleted/.test(r.kind === "failed" ? r.error : ""), r)
  }
  {
    const r = await productHasSales(makeDb({ missing: "entitlements" }), BUNDLE)
    check("a table the database does not have holds no sales", r === false, r)
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

  console.log("\n  the browser asks first, and a failure to ask is not a guess")
  {
    const real = globalThis.fetch
    const answer = (status: number, body: unknown) => {
      globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch
    }
    answer(200, { ok: true, hasSales: true })
    check("sales: archive", (await previewProductDelete(BUNDLE)) === "archive")
    answer(200, { ok: true, hasSales: false })
    check("none: delete", (await previewProductDelete(BUNDLE)) === "delete")
    answer(500, { ok: false, error: "Could not check its sales. Nothing was deleted" })
    check("could not tell: unknown", (await previewProductDelete(BUNDLE)) === "unknown")
    globalThis.fetch = ((_: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_ok, no) => init?.signal?.addEventListener("abort", () => no(new Error("aborted"))))) as typeof fetch
    check("no answer in time: unknown", (await previewProductDelete(BUNDLE, 50)) === "unknown")
    globalThis.fetch = real
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
    /* Changed on purpose (round 41 team): the store is requireTeamPermission("products")'s, read from the session on the server: the owner's own, or the one a team member with Products works in; a product with sales is archived for both */
    check("the creator is the session's", /const gate = await requireTeamPermission\("products"\)/.test(route) && /creatorId: gate\.creatorId/.test(route))
    check("and the delete is lib/products/delete-product's", /deleteOwnProduct\(admin, \{ creatorId, productId \}\)/.test(route))
    check("a failure is answered with its status and words", /if \(result\.kind === "failed"\) return NextResponse\.json\(\{ ok: false, error: result\.error \}, \{ status: result\.status \}\)/.test(route))
    check("a deleted product: its caches and its OnePage blocks (#361)", /forgetDeletedProduct\(admin, \{ creatorId, productId/.test(route))
    check("an archived one: its caches only, its blocks kept for a restore", /purgeProductCaches\(\{ creatorId, productId/.test(route))
    const lib = strip(read("lib/products/delete-product.ts"))
    check("the delete is scoped to the caller's creator", /\.delete\(\)\s*\.eq\("id", productId\)\s*\.eq\("creator_id", creatorId\)\s*\.select\("id"\)/.test(lib))
    check("and counts the rows it deleted", /if \(!gone\.data \|\| gone\.data\.length === 0\) return \{ kind: "failed"/.test(lib))
    check("it writes only the product: never an order, an entitlement or a file",
      !/from\((table|"orders"|"entitlements"|"digital_assets")\)[^\n]*\.(delete|update|insert|upsert)\(/.test(lib) && /count\("orders"\), count\("entitlements"\)/.test(lib))
    check("a product with sales is archived before any delete is tried", lib.indexOf('if (hasSales) return archive("sales")') > 0 && lib.indexOf('if (hasSales) return archive("sales")') < lib.indexOf(".delete()"))
    check("and part 32 no longer decides anything", !/ordersOutliveProducts|creator_id"\)\.limit/.test(lib))
    check("GET says which a press will do, for the same caller", /export async function GET/.test(route) && /previewDelete\(who\.admin, \{ creatorId: who\.creatorId, productId \}\)/.test(route))
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
    check("the list asks the server first, and its question is the shared one",
      /const kind = await previewProductDelete\(product\.id\)/.test(list) && /deleteQuestion\(productToDelete\.title, deleteKind\)\.title/.test(list) && /deleteQuestion\(productToDelete\.title, deleteKind\)\.body/.test(list))
    check("a refusal is said in the question, which stays open", /setDeleteError\(/.test(confirm) && confirm.indexOf("closeDelete()") < confirm.indexOf("catch (error)") && /role="alert"[^>]*>\s*\{deleteError\}/.test(list))

    const editor = strip(read("app/app/products/new/product-editor.tsx"))
    check("the editor's more menu has Delete, last and apart, in red", /\{ label: "Delete", variant: "destructive" as const, separatorBefore: true, onClick: \(\) => void handleDeleteProduct\(\) \}/.test(editor))
    const del = editor.slice(editor.indexOf("const handleDeleteProduct"), editor.indexOf("const handleRedirectToProduct"))
    check("it asks first, in words that say which it will be",
      /const kind = await previewProductDelete\(productId\)/.test(del) && /const sure = await ask\(\{ \.\.\.deleteQuestion\(savedTitle, kind\), cancel: "Cancel" \}\)/.test(del) && /if \(!sure\) return/.test(del) &&
        del.indexOf("previewProductDelete(") < del.indexOf("await ask(") && del.indexOf("await ask(") < del.indexOf("await deleteProduct("))
    check("it deletes through the server", /await deleteProduct\(productId\)/.test(del) && !/\.delete\(\)/.test(del))
    check("a refusal is shown and the editor stays: no way back before the answer",
      /showToast\(/.test(del) && del.indexOf("return\n") < del.indexOf("returnToProducts(") && del.indexOf("returnToProducts(") > del.indexOf("await deleteProduct("))
    check("gone or archived, the list is told and the editor goes back to it",
      /rememberDeleted\(productId\)/.test(del) && /rememberStatus\(productId, result\)/.test(del) && /leaveNotice\(/.test(del) && /returnToProducts\(router, null\)/.test(del))
    check("the more button spins while it deletes", /deleting \? <ActivitySpinner/.test(editor))
    check("the editor's publish switch purges the caches too (#361 missed this screen)", /await forgetProduct\(productId, slug\)/.test(editor))

    const course = strip(read("components/app/course-edit-form.tsx"))
    check("the course editor deletes through the server", /await deleteProduct\(product\.id\)/.test(course) && !/\.from\("products"\)\.delete\(\)/.test(course))
    check("and asks the same true question", /deleteQuestion\(product\.title, await previewProductDelete\(product\.id\)\)/.test(course))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
