/**
 * ===========================================================================
 *  STORELIB REVIEWS ON EVERY PRODUCT PAGE, WITHOUT PLACING ANYTHING
 * ===========================================================================
 * Turning Storelib Reviews on is the whole setup, as with a reviews app on
 * Shopify: every product page gets the stars under the product's name and
 * the reviews under the product.
 *
 *   SETTING     "Add to product pages", on unless the store turns it off
 *   STORELIB    the product section's Star rating block under the title and
 *               the Product reviews section under it, given once and kept
 *               out once removed; a page with its own keeps its own
 *   STARS       only from real published reviews, never samples, drawn by
 *               the block and linking to #reviews
 *   IMPORTED    a Dawn style main product section's own rating block and
 *               the Storelib Reviews section, drawn on a page that has no
 *               reviews of its own; a Judge.me block or a placed section
 *               stays as it is
 *   CARDS       Featured products and Featured collection cards carry the
 *               stars the shop grid's do, collections' products included
 *   WIRING      the live page, the editor and the compatible site call these
 *
 * Run with:  node scripts/run-push-tests.mjs (it is in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { REVIEWS_APP_DEFAULTS, mergeReviewsApp, readReviewsApp } from "../lib/reviews/app-settings"
import { buildStorefrontReviews, emptyStorefrontReviews, productRating, sampleStorefrontReviews } from "../lib/reviews/storefront"
import { AUTO_RATING_ID, AUTO_REVIEWS_ID, REVIEWS_ADDED, mainProductSection, productBlockDefaults, withProductReviews } from "../lib/website-builder/product-page"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage } from "../lib/storelib-theme/compat/page"
import { AUTO_RATING_BLOCK_ID, AUTO_REVIEWS_SECTION_ID, withProductPageReviews, withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"
import { ProductBlock, type ProductCtx } from "../components/website-builder/sections/renderers/product/product-blocks"
import type { SectionInstance } from "../lib/website-builder/types"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { renderSection } from "../lib/storelib-theme/render"
import { storefrontData } from "../lib/website-builder/storefront-data"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
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
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const CREATOR = "33333333-3333-4333-8333-333333333333"
const PRODUCT = "22222222-2222-4222-8222-222222222222"

/* ── The setting ─────────────────────────────────────────────────────── */
console.log("\nThe setting")
{
  check("on by default, so turning the app on is the whole setup", REVIEWS_APP_DEFAULTS.display.productPage === true && readReviewsApp(null).display.productPage === true)
  check("settings saved before it existed read it as on", readReviewsApp({ enabled: true, display: { starColor: "#000000" } }).display.productPage === true)
  check("off stays off, and a change to another display setting keeps it", mergeReviewsApp({ display: { productPage: false } }, { display: { showDate: false } }).display.productPage === false)
  check("a value that is not true or false reads as the default", readReviewsApp({ display: { productPage: "no" } }).display.productPage === true)
  const empty = emptyStorefrontReviews(readReviewsApp({ enabled: true, display: { productPage: false } }), CREATOR)
  check("what a page is handed says whether product pages get them", empty.product_page === false && emptyStorefrontReviews(readReviewsApp({ enabled: true }), CREATOR).product_page === true)
  const panel = read("components/app/settings/reviews-app-panel.tsx")
  check("the switch is in Settings › Integrations › Storelib Reviews, under On your website", /label="Add to product pages"/.test(panel) && /productPage: v/.test(panel) && panel.indexOf("Add to product pages") > panel.indexOf("On your website"))
}

/* ── A Storelib theme's product page ─────────────────────────────────── */
console.log("\nA Storelib theme's product page")
const header: SectionInstance = { id: "h", type: "header", name: "Header", settings: {}, blocks: [], hidden: false }
const footer: SectionInstance = { id: "f", type: "footer", name: "Footer", settings: {}, blocks: [], hidden: false }
const page = (product: SectionInstance, ...rest: SectionInstance[]) => [header, product, ...rest, footer]
{
  const main = { ...mainProductSection("main"), settings: { ...mainProductSection("main").settings, color_scheme: "light" } }
  const before = page(main)
  check("the app off, or the switch off: the page as it was, the same array", withProductReviews(before, false) === before)
  const after = withProductReviews(before, true)
  check("on: the Product reviews section right under the product section", after.map((s) => s.type).join() === "header,product,reviews_product,footer", after.map((s) => s.type))
  const reviews = after[2]
  check("  with a fixed id, in the product section's colour scheme, every other setting its own default", reviews.id === AUTO_REVIEWS_ID && reviews.settings.color_scheme === "light" && Object.keys(reviews.settings).length === 1 && reviews.hidden === false)
  const blocks = after[1].blocks!.map((b) => b.type)
  check("and the Star rating block right under the title", blocks[blocks.indexOf("title") + 1] === "rating" && after[1].blocks!.find((b) => b.type === "rating")!.id === AUTO_RATING_ID, blocks)
  check("  with its schema's defaults", JSON.stringify(after[1].blocks!.find((b) => b.type === "rating")!.settings) === JSON.stringify(productBlockDefaults("rating")) && productBlockDefaults("rating").show_count === true)
  check("the product section remembers it was given them", after[1].settings[REVIEWS_ADDED] === true)
  check("given once: the page drawn again is the same page", withProductReviews(after, true) === after)
  const removed = after.filter((s) => s.id !== AUTO_REVIEWS_ID).map((s) => (s.type === "product" ? { ...s, blocks: s.blocks!.filter((b) => b.type !== "rating") } : s))
  check("removed by the store in the editor, saved: never put back", withProductReviews(removed, true) === removed)
  const own = page(mainProductSection("main"), { id: "mine", type: "reviews_product", name: "Product reviews", settings: { heading: "What people say" }, blocks: [], hidden: false })
  const ownAfter = withProductReviews(own, true)
  check("a page with its own Product reviews keeps it, and gets no second one", ownAfter.filter((s) => s.type === "reviews_product").length === 1 && ownAfter.some((s) => s.id === "mine"))
  check("  and still gets the stars under the title", ownAfter[1].blocks!.some((b) => b.type === "rating"))
  const hiddenOwn = page(mainProductSection("main"), { id: "mine", type: "reviews_all", name: "All reviews", settings: {}, blocks: [], hidden: true })
  check("one the store hid counts as its own too", withProductReviews(hiddenOwn, true).filter((s) => s.type.startsWith("reviews_")).length === 1)
  const badge = page(mainProductSection("main"), { id: "b", type: "reviews_badge", name: "Star rating", settings: {}, blocks: [], hidden: false })
  const badgeAfter = withProductReviews(badge, true)
  check("a page with a Star rating section gets no second row of stars, only the reviews", !badgeAfter[1].blocks!.some((b) => b.type === "rating") && badgeAfter.some((s) => s.type === "reviews_product"))
  const bare = { ...mainProductSection("main"), blocks: [] }
  const bareAfter = withProductReviews(page(bare), true)
  check("a product section emptied of its blocks is left empty, and the reviews still come", bareAfter[1].blocks!.length === 0 && bareAfter.some((s) => s.type === "reviews_product"))
  const hidden = { ...mainProductSection("main"), hidden: true }
  check("a hidden product section: nothing is added", withProductReviews(page(hidden), true).length === 3)
  check("a page with no product section (its own design): nothing is added", withProductReviews([header, footer], true).length === 2)
}

/* ── The stars ───────────────────────────────────────────────────────── */
console.log("\nThe stars under the title")
const settings = readReviewsApp({ enabled: true, display: { starColor: "#e8a33d" } })
const rows = [
  { id: "r1", product_id: PRODUCT, rating: 5, title: "Exactly right", content: "Good.", created_at: "2026-09-30T10:00:00Z", reviewer_name: "Maya Rossi", verified: true },
  { id: "r2", product_id: PRODUCT, rating: 4, title: "", content: "Fine.", created_at: "2026-09-29T10:00:00Z", reviewer_name: "Sam", verified: true },
]
const real = buildStorefrontReviews({ settings, creatorId: CREATOR, rows, products: [{ id: PRODUCT, title: "Linen apron", slug: "linen-apron" }], product: { id: PRODUCT, title: "Linen apron", rows, ratings: [5, 4] } })
{
  const r = productRating(real)
  check("from the product's published reviews: average, share filled, count, the store's colour", r !== null && r.average_label === "4.5" && r.percent === 90 && r.count === 2 && r.count_label === "2 reviews" && r.star_color === "#e8a33d", r)
  check("none with the app off", productRating({ ...real, enabled: false }) === null)
  check("none from sample reviews, in the builder or anywhere", productRating({ ...sampleStorefrontReviews(settings, CREATOR, { id: PRODUCT, title: "Linen apron" }), enabled: true }) === null)
  check("none for a product without reviews", productRating(buildStorefrontReviews({ settings, creatorId: CREATOR, rows: [], products: [], product: { id: PRODUCT, title: "Linen apron", rows: [], ratings: [] } })) === null)
  check("none off a product page", productRating(buildStorefrontReviews({ settings, creatorId: CREATOR, rows, products: [] })) === null)
  check("none when nothing was read", productRating(null) === null && productRating(undefined) === null)

  const palette = { heading: "#111111", paragraph: "#444444", text: "#222222", text_muted: "#666666", border: "#dddddd", accent: "#0055ff", background: "#ffffff" }
  const ctx = (rating: unknown, inEditor = false) =>
    ({ product: { id: PRODUCT, title: "Linen apron", slug: "linen-apron", type: "digital", description: "", price_cents: 4800, compare_at_cents: null, thumbnail_url: "", gallery_urls: [], rating }, sample: false, palette, inEditor, inert: false }) as unknown as ProductCtx
  const draw = (rating: unknown, s: Record<string, unknown> = {}, inEditor = false) => renderToStaticMarkup(createElement(ProductBlock, { block: { id: "auto-rating", type: "rating", settings: { ...productBlockDefaults("rating"), ...s } }, ctx: ctx(rating, inEditor) }))
  const html = draw(r)
  check("the block: stars filled to 90% in the store's colour, the average and the count", html.includes("width:90%") && html.includes("color:#e8a33d") && html.includes(">4.5<") && html.includes("(2 reviews)"), html)
  check("  read out as a rating, linking down to the reviews", html.includes('aria-label="4.5 out of 5 stars"') && html.includes('href="#reviews"'))
  check("  the block's own star colour wins over the app's", draw(r, { star_color: "#ff0000" }).includes("color:#ff0000"))
  check("  the average and the count can be left out", !draw(r, { show_average: false, show_count: false }).includes("(2 reviews)") && !draw(r, { show_average: false }).includes(">4.5<"))
  check("no reviews on the live page: nothing at all, not a row of grey stars", draw(null).replace(/<[^>]+>/g, "").trim() === "" && !draw(null).includes("★"))
  check("in the builder: one quiet line saying when stars show", draw(null, {}, true).includes("Stars show here once this product has a published review"))

  const schema = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string; fields: { id: string }[] }[]; presets: { blocks: { type: string }[] }[] }
  const types = schema.blocks.map((b) => b.type)
  check("Star rating is a product block, offered right after Title", types[types.indexOf("title") + 1] === "rating" && schema.blocks.find((b) => b.type === "rating")!.fields.some((f) => f.id === "margin_bottom"))
  check("a new product section does not carry it until the app is on", !schema.presets[0].blocks.some((b) => b.type === "rating"))
}

/* ── An imported theme ───────────────────────────────────────────────── */
console.log("\nAn imported Shopify theme's product page")
{
  const mainSchema = { type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [{ type: "@app" }, { type: "title" }, { type: "price" }, { type: "rating" }, { type: "buy_buttons" }] } }
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><body><main>{{ content_for_layout }}</main></body></html>`),
    "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="mp">{%- for block in section.blocks -%}{%- case block.type -%}{%- when '@app' -%}{% render block %}{%- when 'rating' -%}{%- if product.metafields.reviews.rating.value != blank -%}<span class="stars">{{ product.metafields.reviews.rating.value }} ({{ product.metafields.reviews.rating_count }})</span>{%- endif -%}{%- else -%}<i>{{ block.type }}</i>{%- endcase -%}{%- endfor -%}</div>`)}\n\n<schema>\n${JSON.stringify(mainSchema)}\n</schema>\n`,
    "sections/related.storelib": `${wrapCompatTemplate(`<div class="rel"></div>`)}\n\n<schema>\n${JSON.stringify({ type: "related", name: "Related", settings: [] })}\n</schema>\n`,
  }
  const theme = new CompatTheme(withStorelibReviewsSection(files), {}, { assetUrl: (n) => `/a/${n}` })
  const sections = [
    { id: "hd", type: "theme-header", group: "header" },
    { id: "mp", type: "main-product", blocks: [{ id: "t", type: "title", settings: {} }, { id: "p", type: "price", settings: {} }, { id: "b", type: "buy_buttons", settings: {} }] },
    { id: "rel", type: "related" },
    { id: "ft", type: "theme-footer", group: "footer" },
  ]
  const placed = withProductPageReviews(sections, theme)
  check("the Storelib Reviews section right under the main product section", placed.map((s) => s.id).join() === `hd,mp,${AUTO_REVIEWS_SECTION_ID},rel,ft`, placed.map((s) => s.id))
  const mp = placed.find((s) => s.id === "mp")!
  check("and the theme's own rating block under the title, since its schema has one", mp.blocks!.map((b) => b.id).join() === `t,${AUTO_RATING_BLOCK_ID},p,b`)
  check("nothing written: the page row handed in is unchanged", sections[1].blocks!.length === 3 && sections.length === 4)
  const withRating = { id: PRODUCT, settings: { title: "Linen apron", price: "$48.00", url: "/products/linen-apron", slug: "linen-apron" }, rating: { value: 4.5, count: 2, percent: 90, color: "#e8a33d" } }
  const base = { designMode: false, products: [withRating], collections: [], menus: {}, shop: { name: "Drew Studio", currency: "USD", moneyFormat: "${{amount}}" } }
  const html = drawPage(theme as never, { ...base, template: "product", path: "/products/linen-apron", product: withRating, reviews: real } as never, placed.filter((s) => !s.group) as never, { scripts: false }).html
  check("drawn: the theme's stars from the review metafields, then the reviews", html.includes('<span class="stars">4.5 (2)</span>') && html.includes("Based on 2 reviews") && html.indexOf("stars") < html.indexOf("Based on 2 reviews"), html.slice(0, 400))
  check("  and the reviews come before the theme's next section", html.indexOf("Based on 2 reviews") < html.indexOf('class="rel"'))

  const judge = sections.map((s) => (s.id === "mp" ? { ...s, blocks: [...s.blocks!, { id: "jm", type: "shopify://apps/judge-me-reviews/blocks/review_widget/61ccd3b1", settings: {} }] } : s))
  check("a page that kept a Judge.me block is left as it is", withProductPageReviews(judge, theme) === judge)
  const placedByStore = [...sections.slice(0, 3), { id: "rv", type: "storelib-reviews" }, sections[3]]
  check("a page with the Storelib Reviews section the store placed is left as it is", withProductPageReviews(placedByStore, theme) === placedByStore)
  const hasStars = sections.map((s) => (s.id === "mp" ? { ...s, blocks: [s.blocks![0], { id: "r", type: "rating", settings: {} }, ...s.blocks!.slice(1)] } : s))
  const starsKept = withProductPageReviews(hasStars, theme)
  check("a main product section with its stars keeps one row of them, and gets the reviews", starsKept.find((s) => s.id === "mp")!.blocks!.filter((b) => b.type === "rating").length === 1 && starsKept.some((s) => s.id === AUTO_REVIEWS_SECTION_ID))
  const noRatingTheme = new CompatTheme(withStorelibReviewsSection({ ...files, "sections/main-product.storelib": files["sections/main-product.storelib"].replace(',{"type":"rating"}', "") }), {}, { assetUrl: (n) => `/a/${n}` })
  const noRating = withProductPageReviews(sections, noRatingTheme)
  check("a theme whose product section has no rating block: no block it cannot draw, the reviews still come", noRating.find((s) => s.id === "mp")!.blocks!.length === 3 && noRating.some((s) => s.id === AUTO_REVIEWS_SECTION_ID))
  const storelibTheme = { files: { "sections/x.storelib": "<template></template>" }, schemaOf: () => ({}) }
  check("a theme without the Storelib Reviews section file: nothing", withProductPageReviews(sections, storelibTheme) === sections)
  const other = [{ id: "hd", type: "theme-header", group: "header" }, { id: "x", type: "custom-product-layout" }, { id: "ft", type: "theme-footer", group: "footer" }]
  check("no main product section found: after the page's own last section, before the footer", withProductPageReviews(other, theme).map((s) => s.id).join() === `hd,x,${AUTO_REVIEWS_SECTION_ID},ft`)
}

/* ── The sections a Storelib theme draws them with ───────────────────── */
console.log("\nDrawn by the live engine")
{
  const draw = (type: string, settings: Record<string, unknown>, products: unknown[] = [], page: Record<string, unknown> = { template: "product" }) => {
    const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`], { file: `sections/${type}.storelib` })
    if (r.ok !== true) throw new Error(`${type}: ${JSON.stringify(r.errors)}`)
    return renderSection({ compiled: r.value, id: "s1", instance: { type, settings }, theme: {}, page: page as never, data: storefrontData({ dynamic: { shop: { name: "Drew Studio" } } as never, reviews: real as unknown as Record<string, unknown> }), products: products as never }).html
  }
  const placed = withProductReviews(page(mainProductSection("main")), true).find((s) => s.id === AUTO_REVIEWS_ID)!
  const html = draw("reviews_product", placed.settings)
  check("the Product reviews section placed with no settings of its own draws in full: average, bars, reviews", html.includes("Based on 2 reviews") && html.includes("Exactly right") && html.includes('id="reviews"') && html.includes("rv__bars"))
  const card = { id: PRODUCT, type: "product", settings: { title: "Linen apron", price: "$48.00", image: "", url: "/products/linen-apron" }, rating: { value: 4.5, count: 2, percent: 90, color: "#e8a33d" } }
  const plain = { id: "p2", type: "product", settings: { title: "Oak board", price: "$30.00", image: "", url: "/products/oak-board" } }
  const featured = draw("product_featured", { source: "shop" }, [card, plain], { template: "index" })
  check("Featured products cards carry their stars too, like the shop grid's; one without reviews carries none", (featured.match(/card__rating/g) ?? []).length === 1 && featured.includes("(2)") && featured.includes("width:90%"))
  check("  and the store can turn them off there", !draw("product_featured", { source: "shop", show_rating: false }, [card, plain], { template: "index" }).includes("card__rating"))
  const collection = DEFAULT_THEME_SOURCES["sections/collection_featured.storelib"]
  check("Featured collection cards too", /settings\.show_rating and block\.rating\.count > 0/.test(collection) && /"id": "show_rating"/.test(collection) && compileSection(collection, { file: "sections/collection_featured.storelib" }).ok === true)
  const collections = read("lib/website-builder/storefront-collections-server.ts")
  check("a collection's products are given their stars, so a collection's cards show them like the shop's", /await withRatings\(db, creatorId, \[\.\.\.unique\.values\(\)\]\)/.test(collections))
}

/* ── Wiring ──────────────────────────────────────────────────────────── */
console.log("\nWhere it is called")
{
  const live = read("components/website-builder/theme/render-product.tsx")
  check("the live product page: placed while the app is on with the switch on, and the stars handed to the block", /withProductReviews\(placed, reviewsOn\)/.test(live) && /reviewsHere\?\.enabled === true && reviewsHere\.product_page === true/.test(live) && /productRating\(reviewsHere\)/.test(live) && /const stars = rating \? \{ rating \} : \{\}/.test(live) && /\{ \.\.\.productData, \.\.\.stars \}/.test(live))
  check("  read beside the page's other reads, never after them", /productPricing\(admin, product\.id\),\n    reviewsRead,\n  \]\)/.test(live))
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor opens the product page with them, to move or remove", /loaded = withProductReviews\(loaded, data\.reviews_on === true\)/.test(editor))
  check("  and its canvas draws the product's real stars, never a sample's", /productRating\(canvasReviews as unknown as StorefrontReviews \| undefined\)/.test(editor) && /* Changed on purpose (round AI, Add a section draws in the canvas first): the canvas's drawing steps are shared functions (inLanguageStep, filledStep, optionsStep, pricedStep) that a section just added is drawn through too. */ /pricedStep\(drawnInLanguage, previewPricing, moneyLocale, canvasRating\)/.test(editor) && /\{ \.\.\.\(raw as Record<string, unknown>\), rating \}/.test(editor))
  const route = read("app/api/website-builder/themes/[installId]/sections/route.ts")
  check("the editor is told by the page's own read, for the product page only", /pageKey === "product" && creatorId/.test(route) && /r\.settings\.enabled && r\.settings\.display\.productPage/.test(route) && /reviews_on: true/.test(route))
  const site = read("lib/storelib-theme/compat/site.ts")
  check("an imported theme's live product page", /reviews\.enabled === true && reviews\.product_page === true\) route\.sections = withProductPageReviews\(route\.sections, site\.theme\)/.test(site))
}

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`  failing:\n    ${failures.join("\n    ")}`)
  process.exit(1)
}
process.exit(0)
