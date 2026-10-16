/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS
 * ===========================================================================
 * Reviews › Widgets and the sections behind it (lib/reviews/widgets.ts,
 * themes/default/sections/reviews_*.storelib):
 *
 *   EACH WIDGET     a section of the theme, drawn by the website's renderer
 *                   with a store's real reviews: what it shows, in the order
 *                   and from the rating it is set to, and nothing at all with
 *                   the app off
 *   NEVER SAMPLES   a live page is never handed the builder's sample reviews,
 *                   and a widget says "Sample reviews" only in the builder
 *   ITS WORDS       every word a widget draws is the shop's own, in the
 *                   page's language (lib/markets/ui-words.ts), in a Storelib
 *                   theme and in an imported one; the reviews keep the words
 *                   their buyers wrote
 *   PRESETS         saved, listed, changed and deleted per store, holding
 *                   only what the section's schema allows (run-now part 205)
 *   ADD SECTION     every widget under Apps › Reviews, and Add to website
 *                   placing it in the editor
 *
 * scripts/check-review-widgets.mjs measures the layouts in a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readReviewsApp } from "../lib/reviews/app-settings"
import { buildStorefrontReviews, sampleStorefrontReviews, type StorefrontReviewRow, type StorefrontReviews } from "../lib/reviews/storefront"
import {
  REVIEW_WIDGETS,
  changedSettings,
  cleanPresetName,
  cleanPresetSettings,
  decodeWidgetSettings,
  editorAddUrl,
  encodeWidgetSettings,
  placementIndex,
  readPlacement,
  reviewList,
  reviewScope,
  sampleWidgetReviews,
  widgetFromParam,
} from "../lib/reviews/widgets"
import { checkPresetInput, createPreset, deletePreset, listPresets, PRESETS_NEED_SQL, readPreset, updatePreset, widgetFields } from "../lib/reviews/widget-presets-server"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import { STORELIB_SCHEMAS } from "../lib/website-builder/storelib-schemas"
import { ADDABLE_SECTIONS } from "../lib/website-builder/section-schemas"
import { APP_SECTION_CATEGORIES, appCategoryOf } from "../lib/website-builder/section-categories"
import { UI_WORDS } from "../lib/markets/ui-words"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage } from "../lib/storelib-theme/compat/page"
import { STARS_SECTION_PATH, REVIEWS_SECTION_PATH, isReviewsAppBlock, isReviewsBadgeBlock, withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"
import { FILTER_NAMES } from "../lib/storelib-theme/storelib/template"
import { WIDGET_COPY } from "../components/app/reviews/widgets/copy"
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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 800)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const P1 = "10000000-0000-4000-8000-000000000001"
const P2 = "10000000-0000-4000-8000-000000000002"
const day = (n: number) => new Date(Date.parse("2026-10-10T10:00:00Z") - n * 86_400_000).toISOString()
const rows: StorefrontReviewRow[] = [
  { id: "r1", product_id: P1, rating: 5, title: "Exactly right", content: "Heavier linen than I expected.", created_at: day(1), reviewer_name: "Maya Ross", verified: true, featured: true, photos: [{ path: "c/1.jpg", url: "https://cdn.example/1.jpg", status: "approved" }] },
  { id: "r2", product_id: P1, rating: 4, title: "Good", content: "A little long for me.", created_at: day(3), reviewer_name: "Priya Shah", verified: true, featured: false, photos: [] },
  { id: "r3", product_id: P2, rating: 2, title: "Not for me", content: "The strap rubbed.", created_at: day(5), reviewer_name: "Tom Baker", verified: false, featured: false, photos: [] },
  { id: "r4", product_id: P1, rating: 5, title: "Second one", content: "Ordered the same again.", created_at: day(7), reviewer_name: "Drew Hall", verified: true, featured: false, photos: [{ path: "c/2.jpg", url: "https://cdn.example/2.jpg", status: "approved" }, { path: "c/3.jpg", url: "https://cdn.example/3.jpg", status: "removed" }] },
]
const appOn = readReviewsApp({ enabled: true })
const products = [{ id: P1, title: "Linen apron", slug: "linen-apron", thumbnail_url: "https://cdn.example/apron.jpg" }, { id: P2, title: "Oak board", slug: "oak-board" }]
const real = buildStorefrontReviews({ settings: appOn, creatorId: "c", rows, products, product: { id: P1, title: "Linen apron", rows: rows.filter((r) => r.product_id === P1), ratings: [5, 4, 5] } })
const shopOnly = buildStorefrontReviews({ settings: appOn, creatorId: "c", rows, products })
const off = buildStorefrontReviews({ settings: readReviewsApp({ enabled: false }), creatorId: "c", rows, products })

function draw(type: string, settings: Record<string, unknown> = {}, reviews: StorefrontReviews | Record<string, unknown> = real, opts: { editor?: boolean; words?: Record<string, string> } = {}): string {
  const out = renderStorelibSection({ id: `s-${type}`, type, name: type, settings, blocks: [], hidden: false }, {} as never, { template: "product", in_editor: opts.editor === true }, undefined, [], { reviews, words: opts.words } as never)
  if (out.ok === false) throw new Error(`${type}: ${JSON.stringify(out.errors)}`)
  return out.html
}
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim()
const ids = (html: string) => [...html.matchAll(/data-review-id="([^"]+)"/g)].map((m) => m[1])

/* ── What the widgets are ────────────────────────────────────────────── */
console.log("\nEvery widget is a section of the theme")
{
  const types = REVIEW_WIDGETS.map((w) => w.type)
  check(`${types.length} widgets: the four sections there were, and the new ones`, types.length >= 10 && ["reviews_product", "reviews_badge", "reviews_grid", "reviews_carousel", "reviews_testimonials", "reviews_media", "reviews_marquee", "reviews_trust", "reviews_summary", "reviews_all"].every((t) => types.includes(t)))
  const missing = types.filter((t) => !DEFAULT_THEME_SOURCES[`sections/${t}.storelib`] || !STORELIB_SCHEMAS[t])
  check("each has its .storelib file in the default theme, and compiles", missing.length === 0, missing)
  check("each can be added: in the manifest's list, with a preset", types.every((t) => ADDABLE_SECTIONS.includes(t) && (STORELIB_SCHEMAS[t].presets?.length ?? 0) > 0), types.filter((t) => !ADDABLE_SECTIONS.includes(t)))
  check("each is filed under reviews", types.every((t) => STORELIB_SCHEMAS[t].category === "reviews"))
  const names = REVIEW_WIDGETS.filter((w) => STORELIB_SCHEMAS[w.type].name !== w.name || WIDGET_COPY[w.type]?.name() !== w.name).map((w) => [w.type, STORELIB_SCHEMAS[w.type].name, w.name])
  check("the gallery, the list and Add section call each one the same", names.length === 0, names)
  const common = ["show_on", "star_style", "star_color"]
  check("each can be shown on phones, computers or both, with its own star style and colour", types.every((t) => common.every((id) => STORELIB_SCHEMAS[t].fields.some((f) => f.id === id))), types.filter((t) => !common.every((id) => STORELIB_SCHEMAS[t].fields.some((f) => f.id === id))))
  const custom = ["background", "text_color", "card_background", "border_color", "border_width", "radius", "star_size", "text_scale", "heading_scale", "padding_top"]
  const NEW = ["reviews_grid", "reviews_testimonials", "reviews_media", "reviews_marquee", "reviews_summary"]
  check("the new ones: colours, borders, corners, star size, type size and spacing", NEW.every((t) => custom.every((id) => STORELIB_SCHEMAS[t].fields.some((f) => f.id === id))), NEW.map((t) => [t, custom.filter((id) => !STORELIB_SCHEMAS[t].fields.some((f) => f.id === id))]))
  const picking = ["scope", "sort", "min_rating", "count"]
  check("  and which reviews: whose, the order, the lowest rating, how many", ["reviews_grid", "reviews_testimonials", "reviews_media", "reviews_marquee", "reviews_carousel"].every((t) => picking.every((id) => STORELIB_SCHEMAS[t].fields.some((f) => f.id === id))))
  check("an address names a widget either way: reviews_carousel or reviews-carousel", widgetFromParam("reviews-carousel")?.type === "reviews_carousel" && widgetFromParam("reviews_grid")?.type === "reviews_grid" && widgetFromParam("hero") === null)
  check("the two filters that pick reviews are the template language's own, documented", FILTER_NAMES.includes("review_scope") && FILTER_NAMES.includes("review_list") && /`review_scope: "here"`/.test(read("docs/storelib-manual.md")) && /review_list/.test(read("docs/storelib-language.md")))
}

/* ── Drawn with real reviews ─────────────────────────────────────────── */
console.log("\nEach widget drawn with a store's real reviews")
{
  for (const w of REVIEW_WIDGETS) {
    const html = draw(w.type)
    const words = text(html)
    const shows = w.type === "reviews_badge" || w.type === "reviews_trust" || w.type === "reviews_summary" ? /4\.7|5\.0|4\.0|4\.67|4\.5/.test(words) : ids(html).length > 0
    check(`${w.type}: drawn from the reviews it was handed`, html.length > 200 && shows, words.slice(0, 200))
    check(`  never a sample review, never the sample line, on a live page`, !/sample-\d|Sample reviews/.test(html))
    check(`  nothing with Storelib Reviews off`, text(draw(w.type, {}, off)) === "")
  }
  const grid = draw("reviews_grid", { scope: "all", sort: "newest", count: 3, show_more: false })
  check("the grid: the shop's newest three, in order", ids(grid).join() === "r1,r2,r3", ids(grid))
  check("  lowest rating 5: only the five star ones", ids(draw("reviews_grid", { scope: "all", min_rating: 5 })).every((id) => ["r1", "r4"].includes(id)))
  check("  lowest first", ids(draw("reviews_grid", { scope: "all", sort: "lowest", show_more: false }))[0] === "r3")
  check("  on a product page, \"this page\" is the product's own", !ids(draw("reviews_grid", { scope: "here" })).includes("r3") && ids(draw("reviews_grid", { scope: "here" }, shopOnly)).includes("r3"))
  check("  the rest behind Show more, a <details>", /<details class="rg__more">[\s\S]*data-review-id="r4"/.test(draw("reviews_grid", { scope: "all", count: 3 })))
  check("  date, verified, photos, product as set", !/rw-card__date/.test(draw("reviews_grid", { show_date: false })) && !/rw-card__ver/.test(draw("reviews_grid", { show_verified: false })) && !/rw-card__photos/.test(draw("reviews_grid", { show_photos: false })) && /rw-card__prod/.test(draw("reviews_grid", { show_product: true })))
  check("  the app's own switches still win: no dates anywhere when Storelib Reviews hides them", !/rw-card__date/.test(draw("reviews_grid", { show_date: true }, buildStorefrontReviews({ settings: readReviewsApp({ enabled: true, display: { showDate: false } }), creatorId: "c", rows, products }))))
  const media = draw("reviews_media", { scope: "all" })
  check("photo reviews: only the reviews with an approved photo, its first photo", ids(media).join() === "r1,r4" && media.includes("https://cdn.example/1.jpg") && !media.includes("3.jpg"), ids(media))
  const noPhotos = buildStorefrontReviews({ settings: appOn, creatorId: "c", rows: rows.map((r) => ({ ...r, photos: [] })), products })
  check("  none with a photo: nothing on a live page, and the builder says why", text(draw("reviews_media", {}, noPhotos)) === "" && /Reviews with photos show here/.test(draw("reviews_media", {}, noPhotos, { editor: true })))
  const marquee = draw("reviews_marquee", { scope: "all", min_rating: 1 })
  check("marquee: the list twice, the copy hidden from screen readers", (marquee.match(/class="mq__set"/g) ?? []).length === 2 && /class="mq__set" aria-hidden="true"/.test(marquee))
  const trust = text(draw("reviews_trust", { layout: "banner", scope: "all" }))
  check("trust bar: Rated, the shop's average, out of 5, from how many", /^Rated 4\.0 out of 5 from 4 reviews/.test(trust), trust)
  const summary = draw("reviews_summary")
  check("rating summary: the product's average and a bar for each rating", text(summary).startsWith("Customer reviews 4.7") && (summary.match(/<li>/g) ?? []).length === 5, text(summary).slice(0, 80))
  check("testimonials: four and five stars by default", ids(draw("reviews_testimonials", { scope: "all" })).every((id) => id !== "r3"))
  check("carousel: the shop's featured, and from the rating set", ids(draw("reviews_carousel")).join() === "r1" && ids(draw("reviews_carousel", { source: "recent", min_rating: 4 })).join() === "r1,r2,r4")
  check("a widget for computers only and one for phones only carry their class", /rw--desktop/.test(draw("reviews_grid", { show_on: "desktop" })) && /rw--mobile/.test(draw("reviews_badge", { show_on: "mobile" })))
}

console.log("\nThe filters")
{
  const items = real.all.items
  check("review_list: newest, highest, lowest, photos first, featured first", reviewList(items, "newest", 1, "")[0].id === "r1" && reviewList(items, "lowest", 1, "")[0].id === "r3" && reviewList(items, "highest", 1, "")[0].rating === 5 && reviewList(items, "photos", 1, "")[0].has_photos && reviewList(items, "featured", 1, "")[0].featured)
  check("  from a rating, with photos only", reviewList(items, "newest", 4, "").every((r) => r.rating >= 4) && reviewList(items, "newest", 1, "photos").every((r) => r.has_photos))
  check("  'app' keeps the order Storelib Reviews set", reviewList(items, "app", 1, "").map((r) => r.id).join() === items.map((r) => r.id).join())
  check("  anything else is safe: not a list is nothing, a rating out of range is clamped", reviewList("x", "newest", 1, "").length === 0 && reviewList(items, "newest", 99, "").every((r) => r.rating === 5))
  const here = reviewScope(real, "here")[0]
  check("review_scope: this page's (the product's), or the shop's", here.scope === "product" && here.product_id === P1 && reviewScope(real, "all")[0].summary.count === 4 && reviewScope(null, "all").length === 0)
}

console.log("\nNever sample reviews on a live page")
{
  const server = read("lib/reviews/storefront-server.ts")
  const live = server.slice(server.indexOf("export async function storefrontReviews"), server.indexOf("export async function canvasReviews"))
  check("the live read never makes sample reviews", live.length > 100 && !/sample/i.test(live.replace(/\/\*[\s\S]*?\*\//g, "")))
  const sample = sampleWidgetReviews({ ...sampleStorefrontReviews(appOn, "c"), enabled: true })
  check("sample reviews are marked sample, and get pictures only in a preview", sample.sample === true && sample.all.items.some((r) => r.has_photos && r.photos[0].startsWith("data:image/svg+xml")))
  check("  real reviews are left as they are", sampleWidgetReviews(real) === real)
  for (const w of REVIEW_WIDGETS) {
    const src = DEFAULT_THEME_SOURCES[`sections/${w.type}.storelib`]
    if (/Sample reviews/.test(src)) check(`${w.type}: its sample line is the builder's only`, /\{% if page\.in_editor and reviews\.sample %\}<p class="rv__sample">Sample reviews/.test(src))
  }
  check("the gallery says out loud when it shows samples", /data-widgets-sample/.test(read("components/app/reviews/widgets/widgets-client.tsx")))
}

/* ── Translations ────────────────────────────────────────────────────── */
console.log("\nEvery word in the page's language; the reviews in their buyers'")
{
  const words = Object.fromEntries(Object.keys(UI_WORDS).map((w) => [w, `zw${w}wz`]))
  /* Shop words and section settings are translated; what is left must be a buyer's words, a name, a product or a number. */
  const BUYERS = /\b(zw[a-z_]+wz|Exactly right|Heavier linen than I expected|Good|A little long for me|Not for me|The strap rubbed|Second one|Ordered the same again|Maya R|Priya S|Tom B|Drew H|Linen apron|Oak board|Oct|Sep|Customer reviews|What buyers say|In their words|Photos from buyers|Loved by buyers|Read all reviews|Read reviews|Reviews|M|P|T|D)\b/g
  const leaks: string[] = []
  for (const w of REVIEW_WIDGETS) {
    const html = draw(w.type, {}, real, { words })
    const attrs = [...html.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]*)"/g)].map((m) => m[1]).join(" ")
    const left = `${text(html.replace(/<[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/[a-z]+>/gi, " "))} ${attrs}`.replace(BUYERS, " ").match(/[A-Za-z][A-Za-z']{2,}/g)
    if (left?.length) leaks.push(`${w.type}: ${[...new Set(left)].join(" ")}`)
  }
  check("no English left in any widget once the shop's words are translated", leaks.length === 0, leaks)
  const grid = draw("reviews_grid", { scope: "all", count: 2 }, real, { words })
  check("  the translated words are the ones drawn: Verified buyer, out of 5 stars, Show more", grid.includes("zwverified_buyerwz") && grid.includes("zwout_of_five_starswz") && grid.includes("zwshow_more_reviewswz"))
  check("  the review itself is the buyer's own words, untouched", grid.includes("Heavier linen than I expected."))
  const trust = text(draw("reviews_trust", { layout: "banner", scope: "all" }, real, { words }))
  check("  the trust bar's sentence too", /zwratedwz 4\.0 zwout_of_fivewz zwrating_fromwz 4 zwreviewswz/.test(trust), trust)
  const settingsTexts = REVIEW_WIDGETS.flatMap((w) => STORELIB_SCHEMAS[w.type].fields.filter((f) => (f.type === "text" || f.type === "textarea") && typeof f.default === "string" && f.default !== "" && f.id !== "link").map((f) => `${w.type}.${f.id}`))
  check(`${settingsTexts.length} headings and labels are section text, translated with the section (Translate › Website)`, settingsTexts.length >= 8)
  const translate = read("lib/markets/translate.ts")
  check("a translation the owner wrote is never replaced by an automatic one", /aiMayWrite/.test(read("lib/markets/translation-press.ts")) && translate.length > 0)
  const compat = read("lib/markets/compat.ts")
  check("an imported theme's page gets the shop's words too", /i18n\.shopWords = shopWordsHere/.test(compat) && /storelib_words: shopWords\(page\.i18n\?\.shopWords\)/.test(read("lib/storelib-theme/compat/theme.ts")))
}

/* ── An imported theme ───────────────────────────────────────────────── */
console.log("\nAn imported theme: the reviews section and the star rating, as sections and app blocks")
{
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><body><main>{{ content_for_layout }}</main></body></html>`),
    "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="mp">{%- for block in section.blocks -%}{%- case block.type -%}{%- when '@app' -%}{% render block %}{%- else -%}<i>{{ block.type }}</i>{%- endcase -%}{%- endfor -%}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [{ type: "@app" }, { type: "title" }] } })}\n</schema>\n`,
  }
  const withBoth = withStorelibReviewsSection(files)
  check("both sections are given to every imported theme", REVIEWS_SECTION_PATH in withBoth && STARS_SECTION_PATH in withBoth && !(STARS_SECTION_PATH in withStorelibReviewsSection({ "sections/x.storelib": "<template></template>" })))
  check("a theme's own file by that name is kept", withStorelibReviewsSection({ ...files, [STARS_SECTION_PATH]: "mine" })[STARS_SECTION_PATH] === "mine")
  check("a reviews app's star block is the stars, its review widget the reviews", isReviewsBadgeBlock("shopify://apps/judge-me-reviews/blocks/preview_badge/61ccd3b1") && isReviewsBadgeBlock("shopify://apps/loox/blocks/star-rating/1") && !isReviewsBadgeBlock("shopify://apps/judge-me-reviews/blocks/review_widget/61ccd3b1") && isReviewsAppBlock("shopify://apps/judge-me-reviews/blocks/review_widget/61ccd3b1"))
  const theme = new CompatTheme(withBoth, {}, { assetUrl: (n) => `/a/${n}` })
  const product = { id: P1, settings: { title: "Linen apron", price: "$48.00", url: "/products/linen-apron", slug: "linen-apron" } }
  const base = { designMode: false, products: [product], collections: [], menus: {}, shop: { name: "Drew Studio", currency: "USD", moneyFormat: "${{amount}}" }, template: "product", path: "/products/linen-apron", product, reviews: real }
  const page = (sections: unknown[], extra: Record<string, unknown> = {}) => drawPage(theme as never, { ...base, ...extra } as never, sections as never, { scripts: false }).html
  const stars = page([{ id: "st", type: "storelib-reviews-stars", settings: {} }])
  check("the Storelib star rating section: the product's stars, average and count", /aria-label="4\.7 out of 5 stars"/.test(stars) && /\(3 reviews\)/.test(stars) && !stars.includes("Write a review"), stars.slice(0, 300))
  const block = page([{ id: "mp", type: "main-product", blocks: [{ id: "jm", type: "shopify://apps/judge-me-reviews/blocks/preview_badge/61ccd3b1", settings: {} }] }])
  check("Judge.me's preview badge block draws as the stars, not the whole list", /slrv-badge/.test(block) && !/slrv-card/.test(block))
  const fr = { de: "", out_of_five_stars: "sur 5 étoiles", reviews: "avis", based_on: "Basé sur", verified_buyer: "Acheteur vérifié", write_a_review: "Écrire un avis" }
  const i18n = { locale: "fr", defaultLanguage: "en", languages: ["en", "fr"], shopWords: fr }
  const frStars = page([{ id: "st", type: "storelib-reviews-stars", settings: {} }], { i18n })
  const frList = page([{ id: "rv", type: "storelib-reviews", settings: {} }], { i18n })
  check("  in French: the shop's translated words", /4\.7 sur 5 étoiles/.test(frStars) && /\(3 avis\)/.test(frStars) && /Basé sur 3 avis/.test(frList) && frList.includes("Acheteur vérifié"))
  check("  and the reviews in their buyers' words", frList.includes("Heavier linen than I expected."))
}

/* ── SQL ─────────────────────────────────────────────────────────────── */
console.log("\nRun-now part 205")
{
  const sql = read("supabase/sql/run-now/205_review_widget_presets.sql")
  check("one table, server only, row level security on, one name per store and widget", /CREATE TABLE IF NOT EXISTS public\.review_widget_presets/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.review_widget_presets FROM anon, authenticated/.test(sql) && /GRANT ALL ON public\.review_widget_presets TO service_role/.test(sql) && /review_widget_presets_one_name ON public\.review_widget_presets \(creator_id, widget, lower\(name\)\)/.test(sql))
  check("  safe to run again, and the schema reloaded last", !/CREATE TABLE public|CREATE INDEX review/.test(sql) && /notify pgrst, 'reload schema';$/.test(sql.trim()))
  check("  the same as its migration, checked after, and in the bundles", sql === read("supabase/migrations/20270130_review_widget_presets.sql") && /as p205_review_widget_presets/.test(read("supabase/sql/run-now/99_check_after.sql")) && read("supabase/sql/run-four/3_of_4_latest.sql").includes(sql.split("\n")[1]) && /part: "205", file: "205_review_widget_presets\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))
}

/* ── Add section, and Add to website ─────────────────────────────────── */
console.log("\nAdd section: Apps › Reviews; Add to website: placed in the editor")
{
  check("Reviews is an app category, under Apps", APP_SECTION_CATEGORIES.some((c) => c.id === "reviews" && c.group === "apps"))
  check("every widget is filed there, and an imported theme's two Storelib sections too", REVIEW_WIDGETS.every((w) => appCategoryOf(w.type, STORELIB_SCHEMAS[w.type].category) === "reviews") && appCategoryOf("storelib-reviews") === "reviews" && appCategoryOf("storelib-reviews-stars") === "reviews" && appCategoryOf("hero_split", "hero") === null)
  const library = read("components/website-builder/editor/section-library.tsx")
  check("the library files them under it, last, with the Apps heading on a phone and a computer", /appCategoryOf\(type, schema\.category\)/.test(library) && (library.match(/data-category-group=\{cat\.group\}/g) ?? []).length === 2 && /APP_GROUP_LABELS/.test(library))
  check("  and their cards are drawn with reviews in them", /data=\{appCategoryOf\(job\.type, job\.schema\.category\) === "reviews" \? previewReviews\(\) : undefined\}/.test(library))
  const url = editorAddUrl("inst-1", { type: "reviews_carousel", page: "product", at: "after_product", presetId: "11111111-1111-4111-8111-111111111111" })
  const back = readPlacement(new URL(url, "https://x").searchParams)
  check("Add to website: the editor's address names the widget, the page, where, and the saved settings", url.startsWith("/website-builder/editor/inst-1?") && back?.widget.type === "reviews_carousel" && back.at === "after_product" && back.presetId === "11111111-1111-4111-8111-111111111111" && new URL(url, "https://x").searchParams.get("page") === "product", url)
  const carried = readPlacement(new URL(editorAddUrl("inst-1", { type: "reviews_grid", page: "home", at: "top", settings: { heading: "Ce qu'ils disent ✓", columns: { desktop: 2, tablet: 2, mobile: 1 } } }), "https://x").searchParams)
  check("  settings never saved go in the address, and come back as they were", carried?.settings.heading === "Ce qu'ils disent ✓" && (carried.settings.columns as { desktop: number }).desktop === 2)
  check("  an address edited by hand: nothing it should not hold", JSON.stringify(decodeWidgetSettings("!!!")) === "{}" && JSON.stringify(decodeWidgetSettings(encodeWidgetSettings({ a: 1 }).slice(0, 3))) === "{}" && readPlacement(new URLSearchParams("add=hero")) === null)
  check("  another page: the library opens on Apps › Reviews", readPlacement(new URL(editorAddUrl("i", { type: "reviews_grid", page: "other", at: "top" }), "https://x").searchParams)?.at === "choose")
  const types = ["header", "announcement", "product", "faq", "footer"]
  check("where it lands: top under the header, under the product, at the bottom above the footer", placementIndex(types, "top", 1, 4) === 1 && placementIndex(types, "after_product", 1, 4) === 3 && placementIndex(types, "bottom", 1, 4) === 4 && placementIndex(["header", "faq", "footer"], "after_product", 1, 2) === 2)
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the editor reads the address once the page is in, adds it as any section is, and takes the words off the address", /readPlacement\(new URLSearchParams\(window\.location\.search\)\)/.test(editor) && /widgetPlace\.current = \{ type: p\.widget\.type, at, settings \}\s*\n\s*addSectionRef\.current\(p\.widget\.type, 0\)/.test(editor) && /const place = widgetPlace\.current\?\.type === type \? widgetPlace\.current : null/.test(editor) && /for \(const k of \["add", "at", "preset", "settings"\]\) url\.searchParams\.delete\(k\)/.test(editor))
  check("  a saved widget's settings from its preset, a placed widget is an ordinary section (moved, hidden, removed there)", /\/api\/reviews\/widgets\/presets\/\$\{p\.presetId\}/.test(editor) && /settings: \{ \.\.\.newSectionSettings\(type, preset\?\.settings, storelibSources\), \.\.\.\(carried \?\? \{\}\) \}/.test(editor))
  check("  picking a place itself: the library opens on Apps › Reviews and the widget keeps its settings when picked", /setLibraryCategory\("reviews"\)/.test(editor) && /initialCategory=\{libraryCategory\}/.test(editor) && /widgetSettings\.current\?\.type === type/.test(editor))
  const page = read("app/app/reviews/widgets/page.tsx")
  const client = read("components/app/reviews/widgets/widgets-client.tsx")
  check("Reviews › Widgets is at /app/reviews/widgets, drawn with the store's own reviews and theme", /loadWidgetsPage/.test(page) && /canvasReviews\(db, creator\.id, product\)/.test(read("app/app/reviews/widgets/load-widgets.ts")) && /editorAddUrl\(data\.installId/.test(client))
  check("  a computer and a phone preview, presets, and the settings from the section's own schema", /data-widget-device/.test(client) && /\/api\/reviews\/widgets\/presets/.test(client) && /STORELIB_SCHEMAS\[type\]\?\.fields/.test(client))
}

/* ── Presets ─────────────────────────────────────────────────────────── */
async function presetsSuite() {
  console.log("\nPresets: saved per store, only what the section allows")
  const fields = widgetFields("reviews_grid")!
  check("a preset's settings are checked against the widget's own section", fields.length > 20 && widgetFields("hero") === null)
  const clean = cleanPresetSettings({ columns: { desktop: 9, tablet: 2, mobile: "1" }, layout: "masonry", sort: "sideways", star_color: "#D97706", background: "red", heading: "Kind words", min_rating: 0, made_up: 1, show_date: "yes" }, fields)
  check("  kept: in range, a known choice, a hex colour, the words as written", JSON.stringify(clean.columns) === JSON.stringify({ desktop: 4, tablet: 2, mobile: 1 }) && clean.layout === "masonry" && clean.star_color === "#d97706" && clean.heading === "Kind words" && clean.min_rating === 1, clean)
  check("  dropped: an unknown choice, a colour that is not one, a setting it does not have, the wrong kind", !("sort" in clean) && !("background" in clean) && !("made_up" in clean) && !("show_date" in clean))
  check("a name: one line, trimmed, never empty", cleanPresetName("  Home   grid \n") === "Home grid" && cleanPresetName("   ") === null && (cleanPresetName("x".repeat(200)) ?? "").length === 60)
  check("a create needs a known widget and a name", checkPresetInput({ widget: "reviews_nope", name: "x" }).ok === false && checkPresetInput({ widget: "reviews_grid", name: " " }).ok === false && checkPresetInput({ widget: "reviews_grid", name: "Grid", settings: { layout: "list" } }).ok === true)
  check("only what differs from the defaults is carried", JSON.stringify(changedSettings({ a: 1, b: { x: 1 }, c: 3 }, { a: 1, b: { x: 1 }, c: 2 })) === JSON.stringify({ c: 3 }))

  /* A store's table, in memory, the way the routes use it. */
  type Row = Record<string, unknown>
  const table: Row[] = []
  let missing = false
  let n = 0
  const db = {
    from(name: string) {
      if (name !== "review_widget_presets") throw new Error(name)
      const filters: [string, unknown][] = []
      let op: "select" | "insert" | "update" | "delete" = "select"
      let payload: Row | null = null
      let head = false
      let one: "single" | "maybe" | null = null
      const run = () => {
        if (missing) return { data: null, error: { code: "42P01", message: "relation does not exist" }, count: null }
        const hit = (r: Row) => filters.every(([k, v]) => r[k] === v)
        if (op === "insert") {
          if (table.some((r) => r.creator_id === payload!.creator_id && r.widget === payload!.widget && String(r.name).toLowerCase() === String(payload!.name).toLowerCase())) return { data: null, error: { code: "23505" } }
          const row = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, created_at: day(0), updated_at: day(0), ...payload }
          table.push(row)
          return { data: row, error: null }
        }
        if (op === "update") {
          const r = table.find(hit)
          if (r) Object.assign(r, payload)
          return { data: r ?? null, error: null }
        }
        if (op === "delete") {
          for (let i = table.length - 1; i >= 0; i--) if (hit(table[i])) table.splice(i, 1)
          return { data: null, error: null }
        }
        const list = table.filter(hit)
        if (head) return { data: null, error: null, count: list.length }
        return { data: one ? list[0] ?? null : list, error: null }
      }
      const q = {
        select(_cols?: string, o?: { head?: boolean }) { head = o?.head === true; return q },
        insert(row: Row) { op = "insert"; payload = row; return q },
        update(row: Row) { op = "update"; payload = row; return q },
        delete() { op = "delete"; return q },
        eq(k: string, v: unknown) { filters.push([k, v]); return q },
        order() { return q },
        limit() { return q },
        single() { one = "single"; return q },
        maybeSingle() { one = "maybe"; return q },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
      }
      return q
    },
  }
  const main = async () => {
    const created = await createPreset(db, "store-a", { widget: "reviews_grid", name: "Home grid", settings: clean })
    check("saved under its name", created.ok === true && created.preset.name === "Home grid" && created.preset.widget === "reviews_grid")
    const again = await createPreset(db, "store-a", { widget: "reviews_grid", name: "home GRID", settings: {} })
    check("  a second one by the same name is refused, whatever its case", again.ok === false && again.status === 409)
    await createPreset(db, "store-b", { widget: "reviews_grid", name: "Home grid", settings: {} })
    const listed = await listPresets(db, "store-a")
    check("  listed for its own store only", listed.ready && listed.presets.length === 1 && listed.presets[0].settings.layout === "masonry")
    if (created.ok) {
      const loaded = await readPreset(db, "store-a", created.preset.id)
      check("  loaded back with its settings", loaded?.settings.star_color === "#d97706")
      check("  another store cannot read it", (await readPreset(db, "store-b", created.preset.id)) === null)
      const changed = await updatePreset(db, "store-a", created.preset.id, { name: "Home page grid", settings: { layout: "list" } })
      check("  renamed and given new settings", changed.ok === true && changed.preset.name === "Home page grid" && changed.preset.settings.layout === "list")
      await deletePreset(db, "store-a", created.preset.id)
      check("  deleted, leaving the other store's", (await listPresets(db, "store-a")).presets.length === 0 && (await listPresets(db, "store-b")).presets.length === 1)
    }
    missing = true
    const before = await listPresets(db, "store-a")
    const write = await createPreset(db, "store-a", { widget: "reviews_grid", name: "x", settings: {} })
    check("before part 205 runs: nothing listed, not ready, and saving says which part to run", before.ready === false && before.presets.length === 0 && write.ok === false && write.status === 503 && write.error === PRESETS_NEED_SQL)
  }
  await main()
  const route = read("app/api/reviews/widgets/presets/route.ts") + read("app/api/reviews/widgets/presets/[id]/route.ts")
  check("the routes are the signed in store's own, checked before anything is written", (route.match(/shopCaller\(\)/g) ?? []).length === 5 && /checkPresetInput/.test(route) && /isUuid\(id\)/.test(route))
}

void presetsSuite().then(() => {
  console.log(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`  failing:\n    ${failures.join("\n    ")}`)
    process.exit(1)
  }
  process.exit(0)
})
