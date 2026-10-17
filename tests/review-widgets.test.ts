/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS
 * ===========================================================================
 *   SETTINGS     every value from a list or a range: no colour, size or
 *                font a merchant types reaches CSS; words kept as plain text
 *   DRAWN        every widget from real reviews, escaped; sorting, filters,
 *                limits; empty and off; samples said as samples, in the
 *                builder only
 *   WORDS        the website's dictionary in the page's language, the
 *                store's own words per language over it
 *   THEMES       the Storelib theme's Reviews widget section through the
 *                live engine, with a saved look and a page's changes; an
 *                imported theme's section through the compatible engine
 *   ADD SECTION  Apps › Reviews in both kinds of theme
 *   ADD TO WEBSITE  where a widget goes, and the builder's address for it
 *   SQL          part 216: owner read only, server writes
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/review-widgets.test.ts
 */
import { readFileSync } from "node:fs"
import { readReviewsApp } from "../lib/reviews/app-settings"
import { buildStorefrontReviews, sampleStorefrontReviews } from "../lib/reviews/storefront"
import { WIDGET_TYPES, cleanWidgetConfigInput, defaultWidgetSettings, readWidgetConfigRow, resolveWidgetSettings, sanitizeWidgetSettings, sectionOverrides, widgetWords } from "../lib/reviews/widgets/config"
import { renderReviewWidget, renderReviewWidgetSection, widgetCss, widgetPool } from "../lib/reviews/widgets/render"
import { reviewWidgetScript } from "../lib/reviews/widgets/enhance"
import { defaultPlacement, editorAddress, readPlacement } from "../lib/reviews/widgets/placement"
import { previewReviews } from "../lib/reviews/widgets/preview-data"
import { fieldsFor } from "../lib/reviews/widgets/fields"
import { appSectionCategory, classifyImportedSection } from "../lib/website-builder/section-categories"
import { UI_WORDS } from "../lib/markets/ui-words"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { renderSection } from "../lib/storelib-theme/render"
import { storefrontData } from "../lib/website-builder/storefront-data"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage } from "../lib/storelib-theme/compat/page"
import { REVIEWS_SECTION_PATH, REVIEW_WIDGET_SECTION_PATH, isMainProductSectionType, withProductPageReviews, withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const CREATOR = "33333333-3333-4333-8333-333333333333"
const PRODUCT = "22222222-2222-4222-8222-222222222222"
const PHOTO = "https://cdn.test/review-photos/c/a.jpg"
const CONFIG = "44444444-4444-4444-8444-444444444444"

function data(enabled = true, onProductPage = true, who: "anyone" | "verified" = "anyone") {
  const settings = readReviewsApp({ enabled, who, display: { starColor: "#e8a33d" } })
  const rows = [
    { id: "r1", product_id: PRODUCT, rating: 5, title: "Exactly right", content: "Clear and <script>alert(1)</script> well made.", created_at: "2026-09-30T10:00:00Z", reviewer_name: "Maya Rivers", verified: true, featured: true, photos: [{ path: "c/a.jpg", url: PHOTO, status: "approved" }], seller_reply: "Thank you" },
    { id: "r2", product_id: PRODUCT, rating: 4, content: "Good.", created_at: "2026-09-20T10:00:00Z", reviewer_name: "Jonas", verified: false },
    { id: "r3", product_id: "p2", rating: 2, content: "Not for me.", created_at: "2026-09-25T10:00:00Z", buyer: { display_name: "Priya Shah" } },
    { id: "r4", product_id: "p2", rating: 5, content: "", title: "", created_at: "2026-09-01T10:00:00Z", reviewer_name: "Sam" },
  ]
  return buildStorefrontReviews({
    settings,
    creatorId: CREATOR,
    rows,
    products: [{ id: PRODUCT, title: "Linen apron", slug: "linen-apron" }, { id: "p2", title: "Oak board", slug: "oak-board" }],
    product: onProductPage ? { id: PRODUCT, title: "Linen apron", rows: rows.slice(0, 2), ratings: [5, 4] } : null,
  })
}
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

function settingsChecks() {
  console.log("\nSettings: lists and ranges only")
  const dirty = sanitizeWidgetSettings({
    star_color: "red;} body{display:none",
    text_color: "#12345G",
    background: "url(javascript:alert(1))",
    card_color: "#ABCDEF",
    border_color: "",
    radius: "9999",
    gap: -40,
    columns: 2.6,
    font: "Comic Sans'; } * { color: red",
    star_shape: "heart",
    sort: "newest",
    heading: "<img src=x onerror=alert(1)> Hello\nthere",
    show_date: "yes",
    show_name: "false",
    unknown_key: "x",
    __proto__: { polluted: true },
  })
  check("a colour that is not a hex colour is dropped", !("star_color" in dirty) && !("text_color" in dirty) && !("background" in dirty))
  check("a hex colour is kept (lower case), an empty one means the theme's", dirty.card_color === "#abcdef" && dirty.border_color === "")
  check("numbers are clamped to their range and rounded", dirty.radius === 32 && dirty.gap === 0 && dirty.columns === 3)
  check("a font or a star shape not on the list is dropped", !("font" in dirty) && !("star_shape" in dirty))
  check("a choice on the list is kept", dirty.sort === "newest")
  check("words lose their markup brackets and line breaks", dirty.heading === "img src=x onerror=alert(1) Hello there")
  check("a toggle is a boolean or nothing", !("show_date" in dirty) && dirty.show_name === false)
  check("an unknown key never comes through", !("unknown_key" in dirty) && !("polluted" in ({} as Record<string, unknown>)))
  const labels = sanitizeWidgetSettings({ labels: { fr: { write_a_review: "Écrire un avis <b>", nonsense: "x" }, "../etc": { write_a_review: "x" }, default: { reviews: "opinions" } } }).labels!
  check("words per language: known languages and known words only, as plain text", labels.fr.write_a_review === "Écrire un avis b" && !("nonsense" in labels.fr) && !("../etc" in labels) && labels.default.reviews === "opinions")
  const resolved = resolveWidgetSettings("carousel", { columns: 4 }, sectionOverrides({ widget: "grid", review_config: CONFIG, columns: "2", heading: "", star_color: "", hide_when_empty: "false" }))
  check("defaults, then the saved look, then the page's changes; an empty change is not a change", resolved.columns === 2 && resolved.heading === defaultWidgetSettings("carousel").heading && resolved.hide_when_empty === false)
  const input = cleanWidgetConfigInput({ type: "grid", name: "  Home   page  grid ", settings: { radius: 8, star_color: "expression(alert(1))" } })
  check("a look to save: known widget, a name, its settings whole and clean", input.ok === true && input.name === "Home page grid" && input.settings.radius === 8 && input.settings.star_color === "")
  check("an unknown widget or no name is refused", cleanWidgetConfigInput({ type: "popup", name: "x" }).ok === false && cleanWidgetConfigInput({ type: "grid", name: "  " }).ok === false)
  const row = readWidgetConfigRow({ id: CONFIG, type: "grid", name: "Grid", settings: { radius: 400, star_color: "#fff;x" }, updated_at: "2026-10-01" })
  check("a row read back is cleaned again", row?.settings.radius === 32 && !("star_color" in (row?.settings ?? {})))
  check("a row of an unknown widget is ignored", readWidgetConfigRow({ id: CONFIG, type: "popup", name: "x", settings: {} }) === null)
  const css = WIDGET_TYPES.map(widgetCss).join("")
  check("the widget stylesheet never holds a < (it is written into a <style>)", !css.includes("<"))
  check("every widget has fields in the customizer", WIDGET_TYPES.every((t) => fieldsFor(t).length >= 4) && !fieldsFor("marquee").some((g) => g.fields.some((f) => f.key === "show_write")))
}

function drawingChecks() {
  console.log("\nDrawn from real reviews")
  const d = data()
  for (const type of WIDGET_TYPES) {
    const html = renderReviewWidget({ type, settings: resolveWidgetSettings(type), reviews: d, shopName: "Drew Studio" })
    check(`${type}: draws, scoped to .slw, with its own stylesheet`, html.startsWith('<div class="slw ') && html.includes(`data-slw="${type}"`) && html.includes("<style>"), html.slice(0, 200))
    check(`${type}: a review's words are text, never markup`, !html.includes("<script>alert"))
    check(`${type}: no sample note on a real page`, !html.includes("<p class=\"slw-sample\""))
  }
  const product = renderReviewWidget({ type: "product_reviews", settings: resolveWidgetSettings("product_reviews"), reviews: d, shopName: "Drew Studio" })
  check("Product reviews: the product's summary, bars, cards, the store's reply", product.includes("Based on 2 reviews") && product.includes("Exactly right") && product.includes("Reply from Drew Studio") && product.includes("Maya R.") && product.includes('class="slw-bars"'))
  check("  the escaped script stays visible as words", product.includes("&lt;script&gt;alert(1)&lt;/script&gt;"))
  check("  verified only on a verified review", (product.match(/class="slw-ver"/g) ?? []).length === 1)
  check("  the write form posts to the store, with the trap field", product.includes('action="/api/reviews/site"') && product.includes('name="website"') && product.includes(`value="${PRODUCT}"`) && product.includes('id="reviews"'))
  check("  the photo, lazily loaded", product.includes(`src="${PHOTO}"`) && product.includes('loading="lazy"'))
  check("  buyers only: no form", !renderReviewWidget({ type: "product_reviews", settings: resolveWidgetSettings("product_reviews"), reviews: data(true, true, "verified") }).includes("<form"))
  const grid = renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid", { min_rating: 4, only_with_text: true }), reviews: d })
  check("Grid: the shop's reviews, filtered by lowest rating and words", grid.includes("Exactly right") && grid.includes("Good.") && !grid.includes("Not for me.") && !grid.includes('data-review-id="r4"'))
  check("  each with its product, linked", grid.includes('href="/products/oak-board"') || grid.includes('href="/products/linen-apron"'))
  const pool = widgetPool(d, resolveWidgetSettings("grid", { sort: "lowest", limit: 2 }))
  check("sorting and the limit", pool.items.length === 2 && pool.items[0].rating === 2)
  check("with photos first", widgetPool(d, resolveWidgetSettings("grid", { sort: "photos" })).items[0].id === "r1")
  const wall = renderReviewWidget({ type: "media_wall", settings: resolveWidgetSettings("media_wall"), reviews: d })
  check("Photo reviews: a tile per photo, opened in a new tab", (wall.match(/class="slw-tile"/g) ?? []).length === 1 && wall.includes('target="_blank" rel="noopener"'))
  const car = renderReviewWidget({ type: "carousel", settings: resolveWidgetSettings("carousel", { autoplay: true, autoplay_seconds: 5 }), reviews: d })
  check("Carousel: a labelled region of slides, buttons for the script, autoplay as an attribute", car.includes('aria-roledescription="carousel"') && car.includes('aria-roledescription="slide"') && car.includes("data-slw-prev") && car.includes('data-autoplay="5"'))
  const mq = renderReviewWidget({ type: "marquee", settings: resolveWidgetSettings("marquee"), reviews: d })
  check("Review strip: the second copy is hidden from screen readers; stops for reduced motion", mq.includes('class="slw-mq__set" aria-hidden="true"') && widgetCss("marquee").includes("prefers-reduced-motion"))
  const badge = renderReviewWidget({ type: "star_badge", settings: resolveWidgetSettings("star_badge"), reviews: d })
  check("Star rating: the product's stars to 90%, links to #reviews", badge.includes("--p: 90%") && badge.includes('href="#reviews"') && badge.includes("(2 reviews)"))
  const trust = renderReviewWidget({ type: "trust_badge", settings: resolveWidgetSettings("trust_badge", { badge_layout: "banner" }), reviews: { ...d, page_url: "/reviews" } })
  check("Trust badge: the shop's rating, from how many reviews, as a banner to /reviews", trust.includes("from 4 reviews") && trust.includes("slw-banner") && trust.includes('href="/reviews"'))
  const big = { ...d, all: { ...d.all, summary: { ...d.all.summary, count: 1200 } } }
  check("  big counts are written the page's way", renderReviewWidget({ type: "trust_badge", settings: resolveWidgetSettings("trust_badge"), reviews: big }).includes("1,200"))
  check("a colour reaches only a custom property on the root", renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid", { star_color: "#ff0000" }), reviews: d }).includes("--slw-star: #ff0000"))

  console.log("\nEmpty, off, samples")
  const none = buildStorefrontReviews({ settings: readReviewsApp({ enabled: true, who: "verified" }), creatorId: CREATOR, rows: [], products: [] })
  check("no reviews and set to hide: nothing on a live page", WIDGET_TYPES.filter((t) => t !== "product_reviews").every((t) => renderReviewWidget({ type: t, settings: resolveWidgetSettings(t, { hide_when_empty: true }), reviews: none }) === ""))
  check("no reviews in the builder: it says so", text(renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid"), reviews: none, inEditor: true })).includes("No reviews yet"))
  check("set to show anyway: the empty state on a live page too", renderReviewWidget({ type: "rating_summary", settings: resolveWidgetSettings("rating_summary", { hide_when_empty: false }), reviews: none }).includes("No reviews yet"))
  check("Storelib Reviews off: nothing, whatever the widget", WIDGET_TYPES.every((t) => renderReviewWidget({ type: t, settings: resolveWidgetSettings(t, { hide_when_empty: false }), reviews: data(false) }) === ""))
  check("no reviews handed at all: nothing", renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid"), reviews: null }) === "")
  const sample = { ...sampleStorefrontReviews(readReviewsApp({ enabled: true }), CREATOR, null), enabled: true }
  check("samples in the builder are marked Sample", renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid"), reviews: sample, inEditor: true }).includes("<b>Sample</b>"))
  const prev = previewReviews(sample)!
  check("the gallery's samples carry sample photos, so the photo wall has something", prev.sample === true && prev.all.items.some((r) => r.has_photos) && renderReviewWidget({ type: "media_wall", settings: resolveWidgetSettings("media_wall"), reviews: prev, inEditor: true }).includes("slw-tile"))
  check("  a data: picture is only ever drawn for samples", !renderReviewWidget({ type: "media_wall", settings: resolveWidgetSettings("media_wall"), reviews: { ...prev, sample: false } }).includes("data:image"))
  check("  real reviews in the gallery stay real (no sample photos added)", previewReviews(d)!.all.items.every((r) => !r.photos.some((p) => p.startsWith("data:"))))
}

function wordsChecks() {
  console.log("\nWords")
  const en = UI_WORDS as unknown as Record<string, string>
  const dict = { write_a_review: "Écrire un avis", verified_buyer: "Acheteur vérifié" }
  const w = widgetWords(dict, { fr: { write_a_review: "Laissez un avis" } }, { locale: "fr", isDefault: false }, en)
  check("the store's own word for the language wins over the dictionary", w.write_a_review === "Laissez un avis" && w.verified_buyer === "Acheteur vérifié" && w.reviews === "reviews")
  const d = widgetWords({}, { default: { write_a_review: "Leave a review" }, fr: { write_a_review: "Laissez un avis" } }, { locale: null }, en)
  check("on the website's own language: the default words", d.write_a_review === "Leave a review")
  const pt = widgetWords({}, { pt: { reviews: "avaliações" } }, { locale: "pt-BR", isDefault: false }, en)
  check("a regional language falls back to its language's words", pt.reviews === "avaliações")
  const html = renderReviewWidget({ type: "product_reviews", settings: resolveWidgetSettings("product_reviews", { labels: { fr: { write_a_review: "Laissez un avis" } } }), reviews: { ...data(), locale: "fr", default_locale: false }, words: dict })
  check("drawn in French: the override and the dictionary", html.includes("Laissez un avis") && html.includes("Acheteur vérifié"))
  check("the review itself stays in the words it was written in", html.includes("Exactly right"))
  const fr = { ...data(), locale: "fr", default_locale: false }
  check("the widget's own heading is a shop word, in the page's language", renderReviewWidget({ type: "product_reviews", settings: resolveWidgetSettings("product_reviews"), reviews: fr, words: { customer_reviews: "Avis clients" } }).includes(">Avis clients</h2>"))
  check("  the look's heading per language, written by the store", renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid", { heading: "Our fans", labels: { fr: { heading: "Nos fans" } } }), reviews: fr }).includes(">Nos fans</h2>") && renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid", { heading: "Our fans", labels: { fr: { heading: "Nos fans" } } }), reviews: data() }).includes(">Our fans</h2>"))
  check("  a page's own heading wins (the page's text, translated with the page)", renderReviewWidgetSection({ settings: { widget: "grid", heading: "Ce que disent nos clients" }, reviews: fr }).includes(">Ce que disent nos clients</h2>"))
  check("  no heading when it is turned off", !renderReviewWidget({ type: "grid", settings: resolveWidgetSettings("grid", { show_heading: false }), reviews: fr }).includes("<h2"))
  check("the widget's new words are shop words (Translate › Shop words)", ["previous", "next", "customer_photos", "read_all_reviews"].every((k) => k in UI_WORDS))
}

function nativeChecks() {
  console.log("\nThe Storelib theme's Reviews widget section, by the live engine")
  const src = DEFAULT_THEME_SOURCES["sections/reviews_widget.storelib"]
  const r = compileSection(src, { file: "sections/reviews_widget.storelib" })
  check("compiles, is addable, one preset per widget", r.ok === true && read("themes/default/manifest.json").includes('"reviews_widget"') && (r.ok ? (r.value.schema.presets ?? []).length === WIDGET_TYPES.length : false), r.ok ? undefined : (r as { errors?: unknown }).errors)
  if (r.ok !== true) return
  const draw = (settings: Record<string, unknown>, reviews: unknown, page: Record<string, unknown> = { template: "product" }) =>
    renderSection({ compiled: r.value, id: "rw1", instance: { type: "reviews_widget", settings }, theme: {}, page: page as never, data: storefrontData({ dynamic: { shop: { name: "Drew Studio" } } as never, reviews: reviews as Record<string, unknown> }) }).html
  const withLook = { ...data(), widgets: { [CONFIG]: { type: "grid", settings: { heading: "Loved by buyers", columns: 4, star_shape: "outline" } } } }
  const html = draw({ widget: "grid", review_config: CONFIG }, withLook, { template: "index" })
  check("draws the saved look it names", html.includes("Loved by buyers") && html.includes("--slw-cols: 4") && html.includes("slw-star-outline"))
  const over = draw({ widget: "grid", review_config: CONFIG, heading: "This page only", columns: "2" }, withLook, { template: "index" })
  check("the page's changes over the saved look", over.includes("This page only") && over.includes("--slw-cols: 2") && over.includes("slw-star-outline"))
  check("a look of another widget is not used", !draw({ widget: "carousel", review_config: CONFIG }, withLook, { template: "index" }).includes("Loved by buyers"))
  check("a deleted look: the widget's own defaults", draw({ widget: "grid", review_config: "55555555-5555-4555-8555-555555555555" }, withLook, { template: "index" }).includes("What customers say"))
  check("review words escaped through the engine as well", !html.includes("<script>alert"))
  const drawn = renderSection({ compiled: r.value, id: "rw2", instance: { type: "reviews_widget", settings: { widget: "marquee" } }, theme: {}, page: { template: "index" } as never, data: storefrontData({ dynamic: { shop: { name: "Drew Studio" } } as never, reviews: data() as never }) })
  check("its stylesheet goes in the section's own <style> block, scoped to it (a <style> in markup is taken out)", !drawn.html.includes("<style>") && drawn.css.includes('[data-section-id="rw2"]') && drawn.css.includes(".slw-mq") && /@keyframes/.test(drawn.css))
  check("the app off: nothing on a live page", text(draw({ widget: "grid" }, data(false))) === "")
  check("in the builder with samples: marked Sample", draw({ widget: "carousel" }, { ...sampleStorefrontReviews(readReviewsApp({ enabled: true }), CREATOR, null), enabled: true }, { template: "index", in_editor: true }).includes("<b>Sample</b>"))
  check("the page loads reviews for it (reviews.enabled in its source) and the canvas reads them (a reviews_ type)", /reviews\.enabled/.test(src) && "reviews_widget".startsWith("reviews_"))
  check("the engine's filter is the shared renderer", /review_widget: \(v, _a, ctx\) =>/.test(read("lib/storelib-theme/storelib/template.ts")) && read("lib/storelib-theme/storelib/template.ts").includes("renderReviewWidgetSection"))
  check("a live page's carousel gets its buttons from the page (StorelibSection hook)", /enhanceReviewWidgets/.test(read("components/website-builder/sections/StorelibSection.tsx")))
}

function compatChecks() {
  console.log("\nAn imported theme")
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><body><main>{{ content_for_layout }}</main></body></html>`),
    "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="mp">{%- for block in section.blocks -%}<i>{{ block.type }}</i>{%- endfor -%}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [{ type: "title" }, { type: "rating" }] } })}\n</schema>\n`,
  }
  const all = withStorelibReviewsSection(files)
  check("every imported theme gets the Reviews widget section beside Storelib Reviews", REVIEW_WIDGET_SECTION_PATH in all && REVIEWS_SECTION_PATH in all)
  check("  never over a file of the theme's own by that name", withStorelibReviewsSection({ ...files, [REVIEW_WIDGET_SECTION_PATH]: "own" })[REVIEW_WIDGET_SECTION_PATH] === "own")
  check("  a Storelib theme gets neither", !(REVIEW_WIDGET_SECTION_PATH in withStorelibReviewsSection({ "sections/x.storelib": "<template></template>" })))
  const theme = new CompatTheme(all, {}, { assetUrl: (n) => `/a/${n}` })
  const withRating = { id: PRODUCT, settings: { title: "Linen apron", price: "$48.00", url: "/products/linen-apron", slug: "linen-apron" } }
  const base = { designMode: false, products: [withRating], collections: [], menus: {}, shop: { name: "Drew Studio", currency: "USD", moneyFormat: "${{amount}}" } }
  const reviews = { ...data(), widgets: { [CONFIG]: { type: "carousel", settings: { heading: "Buyers say", columns: 2 } } } }
  const page = drawPage(theme as never, { ...base, template: "product", path: "/products/linen-apron", product: withRating, reviews } as never, [{ id: "w1", type: "storelib-review-widget", settings: { widget: "carousel", review_config: CONFIG } }], { scripts: true }).html
  check("draws the widget with the saved look in the theme", page.includes("Buyers say") && page.includes('data-slw="carousel"') && page.includes("Exactly right"))
  check("  the carousel brings its small script, inside the widget", /<script>\(function\(\)\{var __name=[^<]*?document\.currentScript[\s\S]*?<\/script><\/div>/.test(page))
  check("  review words escaped", !page.includes("<script>alert"))
  const fr = drawPage(theme as never, { ...base, template: "product", path: "/fr/products/linen-apron", product: withRating, reviews, i18n: { locale: "fr", defaultLanguage: "en", languages: ["en", "fr"], uiWords: { write_a_review: "Écrire un avis" } } } as never, [{ id: "w2", type: "storelib-review-widget", settings: { widget: "product_reviews" } }], { scripts: false }).html
  check("  in another language: Storelib's words in that language", fr.includes("Écrire un avis"))
  const off = drawPage(theme as never, { ...base, template: "index", path: "/", reviews: data(false) } as never, [{ id: "w3", type: "storelib-review-widget", settings: { widget: "grid" } }], { scripts: false }).html
  check("  the app off: nothing", !off.includes("slw"))
  const design = drawPage(theme as never, { ...base, designMode: true, template: "index", path: "/" } as never, [{ id: "w4", type: "storelib-review-widget", settings: { widget: "grid" } }], { scripts: false }).html
  check("  in the builder before any reviews: samples, marked", design.includes("<b>Sample</b>"))
  check("a widget section counts as reviews on the page (no second one added on product pages)", withProductPageReviews([{ id: "m", type: "main-product" }, { id: "w", type: "storelib-review-widget" }], { files: all, schemaOf: () => ({}) }).length === 2)
  check("the main product section, in either kind of theme", isMainProductSectionType("main-product") && isMainProductSectionType("product") && !isMainProductSectionType("featured-product-grid"))
  check("an imported theme's script for the carousel is the same function", reviewWidgetScript().includes("data-slw-ready"))
}

function libraryChecks() {
  console.log("\nAdd a section: Apps › Reviews")
  check("Storelib theme widget and reviews sections are app sections", ["reviews_widget", "reviews_product", "reviews_badge"].every((t) => appSectionCategory(t) === "reviews"))
  check("an imported theme's Storelib sections are app sections", appSectionCategory("storelib-review-widget") === "reviews" && appSectionCategory("storelib-reviews") === "reviews")
  check("a theme's own testimonials stay the theme's", appSectionCategory("testimonials") === null && classifyImportedSection({ type: "testimonials", name: "Testimonials" }) === "testimonials")
  const lib = read("components/website-builder/editor/section-library.tsx")
  check("the library files them before the theme's classifier, and lists Apps last under a heading", /const app = own_ \? null : appSectionCategory\(type\)/.test(lib) && /\.\.\.apps,/.test(lib) && /data-library-group="apps"/.test(lib))
  check("the section's saved look is a list of the store's looks in the sidebar", /field\.id === REVIEW_CONFIG_FIELD && kind === "text"/.test(read("components/website-builder/editor/controls/index.tsx")))
}

function placementChecks() {
  console.log("\nAdd to website")
  check("product widgets go under the product; the shop's at the end of the home page", defaultPlacement("product_reviews").placement === "below_product" && defaultPlacement("star_badge").page === "product" && defaultPlacement("testimonials").page === "home" && defaultPlacement("marquee").placement === "bottom")
  const asked = readPlacement(new URLSearchParams({ widget: "grid", page: "home", placement: "below_product", config: CONFIG }))
  check("under the product means nothing on the home page", asked?.placement === "bottom" && asked.config === CONFIG)
  check("an unknown widget or a bad look id is not passed on", readPlacement(new URLSearchParams({ widget: "popup" })) === null && readPlacement(new URLSearchParams({ widget: "grid", config: "x'); drop" }))?.config === "")
  const href = editorAddress("inst-1", { widget: "product_reviews", config: CONFIG, page: "product", placement: "below_product" }, "linen-apron")
  check("the builder opens on a product page with the widget to add", href.startsWith("/website-builder/editor/inst-1?") && href.includes("previewPath=%2Fproducts%2Flinen-apron") && href.includes("addReviewWidget=product_reviews") && href.includes(`reviewConfig=${CONFIG}`) && href.includes("placement=below_product"))
  check("  no product yet: the home page, at the end", editorAddress("i", { widget: "product_reviews", config: "", page: "product", placement: "below_product" }, null).includes("placement=bottom"))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the editor adds it once the page is in, under the main product, naming the look", /widgetArrival/.test(editor) && /isMainProductSectionType\(x\.type\)/.test(editor) && /review_config:/.test(editor) && /addSection\(type, presetIndex, true, \{ settings:/.test(editor))
  check("  and takes the words off the address", /for \(const k of \["addReviewWidget", "reviewConfig", "placement"\]\) url\.searchParams\.delete\(k\)/.test(editor))
  check("the gallery is a component the reviews management can show", /export function WidgetsGallery/.test(read("components/reviews/widgets/widgets-gallery.tsx")) && read("app/app/reviews/reviews-client.tsx").includes('href="/app/reviews/widgets"'))
}

function sqlChecks() {
  console.log("\nSQL part 216")
  const sql = read("supabase/sql/run-now/216_review_widget_configs.sql")
  check("the table, its checks and its index", /CREATE TABLE IF NOT EXISTS public\.review_widget_configs/.test(sql) && /review_widget_configs_type_check CHECK \(type IN \('product_reviews'/.test(sql) && /pg_column_size\(settings\) < 16384/.test(sql))
  check("row level security: the owner reads their own, nobody writes but the server", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.review_widget_configs FROM PUBLIC, anon, authenticated/.test(sql) && /GRANT SELECT ON public\.review_widget_configs TO authenticated/.test(sql) && /\(SELECT auth\.uid\(\)\)/.test(sql) && !/GRANT[^;]*INSERT[^;]*TO authenticated/.test(sql))
  check("listed in the README, checked after, generated", read("supabase/sql/run-now/README.md").includes("216_review_widget_configs.sql") && read("supabase/sql/run-now/99_check_after.sql").includes("p216_review_widget_configs") && read("lib/admin/sql-parts.generated.ts").includes("216_review_widget_configs.sql"))
  check("the widget types in SQL match the app's", WIDGET_TYPES.every((t) => sql.includes(`'${t}'`)))
}

settingsChecks()
drawingChecks()
wordsChecks()
nativeChecks()
compatChecks()
libraryChecks()
placementChecks()
sqlChecks()

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
