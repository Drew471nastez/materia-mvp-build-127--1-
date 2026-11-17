/**
 * Products round 15: an import says which products are already in the store
 * (lib/products/import/duplicates), skips them unless a copy is asked for,
 * and the server refuses a second one on its own, so a stale page is safe.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { duplicateIndex, findDuplicate, handleFromUrl, normalizeSlug, normalizeTitle } from "../lib/products/import/duplicates"
import { duplicatesFor, importGumroadItem } from "../lib/products/import/gumroad-server"
import { fakeDb } from "./_fake-db"

let checks = 0
function check(name: string, run: () => void) { run(); checks++; console.log(`  ok  ${name}`) }

console.log("\nMatching")
const store = [
  { id: "p1", title: "Lightroom Presets: Summer Pack", slug: "summer-presets" },
  { id: "p2", title: "Café Guide", slug: "cafe-guide" },
  { id: "p3", title: "Linen Shirt", slug: "linen-shirt" },
  { id: "p4", title: "Untitled", slug: null },
]
check("a title ignores case, accents, punctuation and spacing", () => {
  assert.equal(normalizeTitle("  Lightroom   PRESETS – summer pack! "), "lightroom presets summer pack")
  assert.equal(normalizeTitle("Café Guide"), normalizeTitle("cafe guide"))
  assert.equal(normalizeTitle("Salt & Pepper"), normalizeTitle("salt and pepper"))
})
check("a slug or handle is read in one spelling", () => {
  assert.equal(normalizeSlug("Summer_Presets"), "summer-presets")
  assert.equal(normalizeSlug("caf%C3%A9-guide"), "cafe-guide")
})
check("the handle comes from a Shopify or a Gumroad product link, nothing else", () => {
  assert.equal(handleFromUrl("https://shop.example/en/products/linen-shirt"), "linen-shirt")
  assert.equal(handleFromUrl("https://seller.gumroad.com/l/summer-presets/"), "summer-presets")
  assert.equal(handleFromUrl("https://shop.example/collections/all"), null)
  assert.equal(handleFromUrl("not a link"), null)
  assert.equal(handleFromUrl(null), null)
})
check("the source comes first: an earlier import of the same platform id", () => {
  const m = findDuplicate({ title: "Something renamed", externalId: "shop.example:42" }, store, new Map([["shop.example:42", "p3"]]))
  assert.deepEqual(m, { productId: "p3", title: "Linen Shirt", by: "source" })
})
check("an import link to a product the store no longer has is no match", () => {
  assert.equal(findDuplicate({ title: "Something new", externalId: "x:1" }, store, new Map([["x:1", "gone"]])), null)
})
check("then the handle against the store's product addresses", () => {
  assert.deepEqual(findDuplicate({ title: "Totally different", url: "https://seller.gumroad.com/l/summer-presets" }, store), { productId: "p1", title: "Lightroom Presets: Summer Pack", by: "slug" })
})
check("then the title, as a person reads it", () => {
  assert.deepEqual(findDuplicate({ title: "cafe guide", url: "https://shop.example/products/guide-2" }, store), { productId: "p2", title: "Café Guide", by: "title" })
})
check("a new product matches nothing", () => {
  assert.equal(findDuplicate({ title: "Brand new course", url: "https://shop.example/products/brand-new", externalId: "new" }, store, new Map()), null)
  assert.equal(findDuplicate({ title: "" }, store), null)
})
check("one index answers many lookups", () => {
  const index = duplicateIndex(store)
  assert.equal(index.find({ title: "Linen shirt" })?.productId, "p3")
  assert.equal(index.find({ title: "Wool shirt" }), null)
})

console.log("\nOn the server")
const creatorId = "creator-1", userId = "user-1"
const tables = {
  products: [{ id: "p-old", creator_id: creatorId, title: "Presets", slug: "presets", status: "draft" }, { id: "p-other", creator_id: "someone-else", title: "Field Notes", slug: "field-notes" }] as Record<string, any>[],
  product_variants: [] as Record<string, any>[],
  product_options: [] as Record<string, any>[],
  product_import_links: [{ id: "l1", creator_id: creatorId, source: "gumroad", external_id: "g-1", product_id: "p-old", updated_at: new Date().toISOString() }] as Record<string, any>[],
}
const db = fakeDb(tables, { unique: { product_import_links: [["creator_id", "source", "external_id"]] } })
const index = await duplicatesFor(db, creatorId, "gumroad")
check("the store's own products and import links are what is matched", () => {
  assert.equal(index.find({ title: "Renamed", externalId: "g-1" })?.by, "source")
  assert.equal(index.find({ title: "Field Notes" }), null, "another store's product is never a match")
})
const item = { gumroadId: "g-1", title: "Presets", descriptionHtml: "<p>Pack</p>", priceCents: 900, payWhatYouWant: false, images: [], variants: [], tags: [] }
const again = await importGumroadItem(db, { creatorId, userId }, item)
check("without a copy asked for, an earlier import is not written again", () => { assert.equal(again.status, "exists"); assert.equal(tables.products.length, 2) })
const copy = await importGumroadItem(db, { creatorId, userId }, item, { copy: true })
check("a copy asked for is a new draft, and the original keeps its import link", () => {
  assert.equal(copy.status, "imported")
  assert.equal(tables.products.length, 3)
  const made = tables.products[2]
  assert.equal(made.creator_id, creatorId); assert.equal(made.status, "draft"); assert.notEqual(made.slug, "presets")
  assert.equal(tables.product_import_links.length, 1); assert.equal(tables.product_import_links[0].product_id, "p-old")
})

check("both import routes ask again before a write and refuse a duplicate unless a copy is asked for", () => {
  for (const route of ["app/api/app/products/import/link/route.ts", "app/api/app/products/import/gumroad/route.ts"]) {
    const src = readFileSync(route, "utf8")
    assert.match(src, /const copy = body\.copy === true/, route)
    assert.match(src, /status: "duplicate", existing/, route)
    assert.match(src, /, 409\)/, route)
    assert.match(src, /\n\s+copy,\n/, route)
  }
})
check("the screens skip a duplicate by default and offer Import a copy", () => {
  const link = readFileSync("app/(storelib)/app/products/new/link-import-form.tsx", "utf8")
  assert.match(link, /useState<Choice>\("skip"\)/)
  assert.match(link, /copy: action === "import" && !!existing && choice === "copy"/)
  const gumroad = readFileSync("app/(storelib)/app/products/import/gumroad/gumroad-import-client.tsx", "utf8")
  assert.match(gumroad, /const selectable = !p\.unsupported && !p\.existing/)
  assert.match(gumroad, /copy: !!p\.existing/)
})

console.log(`\n${checks} checks passed`)
