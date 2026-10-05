/**
 * ===========================================================================
 *  "THEIR PRODUCTS ARE DELETED BUT STILL SHOWING"
 * ===========================================================================
 * The owner: does archiving and deleting a product work the way a platform
 * should, everywhere? Deleted or archived must be gone from the creator's
 * page, the OnePage, a website, Explore, search, wishlists, the sitemaps
 * and checkout, and a buyer who paid for it must keep it in their library.
 *
 * WHAT IS PINNED HERE.
 *
 *   1. The one rule (lib/products/visibility.ts): published and not flagged.
 *   2. A LIFECYCLE, run against one stand-in database with two clients as
 *      the app has them: the server's (sees every row) and a buyer's (row
 *      level security: a product only while it is published). A product is
 *      archived, restored, archived again and deleted, and after each step
 *      every surface that can be run outside a browser is asked: the
 *      OnePage, a website's wishlist and its cards, checkout for one product
 *      and for a cart, the delete question, and the buyer's library.
 *   3. THE GUARD. Every read of `products` in the public parts of the app
 *      filters on the status, or is listed below with the reason it does
 *      not. A new public page that forgets fails here, before it ships.
 *   4. The fixes around it: the email capture route, the storelib.com
 *      wishlist, the buyer's pages, the OnePage preview, the caches, the
 *      admin's delete, and run-now part 47.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

import { isPubliclyVisible, publicOnly, PUBLIC_PRODUCT_STATUS } from "@/lib/products/visibility"
import { archiveProduct, restoreProduct, isArchivedProduct } from "@/lib/products/archive"
import { deleteOwnProduct, productHasSales } from "@/lib/products/delete-product"
import { answersForBlocks, type ProductsDb } from "@/lib/onepage/live-products"
import { fillOwnedProducts, fillOwnedProduct } from "@/lib/library/owned-products"
import { getLibraryDownloads } from "@/lib/library/get-library-downloads"
import { creatorProducts, wishlistCards } from "@/lib/site-accounts/wishlist-store"
import { priceCart, priceOrder } from "@/lib/checkout/pricing"

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

/* ── One database, two clients ─────────────────────────────────────────── */

const CREATOR = "c0c0c0c0-0000-4000-8000-000000000001"
const CREATOR_USER = "c0c0c0c0-0000-4000-8000-0000000000aa"
const BUYER = "b0b0b0b0-0000-4000-8000-000000000001"
const SOLD = "aaaaaaaa-0000-4000-8000-000000000001" // bought by BUYER
const UNSOLD = "aaaaaaaa-0000-4000-8000-000000000002" // nobody has it
const OTHER = "aaaaaaaa-0000-4000-8000-000000000003" // stays live throughout

type Row = Record<string, any>
type Store = Record<string, Row[]>

function makeStore(): Store {
  const product = (id: string, title: string, slug: string): Row => ({
    id, title, slug, creator_id: CREATOR, status: "published", archived: false, type: "digital",
    price_cents: 2900, pay_what_you_want: false, pwyw_min_price_cents: null, thumbnail_url: `https://cdn.example/${slug}.png`, compare_at_cents: null,
  })
  return {
    products: [product(SOLD, "Tech House Master Bundle", "tech-house"), product(UNSOLD, "Loop Pack", "loop-pack"), product(OTHER, "Drum Kit", "drum-kit")],
    orders: [{ id: "o1", product_id: SOLD, buyer_id: BUYER, status: "completed", amount_cents: 2900, created_at: "2026-09-01T00:00:00Z", creator_id: CREATOR }],
    entitlements: [{ id: "e1", product_id: SOLD, buyer_id: BUYER, creator_id: CREATOR, created_at: "2026-09-01T00:00:00Z" }],
    digital_assets: [{ id: "f1", product_id: SOLD, file_name: "tech-house.zip", created_at: "2026-09-01T00:00:00Z" }],
    subscriber_digital_products: [],
    product_variants: [],
    coupons: [],
    creators: [{ id: CREATOR, user_id: CREATOR_USER, slug: "satori" }],
    profiles: [{ id: CREATOR_USER, display_name: "Satori" }],
  }
}

/**
 * A client in PostgREST's shape. `rls` is the buyer's session: a product
 * row is visible only while published, and so is a product embedded in
 * another row (`product:products(*)`), exactly as the products table's
 * policy answers a signed in buyer who is not its creator.
 */
function client(store: Store, rls: boolean, log: string[] = []) {
  const visible = (p: Row | undefined) => (p && (!rls || p.status === "published") ? p : null)
  class Q {
    op = "select"
    cols = "*"
    head = false
    one: "none" | "maybe" | "single" = "none"
    tests: Array<(r: Row) => boolean> = []
    patch: Row = {}
    rows: Row[] = []
    cap = Infinity
    constructor(readonly table: string) {}
    select(cols = "*", opts?: { head?: boolean }) {
      if (this.op === "select") {
        this.cols = cols
        this.head = !!opts?.head
      }
      return this
    }
    eq(k: string, v: unknown) { this.tests.push((r) => r[k] === v); return this }
    neq(k: string, v: unknown) { this.tests.push((r) => r[k] !== v); return this }
    in(k: string, vs: unknown[]) { this.tests.push((r) => vs.includes(r[k])); return this }
    gt(k: string, v: string) { this.tests.push((r) => String(r[k]) > v); return this }
    is(k: string, v: unknown) { this.tests.push((r) => (v === null ? r[k] == null : r[k] === v)); return this }
    ilike() { return this }
    or() { return this }
    order() { return this }
    limit(n: number) { this.cap = n; return this }
    maybeSingle() { this.one = "maybe"; return this }
    single() { this.one = "single"; return this }
    update(patch: Row) { this.op = "update"; this.patch = patch; return this }
    delete() { this.op = "delete"; return this }
    insert(rows: Row | Row[]) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this }
    then<A, B>(ok: (v: any) => A, no?: (e: unknown) => B) { return Promise.resolve().then(() => this.run()).then(ok, no) }
    run() {
      log.push(`${rls ? "buyer" : "server"} ${this.op} ${this.table}`)
      const all = store[this.table] ?? (store[this.table] = [])
      let hits = all.filter((r) => this.tests.every((t) => t(r)))
      if (this.table === "products") hits = hits.filter((p) => visible(p))
      if (this.op === "update") {
        for (const r of hits) Object.assign(r, this.patch)
        return { data: this.cols === "*" && this.one === "none" ? hits.map((r) => ({ ...r })) : hits.map((r) => ({ ...r })), error: null }
      }
      if (this.op === "delete") {
        const gone = new Set(hits)
        store[this.table] = all.filter((r) => !gone.has(r))
        if (this.table === "products") {
          /* ON DELETE CASCADE and part 32's SET NULL, as the real database has them. */
          for (const p of gone) {
            for (const t of ["entitlements", "digital_assets", "subscriber_digital_products", "product_variants"]) store[t] = (store[t] ?? []).filter((r) => r.product_id !== p.id)
            for (const o of store.orders) if (o.product_id === p.id) o.product_id = null
          }
        }
        return { data: hits.map((r) => ({ id: r.id })), error: null }
      }
      if (this.op === "insert") {
        all.push(...this.rows)
        return { data: this.rows, error: null }
      }
      if (this.head) return { data: null, error: null, count: hits.length }
      let out = hits.slice(0, this.cap).map((r) => {
        const row: Row = { ...r }
        if (/product:products\(/.test(this.cols)) row.product = visible(store.products.find((p) => p.id === r.product_id)) ? { ...store.products.find((p) => p.id === r.product_id) } : null
        if (/creator:creators\(/.test(this.cols)) row.creator = null
        return row
      })
      if (this.one !== "none") {
        if (this.one === "single" && out.length !== 1) return { data: null, error: { code: "PGRST116", message: "not one row" } }
        return { data: out[0] ?? null, error: null }
      }
      return { data: out, error: null }
    }
  }
  return { from: (t: string) => new Q(t) }
}

/* ── What every surface says about a product ───────────────────────────── */

const blocksNaming = (...ids: string[]) => ids.map((id, i) => ({ id: `b${i}`, type: "product", data: { product_id: id, product_title: "copy", product_slug: "copy" } }))

async function surfaces(store: Store, id: string) {
  const server = client(store, false)
  const buyer = client(store, true)
  const onePage = await answersForBlocks(server as unknown as ProductsDb, CREATOR, blocksNaming(id))
  const siteWishlist = await creatorProducts(server, CREATOR, [id])
  const siteCards = await wishlistCards(server, CREATOR, [id])
  const checkout = await priceOrder(server, { productId: id })
  const cart = await priceCart(server, { items: [{ productId: id, quantity: 1 }, { productId: OTHER, quantity: 1 }] })
  const library = await getLibraryDownloads(BUYER, { supabase: buyer, admin: server })
  const row = store.products.find((p) => p.id === id)
  return {
    /* Anybody may see it: the rule itself, on the row as it is now. */
    rule: isPubliclyVisible(row),
    onePage: !!onePage.get(id),
    siteWishlist: siteWishlist.has(id),
    siteCards: siteCards.some((c: any) => c.id === id),
    checkout: checkout.ok,
    cart: cart.ok === true && cart.lines.some((l) => l.item.productId === id),
    cartStillSellsTheRest: cart.ok === true && cart.lines.length >= 1,
    inLibrary: library.some((d) => d.productId === id),
    libraryFiles: library.find((d) => d.productId === id)?.files.length ?? 0,
  }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const st = statSync(dir)
  if (st.isFile()) return [dir]
  return readdirSync(dir).flatMap((f) => walk(join(dir, f)))
}

async function main() {
  console.log("\n  the rule")
  check("published and not flagged: shown", isPubliclyVisible({ status: "published", archived: false }))
  check("published with no flag column: shown", isPubliclyVisible({ status: "published" }))
  check("published but flagged archived (an old row): hidden", !isPubliclyVisible({ status: "published", archived: true }))
  for (const status of ["draft", "unpublished", "archived", "deleted", ""]) check(`status ${status || "(empty)"}: hidden`, !isPubliclyVisible({ status }))
  check("no row at all (deleted): hidden", !isPubliclyVisible(null) && !isPubliclyVisible(undefined))
  {
    const seen: Array<[string, string]> = []
    const q = { eq(c: string, v: string) { seen.push([c, v]); return q } }
    check("publicOnly is the status filter, by name", publicOnly(q) === q && seen.length === 1 && seen[0][0] === "status" && seen[0][1] === "published" && PUBLIC_PRODUCT_STATUS === "published")
  }
  check("the OnePage asks the same rule", /isPubliclyVisible\(/.test(strip(read("lib/onepage/live-products.ts"))))
  check("and the search engines' rule agrees with it", /p\.status !== "published" \|\| p\.archived === true/.test(read("lib/seo/indexing.ts")))

  console.log("\n  a live product is everywhere")
  const store = makeStore()
  const live = await surfaces(store, SOLD)
  check("on the OnePage", live.onePage)
  check("in a website's wishlist, and its cards", live.siteWishlist && live.siteCards)
  check("for sale on its own", live.checkout, live)
  check("for sale in a cart", live.cart, live)
  check("and in the buyer's library, with its file", live.inLibrary && live.libraryFiles === 1, live)

  console.log("\n  archived: off every public surface, still the buyer's")
  const creator = client(store, false)
  const archivedRow = await archiveProduct(creator as any, SOLD)
  check("archived by status and by the flag", archivedRow.status === "archived" && archivedRow.archived === true && isArchivedProduct(archivedRow))
  const arch = await surfaces(store, SOLD)
  check("the rule says hidden", !arch.rule)
  check("off the OnePage", !arch.onePage)
  check("out of a website's wishlist and its cards", !arch.siteWishlist && !arch.siteCards)
  check("not for sale by an old link to its checkout", !arch.checkout)
  check("dropped from a cart, which still sells the rest", !arch.cart && arch.cartStillSellsTheRest, arch)
  check("STILL IN THE BUYER'S LIBRARY, with its file", arch.inLibrary && arch.libraryFiles === 1, arch)
  check("its orders, entitlement and files untouched", store.orders.length === 1 && store.entitlements.length === 1 && store.digital_assets.length === 1)
  {
    /* The buyer's own session reads the entitlement with the product hidden, as row level security answers. */
    const { data } = await client(store, true).from("entitlements").select("id, product_id, product:products(*)").eq("buyer_id", BUYER)
    check("(the buyer's session alone sees the entitlement with no product, which is what dropped it before)", Array.isArray(data) && data.length === 1 && data[0].product === null)
    const filled = await fillOwnedProducts(client(store, false), data as Row[])
    check("and the server fills it back in by id", filled[0]?.product?.id === SOLD)
    const one = await fillOwnedProduct(client(store, false), (data as Row[])[0])
    check("one row the same way (the course player, the product page in the library)", one?.product?.title === "Tech House Master Bundle")
  }

  {
    /* A gift, a free claim or an import: an entitlement and no order. Before, only an order could bring an archived product back into the library. */
    const gift = { ...store, orders: [] as Row[] }
    const library = await getLibraryDownloads(BUYER, { supabase: client(gift, true), admin: client(gift, false) })
    check("a gift with no order is still in the library after an archive", library.some((d) => d.productId === SOLD && d.files.length === 1), library)
  }

  console.log("\n  restored: back as a draft, still off the pages until it is published")
  const back = await restoreProduct(creator as any, SOLD)
  check("a draft, not archived", back.status === "draft" && back.archived === false)
  const draft = await surfaces(store, SOLD)
  check("a draft is shown to nobody", !draft.rule && !draft.onePage && !draft.checkout && !draft.siteWishlist)
  check("and the buyer still has it", draft.inLibrary)
  store.products.find((p) => p.id === SOLD)!.status = "published"
  const again = await surfaces(store, SOLD)
  check("published again: back everywhere", again.rule && again.onePage && again.checkout && again.siteWishlist && again.inLibrary)

  console.log("\n  delete: a product with a sale is archived, never deleted")
  {
    const r = await deleteOwnProduct(creator, { creatorId: CREATOR, productId: SOLD })
    check("archived instead", r.kind === "archived" && store.products.some((p) => p.id === SOLD))
    const after = await surfaces(store, SOLD)
    check("off every public surface", !after.rule && !after.onePage && !after.checkout && !after.siteWishlist && !after.siteCards && !after.cart)
    check("and the buyer keeps it, file and all", after.inLibrary && after.libraryFiles === 1 && store.entitlements.length === 1)
  }

  console.log("\n  delete: a product nobody has is deleted, and gone from everything")
  {
    const before = await surfaces(store, UNSOLD)
    check("(it was live)", before.onePage && before.checkout)
    check("the question first: no sales", (await productHasSales(creator, UNSOLD)) === false)
    const r = await deleteOwnProduct(creator, { creatorId: CREATOR, productId: UNSOLD })
    check("deleted", r.kind === "deleted" && !store.products.some((p) => p.id === UNSOLD))
    const after = await surfaces(store, UNSOLD)
    check("off the OnePage, the website, checkout and the cart", !after.onePage && !after.siteWishlist && !after.siteCards && !after.checkout && !after.cart)
    check("and in nobody's library, because nobody had it", !after.inLibrary)
    const other = await surfaces(store, OTHER)
    check("the creator's other product is untouched throughout", other.rule && other.onePage && other.checkout)
  }

  console.log("\n  a lead magnet sent this month keeps its product")
  {
    const s = makeStore()
    s.orders = []
    s.entitlements = []
    s.subscriber_digital_products = [{ id: "l1", product_id: UNSOLD, expires_at: new Date(Date.now() + 86_400_000).toISOString() }]
    const r = await deleteOwnProduct(client(s, false), { creatorId: CREATOR, productId: UNSOLD })
    check("archived, so the emailed link still downloads", r.kind === "archived" && s.subscriber_digital_products.length === 1)
  }

  console.log("\n  THE GUARD: every public read of products asks the rule")
  {
    /*
      The public parts of the app. A read of `products` in any of these files
      either filters on the status (`.eq("status", "published")`, or
      `publicOnly(`) within its own statement, or is listed in ALLOWED with
      why it may not, and how many such reads the file has.
    */
    const ROOTS = [
      "app/(marketing)", "app/(site)", "app/(sites)", "app/checkout", "app/api/v2/search", "app/api/website-builder/search",
      "app/api/checkout", "app/api/onepage", "app/api/wishlist", "app/api/reviews", "app/api/store-builder", "app/sitemap", "app/sitemap.xml",
      "lib/website-builder", "lib/seo", "lib/commerce", "lib/explore", "lib/checkout", "lib/site-accounts", "lib/onepage",
      "components/website-builder", "components/platform", "components/storefront", "components/product", "hooks",
    ]
    const ALLOWED: Record<string, { count: number; why: string }> = {
      "app/api/reviews/route.ts": { count: 1, why: "a buyer writing a review of a product they have, whatever its status" },
      "app/api/reviews/stats/route.ts": { count: 1, why: "two numbers for a product page, which is a 404 when the product is not published" },
      "components/website-builder/theme/render-product.tsx": { count: 1, why: "the pricing columns of a product the page already read as published" },
      "lib/checkout/fulfil-cart-session.ts": { count: 1, why: "titles for a paid order: the buyer paid while it was on sale" },
      "lib/checkout/fulfil-payment.ts": { count: 1, why: "the title on a paid order's receipt" },
      "lib/explore/read-interests.ts": { count: 1, why: "the categories of what this person bought, to rank published products" },
      "lib/onepage/live-products.ts": { count: 1, why: "reads the status and the flag and applies isPubliclyVisible to each row" },
      "lib/seo/announce.ts": { count: 2, why: "tells search engines an address changed; an archived one then answers 404" },
      "lib/site-accounts/account-data.ts": { count: 2, why: "a website customer's own orders, which they keep" },
      "lib/website-builder/site-performance-read.ts": { count: 1, why: "the creator's own speed report" },
    }
    const reads = new Map<string, number>()
    const unfiltered: string[] = []
    for (const file of [...new Set(ROOTS.flatMap(walk))].filter((f) => /\.(ts|tsx)$/.test(f))) {
      const src = read(file)
      for (const m of src.matchAll(/\.from\("products"\)/g)) {
        const statement = src.slice(m.index!, m.index! + 700).split(/\n\s*\n/)[0]
        const before = src.slice(Math.max(0, m.index! - 120), m.index!)
        const asks = /\.eq\("status", "published"\)|\.eq\("status", PUBLIC_PRODUCT_STATUS\)/.test(statement) || /publicOnly\(/.test(before)
        if (asks) continue
        reads.set(file, (reads.get(file) ?? 0) + 1)
      }
    }
    for (const [file, n] of reads) {
      const allowed = ALLOWED[file]
      if (!allowed || n > allowed.count) unfiltered.push(`${file} (${n})`)
    }
    check("no public read of products shows a product that is not published", unfiltered.length === 0, unfiltered)
    check("the list of exceptions says why for each", Object.values(ALLOWED).every((a) => a.why.length > 20))
    check("and every exception is still there, so the list does not rot", Object.entries(ALLOWED).every(([f, a]) => (reads.get(f) ?? 0) === a.count), [...reads])
    check("the guard really reads the public pages", ["app/(marketing)/u/[username]/page.tsx", "lib/commerce/product-page-cache.ts", "app/checkout/page.tsx"].every((f) => existsSync(f)))
  }

  console.log("\n  the surfaces that were wrong, and are not any more")
  {
    const capture = strip(read("app/api/onepage/email-capture/route.ts"))
    check("the OnePage email capture sends a download only for a published product", /publicOnly\(\s*adminSupabase\s*\.from\("products"\)/.test(capture) && /isPubliclyVisible\(product\)/.test(capture))
    check("and only one of this page's own creator", /lookup = lookup\.eq\("creator_id", onepage\.seller_id\)/.test(capture))
    check("and still collects the address when it is not", !/error: "Product not found"/.test(capture) && /if \(deliverable\) \{/.test(capture))
    check("the lead is recorded with the product it really sent", /digital_product_id: deliverable\?\.id \?\? null/.test(capture))

    const wishlist = strip(read("app/api/wishlist/route.ts"))
    check("the storelib.com wishlist lists only what is still on sale", /!isPubliclyVisible\(item\.products/.test(wishlist) && /\n\s*status,\n/.test(wishlist))
    check("and the library's wishlist count agrees with it", /products!inner\(status\)/.test(read("app/account/library/page.tsx")) && /\.eq\("products\.status", "published"\)/.test(read("app/account/library/page.tsx")))

    const lib = strip(read("lib/library/get-library-downloads.ts"))
    check("My Library fills in a product its buyer's session cannot see", /await fillOwnedProducts\(admin, entitlements/.test(lib))
    for (const page of ["app/dashboard/page.tsx", "app/dashboard/products/page.tsx"]) {
      check(`${page}: an archived purchase still listed`, /fillOwnedProducts\(createAdminClient\(\), entitlements\)/.test(strip(read(page))))
    }
    /* Courses moved to the library (lib/courses/load.ts): the buyer's own purchases are read by their id, the products with the server's client whatever their status. */
    const courses = strip(read("lib/courses/load.ts"))
    check("the courses list: an archived course still listed", /\.from\("entitlements"\)\.select\("product_id, created_at"\)\.eq\("buyer_id", userId\)/.test(courses) && !/\.eq\("status", "published"\)/.test(courses))
    check("the old course list sends people to it", /redirect\("\/account\/library\/courses"\)/.test(read("app/dashboard/courses/page.tsx")))
    check("the library's product page", /fillOwnedProduct\(admin, entitlement\)/.test(strip(read("app/account/library/products/[id]/page.tsx"))))
    check("the dashboard's product page", /fillOwnedProduct\(createAdminClient\(\), read\)/.test(strip(read("app/dashboard/products/[id]/page.tsx"))))
    const player = strip(read("lib/courses/load.ts"))
    check("the course player, after deciding what the buyer owns",
      player.indexOf("productAccess(db, userId, productId)") > 0 && player.indexOf("productAccess(db, userId, productId)") < player.indexOf("readCourseTree(db, productId)") &&
        /level === "none"\) return \{ state: "not-found" \}/.test(player))
    check("course progress is only ever the buyer's own", /\.eq\("buyer_id", userId\)/.test(strip(read("lib/courses/server.ts"))) && /redirect\(`\/account\/library\/courses\//.test(read("app/dashboard/courses/[id]/page.tsx")))

    const preview = strip(read("components/onepage/preview-document.tsx"))
    check("the OnePage preview draws what the live page draws", /answersForBlocks\(db, sellerId, blocks\)/.test(preview) && /resolveProductBlocks\(sent\.blocks, answers\)/.test(preview))
    check("and asks only about products it has not asked about", /filter\(\(id\) => !asked\.current\.has\(id\)\)/.test(preview))

    const forget = strip(read("lib/products/forget-product.ts"))
    check("archive and restore refresh the built website's pages too", /export async function refreshPublishedSite/.test(forget) && /await refreshPublishedSite\(creatorId\)/.test(strip(read("app/api/products/forget/route.ts"))))
    check("so does a delete that archived", /purgeProductCaches\(\{ creatorId, productId, slug: result\.product\.slug, handle \}\)\s*await refreshPublishedSite\(creatorId\)/.test(strip(read("app/api/products/delete/route.ts"))))
    check("and an admin taking a product down or putting it back", /purgeProductCaches\(\{ creatorId: product\.creator_id/.test(strip(read("app/api/admin/products/moderate/route.ts"))))

    const seo = strip(read("app/api/admin/blog/seo-metrics/route.ts"))
    check("the admin's delete asks who has the product, not only orders", /await productHasSales\(supabase, productId\)/.test(seo) && seo.indexOf("productHasSales(") < seo.indexOf('.from("products").delete()'))
    check("and refuses when somebody does", /if \(hasSales\) \{\s*return NextResponse\.json\(/.test(seo))
  }

  console.log("\n  run-now part 47")
  {
    const file = "supabase/sql/run-now/47_products_archived_never_published.sql"
    const sql = read(file)
    const lines = sql.trimEnd().split("\n")
    check("a header, then one statement per line", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => /;$/.test(l.trim())))
    check("no dash in its words", !/[–—]/.test(lines[0]))
    check("status archived sets the flag", /IF NEW\.status = 'archived' THEN NEW\.archived := true;/.test(sql))
    check("publishing clears the flag", /TG_OP = 'UPDATE' AND OLD\.status IS DISTINCT FROM 'published' THEN NEW\.archived := false;/.test(sql))
    check("the flag on a published product archives it", /ELSE NEW\.status := 'archived';/.test(sql))
    check("before the row is written, on status and flag writes only",
      /CREATE TRIGGER products_keep_archive_in_step BEFORE INSERT OR UPDATE OF status, archived ON public\.products FOR EACH ROW/.test(sql))
    check("safe to run twice", /DROP TRIGGER IF EXISTS products_keep_archive_in_step ON public\.products;/.test(sql) && /CREATE OR REPLACE FUNCTION public\.products_keep_archive_in_step\(\)/.test(sql))
    check("skips itself where there is no flag column", /column_name = 'archived'\) THEN RAISE NOTICE/.test(sql))
    check("deletes nothing", !/\bdelete\b|\btruncate\b/i.test(sql.split("\n").slice(1).join("\n")))
    check("the check after has its column", /as p47_products_archived_never_published/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("the README names it", /\| `47_products_archived_never_published\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
    check("and the four files carry it", /-- part 47_products_archived_never_published\.sql/.test(read("supabase/sql/run-four/3_of_4_latest.sql")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
