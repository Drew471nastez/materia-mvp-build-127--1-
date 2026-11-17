/**
 * Products › Import from a link: what Shopify, Gumroad and Payhip pages give,
 * read the way the import reads them (lib/products/import/product-link.ts),
 * and the network half (product-link-server.ts) with a stand-in fetcher, so
 * nothing leaves the machine.
 *
 * The fixtures are written in the shape each platform answers:
 *   Shopify  /products/<handle>.js (hundredths), /products/<handle>.json and
 *            /products.json (units, as strings), Shopify.currency in the head.
 *   Gumroad  the ProductPage props (react_on_rails JSON script, and an
 *            Inertia data-page), with schema.org JSON-LD.
 *   Payhip   payhip.com/b/<key> with JSON-LD and og:/product: meta tags.
 */
import { strict as assert } from "node:assert"
import {
  importImageUrl, importLink, metaContent, parseGumroadProduct, parsePayhipProduct, parseShopifyCatalog,
  parseShopifyProduct, productLink, shopifyCurrency, shopifyJsonProduct, type LinkProduct,
} from "../lib/products/import/product-link"
import { LinkImportError, fetchProductLink, fetchShopifyCatalog, type Fetcher } from "../lib/products/import/product-link-server"
import { handleFromUrl } from "../lib/products/import/duplicates"
import { importGumroadItem } from "../lib/products/import/gumroad-server"
import { fakeDb } from "./_fake-db"

let checks = 0
async function check(name: string, run: () => void | Promise<void>) { await run(); checks++; console.log(`  ok  ${name}`) }

/* ── fixtures ───────────────────────────────────────────────────────────── */

const SHOP = "https://linen-and-loom.example"
const SHOPIFY_HEAD = `<!doctype html><html><head><title>Linen Apron</title>
<meta property="og:price:amount" content="38.00"><meta property="og:price:currency" content="EUR">
<script>var Shopify = Shopify || {};Shopify.shop = "linen-and-loom.myshopify.com";Shopify.locale = "en";Shopify.currency = {"active":"EUR","rate":"1.0"};Shopify.country = "DE";</script>
</head><body></body></html>`
/* /products/linen-apron.js: prices in hundredths, options as objects, images as protocol-relative strings. */
const SHOPIFY_JS = {
  id: 8123456789012, title: "Linen Apron", handle: "linen-apron", description: "<p>Stonewashed linen, <strong>made to order</strong>.</p>",
  published_at: "2026-03-02T10:00:00+01:00", vendor: "Linen & Loom", type: "Aprons", tags: ["kitchen", "linen"],
  price: 3800, price_min: 3800, price_max: 4200, available: true, compare_at_price: 4500,
  variants: [
    { id: 44000000000001, title: "Natural / Short", option1: "Natural", option2: "Short", option3: null, sku: "APR-NAT-S", requires_shipping: true, available: true, options: ["Natural", "Short"], price: 3800, compare_at_price: 4500, featured_image: { id: 1, src: "//linen-and-loom.example/cdn/shop/files/apron-natural.jpg?v=1" } },
    { id: 44000000000002, title: "Natural / Long", option1: "Natural", option2: "Long", option3: null, sku: "APR-NAT-L", requires_shipping: true, available: true, options: ["Natural", "Long"], price: 4200, compare_at_price: null, featured_image: null },
    { id: 44000000000003, title: "Charcoal / Short", option1: "Charcoal", option2: "Short", option3: null, sku: "APR-CHA-S", requires_shipping: true, available: false, options: ["Charcoal", "Short"], price: 3800, compare_at_price: null, featured_image: null },
  ],
  images: ["//cdn.shopify.com/s/files/1/0612/files/apron-front.jpg?v=1709", "//linen-and-loom.example/cdn/shop/files/apron-natural.jpg?v=1", "https://tracker.example/pixel.gif"],
  featured_image: "//cdn.shopify.com/s/files/1/0612/files/apron-front.jpg?v=1709",
  options: [{ name: "Colour", position: 1, values: ["Natural", "Charcoal"] }, { name: "Length", position: 2, values: ["Short", "Long"] }],
  url: "/products/linen-apron",
}
/* /products/pattern-pack.json: a digital product with no options. Prices are units as strings. */
const SHOPIFY_JSON = { product: {
  id: 8123456789099, title: "Sewing Pattern Pack", handle: "pattern-pack", body_html: "<p>Six PDF patterns, A4 and US Letter.</p>", vendor: "Linen & Loom", product_type: "Patterns",
  created_at: "2026-01-10T09:00:00+01:00", tags: "pdf, patterns, sewing",
  variants: [{ id: 45000000000001, product_id: 8123456789099, title: "Default Title", price: "12.50", sku: "PAT-PACK", position: 1, compare_at_price: "18.00", option1: "Default Title", option2: null, option3: null, requires_shipping: false, taxable: true, image_id: null }],
  options: [{ id: 1, product_id: 8123456789099, name: "Title", position: 1, values: ["Default Title"] }],
  images: [{ id: 3101, product_id: 8123456789099, position: 1, src: "https://cdn.shopify.com/s/files/1/0612/files/patterns.jpg?v=1", width: 1600, height: 1600, variant_ids: [] }],
  image: { id: 3101, src: "https://cdn.shopify.com/s/files/1/0612/files/patterns.jpg?v=1" },
} }
/* /products.json?limit=250&page=1 */
const SHOPIFY_CATALOG = { products: [
  { ...SHOPIFY_JSON.product },
  { id: 8123456789012, title: "Linen Apron", handle: "linen-apron", body_html: "<p>Stonewashed linen.</p>", vendor: "Linen & Loom", product_type: "Aprons", tags: ["kitchen", "linen"],
    variants: [
      { id: 44000000000001, title: "Natural / Short", option1: "Natural", option2: "Short", option3: null, sku: "APR-NAT-S", requires_shipping: true, available: true, price: "38.00", compare_at_price: "45.00", featured_image: { id: 1, src: "https://cdn.shopify.com/s/files/1/0612/files/apron-natural.jpg?v=1" } },
      { id: 44000000000002, title: "Natural / Long", option1: "Natural", option2: "Long", option3: null, sku: "APR-NAT-L", requires_shipping: true, available: true, price: "42.00", compare_at_price: null, featured_image: null },
    ],
    images: [{ id: 3001, src: "https://cdn.shopify.com/s/files/1/0612/files/apron-front.jpg?v=1709", position: 1, variant_ids: [] }],
    options: [{ name: "Colour", position: 1, values: ["Natural"] }, { name: "Length", position: 2, values: ["Short", "Long"] }] },
  { id: 8123456789100, title: "Gift card", handle: "gift-card", body_html: "", variants: [{ id: 1, title: "Default Title", price: null }], options: [], images: [] },
] }

const GUMROAD_URL = "https://mira.gumroad.com/l/film-presets"
const GUMROAD_PROPS = {
  product: {
    id: "x3Y_9kq2LmN4bVcZ8wA1Tg==", permalink: "film-presets", name: "Film Presets &amp; LUTs", seller: { id: "1", name: "Mira" },
    price_cents: 2400, currency_code: "usd", pwyw: null, is_physical: false, native_type: "digital", is_tiered_membership: false, is_legacy_subscription: false,
    description_html: "<p>Twelve Lightroom presets.</p><p><img src=\"https://public-files.gumroad.com/desc-1.jpg\"></p>",
    covers: [
      { id: "c1", type: "image", url: "https://public-files.gumroad.com/cover-small.jpg", original_url: "https://public-files.gumroad.com/cover-full.jpg", thumbnail: null, width: 670, height: 670 },
      { id: "c2", type: "video", url: "https://www.youtube.com/embed/abc", thumbnail: "https://public-files.gumroad.com/video-thumb.jpg" },
    ],
    options: [
      { id: "o1", name: "Lightroom", price_difference_cents: 0, is_pwyw: false, quantity_left: null },
      { id: "o2", name: "Lightroom + LUTs", price_difference_cents: 1100, is_pwyw: true, quantity_left: null },
    ],
  },
  purchase: null, discount_code: null, wishlists: [],
}
const GUMROAD_PAGE = `<!doctype html><html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Film Presets & LUTs","url":"${GUMROAD_URL}","offers":{"@type":"Offer","price":"24","priceCurrency":"usd"}}</script></head>
<body><script type="application/json" class="js-react-on-rails-component" data-component-name="ProductPage" data-dom-id="ProductPage-react-component-1">${JSON.stringify(GUMROAD_PROPS)}</script></body></html>`
const attr = (v: unknown) => JSON.stringify(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
const GUMROAD_INERTIA = `<!doctype html><html><body><div id="app" data-page="${attr({ component: "Products/Show", props: { product: { ...GUMROAD_PROPS.product, price_cents: 900, options: [] } }, url: "/l/film-presets" })}"></div></body></html>`

const PAYHIP_URL = "https://payhip.com/b/Qw3rT"
const PAYHIP_PAGE = `<!doctype html><html><head>
<title>Notion Budget Planner - Payhip</title>
<meta property="og:title" content="Notion Budget Planner - Payhip">
<meta property="og:description" content="A Notion template for monthly budgets.">
<meta property="og:image" content="https://payhip.com/cdn-cgi/image/format=auto,width=1200/https://pe56d.s3.amazonaws.com/o_1hq2budget.png">
<meta property="product:price:amount" content="1,299.00"><meta property="product:price:currency" content="USD">
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Notion Budget Planner","description":"A Notion template for monthly budgets.\\n\\nWorks on the free Notion plan & on mobile.","image":["https://pe56d.s3.amazonaws.com/o_1hq2budget.png","https://pe56d.s3.amazonaws.com/o_1hq2preview.png","https://images.example/hotlinked.png"],"brand":{"@type":"Brand","name":"Budget Studio"},"offers":[{"@type":"Offer","name":"Personal","price":"14.00","priceCurrency":"USD","availability":"https://schema.org/InStock"},{"@type":"Offer","name":"Commercial","price":"39.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}]}</script>
</head><body></body></html>`
const PAYHIP_META_ONLY = `<html><head><meta content="Watercolour Brushes" property="og:title"><meta property="og:description" content="48 brushes for Procreate."><meta property="og:image" content="https://pe56d.s3.amazonaws.com/o_brushes.jpg"><meta property="product:price:amount" content="1,299.00"><meta property="product:price:currency" content="JPY"></head></html>`

/* ── links and pictures ─────────────────────────────────────────────────── */

await check("links: product pages of each platform, a Shopify store, and a link without https://", () => {
  assert.deepEqual(((l) => [l.kind, l.kind === "product" && l.source])(importLink("https://mira.gumroad.com/l/film-presets?wanted=true")), ["product", "gumroad"])
  assert.deepEqual(((l) => [l.kind, l.kind === "product" && l.source])(importLink(PAYHIP_URL)), ["product", "payhip"])
  assert.deepEqual(((l) => [l.kind, l.kind === "product" && l.source])(importLink(`${SHOP}/en-de/products/linen-apron?variant=1`)), ["product", "shopify"])
  assert.equal(importLink("linen-and-loom.example/products/linen-apron").url.href, `${SHOP}/products/linen-apron`)
  for (const store of [SHOP, `${SHOP}/`, `${SHOP}/collections/all`, `${SHOP}/products`, `${SHOP}/en/collections/aprons`]) {
    const l = importLink(store)
    assert.equal(l.kind, "store", store); assert.equal(l.url.href, `${SHOP}/`)
  }
})
await check("links: anything not public https, and pages that are not a product, are refused before a fetch", () => {
  for (const u of ["http://shop.example/products/x", "https://127.0.0.1/products/x", "https://[::1]/products/x", "https://localhost/products/x", "https://printer.local/products/x", "https://shop.internal/products/x", "https://u:p@shop.example/products/x", "https://shop.example:8443/products/x", "file:///etc/passwd", "javascript:alert(1)", "https://shop.example/pages/about", "https://payhip.com/MiraStore", "https://gumroad.com/discover", "https://shop.example/products/x.js"]) {
    assert.throws(() => importLink(u), Error, u)
  }
  assert.throws(() => productLink(SHOP), /product page link/)
})
await check("pictures: Payhip's bucket, its resizer unwrapped, and nothing else from payhip.com", () => {
  assert.equal(importImageUrl("https://payhip.com/cdn-cgi/image/format=auto,width=1200/https://pe56d.s3.amazonaws.com/o_x.png"), "https://pe56d.s3.amazonaws.com/o_x.png")
  assert.equal(importImageUrl("https://payhip.com/cdn-cgi/image/w=1/https://169.254.169.254/latest"), null)
  assert.equal(importImageUrl("https://payhip.com/cdn-cgi/image/w=1/https://payhip.com/cdn-cgi/image/w=1/https://pe56d.s3.amazonaws.com/x"), null)
  assert.equal(importImageUrl("https://payhip.com/b/Qw3rT"), null)
  assert.equal(importImageUrl("https://other-bucket.s3.amazonaws.com/o_x.png"), null)
})
await check("duplicates know a Payhip product by its key", () => assert.equal(handleFromUrl(PAYHIP_URL), "qw3rt"))
await check("meta tags are read in either attribute order", () => {
  assert.equal(metaContent(PAYHIP_META_ONLY, "og:title"), "Watercolour Brushes")
  assert.equal(metaContent(PAYHIP_PAGE, "product:price:currency"), "USD")
})

/* ── Shopify ───────────────────────────────────────────────────────────── */

await check("Shopify .js: hundredths kept, options and variants, SKUs, compare-at, the store's own CDN, a tracker left behind", () => {
  const p = parseShopifyProduct(SHOPIFY_JS, SHOPIFY_HEAD, `${SHOP}/products/linen-apron`)
  assert.equal(p.currency, "EUR"); assert.equal(p.priceCents, 3800); assert.equal(p.type, "physical")
  assert.deepEqual(p.options, [{ name: "Colour", values: ["Natural", "Charcoal"] }, { name: "Length", values: ["Short", "Long"] }])
  assert.equal(p.variants.length, 3); assert.equal(p.variants[1].priceCents, 4200); assert.equal(p.variants[0].compareAtCents, 4500); assert.equal(p.variants[2].sku, "APR-CHA-S")
  assert.deepEqual(p.variants[0].options, ["Natural", "Short"])
  assert.equal(p.variants[0].image, `${SHOP}/cdn/shop/files/apron-natural.jpg?v=1`)
  assert.deepEqual(p.images, ["https://cdn.shopify.com/s/files/1/0612/files/apron-front.jpg?v=1709", `${SHOP}/cdn/shop/files/apron-natural.jpg?v=1`])
  assert.ok(p.warnings.some((w) => /unsupported hosts/.test(w)))
  assert.equal(p.vendor, "Linen & Loom"); assert.equal(p.category, "Aprons"); assert.equal(p.externalId, "linen-and-loom.example:8123456789012")
})
await check("Shopify .json: units as strings become hundredths, comma tags split, and Default Title is no variant", () => {
  const normal = shopifyJsonProduct(SHOPIFY_JSON)
  assert.ok(normal); assert.equal(normal.price, 1250)
  const p = parseShopifyProduct(normal, SHOPIFY_HEAD, `${SHOP}/products/pattern-pack`)
  assert.equal(p.priceCents, 1250); assert.equal(p.type, "digital"); assert.deepEqual(p.tags, ["pdf", "patterns", "sewing"])
  assert.deepEqual(p.variants, []); assert.deepEqual(p.options, [])
  assert.equal(p.descriptionHtml, "<p>Six PDF patterns, A4 and US Letter.</p>")
  assert.deepEqual(p.images, ["https://cdn.shopify.com/s/files/1/0612/files/patterns.jpg?v=1"])
})
await check("Shopify .js with one Default Title variant imports as a plain product", () => {
  const p = parseShopifyProduct({ id: 1, title: "Zine", price: 900, options: [{ name: "Title", values: ["Default Title"] }], variants: [{ title: "Default Title", price: 900, options: ["Default Title"], requires_shipping: false }], images: [] }, SHOPIFY_HEAD, `${SHOP}/products/zine`)
  assert.deepEqual(p.variants, []); assert.equal(p.priceCents, 900)
})
await check("Shopify options written as names only take their values from the variants", () => {
  const p = parseShopifyProduct({ ...SHOPIFY_JS, options: ["Colour", "Length"] }, SHOPIFY_HEAD, `${SHOP}/products/linen-apron`)
  assert.deepEqual(p.options.map((o) => o.values), [["Natural", "Charcoal"], ["Short", "Long"]])
})
await check("Shopify currency: JSON-LD first, then Shopify.currency, ShopifyAnalytics, og:price:currency; none is an error", () => {
  assert.equal(shopifyCurrency("", { offers: [{ priceCurrency: "gbp" }] }), "GBP")
  assert.equal(shopifyCurrency(SHOPIFY_HEAD), "EUR")
  assert.equal(shopifyCurrency("<script>window.ShopifyAnalytics.meta.currency = 'CAD';</script>"), "CAD")
  assert.equal(shopifyCurrency('<meta property="og:price:currency" content="AUD">'), "AUD")
  assert.throws(() => parseShopifyProduct(SHOPIFY_JS, "<html></html>", `${SHOP}/products/linen-apron`), /currency/)
})
await check("Shopify catalog: every priced product with its link, id, first picture and variant count", () => {
  const items = parseShopifyCatalog([SHOPIFY_CATALOG], SHOP)
  assert.equal(items.length, 2)
  assert.deepEqual(items[0], { url: `${SHOP}/products/pattern-pack`, externalId: "linen-and-loom.example:8123456789099", title: "Sewing Pattern Pack", image: "https://cdn.shopify.com/s/files/1/0612/files/patterns.jpg?v=1", priceCents: 1250, variants: 0, type: "digital" })
  assert.equal(items[1].priceCents, 3800); assert.equal(items[1].variants, 2); assert.equal(items[1].type, "physical")
  assert.equal(parseShopifyCatalog([SHOPIFY_CATALOG, SHOPIFY_CATALOG], SHOP).length, 2, "a product on two pages is listed once")
})

/* ── Gumroad ───────────────────────────────────────────────────────────── */

await check("Gumroad ProductPage props: price, versions with pay what you want, the full cover, entities in the name", () => {
  const p = parseGumroadProduct(GUMROAD_PAGE, GUMROAD_URL)
  assert.equal(p.title, "Film Presets & LUTs"); assert.equal(p.currency, "USD"); assert.equal(p.priceCents, 2400)
  assert.deepEqual(p.variants.map((v) => [v.name, v.priceCents, v.payWhatYouWant]), [["Lightroom", 2400, false], ["Lightroom + LUTs", 3500, true]])
  assert.deepEqual(p.images, ["https://public-files.gumroad.com/cover-full.jpg", "https://public-files.gumroad.com/video-thumb.jpg"])
  assert.equal(p.externalId, "x3Y_9kq2LmN4bVcZ8wA1Tg=="); assert.ok(p.descriptionHtml.includes("Twelve Lightroom presets"))
})
await check("Gumroad's Inertia data-page is read like the JSON script", () => {
  const p = parseGumroadProduct(GUMROAD_INERTIA, GUMROAD_URL)
  assert.equal(p.priceCents, 900); assert.equal(p.title, "Film Presets & LUTs"); assert.deepEqual(p.variants, [])
})
await check("Gumroad memberships are refused, by flag or by native type", () => {
  const page = (product: Record<string, unknown>) => `<script type="application/json">${JSON.stringify({ product: { ...GUMROAD_PROPS.product, ...product } })}</script>`
  assert.throws(() => parseGumroadProduct(page({ is_tiered_membership: true }), GUMROAD_URL), /community/)
  assert.throws(() => parseGumroadProduct(page({ native_type: "membership" }), GUMROAD_URL), /community/)
})
await check("Gumroad: the page's own product wins over one recommended further down", () => {
  const page = GUMROAD_PAGE + `<script type="application/json">${JSON.stringify({ product: { id: "other", name: "Other", price_cents: 100, currency_code: "usd" } })}</script>`
  assert.equal(parseGumroadProduct(page, GUMROAD_URL).externalId, "x3Y_9kq2LmN4bVcZ8wA1Tg==")
})

/* ── Payhip ────────────────────────────────────────────────────────────── */

await check("Payhip JSON-LD: title without the site name, lowest offer as the price, one variant per named offer", () => {
  const p = parsePayhipProduct(PAYHIP_PAGE, PAYHIP_URL)
  assert.equal(p.source, "payhip"); assert.equal(p.externalId, "payhip:Qw3rT"); assert.equal(p.title, "Notion Budget Planner")
  assert.equal(p.currency, "USD"); assert.equal(p.priceCents, 1400)
  assert.deepEqual(p.variants.map((v) => [v.name, v.priceCents]), [["Personal", 1400], ["Commercial", 3900]])
  assert.deepEqual(p.images, ["https://pe56d.s3.amazonaws.com/o_1hq2budget.png", "https://pe56d.s3.amazonaws.com/o_1hq2preview.png"])
  assert.ok(p.warnings.some((w) => /unsupported hosts/.test(w)))
  assert.equal(p.descriptionHtml, "<p>A Notion template for monthly budgets.</p><p>Works on the free Notion plan &amp; on mobile.</p>")
  assert.equal(p.vendor, "Budget Studio"); assert.equal(p.type, "digital")
})
await check("Payhip meta tags alone: a thousands separator, a whole-unit currency, the og picture", () => {
  const p = parsePayhipProduct(PAYHIP_META_ONLY, "https://payhip.com/b/AbC12")
  assert.equal(p.title, "Watercolour Brushes"); assert.equal(p.currency, "JPY"); assert.equal(p.priceCents, 129900)
  assert.deepEqual(p.images, ["https://pe56d.s3.amazonaws.com/o_brushes.jpg"]); assert.equal(p.descriptionHtml, "<p>48 brushes for Procreate.</p>")
})
await check("Payhip without a price is an error, not a free draft", () => {
  assert.throws(() => parsePayhipProduct('<meta property="og:title" content="Something">', PAYHIP_URL), /Payhip did not expose/)
})

/* ── the network half, with a stand-in fetcher ─────────────────────────── */

type Answer = { status?: number; body: string; url?: string }
function fetcher(routes: Record<string, Answer | (() => never)>, asked: string[] = []): Fetcher {
  return (async (href: string) => {
    asked.push(href)
    const a = routes[href]
    if (!a) return Object.defineProperty(new Response("Not found", { status: 404 }), "url", { value: href })
    if (typeof a === "function") return a()
    return Object.defineProperty(new Response(a.body, { status: a.status ?? 200 }), "url", { value: a.url ?? href })
  }) as unknown as Fetcher
}

await check("server: a Shopify product reads its page then .js", async () => {
  const asked: string[] = []
  const p = await fetchProductLink(`${SHOP}/products/linen-apron?utm_source=x`, fetcher({ [`${SHOP}/products/linen-apron`]: { body: SHOPIFY_HEAD }, [`${SHOP}/products/linen-apron.js`]: { body: JSON.stringify(SHOPIFY_JS) } }, asked))
  assert.equal(p.priceCents, 3800); assert.deepEqual(asked, [`${SHOP}/products/linen-apron`, `${SHOP}/products/linen-apron.js`])
})
await check("server: a store that hides .js (or answers it with HTML) is read from .json, in units", async () => {
  const p = await fetchProductLink(`${SHOP}/products/pattern-pack`, fetcher({ [`${SHOP}/products/pattern-pack`]: { body: SHOPIFY_HEAD }, [`${SHOP}/products/pattern-pack.js`]: { body: "<html>theme page</html>" }, [`${SHOP}/products/pattern-pack.json`]: { body: JSON.stringify(SHOPIFY_JSON) } }))
  assert.equal(p.priceCents, 1250); assert.equal(p.currency, "EUR")
})
await check("server: a myshopify.com link that moved to the store's own domain is read there", async () => {
  const p = await fetchProductLink("https://linen-and-loom.myshopify.com/products/linen-apron", fetcher({ "https://linen-and-loom.myshopify.com/products/linen-apron": { body: SHOPIFY_HEAD, url: `${SHOP}/products/linen-apron` }, [`${SHOP}/products/linen-apron.js`]: { body: JSON.stringify(SHOPIFY_JS) } }))
  assert.equal(p.externalId, "linen-and-loom.example:8123456789012")
})
await check("server: a password page, a missing product, a page that is not Shopify, each said plainly", async () => {
  await assert.rejects(fetchProductLink(`${SHOP}/products/x`, fetcher({ [`${SHOP}/products/x`]: { body: "<html>Enter password</html>", url: `${SHOP}/password` } })), (e: unknown) => e instanceof LinkImportError && /password/.test((e as Error).message))
  await assert.rejects(fetchProductLink(`${SHOP}/products/gone`, fetcher({})), (e: unknown) => e instanceof LinkImportError && /not found/.test((e as Error).message))
  await assert.rejects(fetchProductLink("https://woo.example/products/mug", fetcher({ "https://woo.example/products/mug": { body: "<html></html>" } })), (e: unknown) => e instanceof LinkImportError && /does not share/.test((e as Error).message))
  await assert.rejects(fetchProductLink(`${SHOP}/products/busy`, fetcher({ [`${SHOP}/products/busy`]: { status: 429, body: "" } })), /limiting requests/)
})
await check("server: Gumroad and Payhip pages are parsed from the one page read", async () => {
  const asked: string[] = []
  const g = await fetchProductLink(GUMROAD_URL, fetcher({ [GUMROAD_URL]: { body: GUMROAD_PAGE } }, asked))
  const p = await fetchProductLink(PAYHIP_URL, fetcher({ [PAYHIP_URL]: { body: PAYHIP_PAGE } }, asked))
  assert.equal(g.source, "gumroad"); assert.equal(p.source, "payhip"); assert.equal(asked.length, 2)
})
await check("server: a Shopify catalog reads the home page for its currency and /products.json page by page", async () => {
  const asked: string[] = []
  const full = { products: Array.from({ length: 250 }, (_, i) => ({ ...SHOPIFY_JSON.product, id: 9000 + i, handle: `pattern-${i}` })) }
  const c = await fetchShopifyCatalog(SHOP, fetcher({ [`${SHOP}/`]: { body: SHOPIFY_HEAD }, [`${SHOP}/products.json?limit=250&page=1`]: { body: JSON.stringify(full) }, [`${SHOP}/products.json?limit=250&page=2`]: { body: JSON.stringify(SHOPIFY_CATALOG) } }, asked))
  assert.equal(c.currency, "EUR"); assert.equal(c.items.length, 252); assert.equal(c.truncated, false); assert.equal(asked.length, 3)
  await assert.rejects(fetchShopifyCatalog("https://not-shopify.example", fetcher({ "https://not-shopify.example/": { body: "<html></html>" } })), /does not list its products/)
})
await check("server: a transport failure is not dressed up as a parser message", async () => {
  const boom = fetcher({ [`${SHOP}/products/x`]: () => { throw new Error("Refused: a private address") } })
  await assert.rejects(fetchProductLink(`${SHOP}/products/x`, boom), (e: unknown) => !(e instanceof LinkImportError))
})

/* ── a Payhip import, end to end against the in-memory database ────────── */

const creatorId = "creator-1", userId = "user-1"
const item = (p: LinkProduct) => ({ gumroadId: p.externalId, title: p.title, descriptionHtml: p.descriptionHtml, priceCents: p.priceCents, payWhatYouWant: p.payWhatYouWant, images: p.images, variants: p.variants, tags: p.tags })
const payhip = parsePayhipProduct(PAYHIP_PAGE, PAYHIP_URL)
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))
const tables = { products: [] as Record<string, unknown>[], product_variants: [] as Record<string, unknown>[], product_options: [] as Record<string, unknown>[], product_import_links: [] as Record<string, unknown>[] }
const db = fakeDb(tables, { unique: { product_import_links: [["creator_id", "source", "external_id"]] } })
const fetched: string[] = []
const result = await importGumroadItem(db, { creatorId, userId }, item(payhip), { source: "payhip", linkProduct: payhip, imageUrl: (u) => importImageUrl(u), fetchImage: async (u) => { fetched.push(u); return PNG } })
await check("a Payhip product becomes one draft with its two offers as variants, its pictures from Payhip's bucket only", () => {
  assert.equal(result.status, "imported")
  const row = tables.products[0]
  assert.equal(row.status, "draft"); assert.equal(row.price_cents, 1400); assert.equal(row.type, "digital")
  assert.deepEqual(tables.product_variants.map((v) => [v.name, v.price_cents]), [["Personal", 1400], ["Commercial", 3900]])
  assert.equal(tables.product_import_links[0].source, "payhip")
  assert.ok(fetched.every((u) => u.startsWith("https://pe56d.s3.amazonaws.com/")), fetched.join(","))
})
const before470 = fakeDb({ products: [], product_import_links: [] }, { failInsert: { product_import_links: { code: "23514", message: "new row violates check constraint \"product_import_links_source_check\"" } } })
const notReady = await importGumroadItem(before470, { creatorId, userId }, item(payhip), { source: "payhip", linkProduct: payhip })
await check("before SQL part 470 a Payhip import says the database needs its update, and writes nothing", () => assert.deepEqual(notReady, { status: "error", error: "not_ready" }))

console.log(`\n${checks} checks passed`)
