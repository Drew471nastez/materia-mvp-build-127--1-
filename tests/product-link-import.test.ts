import { strict as assert } from "node:assert"
import { parseShopifyProduct, parseGumroadProduct, productLink, importImageUrl, type LinkProduct } from "../lib/products/import/product-link"
import { matchesProductFilters } from "../lib/products/admin-filters"
import { importGumroadItem } from "../lib/products/import/gumroad-server"
import { fakeDb } from "./_fake-db"

const html = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Shirt","category":"Clothing","offers":{"price":"12.50","priceCurrency":"USD"}}</script>'
const raw = { id: 123, title: "Shirt", description: '<p>Soft cotton.</p><script>alert(1)</script>', price: 1250, type: "T-shirts", vendor: "Studio", tags: ["cotton"], images: ["https://cdn.shopify.com/shirt.jpg", "https://cdn.shopify.com/shirt-back.jpg", "https://evil.example/pixel"], options: [{ name: "Size", values: ["S", "M"] }], variants: [{ title: "Small", price: 1250, requires_shipping: true, sku: "S-1", options: ["S"] }, { title: "Medium", price: 1500, requires_shipping: true, sku: "M-1", options: ["M"], compare_at_price: 2000 }] }
let checks = 0
function check(name: string, run: () => void) { run(); checks++; console.log(`  ok  ${name}`) }
check("product links drop tracking parameters and keep locale-prefixed Shopify paths", () => { assert.equal(productLink("https://shop.example/en/products/shirt?utm_source=test#details").href, "https://shop.example/en/products/shirt") })
check("unsafe and non-product links are rejected", () => { for (const u of ["http://shop.example/products/x", "https://user:password@shop.example/products/x", "https://127.0.0.1/products/x", "https://shop.example:8080/products/x", "https://shop.example/admin", "javascript:alert(1)"]) assert.throws(() => productLink(u)) })
check("image imports require HTTPS platform CDNs, without credentials or fake suffixes", () => { assert.equal(importImageUrl("//cdn.shopify.com/a.jpg"), "https://cdn.shopify.com/a.jpg"); for (const u of ["http://cdn.shopify.com/a", "https://cdn.shopify.com.evil.example/a", "https://user:pass@cdn.shopify.com/a", "https://localhost/a"]) assert.equal(importImageUrl(u), null) })
const product = parseShopifyProduct(raw, html, "https://shop.example/products/shirt")
check("Shopify imports preserve prices, every variant, option groups, SKU, category and safe gallery images", () => {
  assert.equal(product.priceCents, 1250); assert.equal(product.currency, "USD"); assert.equal(product.type, "physical"); assert.equal(product.category, "Clothing"); assert.equal(product.vendor, "Studio")
  assert.equal(product.images.length, 2); assert.equal(product.variants.length, 2); assert.equal(product.variants[1].priceCents, 1500); assert.equal(product.variants[1].compareAtCents, 2000); assert.equal(product.variants[0].sku, "S-1"); assert.deepEqual(product.options[0].values, ["S", "M"])
})
check("unknown currency, missing prices and too many variants fail without inventing data", () => { assert.throws(() => parseShopifyProduct(raw, "", product.url)); assert.throws(() => parseShopifyProduct({ ...raw, price: -1 }, html, product.url)); assert.throws(() => parseShopifyProduct({ ...raw, variants: Array(101).fill(raw.variants[0]) }, html, product.url)) })
const gumHtml = '<script type="application/ld+json">{"@type":"Product","name":"Presets","description":"A preset pack","image":["https://public-files.gumroad.com/cover.png"],"offers":{"price":"19.99","priceCurrency":"USD"}}</script>'
/* Changed on purpose: Gumroad writes its JSON-LD offer in the visitor's currency (a real EUR 35.00 page read from the US says USD 38.38, tests/fixtures/product-imports/gumroad-layla-page.html), so a page with JSON-LD only is refused instead of imported at a price the seller never set. The product's public JSON (/l/<permalink>.json) is read first, tests/product-import-sources. */
check("Gumroad JSON-LD alone is not a price", () => { assert.throws(() => parseGumroadProduct(gumHtml, "https://seller.gumroad.com/l/presets"), /did not expose/) })
check("Gumroad embedded public versions preserve individual prices", () => { const p = parseGumroadProduct(gumHtml + '<script type="application/json">{"props":{"product":{"name":"Presets","price_cents":1999,"currency_code":"usd","variants":[{"title":"Version","options":[{"name":"Pro","price_difference":500}]}]}}}</script>', "https://seller.gumroad.com/l/presets"); assert.equal(p.variants[0].priceCents, 2499) })
check("Gumroad without readable prices is an error, not a free draft", () => assert.throws(() => parseGumroadProduct("<html>Not found</html>", "https://seller.gumroad.com/l/missing")))
check("filters include draft and public by default, archive only when selected", () => { assert.ok(matchesProductFilters({ status: "published" }, { statuses: [], stock: [] })); assert.ok(matchesProductFilters({ status: "draft" }, { statuses: [], stock: [] })); assert.equal(matchesProductFilters({ status: "published", archived: true }, { statuses: [], stock: [] }), false); assert.ok(matchesProductFilters({ status: "published", archived: true }, { statuses: ["archived"], stock: [] })); assert.equal(matchesProductFilters({ status: "draft" }, { statuses: ["published"], stock: [] }), false) })
check("stock filters support limited downloads, counted inventory and combined choices", () => { assert.ok(matchesProductFilters({ status: "published", max_purchases: 5, sales_count: 5 }, { statuses: [], stock: ["sold-out"] })); assert.equal(matchesProductFilters({ status: "published", inventory_count: 0 }, { statuses: [], stock: ["available"] }), false); assert.ok(matchesProductFilters({ status: "published", inventory_count: 0 }, { statuses: [], stock: ["available", "sold-out"] })); assert.ok(matchesProductFilters({ status: "published" }, { statuses: [], stock: ["available"] })) })

check("Shopify custom domains may copy their own CDN paths but cannot fetch arbitrary pages", () => {
  assert.equal(importImageUrl("/cdn/shop/files/cover.jpg", "https://shop.example/products/shirt"), "https://shop.example/cdn/shop/files/cover.jpg")
  assert.equal(importImageUrl("https://shop.example/private-data", "https://shop.example/products/shirt"), null)
  assert.equal(importImageUrl("https://other.example/cdn/shop/files/x.jpg", "https://shop.example/products/shirt"), null)
})
check("Gumroad's current public options, original covers, courses and pay-what-you-want are preserved", () => {
  const page = gumHtml + '<script type="application/json">' + JSON.stringify({ product: { id: "native-id", name: "A course", native_type: "course", price_cents: 5000, currency_code: "usd", pwyw: { suggested_price_cents: 6000 }, covers: [{ type: "image", url: "https://public-files.gumroad.com/small.jpg", original_url: "https://public-files.gumroad.com/full.jpg" }], options: [{ name: "Complete", price_difference_cents: 2000 }] } }) + '</script>'
  const p = parseGumroadProduct(page, "https://seller.gumroad.com/l/course")
  assert.equal(p.type, "course"); assert.equal(p.payWhatYouWant, true); assert.equal(p.variants[0].priceCents, 7000); assert.equal(p.images[0], "https://public-files.gumroad.com/full.jpg")
})
check("whole-unit Gumroad currencies are imported in Storelib hundredths", () => {
  const page = '<script type="application/json">' + JSON.stringify({ product: { id: "yen-id", name: "A file", price_cents: 1500, currency_code: "jpy", options: [{ name: "Pro", price_difference_cents: 500 }] } }) + '</script>'
  const p = parseGumroadProduct(page, "https://seller.gumroad.com/l/yen")
  assert.equal(p.priceCents, 150000); assert.equal(p.variants[0].priceCents, 200000)
})

const creatorId = "creator-1", userId = "user-1"
const item = (p: LinkProduct) => ({ gumroadId: p.externalId, title: p.title, descriptionHtml: p.descriptionHtml, priceCents: p.priceCents, payWhatYouWant: false, images: [], variants: p.variants, tags: p.tags })
const tables = { products: [] as Record<string, any>[], product_variants: [] as Record<string, any>[], product_options: [] as Record<string, any>[], product_import_links: [] as Record<string, any>[] }
const db = fakeDb(tables, { unique: { product_import_links: [["creator_id", "source", "external_id"]] } })
const result = await importGumroadItem(db, { creatorId, userId }, item(product), { source: "shopify", linkProduct: product, imageUrl: importImageUrl })
check("link import saves an owned physical draft with sanitised description, SKU, category and options", () => {
  assert.equal(result.status, "imported"); const row = tables.products[0]; assert.equal(row.creator_id, creatorId); assert.equal(row.status, "draft"); assert.equal(row.type, "physical"); assert.equal(row.requires_shipping, true); assert.equal(row.category, "Clothing"); assert.ok(!row.description.includes("<script")); assert.equal(tables.product_variants[0].option1, "S"); assert.equal(tables.product_variants[1].sku, "M-1"); assert.equal(tables.product_options[0].name, "Size"); assert.equal(tables.product_import_links[0].source, "shopify")
})
const again = await importGumroadItem(db, { creatorId, userId }, item(product), { source: "shopify", linkProduct: product })
check("a repeated import reopens the same product instead of creating a duplicate", () => { assert.equal(again.status, "exists"); assert.equal(tables.products.length, 1) })
const broken = { products: [] as Record<string, any>[], product_import_links: [] as Record<string, any>[] }
const badDb = fakeDb(broken, { failInsert: { product_variants: { code: "XX000", message: "Cannot save variants" } } })
const failed = await importGumroadItem(badDb, { creatorId, userId }, item(product), { source: "shopify", linkProduct: product })
check("a failed variant save removes the incomplete product and releases its import claim", () => { assert.equal(failed.status, "error"); assert.equal(broken.products.length, 0); assert.equal(broken.product_import_links.length, 0) })
console.log(`\n${checks} checks passed`)
