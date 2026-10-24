/**
 * ===========================================================================
 *  ROUND BC: A PRODUCT PAGE'S STARS, STOCK, DELIVERY DATE, OPTIONS AND
 *  SWATCHES, IN AN IMPORTED THEME AND IN STORELIB'S OWN
 * ===========================================================================
 * "I have a review and it says no reviews": the builder's canvas asked for
 * the reviews of the product picked, and a product page opened before one
 * was picked showed the shop's first product with no product reviews read,
 * so Star rating said No reviews yet. And a featured product's Star rating
 * had stars only while "Stars on product cards" was on.
 *
 * Stock: a Shopify theme's inventory block (Dawn's) read nothing for an
 * option with plenty, and was told a made up 11 above the low stock line.
 * With Show stock left on it is told the real count of the option picked
 * now, and Storelib's own Stock status block follows the option picker.
 *
 * Estimated delivery: a new block, in Storelib's product section and as an
 * app block for an imported theme, from the cheapest rate home's business
 * days and the days to get an order ready; nothing for a download.
 *
 * Options: the price, sold out values, the variant's photo, ?variant= and
 * the cart line all follow the option picked.
 *
 * Swatches: a seller sets each colour value's own swatch (a colour, or its
 * photo), kept on the option, and every picker draws it: Storelib's own,
 * `value.swatch` and the metafields older themes read.
 *
 * Run with:  npx tsx --conditions react-server tests/round-bc-productblocks.test.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { fakeDb } from "./_fake-db"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { drawPage, themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type CartEntry, type SiteData } from "../lib/storelib-theme/compat/site"
import { REVIEW_STARS_BLOCK } from "../lib/storelib-theme/compat/review-app-blocks"
import { ESTIMATED_DELIVERY_BLOCK, STOCK_STATUS_BLOCK, estimatedDeliveryHtml, stockLine, stockStatusHtml } from "../lib/storelib-theme/compat/product-app-blocks"
import { withPageFacts } from "../lib/storelib-theme/compat/product-facts"
import { pageFactsFor } from "../lib/storelib-theme/compat/product-facts-server"
import { productObject } from "../lib/storelib-theme/compat/objects"
import { buildStorefrontReviews } from "../lib/reviews/storefront"
import { readReviewsApp } from "../lib/reviews/app-settings"
import { variantStock } from "../lib/physical/storefront-stock"
import { deliveryWindow, deliveryWindowLine, DELIVERY_WINDOW_WORDS } from "../lib/physical/delivery-lines"
import { cleanSwatches, cleanSwatch } from "../lib/products/option-swatches"
import { normaliseOptions } from "../lib/physical/variants"
import { valueSwatchColor, valuePrefersPhoto } from "../lib/products/product-page-model"
import { addableBlocks, schemaFor, themeBlockCatalog } from "../lib/website-builder/storelib-schemas"
import { withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
type O = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const SHOP = "bc000000-0000-4000-8000-000000000001"
const TEE = "bc000000-0000-4000-8000-0000000000a1"
const EBOOK = "bc000000-0000-4000-8000-0000000000a2"
const HYDRA = "bc000000-0000-4000-8000-0000000000a3"
const S = "bc000000-0000-4000-8000-0000000000b1"
const M = "bc000000-0000-4000-8000-0000000000b2"
const L = "bc000000-0000-4000-8000-0000000000b3"
const XL = "bc000000-0000-4000-8000-0000000000b4"
const STUDIO = "bc000000-0000-4000-8000-0000000000c1"

/** The shop as the database holds it: a tee in four sizes (40, 3, none, none but Continue selling), a rate home of 2 to 4 business days. */
function db() {
  const variant = (v: O) => ({ product_id: TEE, price_cents: 3000, compare_at_price_cents: null, image_url: null, pay_what_you_want: false, max_purchases: null, active: true, track_inventory: true, inventory_policy: "deny", weight_grams: 200, fulfillment_method: null, sku: null, low_stock_threshold: null, ...v })
  return fakeDb({
    products: [{ id: TEE, creator_id: SHOP, type: "physical", status: "published", title: "Tee", slug: "tee", price_cents: 3000, inventory_count: null, track_inventory: true, continue_selling: false, low_stock_threshold: null, max_per_order: null, shipping_profile_id: null, weight_grams: 200, requires_shipping: true, fulfillment_method: "self" }],
    product_variants: [
      variant({ id: S, name: "S", option1: "S", position: 0, price_cents: 3000 }),
      variant({ id: M, name: "M", option1: "M", position: 1, price_cents: 3200, image_url: "https://cdn.test/tee-m.jpg" }),
      variant({ id: L, name: "L", option1: "L", position: 2, price_cents: 3400 }),
      variant({ id: XL, name: "XL", option1: "XL", position: 3, price_cents: 3600, inventory_policy: "continue" }),
    ],
    product_options: [{ product_id: TEE, position: 1, name: "Size", values: ["S", "M", "L", "XL"] }],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, low_stock_default: 5 }],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", country: "RO", active: true, fulfills_orders: true, pickup_enabled: false }],
    inventory_levels: [
      { variant_id: S, location_id: STUDIO, creator_id: SHOP, available: 40 },
      { variant_id: M, location_id: STUDIO, creator_id: SHOP, available: 3 },
      { variant_id: L, location_id: STUDIO, creator_id: SHOP, available: 0 },
      { variant_id: XL, location_id: STUDIO, creator_id: SHOP, available: 0 },
    ],
    shipping_profiles: [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }],
    shipping_zones: [{ id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false }],
    shipping_rates: [{ id: "r-ro", creator_id: SHOP, zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 1500, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4 }],
    shipping_packages: [],
    store_settings: [{ creator_id: SHOP, currency: "USD", default_country: "RO" }],
  })
}

const teeCard = () => ({
  id: TEE,
  settings: {
    title: "Tee",
    slug: "tee",
    url: "/products/tee",
    price: "$30.00",
    kind: "physical",
    available: true,
    image: "https://cdn.test/tee.jpg",
    images: ["https://cdn.test/tee.jpg"],
    options: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
    variants: [
      { id: S, name: "S", options: ["S"], price: "$30.00", available: true },
      { id: M, name: "M", options: ["M"], price: "$32.00", available: true, image: "https://cdn.test/tee-m.jpg" },
      { id: L, name: "L", options: ["L"], price: "$34.00", available: true },
      { id: XL, name: "XL", options: ["XL"], price: "$36.00", available: true },
    ],
  },
})
const ebook = { id: EBOOK, settings: { title: "Ebook", slug: "ebook", url: "/products/ebook", price: "$9.00", kind: "digital", available: true } }
/** Reviewed, with card stars off: its card carries no rating. */
const hydra = { id: HYDRA, settings: { title: "Hydra", slug: "hydra", url: "/products/hydra", price: "$29.00", kind: "digital", available: true } }

;(async () => {
  const zip = new JSZip()
  const walk = (dir: string, rel: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`)
      else zip.file(`${rel}${n}`, readFileSync(p))
    }
  }
  walk(join(process.cwd(), "tests/fixtures/shopify-materia"), "")
  walk(join(process.cwd(), "tests/fixtures/shopify-reviews"), "")
  walk(join(process.cwd(), "tests/fixtures/shopify-product-blocks"), "")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) {
    check("the fixture converts", false, r)
    process.exit(1)
  }
  const rows = r.theme.files as Record<string, string>
  const theme = themeOfInstall(rows, r.theme.settings, { assetUrl: (n: string) => `/a/${n}`, assetText: () => null })
  const shop = { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }

  /* The tee's page facts, read by the live site's own reader from the shop above. */
  const facts = await pageFactsFor(db(), SHOP, TEE, true)
  const factsHidden = await pageFactsFor(db(), SHOP, TEE, false)
  const tee = withPageFacts(teeCard(), facts)
  const teeHidden = withPageFacts(teeCard(), factsHidden)

  const main = (extra: O[] = []) => [
    {
      id: "main",
      type: "main-product",
      settings: {},
      blocks: [
        { id: "title", type: "title", settings: {} },
        { id: "price", type: "price", settings: {} },
        { id: "inv", type: "inventory", settings: { inventory_threshold: 10, show_inventory_quantity: true } },
        { id: "picker", type: "variant_picker", settings: {} },
        ...extra,
        { id: "buy", type: "buy_buttons", settings: {} },
      ],
    },
  ]
  const page = (card: O, extra: O = {}) => ({ designMode: false, host: "shop.test", products: [card, ...[ebook, hydra].filter((x) => x.id !== card.id)], collections: [], menus: {}, shop, template: "product", path: card.settings.url, product: card, ...extra })
  const draw = (p: O, sections: O[]) => drawPage(theme, p as never, sections as never, { scripts: false }).html
  const inv = (html: string) => html.match(/<p class="product__inventory[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[0].replace(/\s+/g, " ") ?? ""

  console.log("\n1. Storelib Reviews: the stars a product page and the builder show")
  {
    const settings = readReviewsApp({ enabled: true, display: { starColor: "#c2410c" } })
    const reviewRows = [
      { id: "r1", product_id: TEE, rating: 5, content: "Great", created_at: "2026-10-17T10:00:00Z", reviewer_name: "Drew" },
      { id: "r2", product_id: HYDRA, rating: 4, content: "Fresh", created_at: "2026-10-10T10:00:00Z", reviewer_name: "Priya" },
    ]
    const byProduct = { [TEE]: [5], [HYDRA]: [4] }
    const reviews = buildStorefrontReviews({ settings, creatorId: SHOP, rows: reviewRows, shopRatings: [5, 4], ratingsByProduct: byProduct, products: [{ id: TEE, title: "Tee", slug: "tee" }, { id: HYDRA, title: "Hydra", slug: "hydra" }], product: null })
    check("the shop's reviews carry every product's own stars (ratings by product)", reviews.ratings?.[TEE]?.count === 1 && reviews.ratings?.[TEE]?.average === 5 && reviews.ratings?.[HYDRA]?.average === 4, reviews.ratings)
    const home = draw({ designMode: false, host: "shop.test", products: [tee, ebook, hydra], collections: [], menus: {}, shop, template: "index", path: "/", reviews }, [{ id: "fp", type: "featured-product", settings: { product: HYDRA }, blocks: [{ id: "t", type: "title", settings: {} }, { id: "s", type: REVIEW_STARS_BLOCK, settings: {} }] }])
    const stars = home.slice(home.indexOf('data-block-id="s"'))
    check("a featured product with card stars off: Star rating still draws its 4.0 and 1 review, to its page's reviews", stars.includes("--rv: 80%") && stars.includes("1 review") && stars.includes('href="/products/hydra#reviews"'), stars.slice(0, 600))
    const editorHome = draw({ designMode: true, host: "shop.test", products: [tee, ebook, hydra], collections: [], menus: {}, shop, template: "index", path: "/", reviews }, [{ id: "fp", type: "featured-product", settings: { product: HYDRA }, blocks: [{ id: "s", type: REVIEW_STARS_BLOCK, settings: {} }] }])
    check("  and the same in the builder, never No reviews yet", editorHome.includes("--rv: 80%") && !editorHome.includes("No reviews yet"))
    const none = draw({ designMode: true, host: "shop.test", products: [tee, ebook, hydra], collections: [], menus: {}, shop, template: "index", path: "/", reviews }, [{ id: "fp", type: "featured-product", settings: { product: EBOOK }, blocks: [{ id: "s", type: REVIEW_STARS_BLOCK, settings: {} }] }])
    check("  a product with none still says No reviews yet in the builder", none.includes("No reviews yet"))
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the canvas asks for the reviews of the product it shows: the one picked, else the shop's first", /const reviewsProductId = templateOfPage\(pageKey\)\.template === "product" \? \(productId \?\? products\[0\]\?\.id \?\? null\) : null/.test(canvas) && /useCanvasReviews\(wantsReviews, reviewsProductId\)/.test(canvas))
    const server = read("lib/reviews/storefront-server.ts")
    check("the live site and the canvas read each product's ratings with the shop's (product_id, rating)", /select\("product_id, rating"\)/.test(server) && (server.match(/ratingsByProduct: shop\.byProduct/g) ?? []).length === 2)
  }

  console.log("\n2. Real stock: the theme's inventory block and Stock status")
  {
    check("the stock read keeps the real count beside the few-left rule", variantStock(40, { tracked: true, keepSelling: false, lowAt: 5 }).count === 40 && variantStock(40, { tracked: true, keepSelling: false, lowAt: 5 }).left === null && variantStock(4, { tracked: false, keepSelling: false, lowAt: 5 }).count === null)
    check("page facts, Show stock left on: each option's real count and that it is counted", facts?.variants.map((v) => `${v.count}:${v.tracked}`).join() === "40:true,3:true,0:true,0:true", facts?.variants)
    check("  Show stock left off: no count at all", factsHidden?.variants.every((v) => v.count === undefined) === true)
    const p = productObject(tee as never)
    const v = (id: string) => (p.variants as O[]).find((x) => x.id === id)!
    check("Shopify's fields: S counted with its real 40, M 3, L none, XL none but Continue selling", v(S).inventory_management === "shopify" && v(S).inventory_quantity === 40 && v(M).inventory_quantity === 3 && v(L).available === false && v(L).inventory_quantity === 0 && v(XL).available === true && v(XL).inventory_policy === "continue" && v(XL).inventory_quantity === 0, (p.variants as O[]).map((x) => [x.id, x.inventory_management, x.inventory_quantity, x.available]))
    const sPage = inv(draw(page(tee), main()))
    check("Dawn's inventory block on S: 40 in stock (it said nothing before)", sPage.includes("40 in stock") && !sPage.includes("visibility-hidden"), sPage)
    check("?variant= M: Low stock: 3 left", inv(draw(page(tee, { selectedVariantId: M }), main())).includes("Low stock: 3 left"))
    check("?variant= L: Out of stock", /Out of stock<\/p>/.test(inv(draw(page(tee, { selectedVariantId: L }), main()))))
    check("?variant= XL: Out of stock, continue selling", inv(draw(page(tee, { selectedVariantId: XL }), main())).includes("Out of stock, continue selling"))
    const hidden = inv(draw(page(teeHidden), main()))
    check("Show stock left off: no number is ever printed", !/\d+ in stock/.test(hidden) && !/\d+ left/.test(hidden), hidden)
    const withBlock = draw(page(tee), main([{ id: "stock", type: STOCK_STATUS_BLOCK, settings: {} }]))
    const blk = withBlock.slice(withBlock.indexOf('data-block-id="stock"'), withBlock.indexOf('data-block-id="stock"') + 3000)
    check("Stock status as an app block in Dawn's main product: In stock for S", blk.includes('class="slpb slpb-stock"') && blk.includes(">In stock</span>"), blk.slice(0, 400))
    const map = JSON.parse((blk.match(/data-stock="([^"]*)"/)?.[1] ?? "{}").replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
    check("  with every option's line for the picker to follow: M Only 3 left, L Out of stock", map[M]?.[1] === "Only 3 left" && map[L]?.[0] === "out" && map[S]?.[0] === "in", map)
    const own = stockStatusHtml({ variants: [{ id: S, available: true, management: "shopify", quantity: 40, policy: "deny" }], selectedId: S, settings: {}, words: {}, inEditor: false, blockId: "x" })
    check("  and the script that reads the option picked from the theme's own form", own.includes('form[action*="/cart/add"] [name="id"]') && own.includes('addEventListener("change"'))
    check("on ?variant= M it opens on Only 3 left", draw(page(tee, { selectedVariantId: M }), main([{ id: "stock", type: STOCK_STATUS_BLOCK, settings: {} }])).includes(">Only 3 left</span>"))
    check("its own words win: Few left text", stockLine({ id: M, available: true, management: "shopify", quantity: 3, policy: "deny" }, { low_text: "Hurry, {count} to go" }, {})?.line === "Hurry, {count} to go".replace("{count}", "3"))
    check("Storelib's own Low stock block, with In stock words set: Out of stock for a sold out option", /if \(str\(s\.in_stock_text\) && !ctx\.canBuy && !ctx\.sample && ctx\.variant\) return line\(w\("out_of_stock"\)\)/.test(read("components/website-builder/sections/renderers/product/product-blocks.tsx")))
    check("in the builder with no product: a quiet note", stockStatusHtml({ variants: [], selectedId: null, settings: {}, words: {}, inEditor: true, blockId: "x" }).includes("Stock status shows on a product's page"))
  }

  console.log("\n3. Estimated delivery")
  {
    const fri = new Date(2026, 9, 23, 10)
    const win = deliveryWindow({ minDays: 2, maxDays: 4, processingDays: 1 }, fri)!
    check("Friday morning, a day to get ready, 2 to 4 business days: Wed Oct 28 to Fri Oct 30", deliveryWindowLine(win, DELIVERY_WINDOW_WORDS) === "Arrives Wed, Oct 28 to Fri, Oct 30", deliveryWindowLine(win, DELIVERY_WINDOW_WORDS))
    check("  after the last order hour it starts on Monday: Thu Oct 29 to Mon Nov 2", deliveryWindowLine(deliveryWindow({ minDays: 2, maxDays: 4, processingDays: 1, cutoffHour: 9 }, fri)!, DELIVERY_WINDOW_WORDS) === "Arrives Thu, Oct 29 to Mon, Nov 2")
    check("  on a Saturday it counts from Monday, weekends never counted", deliveryWindowLine(deliveryWindow({ minDays: 3, maxDays: 3, processingDays: 0 }, new Date(2026, 9, 24, 10))!, DELIVERY_WINDOW_WORDS) === "Arrives Thu, Oct 29")
    check("  no days on the rate: no promise", deliveryWindow({ minDays: null, maxDays: null }, fri) === null)
    check("page facts carry the cheapest rate home's days", JSON.stringify(facts?.deliveryDays) === '{"minDays":2,"maxDays":4}', facts?.deliveryDays)
    const html = draw(page(tee), main([{ id: "eta", type: ESTIMATED_DELIVERY_BLOCK, settings: { processing_days: 1 } }]))
    const eta = html.slice(html.indexOf('data-block-id="eta"'), html.indexOf('data-block-id="eta"') + 3000)
    check("as an app block in Dawn's main product: Arrives <date> to <date>, counted again in the browser", /class="slpb slpb-delivery"/.test(eta) && /<span class="slpb-t">Arrives [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+ to [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+<\/span>/.test(eta) && eta.includes("data-window="), eta.slice(0, 500))
    const digital = draw(page(ebook), main([{ id: "eta", type: ESTIMATED_DELIVERY_BLOCK, settings: {} }]))
    check("a download: nothing on the website", !digital.includes('data-block-id="eta"'))
    check("  a note in the builder", estimatedDeliveryHtml({ ships: false, days: null, settings: {}, words: {}, locale: "en", inEditor: true }).includes("Estimated delivery shows for a product that ships"))
    check("  in the page's language", estimatedDeliveryHtml({ ships: true, days: { minDays: 3, maxDays: 3 }, settings: { processing_days: 0 }, words: { arrives_on: "Arriva {date}" }, locale: "it", inEditor: false, now: new Date(2026, 9, 24, 10) }).includes("Arriva gio 29 ott"))
    const product = JSON.parse(read("themes/default/sections/product.json"))
    const block = (product.blocks as O[]).find((b) => b.type === "estimated_delivery")
    check("Storelib's own product section: an Estimated delivery block with its panel", !!block && (block.fields as O[]).map((f) => f.id).join() === "processing_days,cutoff_hour,text,color,margin_top,margin_bottom")
    const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("  drawn by its own renderer, from the product's delivery days, nothing for a download", /estimated_delivery: EstimatedDelivery,/.test(blocks) && /function EstimatedDelivery\(/.test(blocks) && /Only a product that ships has a delivery date/.test(blocks))
    const files = withStorelibReviewsSection(rows)
    const catalog = themeBlockCatalog(files, { builtIn: false })
    const names = addableBlocks(schemaFor("main-product", files, {}), catalog).map((b) => b.name)
    check("Add block in a section that takes @app lists Stock status and Estimated delivery after Storelib Reviews'", JSON.stringify(names.slice(-4)) === '["Star rating","Reviews","Stock status","Estimated delivery"]', names)
  }

  console.log("\n4. Options: price, sold out, photo, ?variant= and the cart line")
  {
    const m = draw(page(tee, { selectedVariantId: M }), main())
    check("?variant= M: its price, its photo, M chosen, the form buys M", m.includes('id="Price-main"') && /\$32\.00/.test(m.match(/<p class="price"[^>]*>[^<]*/)?.[0] ?? "") && /tee-m\.jpg/.test(m.match(/<img class="pb-media"[^>]*>/)?.[0] ?? "") && m.includes(`name="id" value="${M}"`) && /<span class="pb-chosen">M<\/span>/.test(m))
    check("L sold out: its value disabled, and on its own page the button says Sold out", /class="pb-value disabled" data-value="L"/.test(m) && draw(page(tee, { selectedVariantId: L }), main()).includes(">Sold out</button>"))
    check("each value names the variant it makes", new RegExp(`data-value="XL" data-variant="${XL}"`).test(m))
    const site: SiteData = { creatorId: SHOP, theme, pages: { product: main() as never }, products: [tee as never, ebook as never], collections: [], menus: {}, shop, host: "shop.test" }
    const ask = (url: string, method = "GET", body: O | null = null, cart: CartEntry[] = []) => {
      const u = new URL(url, "https://shop.test")
      return answer(site, { method, path: u.pathname, query: u.searchParams, body, cart, note: "", attributes: {}, discountCode: "", ajax: true, referer: "/" })
    }
    const sectionM = await ask(`/products/tee?variant=${M}&section_id=main`)
    const sectionBody = String(sectionM.body)
    check("the section drawn again for ?variant= M (Dawn's picker asks for it): Low stock: 3 left and $32.00", sectionBody.includes("Low stock: 3 left") && sectionBody.includes("$32.00"), sectionBody.slice(0, 300))
    const added = await ask("/cart/add.js", "POST", { id: M, quantity: 1 })
    const line = (added.cart ?? [])[0] as O | undefined
    check("Add to cart with M: the cart line is that variant", !!line && JSON.stringify(line).includes(M), added.cart)
  }

  console.log("\n5. Swatches")
  {
    check("a swatch is a hex colour or photo, nothing else", cleanSwatch("#0077BE") === "#0077be" && cleanSwatch("#abc") === "#aabbcc" && cleanSwatch("photo") === "photo" && cleanSwatch("red; background:url(x)") === null)
    check("only for values the option has", JSON.stringify(cleanSwatches({ Ocean: "#0077be", Gone: "#000000", Red: "photo" }, ["Ocean", "Red"])) === '{"Ocean":"#0077be","Red":"photo"}')
    check("the product editor's save keeps them on the option", JSON.stringify(normaliseOptions([{ name: "Color", values: ["Ocean", "Red"], swatches: { Ocean: "#0077be", Red: "photo", Nope: "#111111" } }])[0].swatches) === '{"Ocean":"#0077be","Red":"photo"}')
    check("a value's colour: the seller's own, else its name's; photo when chosen", valueSwatchColor("Ocean", { Ocean: "#0077be" }) === "#0077be" && valueSwatchColor("Navy", {}) === "#1f2a44" && valueSwatchColor("Red", { Red: "photo" }) === null && valuePrefersPhoto("Red", { Red: "photo" }))
    const card = {
      id: "bc000000-0000-4000-8000-0000000000d1",
      settings: {
        title: "Cap",
        slug: "cap",
        url: "/products/cap",
        price: "$20.00",
        kind: "physical",
        available: true,
        images: ["https://cdn.test/cap.jpg", "https://cdn.test/cap-red.jpg"],
        options: [{ name: "Color", values: ["Navy", "Ocean", "Red"], swatches: { Ocean: "#0077be", Red: "photo" } }],
        variants: [
          { id: "cap-navy", name: "Navy", options: ["Navy"], price: "$20.00", available: true },
          { id: "cap-ocean", name: "Ocean", options: ["Ocean"], price: "$20.00", available: true },
          { id: "cap-red", name: "Red", options: ["Red"], price: "$20.00", available: false, image: "https://cdn.test/cap-red.jpg" },
        ],
      },
    }
    const html = draw(page(card), main())
    check("value.swatch in a Shopify theme: Navy by its name, Ocean the seller's #0077be", /data-value="Navy"[\s\S]{0,200}--swatch: #1f2a44;/.test(html) && /data-value="Ocean"[\s\S]{0,200}--swatch: #0077be;/.test(html), html.match(/<fieldset class="pb-option"[\s\S]*?<\/fieldset>/)?.[0])
    check("  Red, set to its photo: the variant's photo, though Red names a colour", /data-value="Red"[\s\S]{0,260}swatch--image[\s\S]{0,120}cap-red\.jpg/.test(html))
    check("metafield swatches older themes read: variant.metafields.custom.color_swatch", /data-variant="cap-ocean" data-mf="#0077be"/.test(html) && /data-variant="cap-navy" data-mf="#1f2a44"/.test(html), html.match(/<span class="pb-mf"[^>]*>/g))
    const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("Storelib's own Variant picker draws the seller's swatch too", /const color = valueSwatchColor\(value, o\.swatches\)/.test(blocks))
    const editor = read("components/physical/variant-options.tsx")
    check("the product editor: a dot beside each colour value to pick a colour or use its photo", /function SwatchPicker\(/.test(editor) && /type="color"/.test(editor) && /onChange\("photo"\)/.test(editor))
    const sql = read("supabase/sql/run-now/286_product_option_swatches.sql")
    check("SQL part 286 adds product_options.swatches, safe to run again", /ADD COLUMN IF NOT EXISTS swatches jsonb NOT NULL DEFAULT '\{\}'::jsonb/.test(sql))
    const readers = ["lib/website-builder/shop-products.ts", "lib/products/product-section-data.ts", "lib/physical/catalog-server.ts"].map(read)
    check("every reader asks for swatches and falls back without them before part 286", readers.every((src) => /swatches/.test(src) && /cleanSwatches\(/.test(src)))
  }

  console.log(`\n  ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
