/**
 * ===========================================================================
 *  AG2: AN IMPORTED THEME'S NATIVE SECTIONS, BLOCK PREVIEWS, SIZE CHARTS,
 *  REVIEW AGGREGATES, DYNAMIC BINDINGS AND TENANT ISOLATION
 * ===========================================================================
 * Checked here, with the engine itself (no database: reads get a stand in
 * that filters rows the way PostgREST does):
 *
 *   native sections   a template naming storelib-review-widget imports and
 *                     pushes without a theme file, keeps its settings, and a
 *                     re-import or push that leaves it out keeps it where it
 *                     was; an unknown type is still refused, with the reason
 *   block previews    Add block draws a block from its own markup, never the
 *                     product section around it, and gives up (icon) when a
 *                     block cannot be drawn alone
 *   size charts       the full JSON, units converted and labelled, identical
 *                     on the main product and a featured product
 *   reviews           Shopify's rating metafields with real numbers, on a
 *                     featured product too, with the JSON-LD the same
 *   bindings          `{{ product.metafields.custom.material }}` and the
 *                     builder's pills read at render time, escaped
 *   isolation         every new read is scoped to the site's own creator
 *
 * Run with:  npx tsx tests/ag2-imported-theme.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { mergePages } from "../lib/github-sync/layout"
import { isStorelibNativeSection, preserveNativeWidgets, STORELIB_APP_SECTION_TYPES } from "../lib/storelib-theme/compat/native-sections"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage, pageContextFor } from "../lib/storelib-theme/compat/page"
import { boundExpression, boundText, productObject, reviewMetafields } from "../lib/storelib-theme/compat/objects"
import { sizeChartJson, readSizeChart, type SizeChart } from "../lib/size-charts/model"
import { sizeChartsForStore } from "../lib/size-charts/storefront"
import { COMPAT_SOURCE_EXPR, sourcesFor } from "../lib/storelib-theme/dynamic"
import { REVIEW_STARS_BLOCK } from "../lib/storelib-theme/compat/review-app-blocks"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
type O = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const TEE = "33333333-3333-4333-8333-333333333333"
const MUG = "44444444-4444-4444-8444-444444444444"
const OTHER_PRODUCT = "55555555-5555-4555-8555-555555555555"

/* A stand in for the server's client: rows filtered by eq and in, as PostgREST filters them. Every filter asked for is kept, for the isolation checks. */
function fakeDb(tables: Record<string, O[]>) {
  const asked: { table: string; filters: [string, string, unknown][] }[] = []
  return {
    asked,
    from(table: string) {
      const filters: [string, string, unknown][] = []
      asked.push({ table, filters })
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([op, k, v]) => (op === "eq" ? r[k] === v : (v as unknown[]).includes(r[k]))))
      const q: O = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push(["eq", k, v]), q),
        in: (k: string, v: unknown[]) => (filters.push(["in", k, v]), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok, bad),
      }
      return q
    },
  }
}

const schemaOf = (o: O) => `\n\n<schema>\n${JSON.stringify(o)}\n</schema>\n`

async function main() {
  console.log("\nNative sections: the ZIP import\n")
  {
    const zip = new JSZip()
    zip.file("layout/theme.liquid", "<html><body>{{ content_for_layout }}</body></html>")
    zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Test", theme_version: "1.0.0" }]))
    zip.file("sections/hero.liquid", `<h1>{{ section.settings.title }}</h1>{% schema %}${JSON.stringify({ name: "Hero", settings: [{ type: "text", id: "title", label: "Title" }] })}{% endschema %}`)
    zip.file(
      "templates/index.json",
      JSON.stringify({
        sections: {
          hero: { type: "hero", settings: { title: "Hi" } },
          reviews: { type: "storelib-review-widget", settings: { widget: "carousel", heading: "Loved by buyers", review_config: "cfg-1" } },
          ghost: { type: "ghost-section", settings: {} },
        },
        order: ["hero", "reviews", "ghost"],
      }),
    )
    const r = await convertShopifyTheme(zip)
    check("the theme imports", r.ok === true, r.ok === false ? (r as { error: string }).error : undefined)
    if (r.ok) {
      const home = r.theme.pages.find((p) => p.page_key === "home")
      const widget = home?.sections.find((s) => s.id === "reviews")
      check("storelib-review-widget is kept without a sections/storelib-review-widget.liquid", widget?.type === "storelib-review-widget", home?.sections.map((s) => s.type))
      check("  with every setting it was given", widget?.settings.widget === "carousel" && widget?.settings.heading === "Loved by buyers" && widget?.settings.review_config === "cfg-1", widget?.settings)
      check("  named as Add section names it", widget?.name === "Reviews widget", widget?.name)
      check("  in its place in the order", home?.sections.map((s) => s.id).join(",") === "hero,reviews")
      const notes = r.report.notes.filter((n) => n.file === "templates/index.json").map((n) => n.message)
      check("an unknown type is still left off, with the reason", notes.some((m) => /names sections the theme does not have, which were left off: ghost-section/.test(m)), notes)
      check("  and the report says Storelib draws the widget", notes.some((m) => /Storelib's own storelib-review-widget, kept with its settings/.test(m)), notes)
    }
    const bad = await convertShopifyTheme(new JSZip().file("sections/a.liquid", "x") as JSZip)
    check("an upload that is not a theme is refused with the exact reason", bad.ok === false && /needs its layout/.test((bad as { error: string }).error), bad)
    check("both registered types are listed", STORELIB_APP_SECTION_TYPES.includes("storelib-review-widget") && STORELIB_APP_SECTION_TYPES.includes("storelib-reviews") && isStorelibNativeSection("storelib-review-widget") && !isStorelibNativeSection("ghost-section"))
  }

  console.log("\nNative sections: a GitHub push and a re-import\n")
  {
    const current = [
      {
        page_key: "home",
        sections: [
          { id: "hero", type: "hero", settings: { title: "Old" } },
          { id: "w1", type: "storelib-review-widget", settings: { widget: "carousel", heading: "Kept heading" } },
          { id: "main", type: "main-product", settings: {}, blocks: [{ id: "t", type: "title", settings: {} }, { id: "stars", type: REVIEW_STARS_BLOCK, settings: { show_count: false } }] },
          { id: "footer-text", type: "rich-text", settings: {} },
        ],
      },
    ]
    const known = (t: string) => ["hero", "main-product", "rich-text"].includes(t)
    /* The repository's home.json: the widget and the stars block left out, the hero changed. */
    const pushed = JSON.stringify({ sections: { hero: { type: "hero", settings: { title: "New" } }, main: { type: "main-product", settings: {}, blocks: { t: { type: "title", settings: {} } }, block_order: ["t"] }, "footer-text": { type: "rich-text", settings: {} } }, order: ["hero", "main", "footer-text"] })
    const r = mergePages(current, { "templates/home.json": pushed }, { knownTypes: known, maxSections: 60, newPageKey: () => true })
    const home = r.pages.find((p) => p.page_key === "home")?.sections ?? []
    check("the push is taken", r.errors.length === 0 && home.find((s) => s.id === "hero")?.settings?.title === "New", r.errors)
    check("the creator's reviews widget is kept, after the section it followed", home.map((s) => s.id).join(",") === "hero,w1,main,footer-text", home.map((s) => s.id))
    check("  with its id and its settings", (home.find((s) => s.id === "w1")?.settings as O)?.heading === "Kept heading")
    const main = home.find((s) => s.id === "main") as O
    check("a Storelib app block the pushed section left out is put back with its settings", main?.blocks?.map((b: O) => b.id).join(",") === "t,stars" && main.blocks[1].settings.show_count === false, main?.blocks)

    const withWidget = JSON.stringify({ sections: { hero: { type: "hero", settings: {} }, w2: { type: "storelib-review-widget", settings: { widget: "grid" } } }, order: ["hero", "w2"] })
    const r2 = mergePages(current, { "templates/home.json": withWidget }, { knownTypes: known, maxSections: 60, newPageKey: () => true })
    check("a pushed template may place storelib-review-widget with no file for it", r2.errors.length === 0 && r2.pages[0].sections.some((s) => s.id === "w2" && s.type === "storelib-review-widget"), r2.errors)
    const r3 = mergePages(current, { "templates/home.json": JSON.stringify({ sections: { g: { type: "ghost" } }, order: ["g"] }) }, { knownTypes: known, maxSections: 60, newPageKey: () => true })
    check("an unknown type is refused with the exact reason", r3.errors.length === 1 && r3.errors[0].reason === `templates/home.json: section "g" is a "ghost", and there is no sections/ghost.storelib in this theme. Add the file in the same push, or use a section the theme has`, r3.errors)
    check("  and the page is left as it was", r3.pages.length === 0)

    const same = preserveNativeWidgets([{ id: "w", type: "storelib-review-widget", settings: { widget: "carousel", heading: "Mine" } }], [{ id: "w", type: "storelib-review-widget", settings: { widget: "grid" } }])
    check("the same widget in both: its saved settings are kept over the file's", same.length === 1 && same[0].settings?.heading === "Mine" && same[0].settings?.widget === "carousel", same)
    const first = preserveNativeWidgets([{ id: "w", type: "storelib-reviews", settings: {} }, { id: "a", type: "hero" }], [{ id: "a", type: "hero" }])
    check("a widget that came first stays first", first.map((s) => s.id).join(",") === "w,a")
    check("the GitHub sync and the import both use the registry", /isStorelibNativeSection\(s\.type\)/.test(code("lib/github-sync/layout.ts")) && /preserveNativeWidgets\(cur\.template, templates\[key\]\)/.test(code("lib/github-sync/layout.ts")) && /isStorelibNativeSection\(s\.type\)/.test(code("lib/storelib-theme/shopify/convert.ts")))
  }

  /* ── One theme for the drawing checks ── */
  const tees: SizeChart = readSizeChart({ name: "Tees", unit: "cm", columns: [{ name: "Size", measure: false }, { name: "EU", measure: false }, { name: "Chest", measure: true }, { name: "Length", measure: true }], rows: [["S", "44", "86-91", "69"], ["M", "46", "91-97", "71"], ["L", "48", "97-102", "74"]], notes: "Measured flat.", imageUrl: "https://cdn.example.com/measure.png" })!
  const teeCard = {
    id: TEE,
    settings: {
      title: "Classic tee",
      slug: "classic-tee",
      url: "/products/classic-tee",
      price: "$48.00",
      kind: "physical",
      available: true,
      description_html: "<p>Soft <strong>cotton</strong></p>",
      fields: { material: '<img src=x onerror="alert(1)">Wool & silk' },
      variants: [{ id: "v-s", name: "S", price: "", available: true }],
      options: [{ name: "Size", values: ["S"] }],
    },
  }
  const mugCard = { id: MUG, settings: { title: "Mug", slug: "mug", url: "/products/mug", price: "$12.00", kind: "physical", available: true } }
  const JSON_OUT = `<pre class="chart">{{ product.metafields.storelib.size_chart.value | json }}</pre><i class="rating">{{ product.metafields.reviews.rating.value.rating }}|{{ product.metafields.reviews.rating.value.value }}|{{ product.metafields.reviews.rating_count.value }}</i><script type="application/ld+json">{{ product | structured_data }}</script>`
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
    "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="main">${JSON_OUT}<div class="gallery">GALLERY</div>{%- for block in section.blocks -%}{%- case block.type -%}{%- when 'title' -%}<h1 class="t" {{ block.shopify_attributes }}>{{ product.title }}</h1>{%- when 'price' -%}<p class="price" {{ block.shopify_attributes }}>{{ product.price | money }}</p>{%- when 'inline' -%}{%- endcase -%}{%- endfor -%}</div>`)}${schemaOf({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [{ type: "@app" }, { type: "title", name: "Title" }, { type: "price", name: "Price" }, { type: "inline", name: "Inline" }] } })}`,
    "sections/featured-product.storelib": `${wrapCompatTemplate(`{%- assign product = section.settings.product -%}<div class="featured">${JSON_OUT}</div>`)}${schemaOf({ type: "featured-product", name: "Featured product", settings: [], shopify: { name: "Featured product", settings: [{ type: "product", id: "product", label: "Product" }] } })}`,
    "sections/bound.storelib": `${wrapCompatTemplate(`<p class="mat">{{ section.settings.material }}</p><p class="price">{{ section.settings.price_line }}</p><div class="desc">{{ section.settings.body }}</div><a class="go" href="{{ section.settings.link }}">go</a><p class="shop">{{ section.settings.shop_line }}</p><p class="rate">{{ section.settings.rate }}</p>`)}${schemaOf({ type: "bound", name: "Bound", settings: [], shopify: { name: "Bound", settings: [{ type: "text", id: "material", label: "M" }, { type: "text", id: "price_line", label: "P" }, { type: "richtext", id: "body", label: "B" }, { type: "url", id: "link", label: "L" }, { type: "text", id: "shop_line", label: "S" }, { type: "text", id: "rate", label: "R" }] } })}`,
    "blocks/badge.storelib": `${wrapCompatTemplate(`<span class="badge" {{ block.shopify_attributes }}>{{ block.settings.label }} {{ closest.product.title }}</span>`)}${schemaOf({ type: "badge", name: "Badge", settings: [], shopify: { name: "Badge", settings: [{ type: "text", id: "label", label: "Label", default: "New" }] } })}`,
  }
  const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
  const reviews = { enabled: true, sample: false, star_color: "#111", ratings: { [TEE]: { count: 3, average: 4.7, stars: { "5": 2, "4": 1, "3": 0, "2": 0, "1": 0 } } }, product: { id: TEE, summary: { count: 3, average: 4.7, bars: [{ stars: 5, count: 2 }, { stars: 4, count: 1 }, { stars: 3, count: 0 }, { stars: 2, count: 0 }, { stars: 1, count: 0 }] } } }
  const page = { designMode: false, products: [teeCard, mugCard], collections: [], menus: {}, shop: { name: "Shop & Co", currency: "USD", moneyFormat: "${{amount}}" }, template: "product", path: "/products/classic-tee", product: teeCard, reviews, sizeCharts: { [TEE]: tees } }

  console.log("\nSize charts: the JSON and its units\n")
  {
    const json = sizeChartJson(tees) as O
    check("title, unit and its label", json.title === "Tees" && json.name === "Tees" && json.unit === "cm" && json.unit_label === "cm")
    check("both units available when a measurement has numbers", JSON.stringify(json.units) === '["cm","in"]' && json.has_measurements === true)
    check("each column says its unit, a size label none", json.columns[0].unit === null && json.columns[1].unit === null && json.columns[2].unit === "cm" && json.columns[2].measure === true)
    check("cm to in: measurements converted to one decimal, sizes and EU labels as typed", json.tables.in.rows[0][2] === "33.9-35.8" && json.tables.in.rows[0][3] === "27.2" && json.tables.in.rows[0][1] === "44" && json.tables.in.rows[0][0] === "S" && json.tables.in.unit_label === "in", json.tables.in.rows[0])
    check("  the cm table is the rows as typed", JSON.stringify(json.tables.cm.rows) === JSON.stringify(tees.rows))
    check("notes, picture and the measuring guide", json.notes === "Measured flat." && json.image === "https://cdn.example.com/measure.png" && json.measuring_guide.text === "Measured flat." && json.measuring_guide.image === "https://cdn.example.com/measure.png")
    const inches = sizeChartJson(readSizeChart({ name: "Jeans", unit: "in", columns: [{ name: "Size", measure: false }, { name: "Waist", measure: true }], rows: [["30", "30"], ["32", "32,5"]] })!) as O
    check("in to cm, with the decimal mark kept", inches.tables.cm.rows[0][1] === "76.2" && inches.tables.cm.rows[1][1] === "82,6" && inches.unit_label === "in", inches.tables.cm.rows)
    const labels = sizeChartJson(readSizeChart({ name: "Rings", unit: "cm", columns: [{ name: "Size", measure: false }, { name: "Fit", measure: true }], rows: [["S", "Snug"]] })!) as O
    check("a chart with no measured number offers only its own unit", JSON.stringify(labels.units) === '["cm"]' && labels.tables.in === undefined)
    const mf = productObject({ ...teeCard, settings: { ...teeCard.settings, size_chart: tees } } as never).metafields as O
    check("product.metafields.custom.size_chart: a page with the table, the same JSON beside it", mf.custom.size_chart.value.title === "Tees" && /<table>/.test(mf.custom.size_chart.value.content) && /Chest <span class="slsc__unit">\(cm\)<\/span>/.test(mf.custom.size_chart.value.content) && mf.custom.size_chart.value.tables.in.rows[0][2] === "33.9-35.8")
    const own = productObject({ ...teeCard, settings: { ...teeCard.settings, fields: { size_chart: "My own words" }, size_chart: tees } } as never).metafields as O
    check("  never over the creator's own custom field of that name", own.custom.size_chart.value === "My own words")
  }

  console.log("\nSize charts and reviews: main product and featured product read the same\n")
  {
    const html = drawPage(theme, page as never, [{ id: "main", type: "main-product", blocks: [{ id: "t", type: "title", settings: {} }] }, { id: "feat", type: "featured-product", settings: { product: "classic-tee" } }] as never, { scripts: false }).html
    const grab = (cls: string, tag: string) => {
      const at = html.indexOf(`class="${cls}"`)
      const from = html.indexOf(`<${tag}`, at)
      return at < 0 ? "" : html.slice(from, html.indexOf(`</${tag}>`, from))
    }
    const mainPart = html.slice(html.indexOf('class="main"'), html.indexOf('class="gallery"'))
    const featPart = html.slice(html.indexOf('class="featured"'))
    const chartOf = (part: string) => part.slice(part.indexOf('<pre class="chart">') + 19, part.indexOf("</pre>"))
    const mainChart = chartOf(mainPart)
    const featChart = chartOf(featPart)
    check("the main product has the full chart", /&quot;title&quot;:&quot;Tees&quot;|"title":"Tees"/.test(mainChart), mainChart.slice(0, 200))
    check("the featured product gets the identical chart JSON", mainChart.length > 50 && mainChart === featChart, { mainChart: mainChart.slice(0, 120), featChart: featChart.slice(0, 120) })
    const ratingOf = (part: string) => part.slice(part.indexOf('<i class="rating">') + 18, part.indexOf("</i>"))
    check("the main product's rating is the page's published reviews: 4.7 of 3", ratingOf(mainPart) === "4.7|4.7|3", ratingOf(mainPart))
    check("the featured product reads the same numbers from the shop's ratings", ratingOf(featPart) === "4.7|4.7|3", ratingOf(featPart))
    const ld = (part: string) => {
      const s = part.slice(part.indexOf('<script type="application/ld+json">') + 35)
      try {
        return JSON.parse(s.slice(0, s.indexOf("</script>"))) as O
      } catch {
        return {}
      }
    }
    check("JSON-LD aggregateRating agrees on both", ld(mainPart).aggregateRating?.ratingValue === "4.7" && ld(mainPart).aggregateRating?.reviewCount === 3 && ld(featPart).aggregateRating?.ratingValue === "4.7" && ld(featPart).aggregateRating?.reviewCount === 3, [ld(mainPart).aggregateRating, ld(featPart).aggregateRating])
    void grab
    const p = productObject({ ...mugCard } as never) as O
    check("a product with no published reviews has no rating metafields", Object.keys(p.metafields.reviews).length === 0)
    const sample = drawPage(theme, { ...page, reviews: { ...reviews, sample: true }, product: mugCard } as never, [{ id: "feat", type: "featured-product", settings: { product: "classic-tee" } }] as never, { scripts: false }).html
    check("sample reviews never count", /<i class="rating">\|\|<\/i>/.test(sample), sample.slice(sample.indexOf('class="rating"'), sample.indexOf('class="rating"') + 60))
    const mf = reviewMetafields({ value: 4.66, count: 3 }) as O
    check("rating.value: { rating, value, scale_min, scale_max }, one decimal", mf.rating.value.rating === 4.7 && mf.rating.value.value === 4.7 && mf.rating.value.scale_min === 1 && mf.rating.value.scale_max === 5 && mf.rating_count.value === 3)
    const pageObj = pageContextFor(theme, page as never, []).globals.product as O
    const dist = pageObj.metafields.storelib.reviews.value
    check("product.metafields.storelib.reviews carries the distribution", dist.count === 3 && dist.distribution[0].stars === 5 && dist.distribution[0].count === 2 && dist.distribution[0].percent === 67 && dist.distribution[1].count === 1, dist)
  }

  console.log("\nBlock library previews: the block, not its section\n")
  {
    const ctx = pageContextFor(theme, { ...page, template: "index", product: null } as never, [])
    const title = theme.renderBlockAlone(ctx, "main-product", { id: "block-picker-preview", type: "title", settings: {} })
    check("a section's own block is drawn from its `when` branch", !!title && /<h1 class="t" data-block-id="block-picker-preview">Classic tee<\/h1>/.test(title), title)
    check("  without the rest of the product section", !!title && !/GALLERY|class="chart"|class="main"/.test(title), title)
    check("  inside a minimal section wrapper for the theme's CSS", !!title && /^<div id="shopify-section-storelib-block-preview" class="shopify-section" data-section-type="main-product" data-storelib-block-alone>/.test(title))
    const price = theme.renderBlockAlone(ctx, "main-product", { id: "p", type: "price", settings: {} })
    check("  with the sample product's own data", !!price && /\$48\.00/.test(price), price)
    const badge = theme.renderBlockAlone(ctx, "main-product", { id: "b", type: "badge", settings: { label: "Hot" } })
    check("a theme block is drawn from blocks/<type> with its settings and closest.product", !!badge && /<span class="badge" data-block-id="b">Hot Classic tee<\/span>/.test(badge), badge)
    const stars = theme.renderBlockAlone(ctx, "main-product", { id: "s", type: REVIEW_STARS_BLOCK, settings: {} })
    check("a Storelib app block is drawn alone too", !!stars && /shopify-app-block/.test(stars), stars)
    check("a block that draws nothing alone gives up (the library shows its icon)", theme.renderBlockAlone(ctx, "main-product", { id: "i", type: "inline", settings: {} }) === null)
    check("  and one the section has no branch for", theme.renderBlockAlone(ctx, "main-product", { id: "x", type: "nowhere", settings: {} }) === null)
    const { blockMarkup } = await import("../components/website-builder/compat/compat-section-preview")
    const t0 = performance.now()
    const drawn = blockMarkup(theme, page as never, "main-product", { id: "block-picker-preview", type: "title", settings: {} } as never, files, 1200, 800)
    const ms = performance.now() - t0
    check("blockMarkup: the preview's markup is the block alone, no scripts", !!drawn && /Classic tee/.test(drawn) && !/GALLERY/.test(drawn) && !/<script(?![^>]*ld\+json)/.test(drawn), drawn)
    console.log(`        (drawn in ${ms.toFixed(1)} ms)`)
    const picker = code("components/website-builder/editor/block-picker.tsx")
    /* Round 18: the whole section only when the block cannot be drawn alone (a block drawn through a snippet), cropped to the block; it was an icon. */
    check("the picker draws an imported theme's block with blockMarkup, and its section only when that draws nothing", /blockMarkup\(ctx\.theme, page, session\.request\.section\.type, session\.blockFor\(choice\)/.test(picker) && /if \(!html\) \{[\s\S]{0,120}sectionMarkup\(/.test(picker))
  }

  console.log("\nDynamic bindings, escaped\n")
  {
    const sections = [{ id: "bd", type: "bound", settings: { material: "{{ product.metafields.custom.material }}", price_line: "Now {{ product.price }}", body: "{{ product.description }}", link: "{{ product.metafields.custom.link }}", shop_line: "{{ shop.name }}", rate: "{{ product.rating }} from {{ product.rating_count }}" } }]
    const evil = { ...teeCard, settings: { ...teeCard.settings, fields: { ...teeCard.settings.fields, link: "javascript:alert(1)" } } }
    const html = drawPage(theme, { ...page, products: [evil, mugCard], product: evil } as never, sections as never, { scripts: false }).html
    const part = (cls: string) => {
      const at = html.indexOf(`class="${cls}"`)
      return at < 0 ? "" : html.slice(html.indexOf(">", at) + 1, html.indexOf("</", at))
    }
    check("a custom field metafield is read at render time, HTML-escaped", part("mat") === "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Wool &amp; silk", part("mat"))
    check("the builder's product.price pill is the formatted price, not cents", part("price") === "Now $48.00", part("price"))
    check("a description into rich text keeps its cleaned markup", /<p>Soft <strong>cotton<\/strong><\/p>/.test(html.slice(html.indexOf('class="desc"'))))
    check("a bound link that is a script is \"#\"", /<a class="go" href="#">/.test(html), html.slice(html.indexOf('class="go"') - 10, html.indexOf('class="go"') + 40))
    check("shop fields are escaped too", part("shop") === "Shop &amp; Co", part("shop"))
    check("review sources read the real aggregates", part("rate") === "4.7 from 3", part("rate"))
    check("boundExpression escapes text, keeps a description in rich text, strips it in text", boundExpression("product.title", "text") === "product.title | escape" && boundExpression("closest.product.description", "richtext") === "closest.product.description" && boundExpression("product.description", "text") === "product.description | strip_html | escape" && boundExpression("settings.color_palette.color3", "color") === "settings.color_palette.color3")
    check("boundText rewrites each placeholder", boundText("Get {{ product.title }} by {{shop.name}}", "text") === "Get {{ product.title | escape }} by {{ shop.name | escape }}")
    const compat = sourcesFor("text", "product", { compat: true }).map((s) => s.id)
    const native = sourcesFor("text", "product").map((s) => s.id)
    check("the Shop data picker offers an imported theme only what its Liquid fills", compat.includes("product.title") && compat.includes("product.rating") && !compat.includes("creator.bio") && !compat.includes("social.instagram") && compat.every((id) => COMPAT_SOURCE_EXPR[id] !== undefined))
    check("  and a Storelib theme keeps its own list", native.includes("creator.bio") && !native.includes("product.rating"))
    check("the editor tells the picker it is an imported theme", /compat: compatInstall,/.test(code("app/website-builder/editor/[installId]/page.tsx")) && /sourcesFor\(kind, env\.template, \{ compat: env\.compat === true \}\)/.test(code("components/website-builder/editor/controls/dynamic-source-field.tsx")))
  }

  console.log("\nTenant isolation\n")
  {
    const chartRow = (id: string, creator: string, name: string) => ({ id, creator_id: creator, name, unit: "cm", columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }], rows: [["S", "86"]], notes: null, image_url: null })
    const db = fakeDb({
      product_size_charts: [
        { product_id: TEE, size_chart_id: "c1", creator_id: CREATOR },
        /* A link row of another store that points at this store's chart id. */
        { product_id: OTHER_PRODUCT, size_chart_id: "c1", creator_id: OTHER },
        /* This store's product pointing at another store's chart. */
        { product_id: MUG, size_chart_id: "c2", creator_id: CREATOR },
      ],
      size_charts: [chartRow("c1", CREATOR, "Mine"), chartRow("c2", OTHER, "Theirs")],
    })
    const charts = await sizeChartsForStore(db as never, CREATOR)
    check("a store reads its own products' charts", charts[TEE]?.name === "Mine")
    check("  never another store's link", charts[OTHER_PRODUCT] === undefined)
    check("  never another store's chart, even by id from its own link", charts[MUG] === undefined)
    check("  every read filtered by the creator", db.asked.every((a) => a.filters.some(([op, k, v]) => op === "eq" && k === "creator_id" && v === CREATOR)), db.asked)
    check("  and no creator reads nothing", Object.keys(await sizeChartsForStore(db as never, "")).length === 0)
    check("the chart a visitor is handed has no row id", !("id" in (charts[TEE] as O)))

    const shop = code("lib/website-builder/shop-products.ts")
    check("card ratings: reviews read for this store only", /from\("reviews"\)\.select\("product_id, rating"\)\.eq\("creator_id", creatorId\)\.in\("product_id", ids\)/.test(shop))
    check("  the older columns' fallback too", /select\("id, reviews_count, reviews_average"\)\.eq\("creator_id", creatorId\)/.test(shop))
    const sf = code("lib/reviews/storefront-server.ts")
    check("a product page's reviews are read with its creator beside the product id", /if \(creatorId && key === "product_id"\) q = q\.eq\("creator_id", creatorId\)/.test(sf) && /readRows\(db, "product_id", productId, PRODUCT_LIMIT, creatorId\)/.test(sf) && /readRatings\(db, "product_id", productId, creatorId\)/.test(sf))
    check("  and the shop's product names for its reviews", /select\("id, title, slug, thumbnail_url"\)\.eq\("creator_id", creatorId\)/.test(sf))
    const route = code("app/api/website-builder/products/route.ts")
    check("the builder's cards carry charts read for the signed in creator", /sizeChartsForStore\(admin, creator\.id\)/.test(route))
    const site = code("lib/website-builder/compat-site.ts")
    check("the live site reads charts for the site's own creator", /sizeChartsForStore\(admin as never, creator\.creatorId\)/.test(site))
    check("native sections need no read at all: the registry is a list of names", !/from\(/.test(code("lib/storelib-theme/compat/native-sections.ts")))
  }

  console.log("\nDocs\n")
  {
    const dev = code("content/developers/imported-shopify-themes.md")
    check("the developer docs name the native sections, the chart JSON, the review fields and the binding syntax", ["storelib-review-widget", "measuring_guide", "unit_label", "product.metafields.storelib.reviews", "scale_max", "{{ product.metafields.custom.material }}", "| escape"].every((w) => dev.includes(w)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
