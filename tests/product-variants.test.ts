/**
 * ===========================================================================
 *  A PRODUCT'S VARIANTS, FROM THE EDITOR TO CHECKOUT, AND THE EDITOR'S LOOK
 * ===========================================================================
 * The owner: "make sure variants work great end to end", "the variants icons
 * are too AI and purple", "remove the purple info circles", "no heavy blue
 * focus border", "the what's included check marks look AI", and "the chosen
 * category should be a lighter grey with a little depth, like the X".
 *
 *   SAVING (app/(storelib)/app/products/new/variant-save.ts). One row per variant, in
 *   the list's order; pay what you want listed at its minimum; a compare at
 *   only above the price; a removed variant deleted, unless the editor never
 *   read the saved ones; every file link replaced in one go and kept to the
 *   product's own files; each saved id handed back by the form's id.
 *   UNSAVED. Opening a variant, or a new one taking its saved id, is not a
 *   change; moving one is.
 *   CHECKOUT (lib/checkout/pricing.ts). An option at its purchase limit is
 *   refused on its own, and left out of a basket.
 *   THE LOOK. No info circles, no violet in the variants, one quiet focus for
 *   every field, a grey check for what's included (editor and product page),
 *   and the chosen category on a light grey chip beside an x drawn the same.
 *
 *   npx tsx tests/product-variants.test.ts
 */
import { readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { saveVariants, variantRow } from "../app/(storelib)/app/products/new/variant-save"
import { snapshotOf, variantsOf, type ProductVariant, type SnapshotFields } from "../app/(storelib)/app/products/new/editor-form"
import { priceOrder, priceCart, variantSoldOut } from "../lib/checkout/pricing"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: "new-variant-1",
  name: "Basic",
  description: "",
  price: "19",
  compareAtPrice: "",
  maxPurchases: "",
  isExpanded: true,
  assignedFiles: [],
  payWhatYouWant: false,
  pwywMinPrice: "",
  pwywSuggestedPrice: "",
  ...over,
})

type Row = Record<string, unknown>

/** A stand-in for the Supabase client: tables of rows, the chained calls the save and checkout make, and a log of writes. */
function fakeDb(tables: Record<string, Row[]>) {
  const log: string[] = []
  let next = 0
  return {
    log,
    tables,
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      let op: "select" | "insert" | "update" | "delete" = "select"
      let payload: Row | Row[] | null = null
      let head = false
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const run = () => {
        if (op === "delete") {
          const gone = rows()
          tables[table] = (tables[table] ?? []).filter((r) => !gone.includes(r))
          log.push(`delete ${table} ${gone.length}`)
          return { data: null, error: null }
        }
        if (op === "insert") {
          const list = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: `saved-${++next}`, ...r }))
          tables[table] = [...(tables[table] ?? []), ...list]
          log.push(`insert ${table} ${list.length}`)
          return { data: list, error: null }
        }
        if (op === "update") {
          const hit = rows()
          for (const r of hit) Object.assign(r, payload)
          log.push(`update ${table} ${hit.length}`)
          return { data: hit, error: null }
        }
        const found = rows()
        return head ? { data: null, count: found.length, error: null } : { data: found, error: null }
      }
      const chain: Record<string, unknown> = {
        select: (_c?: string, o?: { head?: boolean }) => ((head = !!o?.head), chain),
        insert: (r: Row | Row[]) => ((op = "insert"), (payload = r), chain),
        update: (r: Row) => ((op = "update"), (payload = r), chain),
        delete: () => ((op = "delete"), chain),
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => {
          const r = run()
          return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }
        },
        maybeSingle: async () => {
          const r = run()
          return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      }
      return chain
    },
  }
}

const PRODUCT = "11111111-1111-4111-8111-111111111111"

async function main() {
  console.log("\nOne variant, one row (app/(storelib)/app/products/new/variant-save.ts)")
  {
    const r = variantRow("p1", variant({ price: "19.99", compareAtPrice: "29", maxPurchases: "50" }), 2)
    check("its price, compare at, limit and place in the list", r.price_cents === 1999 && r.compare_at_price_cents === 2900 && r.max_purchases === 50 && r.position === 2 && r.product_id === "p1", r)
    check("a compare at at or under the price is not saved as a discount", variantRow("p1", variant({ price: "20", compareAtPrice: "20" }), 0).compare_at_price_cents === null)
    const pwyw = variantRow("p1", variant({ price: "", payWhatYouWant: true, pwywMinPrice: "5", pwywSuggestedPrice: "12", compareAtPrice: "30" }), 0)
    check("pay what you want is listed at its minimum, with no compare at", pwyw.price_cents === 500 && pwyw.pwyw_min_price_cents === 500 && pwyw.pwyw_suggested_price_cents === 1200 && pwyw.compare_at_price_cents === null, pwyw)
    check("a fixed price keeps no pay what you want amounts", variantRow("p1", variant({ pwywMinPrice: "5" }), 0).pwyw_min_price_cents === null)
    check("no name is Untitled, an empty description and a zero limit are nothing", (() => { const x = variantRow("p1", variant({ name: "  ", description: " ", maxPurchases: "0" }), 0); return x.name === "Untitled" && x.description === null && x.max_purchases === null })())
  }

  console.log("\nSaving the list")
  {
    const db = fakeDb({
      product_variants: [
        { id: "v1", product_id: PRODUCT, name: "Old A", position: 0 },
        { id: "v2", product_id: PRODUCT, name: "Old B", position: 1 },
      ],
      product_variant_files: [{ variant_id: "v1", digital_asset_id: "f1" }, { variant_id: "v2", digital_asset_id: "f1" }],
      digital_assets: [{ id: "f1", product_id: PRODUCT }, { id: "f2", product_id: PRODUCT }, { id: "fx", product_id: "other" }],
    })
    /* v2 removed, v1 moved below a new one, files f2 and a file of another product. */
    const ids = await saveVariants(db, PRODUCT, [
      variant({ id: "new-variant-9", name: "New", assignedFiles: ["f2", "fx"] }),
      variant({ id: "v1", name: "A", assignedFiles: ["f1", "f2"] }),
    ])
    const rows = db.tables.product_variants
    check("the removed variant is deleted", !rows.some((r) => r.id === "v2"))
    check("the new one is inserted and the kept one updated, each at its place", rows.find((r) => r.id === "v1")?.position === 1 && rows.find((r) => r.name === "New")?.position === 0 && rows.find((r) => r.id === "v1")?.name === "A")
    check("each saved id comes back by the form's id", ids.get("v1") === "v1" && typeof ids.get("new-variant-9") === "string" && ids.get("new-variant-9") !== "new-variant-9", [...ids])
    const links = db.tables.product_variant_files.map((l) => `${l.variant_id === "v1" ? "v1" : "new"}:${l.digital_asset_id}`).sort()
    check("the file links are replaced, and only the product's own files are linked", links.join() === "new:f2,v1:f1,v1:f2", links)
    check("the links go in with one insert", db.log.filter((l) => l.startsWith("insert product_variant_files")).length === 1, db.log)
  }
  {
    const db = fakeDb({ product_variants: [{ id: "v1", product_id: PRODUCT, name: "Kept", position: 0 }] })
    await saveVariants(db, PRODUCT, [], { keepUnlisted: true })
    check("variants the editor could not read are never deleted by a save", db.tables.product_variants.length === 1)
    await saveVariants(db, PRODUCT, [])
    check("and removing every variant in the form does delete them", db.tables.product_variants.length === 0)
  }

  console.log("\nWhat counts as unsaved (app/(storelib)/app/products/new/editor-form.ts)")
  {
    const base: SnapshotFields = {
      title: "T", description: "", price: "", compareAtPrice: "", mediaItems: [], digitalFiles: [], variants: [variant({ id: "new-variant-1", isExpanded: true }), variant({ id: "v2", name: "Pro" })],
      whatsIncluded: [], faqs: [], selectedCategory: null, limitSalesEnabled: false, salesLimit: "", callToAction: "", showSalesBadge: true,
      refundPolicyEnabled: false, refundPolicyType: "7_day", payWhatYouWant: false, pwywMinPrice: "", pwywSuggestedPrice: "",
    }
    const saved = snapshotOf(base)
    check("opening or closing a variant is not a change", snapshotOf({ ...base, variants: base.variants.map((v) => ({ ...v, isExpanded: !v.isExpanded })) }) === saved)
    check("a new variant taking its saved id is not a change", snapshotOf({ ...base, variants: base.variants.map((v) => (v.id === "new-variant-1" ? { ...v, id: "uuid-1" } : v)) }) === saved)
    check("moving a variant is a change", snapshotOf({ ...base, variants: [...base.variants].reverse() }) !== saved)
    const loaded = variantsOf([
      { id: "b", name: "B", position: 1, price_cents: 900, compare_at_price_cents: 1200, max_purchases: 3 },
      { id: "a", name: "A", position: 0, price_cents: 500, pay_what_you_want: true, pwyw_min_price_cents: 500 },
    ])
    check("reloaded in position order, with compare at and limit", loaded.map((v) => v.id).join() === "a,b" && loaded[1].compareAtPrice === "12" && loaded[1].maxPurchases === "3" && loaded[0].payWhatYouWant && loaded[0].pwywMinPrice === "5")
  }

  console.log("\nCheckout (lib/checkout/pricing.ts)")
  {
    const tables = () => ({
      products: [{ id: PRODUCT, title: "Kit", slug: "kit", type: "digital", status: "published", price_cents: 2000, thumbnail_url: null, creator_id: "c1" }],
      product_variants: [
        { id: "lim", product_id: PRODUCT, name: "Limited", price_cents: 3000, max_purchases: 2 },
        { id: "open", product_id: PRODUCT, name: "Open", price_cents: 1000, max_purchases: null },
      ],
      orders: [
        { id: "o1", variant_id: "lim", status: "completed" },
        { id: "o2", variant_id: "lim", status: "completed" },
        { id: "o3", variant_id: "open", status: "completed" },
      ],
    })
    check("an option at its limit is sold out", await variantSoldOut(fakeDb(tables()), { id: "lim", max_purchases: 2 }))
    check("an option under its limit, or with none, is not", !(await variantSoldOut(fakeDb(tables()), { id: "lim", max_purchases: 3 })) && !(await variantSoldOut(fakeDb(tables()), { id: "open", max_purchases: null })))
    const t = tables()
    t.orders[1].status = "refunded"
    check("only completed orders count", !(await variantSoldOut(fakeDb(t), { id: "lim", max_purchases: 2 })))
    const sold = await priceOrder(fakeDb(tables()), { productId: PRODUCT, variantId: "lim" })
    check("a single checkout refuses a sold out option, before any charge", sold.ok === false && /sold out/.test(sold.error), sold)
    const open = await priceOrder(fakeDb(tables()), { productId: PRODUCT, variantId: "open" })
    check("and prices an open one from the option", open.ok === true && open.totals.totalCents === 1000 && open.variant?.id === "open")
    const cart = await priceCart(fakeDb(tables()), { items: [{ productId: PRODUCT, variantId: "lim" }, { productId: PRODUCT, variantId: "open" }] })
    check("a basket leaves the sold out option out and names it", cart.ok === true && cart.lines.length === 1 && cart.lines[0].item.variantId === "open" && cart.dropped.length === 1, cart)
  }

  console.log("\nThe editor's look (app/(storelib)/app/products/new/product-editor.tsx)")
  const editor = code("app/(storelib)/app/products/new/product-editor.tsx")
  const variants = editor.slice(editor.indexOf("sectionRefs.current.variants = el"), editor.indexOf(">Pricing</h2>"))
  check("no info circles anywhere in the editor", !/TooltipIcon|TooltipProvider|PopoverTrigger|rounded-full bg-violet-100/.test(editor))
  check("the variants have no violet and no layers badge", !/violet|purple|#8b5cf6|Layers/.test(variants) && !/violet/.test(editor.slice(editor.indexOf("const VariantFileCheckbox"), editor.indexOf("const VariantFileCheckbox") + 2500)))
  check("each variant moves up and down, and a move is saved as its position", /moveVariant\(variant\.id, -1\)/.test(variants) && /moveVariant\(variant\.id, 1\)/.test(variants) && /disabled=\{index === 0\}/.test(variants) && /disabled=\{index === variants\.length - 1\}/.test(variants))
  check("the save goes through variant-save, keeping unread variants", /await saveVariants\(supabase, finalProductId, variants, \{ keepUnlisted: variantsUnread\.current \}\)/.test(editor) && /savedIds\.has\(v\.id\)/.test(editor))
  check("one quiet focus for every field: grey border, a 3px ring at 6%, no violet select ring",
    /const FIELD_FOCUS =/.test(editor) && /:focus\]:border-\[#9ca3af\]/.test(editor) && /:focus\]:ring-\[rgba\(17,24,39,0\.06\)\]/.test(editor) && /:focus\]:ring-\[3px\]/.test(editor)
      && (editor.match(/cn\(FIELD_FOCUS,/g) ?? []).length === 3 && !/focus:ring-violet|focus:border-violet/.test(editor))
  const included = editor.slice(editor.indexOf("What's Included</h2>"), editor.indexOf("sectionRefs.current.files = el"))
  check("what's included: one thin grey check, no green or violet", /<Check aria-hidden strokeWidth=\{2\} className="h-4 w-4 shrink-0 text-\[#6b7280\]" \/>/.test(included) && !/green|violet/.test(included))

  console.log("\nThe product page (app/(storelib)/(marketing)/p/[slug]/page.tsx)")
  const page = code("app/(storelib)/(marketing)/p/[slug]/page.tsx")
  const icon = page.slice(page.indexOf("function getIncludedItemIcon"), page.indexOf("export const dynamic"))
  check("what's included is the same thin check on every line, grey unless the theme sets a colour", /text-\[#6b7280\]/.test(icon) && !/text-green-600|<Download|<Files|<Infinity/.test(icon))

  console.log("\nThe category field (app/(storelib)/app/products/new/category-picker.tsx)")
  const picker = code("app/(storelib)/app/products/new/category-picker.tsx")
  check("the chosen category is a light grey chip with a little depth, and the x beside it is drawn the same", /data-category-chip=""/.test(picker) && /const CHIP_DEPTH = "bg-\[#f6f7f8\] shadow-\[/.test(picker) && (picker.match(/CHIP_DEPTH/g) ?? []).length >= 3)
  check("the picker is memoised, so the editor's typing does not draw its sheet again", /export const CategoryPicker = React\.memo\(function CategoryPicker\(/.test(picker))
  check("its field focuses quietly too", /focus:border-\[#9ca3af\] focus:ring-\[3px\] focus:ring-\[rgba\(17,24,39,0\.06\)\]/.test(picker) && !/focus:border-\[#1a1a2e\]/.test(picker))

  console.log("\nThe SQL (supabase/sql/run-now/35_product_variants_columns.sql)")
  const sql = read("supabase/sql/run-now/35_product_variants_columns.sql")
  const after = read("supabase/sql/run-now/99_check_after.sql")
  check("adds the two columns, drops the position rule, adds the indexes, each safe to run twice",
    /ALTER TABLE IF EXISTS public\.product_variants ADD COLUMN IF NOT EXISTS compare_at_price_cents integer;/.test(sql) && /ADD COLUMN IF NOT EXISTS max_purchases integer;/.test(sql)
      && /DROP CONSTRAINT IF EXISTS product_variants_product_position_unique;/.test(sql) && /CREATE INDEX IF NOT EXISTS idx_orders_variant_status/.test(sql))
  check("99 has a column for it", /as p35_product_variants_columns[,;]/.test(after))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
