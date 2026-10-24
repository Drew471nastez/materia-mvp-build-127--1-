/**
 * ===========================================================================
 *  STORELIB REVIEWS IN AN IMPORTED THEME, AS A SHOPIFY REVIEWS APP
 * ===========================================================================
 * The Materia fixture (tests/fixtures/shopify-materia, an Italian theme)
 * with tests/fixtures/shopify-reviews laid over it: a product page in both
 * shapes Shopify themes use (Dawn's main-product, section blocks and
 * `@app`; Horizon's product-information, theme blocks, `closest.product`
 * and `@app`), a card snippet, a featured product, a featured collection and
 * search results, each reading Shopify's review metafields the way those
 * themes do. Imported through the real converter and drawn by the engine.
 *
 *   METAFIELDS   product.metafields.reviews.rating (a rating: value,
 *                scale_min, scale_max) and rating_count, on the product
 *                page, the cards, a featured product, search results and
 *                the Section Rendering API (quick view); the product page's
 *                from its own reviews whatever the cards show; never from
 *                sample reviews
 *   APP BLOCKS   Storelib Reviews' Star rating and Reviews in Dawn's
 *                {% render block %} and Horizon's {% content_for 'blocks' %},
 *                nested too; another app's badge drawn as stars, its widget
 *                as reviews; nothing with the app off
 *   WORDS        Storelib's words in the page's language (Shop words)
 *   EDITOR       offered in Add block where the theme's schema takes "@app",
 *                and only there; "@theme" alone never takes an app block
 *   SEARCH       aggregateRating in the theme's structured data
 *   CANVAS       the builder asks for the store's real reviews on a product
 *                page; samples never become stars
 *
 * Run with:  node scripts/run-push-tests.mjs (it is in SUITES)
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { drawPage, drawSection, pageContextFor, themeOfInstall } from "../lib/storelib-theme/compat/page"
import { REVIEWS_SECTION_TYPE, reviewAppBlockKind, withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"
import { REVIEWS_LIST_BLOCK, REVIEW_STARS_BLOCK } from "../lib/storelib-theme/compat/review-app-blocks"
import { addableBlocks, blockSchemaIn, schemaFor, themeBlockCatalog } from "../lib/website-builder/storelib-schemas"
import { acceptsType } from "../lib/storelib-theme/schema/validate"
import { buildStorefrontReviews, sampleStorefrontReviews } from "../lib/reviews/storefront"
import { readReviewsApp } from "../lib/reviews/app-settings"
import { compatFields } from "../lib/markets/compat-fields"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

type O = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const P1 = "11111111-1111-4111-8111-111111111111"
const P2 = "22222222-2222-4222-8222-222222222222"
const P3 = "33333333-3333-4333-8333-333333333333"

/** Shown on cards while "Stars on product cards" is on (lib/website-builder/shop-products.ts withRatings). */
const rated = { id: P1, settings: { title: "Prime1 Clarity", slug: "prime1-clarity", url: "/products/prime1-clarity", price: 3900, price_cents: 3900, description: "Energia." }, rating: { value: 4.5, count: 2, percent: 90, color: "#c2410c" } }
const plain = { id: P2, settings: { title: "Shaker", slug: "shaker", url: "/products/shaker", price: 1200, price_cents: 1200 } }
/** Reviewed, with card stars off: its card carries no rating. */
const unrated = { id: P3, settings: { title: "Hydra", slug: "hydra", url: "/products/hydra", price: 2900, price_cents: 2900 } }

function reviewsFor(product: { id: string; title: string } | null, enabled = true) {
  const settings = readReviewsApp({ enabled, who: "anyone", display: { starColor: "#c2410c" } })
  const rows = [
    { id: "r1", product_id: P1, rating: 5, title: "Perfetto", content: "Exactly right", created_at: "2026-09-30T10:00:00Z", reviewer_name: "Maya Rivers", verified: true },
    { id: "r2", product_id: P1, rating: 4, content: "Buono.", created_at: "2026-09-20T10:00:00Z", reviewer_name: "Jonas" },
    { id: "r3", product_id: P3, rating: 4, content: "Fresco.", created_at: "2026-09-10T10:00:00Z", reviewer_name: "Priya" },
  ]
  const mine = product ? rows.filter((r) => r.product_id === product.id) : []
  return buildStorefrontReviews({ settings, creatorId: "c", rows, products: [{ id: P1, title: "Prime1 Clarity", slug: "prime1-clarity" }, { id: P3, title: "Hydra", slug: "hydra" }], product: product ? { id: product.id, title: product.title, rows: mine, ratings: mine.map((r) => r.rating) } : null })
}

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
  const r = await convertShopifyTheme(zip)
  if (!r.ok) {
    check("the fixture converts", false, r)
    process.exit(1)
  }
  const rows = r.theme.files as Record<string, string>
  const theme = themeOfInstall(rows, r.theme.settings, { assetUrl: (n: string) => `/a/${n}`, assetText: () => null })
  const productTemplate = (r.theme.pages as O[]).find((p) => p.page_key === "product")!.sections as O[]
  const shop = { name: "Materia", currency: "EUR", moneyFormat: "€{{amount}}" }
  const base = { designMode: false, host: "materia.test", products: [rated, plain, unrated], collections: [], menus: {}, shop }
  const productPage = (card: O, extra: O = {}) => ({ ...base, template: "product", path: card.settings.url, product: card, reviews: reviewsFor({ id: card.id, title: card.settings.title }), ...extra })
  const draw = (page: O, sections: O[]) => drawPage(theme, page as never, sections as never, { scripts: false }).html

  console.log("\nShopify's review metafields")
  {
    const html = draw(productPage(rated), productTemplate)
    check("the product page's own rating block: 4.5 / 5 and (2)", /<p class="rating-text">4\.5 \/ 5<\/p>\s*<p class="rating-count">\(2\)<\/p>/.test(html), html.match(/rating-wrapper[\s\S]{0,400}/)?.[0])
    check("  the stars Dawn's CSS fills: --rating: 4, --rating-max: 5, --rating-decimal: 0.5", html.includes("--rating: 4; --rating-max: 5; --rating-decimal: 0.5;"))
    const cards = html.slice(html.indexOf("Potrebbe piacerti"))
    check("the cards under it: the rated product carries its stars, the others none", (cards.match(/class="rating-text"/g) ?? []).length === 1 && cards.includes("(2)"))
    const off = draw(productPage(unrated), productTemplate)
    check("stars on product cards off: the product page still reads its own reviews (4.0 / 5, 1)", /<p class="rating-text">4\.0 \/ 5<\/p>\s*<p class="rating-count">\(1\)<\/p>/.test(off))
    check("  while its card elsewhere carries none", (off.slice(off.indexOf("Potrebbe piacerti")).match(/class="rating-text"/g) ?? []).length === 1)
    const none = draw(productPage(plain), productTemplate)
    check("a product with no reviews: no rating block at all", !none.slice(0, none.indexOf("Potrebbe piacerti")).includes('class="rating-wrapper"'))
    const sample = draw({ ...base, designMode: true, template: "product", path: unrated.settings.url, product: unrated }, productTemplate)
    check("in the builder before reviews arrive: samples never become a product's stars", !sample.slice(0, sample.indexOf("Potrebbe piacerti")).includes('class="rating-wrapper"'))
    const featured = draw({ ...base, template: "index", path: "/" }, [{ id: "fp", type: "featured-product", settings: { product: P1 }, blocks: [{ id: "t", type: "title", settings: {} }, { id: "rt", type: "rating", settings: {} }] }])
    check("a featured product reads them: 4.5 / 5 (2)", featured.includes('class="rating-text featured-rating"') && featured.includes("4.5 / 5 (2)"))
    const search = draw({ ...base, template: "search", path: "/search", search: { terms: "p", results: [rated, plain], performed: true } }, [{ id: "main", type: "main-search", settings: {} }])
    check("search results read them", (search.match(/class="rating-text">4\.5 \/ 5/g) ?? []).length === 1)
    const page = productPage(rated)
    const ctx = pageContextFor(theme, page as never, productTemplate as never)
    const quick = drawSection(theme, ctx, productTemplate.find((s) => s.type === "main-product") as never).html
    check("the product section drawn alone (quick view, Section Rendering API) reads them too", /<p class="rating-text">4\.5 \/ 5<\/p>/.test(quick))
  }

  console.log("\nStorelib Reviews' app blocks")
  {
    const dawn = productTemplate.map((s) => (s.type === "main-product" ? { ...s, blocks: [...s.blocks.slice(0, 1), { id: "stars", type: REVIEW_STARS_BLOCK, settings: { show_average: true } }, ...s.blocks.slice(1), { id: "list", type: REVIEWS_LIST_BLOCK, settings: { per_page: 1 } }] } : s))
    const html = draw(productPage(rated), dawn)
    const at = (id: string) => html.indexOf(`data-block-id="${id}"`)
    check("Dawn ({% render block %}): Star rating drawn in its place, after the title", at("stars") > html.indexOf('class="product__title"') && at("stars") < html.indexOf('class="price"'))
    const stars = html.slice(at("stars"), at("stars") + 2400)
    check("  the product's stars filled to 90%, 4.5 and 2 reviews, to #reviews", stars.includes("--rv: 90%") && stars.includes('<span class="slrv-rating-avg" aria-hidden="true">4.5</span>') && stars.includes("2 reviews") && stars.includes('href="#reviews"'), stars)
    check("  in the store's star colour, the theme's font and text colour", stars.includes("--slrv-star: #c2410c;") && /\.slrv-rating\{[^}]*font:inherit;color:inherit/.test(html))
    const list = html.slice(at("list"), at("list") + 9000)
    check("Reviews drawn in the product information column, compact, with the product's reviews", list.includes('class="slrv slrv-block"') && list.includes("Exactly right") && list.includes("Based on 2 reviews"))
    check("  its own setting: one review before Show more", list.includes("Show more reviews"))
    const horizon = [{ id: "pi", type: "product-information", settings: {}, blocks: [{ id: "details", type: "_product-details", settings: {}, blocks: [{ id: "title", type: "product-title", settings: {} }, { id: "hr", type: "review", settings: {} }, { id: "stars2", type: REVIEW_STARS_BLOCK, settings: {} }, { id: "list2", type: REVIEWS_LIST_BLOCK, settings: {} }] }] }]
    const h = draw(productPage(rated), horizon)
    check("Horizon ({% content_for 'blocks' %}, nested in product details): the theme's review block reads 4.5, 5, 2", /horizon-rating__value">4\.5<[\s\S]*horizon-rating__max">5<[\s\S]*horizon-rating__count">2</.test(h), h.match(/horizon-rating[\s\S]{0,300}/)?.[0])
    check("  Star rating and Reviews beside it, the product's", h.includes('data-block-id="stars2"') && h.slice(h.indexOf('data-block-id="stars2"')).includes("--rv: 90%") && h.includes("Exactly right"))
    const card = draw({ ...base, template: "index", path: "/" }, [{ id: "fp", type: "featured-product", settings: { product: P1 }, blocks: [{ id: "t", type: "title", settings: {} }, { id: "s", type: REVIEW_STARS_BLOCK, settings: { link: true } }] }])
    check("in a featured product: that product's stars, to its own page's reviews", card.includes("--rv: 90%") && card.includes('href="/products/prime1-clarity#reviews"'))
    const off = draw(productPage(rated, { reviews: reviewsFor({ id: P1, title: "Prime1 Clarity" }, false) }), dawn)
    check("the app off: neither block draws anything", !off.includes('data-block-id="stars"') && !off.includes("slrv-block"))
    const empty = draw(productPage(plain), dawn)
    check("no reviews on the website: no stars", !empty.includes('data-block-id="stars"'))
    const builder = draw(productPage(plain, { designMode: true }), dawn)
    check("  in the builder: a quiet No reviews yet, so the block can be found", builder.includes('class="slrv-rating slrv-rating-none">No reviews yet</p>'))
    check("another app's blocks a theme kept: a badge is stars, a widget is reviews", reviewAppBlockKind("shopify://apps/judge-me-reviews/blocks/preview_badge/61ccd3b1") === "stars" && reviewAppBlockKind("shopify://apps/loox-product-reviews/blocks/loox-rating/1") === "stars" && reviewAppBlockKind("shopify://apps/judge-me-reviews/blocks/review_widget/61ccd3b1") === "reviews" && reviewAppBlockKind("shopify://apps/klaviyo/blocks/form/1") === null)
    const judge = draw(productPage(rated), productTemplate.map((s) => (s.type === "main-product" ? { ...s, blocks: [{ id: "jm", type: "shopify://apps/judge-me-reviews/blocks/preview_badge/61ccd3b1", settings: { heading: "From Judge.me" } }, ...s.blocks] } : s)))
    check("  Judge.me's preview badge under the title draws the stars, never a whole reviews list", judge.includes('data-block-id="jm"') && judge.slice(judge.indexOf('data-block-id="jm"'), judge.indexOf('data-block-id="jm"') + 2400).includes("--rv: 90%") && !judge.includes("slrv-block") && !judge.includes("From Judge.me"))
    check("the full Storelib Reviews section still draws", draw(productPage(rated), [...productTemplate, { id: "rv", type: REVIEWS_SECTION_TYPE, settings: {} }]).includes("Based on 2 reviews"))
  }

  console.log("\nIn the page's language")
  {
    const words = { reviews: "recensioni", review: "recensione", based_on: "Basato su", write_a_review: "Scrivi una recensione", out_of_five_stars: "su 5 stelle", customer_reviews: "Recensioni dei clienti" }
    const dawn = productTemplate.map((s) => (s.type === "main-product" ? { ...s, blocks: [...s.blocks, { id: "stars", type: REVIEW_STARS_BLOCK, settings: {} }, { id: "list", type: REVIEWS_LIST_BLOCK, settings: {} }] } : s))
    const html = draw(productPage(rated, { i18n: { locale: "it", defaultLanguage: "en", languages: ["en", "it"], uiWords: words } }), dawn)
    check("Shop words: 2 recensioni, its label, Basato su, Scrivi una recensione, the block's heading", html.includes("2 recensioni") && html.includes('aria-label="4.5 su 5 stelle, 2 recensioni"') && html.includes("Basato su 2 recensioni") && html.includes("Scrivi una recensione") && html.includes("Recensioni dei clienti"))
    check("the Reviews block's own Heading is text the Translate sheet lists", (compatFields(theme).blockFieldsOf("main-product", REVIEWS_LIST_BLOCK) ?? []).some((f) => f.id === "heading" && f.type === "text"))
    check("  the website and the canvas hand over the same words (compat-fields.ts compatUiWords)", /compatUiWords\(map\)/.test(read("lib/markets/compat.ts")) && /compatUiWords\(map\)/.test(read("components/website-builder/compat/compat-canvas.tsx")))
  }

  console.log("\nAdd block in the builder")
  {
    const files = withStorelibReviewsSection(rows)
    const catalog = themeBlockCatalog(files, { builtIn: false })
    const names = (list: { name: string }[]) => list.map((b) => b.name)
    const main = schemaFor("main-product", files, {})
    /* Changed on purpose (round BC): Storelib's Stock status and Estimated delivery app blocks follow Storelib Reviews' two. */
    check("Dawn's main product (section blocks, @app): Star rating and Reviews after its own", JSON.stringify(names(addableBlocks(main, catalog)).slice(-4, -2)) === '["Star rating","Reviews"]' && names(addableBlocks(main, catalog)).includes("Product rating"))
    check("  each with its panel", (blockSchemaIn(main, catalog, REVIEW_STARS_BLOCK)?.fields ?? []).map((f) => f.id).join() === "show_average,show_count,link,star_color" && (blockSchemaIn(main, catalog, REVIEWS_LIST_BLOCK)?.fields ?? []).some((f) => f.id === "show_write"))
    const pi = schemaFor("product-information", files, {})
    check("Horizon's product information (@theme and @app): among its theme blocks", names(addableBlocks(pi, catalog)).includes("Star rating") && names(addableBlocks(pi, catalog)).includes("Product title"))
    check("  and inside product details, a theme block that takes @app", names(addableBlocks({ accepts: catalog["_product-details"]?.accepts }, catalog)).includes("Reviews"))
    check("a section whose schema does not take @app does not offer them", !names(addableBlocks(schemaFor("featured-collection", files, {}), catalog)).includes("Star rating") && !names(addableBlocks(schemaFor("slideshow", files, {}), catalog)).includes("Star rating"))
    check("\"@theme\" alone never takes an app block; \"@app\" does", !acceptsType(["@theme"], REVIEW_STARS_BLOCK) && acceptsType(["@theme", "@app"], REVIEW_STARS_BLOCK) && acceptsType(["@theme"], "product-title"))
    check("a Storelib theme's catalog has no app blocks", !(REVIEW_STARS_BLOCK in themeBlockCatalog({})))
  }

  console.log("\nSearch results")
  {
    const html = draw(productPage(rated), productTemplate)
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])
    check("the theme's structured data carries aggregateRating 4.5 from 2 reviews", ld.aggregateRating?.ratingValue === "4.5" && ld.aggregateRating.reviewCount === 2 && ld.aggregateRating.bestRating === 5)
    const none = draw(productPage(plain), productTemplate)
    check("  none for a product without reviews", !/aggregateRating/.test(none.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]))
  }

  console.log("\nThe builder's canvas")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    /* Changed on purpose (round BC): the product the page shows (the one picked, else the shop's first), not only one picked. */
    check("a product page asks for the store's real reviews, as do the Storelib Reviews section and a reviews block", /const wantsReviews = reviewsProductId !== null \|\| props\.sections\.some\(\(s\) => s\.type === REVIEW_WIDGET_SECTION_TYPE \|\| s\.type === REVIEWS_SECTION_TYPE \|\| holdsReviewsBlock\(s\.blocks\)\)/.test(canvas))
    const settings = readReviewsApp({ enabled: true })
    const sample = { ...sampleStorefrontReviews(settings, "", { id: P1, title: "Prime1 Clarity" }), enabled: true }
    const dawn = productTemplate.map((s) => (s.type === "main-product" ? { ...s, blocks: [...s.blocks, { id: "stars", type: REVIEW_STARS_BLOCK, settings: {} }] } : s))
    const html = draw({ ...productPage(plain), designMode: true, reviews: sample }, dawn)
    check("sample reviews draw the Reviews list, never a product's stars", !html.includes("--rv:") && html.includes("No reviews yet"))
    const real = draw({ ...productPage(rated), designMode: true }, dawn)
    check("the store's real reviews in the canvas: the stars, as on the website", real.includes("--rv: 90%") && /<p class="rating-text">4\.5 \/ 5<\/p>/.test(real))
  }

  console.log(`\n  ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
