/**
 * ===========================================================================
 *  ROUND 13: PRODUCT FAQS AND SIZE CHARTS, EVERYWHERE A PRODUCT IS SHOWN
 * ===========================================================================
 * The owner: "Do they actually fetch with the FAQs in the blocks of the
 * product pages, product info section, featured product, and all places on
 * Storelib?" and "The size guide block doesn't work ... 'use assigned
 * Storelib size chart' doesn't work."
 *
 * Real shaped products, read through the real loading code:
 *
 *   TEE     a tee with its own questions and its own chart
 *   POLO    in the Shirts collection (one hand picked, one smart): it
 *           relies on the chart set for that collection
 *   HOODIE  filed under Hoodies: it relies on the chart set for that
 *           category
 *   MUG     a mug: no chart, no questions
 *
 * The chart's resolution (lib/size-charts/storefront.ts), the cards an
 * imported theme's Featured product reads (lib/website-builder/product-
 * extras.ts) and its metafields (compat objects), an imported theme drawn
 * whole (a Featured product section reading "Use assigned Storelib size
 * chart" the way Materia does, with collapsible rows), a Storelib theme's
 * product page (the page product handed to its FAQ and Size guide
 * sections, .storelib and React alike), the OnePage's sheet, the seller's
 * side (Also show it on, before and after SQL part 309), the SQL part and
 * the Help Center.
 *
 * Run with: npx tsx tests/r13-sizefaq.test.ts
 */
import { readFileSync } from "node:fs"
import Module from "node:module"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { SizeChart } from "../lib/size-charts/model"
import type { SectionInstance } from "../lib/website-builder/types"
import { sizeChartForProduct, sizeChartsForProducts, sizeChartsForStore } from "../lib/size-charts/storefront"
import { sizeChartFromTable, SIZE_GUIDE_TABLE } from "../lib/size-charts/table-text"
import { productExtras, withExtras } from "../lib/website-builder/product-extras"
import { productObject } from "../lib/storelib-theme/compat/objects"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage } from "../lib/storelib-theme/compat/page"
import { faqAnswerHtml, pageProductOf, showsProductFaqs, withProductFaqs, FAQ_SECTION_TYPES, type PageProduct } from "../lib/products/page-product"
import { withProductBlocks } from "../lib/website-builder/product-page"
import { schemaFor } from "../lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "../lib/website-builder/section-schemas"
import { StorefrontProvider } from "../components/website-builder/theme/storefront-context"
import { SizeGuideSection } from "../components/website-builder/sections/renderers/SizeGuideSection"
import { FaqSection } from "../components/website-builder/sections/renderers/FaqSection"
import { ProductQuestions, SizeChartPanel } from "../components/product/size-chart-panel"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { ALL_HELP_ARTICLES } from "../lib/help/articles"

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
/** A section as the page holds one. */
const sec = (x: unknown) => x as SectionInstance
type O = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const TEE = "a0000000-0000-4000-8000-000000000001"
const POLO = "a0000000-0000-4000-8000-000000000002"
const HOODIE = "a0000000-0000-4000-8000-000000000003"
const MUG = "a0000000-0000-4000-8000-000000000004"
const TEE_CHART = "c0000000-0000-4000-8000-000000000001"
const SHIRT_CHART = "c0000000-0000-4000-8000-000000000002"
const HOODIE_CHART = "c0000000-0000-4000-8000-000000000003"
const THEIR_CHART = "c0000000-0000-4000-8000-000000000009"
const SHIRTS = "d0000000-0000-4000-8000-000000000001"
const SMART = "d0000000-0000-4000-8000-000000000002"

const cols = (names: string[]) => names.map((name, i) => ({ name, measure: i > 0 }))
const chartRow = (id: string, name: string, extra: O = {}) => ({ id, creator_id: CREATOR, name, unit: "cm", columns: cols(["Size", "Chest", "Length"]), rows: [["S", "86-91", "69"], ["M", "91-97", "71"]], notes: "Measured flat.", image_url: null, collection_ids: [], categories: [], ...extra })

/** The store, as its tables hold it. */
function tables(): Record<string, O[]> {
  return {
    products: [
      { id: TEE, creator_id: CREATOR, title: "Classic tee", type: "physical", category: "T-Shirts", status: "published", price_cents: 2800, faqs: [{ question: "Does it shrink?", answer: "No. It is <b>pre-washed</b>.\nWash cold." }, { question: "Is it soft?", answer: "Very." }, { question: "", answer: "dropped" }] },
      { id: POLO, creator_id: CREATOR, title: "Pique polo", type: "physical", category: "Polos", status: "published", price_cents: 3500, tags: ["shirt"], faqs: null },
      { id: HOODIE, creator_id: CREATOR, title: "Heavy hoodie", type: "physical", category: "Hoodies", status: "published", price_cents: 6000, faqs: [] },
      { id: MUG, creator_id: CREATOR, title: "Mug", type: "physical", category: "Mugs", status: "published", price_cents: 1500 },
    ],
    size_charts: [
      chartRow(TEE_CHART, "Tees"),
      chartRow(SHIRT_CHART, "Shirts", { collection_ids: [SHIRTS], rows: [["S", "90-95", "70"], ["M", "95-100", "72"]] }),
      chartRow(HOODIE_CHART, "Hoodies", { categories: ["hoodies"], unit: "in", rows: [["S", "36-38", "27"], ["M", "38-40", "28"]] }),
      { ...chartRow(THEIR_CHART, "Theirs", { categories: ["Mugs"] }), creator_id: OTHER },
    ],
    product_size_charts: [{ product_id: TEE, size_chart_id: TEE_CHART, creator_id: CREATOR }],
    product_collections: [
      { id: SHIRTS, creator_id: CREATOR, kind: "manual", rules: [], match: "all" },
      { id: SMART, creator_id: CREATOR, kind: "smart", rules: [{ field: "tag", op: "equals", value: "shirt" }], match: "all" },
    ],
    product_collection_items: [{ collection_id: SHIRTS, product_id: POLO }],
  }
}

/* ── The server's client as PostgREST answers: filters applied, a missing table or column answered as it does. ── */
function fakeDb(t: Record<string, O[]>, opts: { missing?: string[]; missingColumns?: string[] } = {}) {
  const calls: { table: string; op: string; cols?: string; values?: unknown }[] = []
  return {
    calls,
    from(table: string) {
      const filters: ((r: O) => boolean)[] = []
      let op = "select"
      let cols = ""
      let values: unknown
      const missingCol = () => (opts.missingColumns ?? []).some((c) => cols.includes(c) || (values && typeof values === "object" && c in (values as O)))
      const result = (one: boolean) => {
        calls.push({ table, op, cols, values })
        if ((opts.missing ?? []).includes(table)) return { data: null, error: { code: "PGRST205" } }
        if (missingCol()) return { data: null, error: { code: "42703" } }
        const rows = (t[table] ??= []).filter((r) => filters.every((f) => f(r)))
        if (op === "insert") {
          const row = { id: "e0000000-0000-4000-8000-000000000001", ...(values as O) }
          t[table].push(row)
          return { data: one ? row : [row], error: null }
        }
        if (op === "update") rows.forEach((r) => Object.assign(r, values as O))
        return { data: one ? rows[0] ?? null : rows, error: null, count: rows.length }
      }
      const b: O = {
        select: (c?: string) => ((cols = op === "select" ? c ?? "" : cols), b),
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
        in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), b),
        order: () => b,
        limit: () => b,
        update: (v: unknown) => ((op = "update"), (values = v), b),
        insert: (v: unknown) => ((op = "insert"), (values = v), b),
        maybeSingle: async () => result(true),
        single: async () => result(true),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result(false)).then(ok, bad),
      }
      return b
    },
  }
}

function allowServerOnly() {
  const M = Module as unknown as { _resolveFilename: (this: unknown, request: string, ...rest: unknown[]) => string }
  const resolve = M._resolveFilename
  M._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    if (request === "server-only") return resolve.call(this, request, ...rest).replace(/index\.js$/, "empty.js")
    return resolve.call(this, request, ...rest)
  }
}

/** A shop card, as lib/website-builder/shop-products.ts makes one. */
const card = (id: string, slug: string, title: string, category: string) => ({
  id,
  type: "product" as const,
  settings: { title, slug, url: `/products/${slug}`, price: "$28.00", compare_price: "", image: "", images: [], kind: "physical", available: true, category, description: "Cotton.", options: [{ name: "Size", values: ["S", "M"] }], variants: [{ id: `${id}-s`, name: "S", options: ["S"], price: "$28.00", available: true }, { id: `${id}-m`, name: "M", options: ["M"], price: "$28.00", available: true }] } as O,
})
const CARDS = [card(TEE, "classic-tee", "Classic tee", "T-Shirts"), card(POLO, "pique-polo", "Pique polo", "Polos"), card(HOODIE, "heavy-hoodie", "Heavy hoodie", "Hoodies"), card(MUG, "mug", "Mug", "Mugs")]

async function main() {
  allowServerOnly()
  const { listSizeCharts, saveSizeChart, productSizeChartId } = await import("../lib/size-charts/server")

  console.log("\nWhich chart a product shows: its own, its collection's, its category's\n")
  {
    const db = fakeDb(tables())
    const all = await sizeChartsForProducts(db, CREATOR, [{ id: TEE }, { id: POLO }, { id: HOODIE }, { id: MUG }])
    check("the tee shows its own chart", all.get(TEE)?.name === "Tees" && all.get(TEE)?.source === "product")
    check("the polo, with no chart of its own, shows the one set for its collection", all.get(POLO)?.name === "Shirts" && all.get(POLO)?.source === "collection" && all.get(POLO)?.rows[0][1] === "90-95")
    check("the hoodie shows the one set for its category, matched in any case", all.get(HOODIE)?.name === "Hoodies" && all.get(HOODIE)?.source === "category" && all.get(HOODIE)?.unit === "in")
    check("the mug shows none: another store's chart for Mugs is never read", !all.has(MUG))
    check("no chart a visitor is handed carries an id", [...all.values()].every((c) => !("id" in c)))
    const reads = db.calls.filter((c) => c.table === "product_size_charts").length
    check("one read of the links for the whole list, not one per product", reads === 1, reads)
    const smartOnly = tables()
    smartOnly.product_collection_items = []
    smartOnly.size_charts[1].collection_ids = [SMART]
    check("a smart collection counts by its rules (tag is shirt)", (await sizeChartsForProducts(fakeDb(smartOnly), CREATOR, [{ id: POLO }])).get(POLO)?.name === "Shirts")
    const own = tables()
    own.product_size_charts.push({ product_id: POLO, size_chart_id: TEE_CHART, creator_id: CREATOR })
    check("a chart picked on the product wins over its collection's", (await sizeChartsForProducts(fakeDb(own), CREATOR, [{ id: POLO }])).get(POLO)?.name === "Tees")
    check("one product, by the same rule (the product section and the OnePage read it so)", (await sizeChartForProduct(fakeDb(tables()), HOODIE, CREATOR))?.name === "Hoodies" && (await sizeChartForProduct(fakeDb(tables()), MUG, CREATOR)) === null)
    check("  and without the owner given, from the product's own store", (await sizeChartForProduct(fakeDb(tables()), POLO))?.name === "Shirts")
    check("before SQL part 309 (no rule columns): only the product's own chart, never an error", (await sizeChartsForProducts(fakeDb(tables(), { missingColumns: ["collection_ids"] }), CREATOR, [{ id: TEE }, { id: POLO }])).size === 1)
    check("before SQL part 283: nothing, never an error", (await sizeChartsForProducts(fakeDb({}, { missing: ["product_size_charts", "size_charts"] }), CREATOR, [{ id: TEE }])).size === 0)
  }

  console.log("\nThe cards a section features carry the questions and the chart\n")
  /* The store's charts by product, as the live site and the builder's cards read them once (sizeChartsForStore): its own, else its collection's or category's. */
  const storeCharts = await sizeChartsForStore(fakeDb(tables()), CREATOR)
  const charted = <C extends { id: string; settings: O }>(list: C[]) => list.map((c) => (storeCharts[c.id] ? { ...c, settings: { ...c.settings, size_chart: storeCharts[c.id] } } : c))
  {
    check("the store's charts: the tee's own, the polo's collection's, the hoodie's category's, none for the mug", (storeCharts[TEE] as O)?.name === "Tees" && (storeCharts[POLO] as O)?.source === "collection" && (storeCharts[HOODIE] as O)?.source === "category" && !storeCharts[MUG])
    const extras = await productExtras(fakeDb(tables()), CREATOR, CARDS)
    const cards = charted(withExtras(CARDS, extras))
    const tee = cards.find((c) => c.id === TEE)!
    check("the tee's card has its answered questions, in the editor's order", Array.isArray(tee.settings.faqs) && (tee.settings.faqs as O[]).map((f) => f.question).join("|") === "Does it shrink?|Is it soft?")
    check("  and its chart", tee.settings.size_chart?.name === "Tees")
    check("the polo's card has its collection's chart and no questions", cards[1].settings.size_chart?.name === "Shirts" && cards[1].settings.faqs === undefined)
    check("the mug's card carries neither", cards[3].settings.faqs === undefined && cards[3].settings.size_chart === undefined)
    const teeObj = productObject(tee as never) as O
    const faqs = teeObj.metafields.storelib.faqs.value as O[]
    check("product.metafields.storelib.faqs: question, answer and answer_html", faqs.length === 2 && faqs[0].question === "Does it shrink?" && faqs[0].answer.startsWith("No. It is <b>"))
    check("  answer_html escapes what a seller typed and keeps the lines", faqs[0].answer_html === "No. It is &lt;b&gt;pre-washed&lt;/b&gt;.<br>Wash cold.", faqs[0].answer_html)
    const chart = teeObj.metafields.storelib.size_chart.value as O
    check("product.metafields.storelib.size_chart: name, title, unit, units, columns, rows, rows_cm, rows_in, tables, notes, notes_html, image, measuring_guide, source", ["name", "title", "unit", "units", "columns", "rows", "rows_cm", "rows_in", "tables", "notes", "notes_html", "image", "measuring_guide", "source"].every((k) => k in chart) && chart.source === "product")
    check("  the rows in inches are converted measurement by measurement", chart.rows_in[0][1] === "33.9-35.8" && chart.rows_in[0][0] === "S")
    check("  the polo's says it came from a collection", (productObject(cards[1] as never) as O).metafields.storelib.size_chart.value.source === "collection")
    check("the mug's product has neither: a theme's != blank test draws nothing", (productObject(cards[3] as never) as O).metafields.storelib.size_chart === undefined && (productObject(cards[3] as never) as O).metafields.storelib.faqs === undefined)
    check("the live site's catalogue reads the questions with the descriptions, the charts once for the store", /productExtras\(admin as never, creator\.creatorId, cards\)/.test(code("lib/website-builder/compat-site.ts")) && /withExtras\(withDescriptions\(cards, described\), extras\)/.test(code("lib/website-builder/compat-site.ts")) && /sizeChartsForStore\(admin as never, creator\.creatorId\)/.test(code("lib/website-builder/compat-site.ts")))
    check("  and so do the builder's cards (?cards=1)", /productExtras\(admin, creator\.id, \[\.\.\.shopRead, \.\.\.catalogRead\]\)/.test(code("app/api/website-builder/products/route.ts")) && /sizeChartsForStore\(admin, creator\.id\)/.test(code("app/api/website-builder/products/route.ts")))
  }

  console.log("\nAn imported theme, drawn whole: a Featured product and the product page\n")
  {
    const cards = withExtras(CARDS, await productExtras(fakeDb(tables()), CREATOR, CARDS))
    /* The shop's list copy has neither; the catalogue a picker names from has the questions, the page's sizeCharts the charts (as on the live site). */
    const shop = CARDS.map((c) => ({ ...c, settings: { ...c.settings } }))
    const featured = `${wrapCompatTemplate(`<div class="feat">{%- assign product = section.settings.product -%}<h2>{{ product.title }}</h2>{%- for block in section.blocks -%}{%- case block.type -%}{%- when 'size_table' -%}{%- if block.settings.use_storelib_chart != false and product.metafields.storelib.size_chart != blank -%}{%- assign slc = product.metafields.storelib.size_chart.value -%}<table class="assigned" data-source="{{ slc.source }}"><tr>{% for c in slc.columns %}<th>{{ c.name }}</th>{% endfor %}</tr>{% for row in slc.rows_in %}<tr>{% for cell in row %}<td>{{ cell }}</td>{% endfor %}</tr>{% endfor %}</table>{%- else -%}<table class="fallback"><tr><td>{{ block.settings.table_data }}</td></tr></table>{%- endif -%}{%- when 'collapsible_tab' -%}<details class="row"><summary>{{ block.settings.heading }}</summary>{{ block.settings.content }}</details>{%- endcase -%}{%- endfor -%}{% form 'product', product %}<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}"><button>Add</button>{% endform %}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "featured-product", name: "Featured product", settings: [], shopify: { name: "Featured product", settings: [{ type: "product", id: "product", label: "Product" }], blocks: [{ type: "size_table", name: "Size table", settings: [{ type: "checkbox", id: "use_storelib_chart", label: "Use assigned Storelib size chart", default: true }, { type: "textarea", id: "table_data", label: "Table data" }] }, { type: "collapsible_tab", name: "Collapsible row", settings: [{ type: "text", id: "heading", label: "Heading" }, { type: "richtext", id: "content", label: "Content" }] }] } })}\n</schema>\n`
    const files: Record<string, string> = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
      "sections/featured-product.storelib": featured,
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const home = (slug: string, design = false) =>
      drawPage(theme, { designMode: design, products: shop, pickable: cards, sizeCharts: storeCharts, collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, template: "index", path: "/" } as never, [{ id: "fp", type: "featured-product", settings: { product: slug }, blocks: [{ id: "st", type: "size_table", settings: { use_storelib_chart: true, table_data: "Own table" } }, { id: "r1", type: "collapsible_tab", settings: { heading: "Shipping", content: "<p>Two days.</p>" } }] }] as never, { scripts: false }).html
    const tee = home("classic-tee")
    check("a Featured product on the home page: Use assigned Storelib size chart draws the tee's chart", /<table class="assigned" data-source="product">/.test(tee) && tee.includes("<td>33.9-35.8</td>"), tee.slice(tee.indexOf('class="feat"'), tee.indexOf('class="feat"') + 500))
    check("  and its questions go into a row like the theme's own, after its last", /<details class="row"><summary>FAQ<\/summary><p><strong>Does it shrink\?<\/strong><\/p>/.test(tee) && tee.indexOf("<summary>FAQ</summary>") > tee.indexOf("<summary>Shipping</summary>"))
    check("  a seller's tag in an answer is shown as typed", tee.includes("&lt;b&gt;pre-washed&lt;/b&gt;") && !tee.includes("<b>pre-washed</b>"))
    const polo = home("pique-polo")
    check("the polo, relying on its collection: the Shirts chart", /data-source="collection"/.test(polo) && polo.includes("<td>35.4-37.4</td>"))
    const hoodie = home("heavy-hoodie")
    check("the hoodie, relying on its category: the Hoodies chart in its own inches", /data-source="category"/.test(hoodie) && hoodie.includes("<td>36-38</td>"))
    const viaAll = drawPage(new CompatTheme({ ...files, "sections/all.storelib": `${wrapCompatTemplate(`<p class="all">{{ all_products['pique-polo'].metafields.storelib.size_chart.value.name }}|{{ all_products['classic-tee'].metafields.storelib.faqs.value.size }}</p>`)}\n\n<schema>\n${JSON.stringify({ type: "all", name: "All", settings: [] })}\n</schema>\n` }, {}, { assetUrl: (n) => `/a/${n}` }), { designMode: false, products: shop, pickable: cards, sizeCharts: storeCharts, collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, template: "index", path: "/" } as never, [{ id: "a", type: "all" }] as never, { scripts: false }).html
    check("all_products[handle] carries them too", /<p class="all">Shirts\|2<\/p>/.test(viaAll), viaAll.slice(viaAll.indexOf('class="all"') - 10, viaAll.indexOf('class="all"') + 60))
    const mug = home("mug")
    check("the mug, with none: the block's own table, no FAQ row", /<table class="fallback"><tr><td>Own table<\/td>/.test(mug) && !/<summary>FAQ<\/summary>/.test(mug))
    check("the builder's canvas draws the same", /data-source="product"/.test(home("classic-tee", true)))

    /* A theme of its own (the one above reads the size chart metafield itself, so Storelib adds no link to it): questions under the description, Size guide beside Size. */
    const mainFiles: Record<string, string> = {
      "layout/theme.storelib": files["layout/theme.storelib"],
      "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="p"><div class="desc">{{ product.description }}</div>{%- for option in product.options_with_values -%}<fieldset><legend>{{ option.name }}</legend></fieldset>{%- endfor -%}{% form 'product', product %}<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}"><button>Add</button>{% endform %}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [] } })}\n</schema>\n`,
    }
    const t2 = new CompatTheme(mainFiles, {}, { assetUrl: (n) => `/a/${n}` })
    const page = (c: O) => drawPage(t2, { designMode: false, products: shop, pickable: cards, sizeCharts: storeCharts, collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, template: "product", path: c.settings.url, product: c } as never, [{ id: "main", type: "main-product" }] as never, { scripts: false }).html
    const teePage = page(cards[0])
    check("the product page: questions under the description, Size guide beside Size", /data-storelib-product-faq/.test(teePage) && /<legend>Size<button type="button" class="slsc-open"/.test(teePage))
    const hoodiePage = page(cards[2])
    check("  the hoodie's page has its category's chart beside Size, and no questions block", /<legend>Size<button type="button" class="slsc-open"/.test(hoodiePage) && hoodiePage.includes("Hoodies") && !/data-storelib-product-faq/.test(hoodiePage))
    check("  the mug's page has neither", !/slsc-open|data-storelib-product-faq/.test(page(cards[3])))
  }

  console.log("\nA Storelib theme: the page's product, to every section on its page\n")
  {
    const teeData = { id: TEE, title: "Classic tee", type: "physical", faqs: [{ question: "Does it shrink?", answer: "No. It is <b>pre-washed</b>.\n\nWash cold." }], size_chart: { ...chartRow(TEE_CHART, "Tees"), imageUrl: null } }
    /* `product_faq_seeded`: the creator took the Product questions block out (lib/website-builder/product-page.ts), so it is not put back. */
    const productSection = (data: O, blocks?: O[]) => ({ id: "p", type: "product", name: "Product", settings: { _product_data: data, ...(blocks ? { product_faq_seeded: true } : {}) }, ...(blocks ? { blocks } : {}) })
    const withFaqBlock = pageProductOf([sec(productSection(teeData, [{ id: "t", type: "title", settings: {} }, { id: "pf", type: "product_faq", settings: {} }]))], withProductBlocks)!
    check("the page product is read off the product section's own product", withFaqBlock.id === TEE && withFaqBlock.faqs.length === 1 && withFaqBlock.sizeChart?.name === "Tees")
    check("  a product section with the Product questions block says it shows them", withFaqBlock.faqsInProductSection === true)
    const noBlock = pageProductOf([sec(productSection(teeData, [{ id: "t", type: "title", settings: {} }]))], withProductBlocks)!
    check("  one without it does not", noBlock.faqsInProductSection === false)
    check("a page about no product has none", pageProductOf([sec({ id: "h", type: "hero", name: "Hero", settings: {} })]) === null)
    check("every FAQ section can take them", ["faq", "faq_accordion", "faq_columns", "faq_cta"].every((t) => t in FAQ_SECTION_TYPES))

    const accordion = sec({ id: "f", type: "faq_accordion", name: "FAQ", settings: { heading: "Questions", faq_source: "auto" }, blocks: [{ id: "q1", type: "qa", settings: { question: "Store question?", answer: "<p>Store answer.</p>" } }] })
    check("auto, product section already showing them: the section keeps its own", !showsProductFaqs(accordion, withFaqBlock) && withProductFaqs(accordion, withFaqBlock) === accordion)
    const shown = withProductFaqs(accordion, noBlock)
    check("auto, product section without them: the product's questions, in order, as the section's own blocks", shown.blocks?.length === 1 && shown.blocks[0].type === "qa" && shown.blocks[0].settings.question === "Does it shrink?")
    check("  the answer escaped, a paragraph per blank line, a <br> per line", shown.blocks?.[0].settings.answer === "<p>No. It is &lt;b&gt;pre-washed&lt;/b&gt;.</p><p>Wash cold.</p>" && faqAnswerHtml("a\nb") === "<p>a<br>b</p>")
    check("These questions only: always the section's own", withProductFaqs(sec({ ...accordion, settings: { faq_source: "section" } }), noBlock).blocks?.[0].id === "q1")
    const productOnly = sec({ ...accordion, settings: { faq_source: "product" } })
    const mugPage: PageProduct = { id: MUG, title: "Mug", type: "physical", faqs: [], sizeChart: null, faqsInProductSection: false }
    check("The product only, on a product with none: hidden from buyers, empty in the builder", withProductFaqs(productOnly, mugPage).hidden === true && withProductFaqs(productOnly, mugPage, { inEditor: true }).blocks?.length === 0)
    check("auto on a product with none: the section's own", withProductFaqs(accordion, mugPage).blocks?.[0].id === "q1")
    check("a section that is not an FAQ is never touched", withProductFaqs(sec({ id: "h", type: "hero", name: "Hero", settings: {} }), noBlock).type === "hero")

    /* The live product page draws its .storelib sections on the server from these very sections (components/website-builder/theme/render-product.tsx). */
    const { renderWithSources } = await import("../lib/website-builder/storefront-render")
    const sections = [sec(productSection(teeData, [{ id: "t", type: "title", settings: {} }])), accordion]
    const about = pageProductOf(sections, withProductBlocks)
    const drawn = sections.map((s) => withProductFaqs(s, about))
    const out = renderWithSources(DEFAULT_THEME_SOURCES, drawn, {} as never, "product") as O
    const html = String(out.f?.html ?? "")
    check("the Accordion FAQ on the live product page draws the product's question, escaped", html.includes("Does it shrink?") && html.includes("&lt;b&gt;pre-washed&lt;/b&gt;") && !html.includes("Store question?"), html.slice(0, 600))
    check("render-product hands the sections over this way", /const aboutProduct = pageProductOf\(withProduct, withProductBlocks\)/.test(code("components/website-builder/theme/render-product.tsx")) && /withProduct\.map\(\(s\) => withProductFaqs\(s, aboutProduct\)\)/.test(code("components/website-builder/theme/render-product.tsx")))
    check("ThemePage puts the page's product on the storefront for every section, live and in the canvas", /pageProductOf\(sections, withProductBlocks\)/.test(code("components/website-builder/theme/ThemePage.tsx")) && /pageProduct \? \{ pageProduct \}/.test(code("components/website-builder/theme/ThemePage.tsx")))
    check("  and the builder's .storelib sections draw with it too", /withProductFaqs\(own, pageProduct, \{ inEditor \}\)/.test(code("components/website-builder/sections/StorelibSection.tsx")))

    const theme = {} as never
    const faqHtml = renderToStaticMarkup(createElement(StorefrontProvider, { value: { pageProduct: noBlock }, children: null } as never, createElement(FaqSection, { section: sec({ id: "fq", type: "faq", name: "FAQ", settings: { heading: "FAQ" }, blocks: [{ id: "x", type: "faq_item", settings: { question: "Store question?", answer: "<p>x</p>" } }] }), theme })))
    check("the FAQ section (React) on a product page: the product's question", faqHtml.includes("Does it shrink?") && !faqHtml.includes("Store question?"))

    const guide = (pageProduct: PageProduct | null, settings: O = {}, inEditor = false) => renderToStaticMarkup(createElement(StorefrontProvider, { value: { pageProduct, inEditor }, children: null } as never, createElement(SizeGuideSection, { section: sec({ id: "sg", type: "size_guide", name: "Size guide", settings: { heading: "Size guide", ...settings } }), theme })))
    const hoodie: PageProduct = { id: HOODIE, title: "Heavy hoodie", type: "physical", faqs: [], sizeChart: { name: "Hoodies", unit: "in", columns: cols(["Size", "Chest", "EU"]).map((c, i) => (i === 2 ? { ...c, measure: false } : c)), rows: [["S", "36-38", "44"], ["M", "38-40", "46"]], notes: "Measured flat.", imageUrl: null }, faqsInProductSection: false }
    const g1 = guide(hoodie)
    check("the Size guide section on a product page: that product's chart, not the sample", /data-size-guide-section="product"/.test(g1) && g1.includes("Hoodies") && g1.includes("Measured flat.") && !g1.includes("81-86"))
    check("  in the section's default cm, converted, a label column never converted", g1.includes("91.4-96.5") && g1.includes(">44<"), g1.slice(g1.indexOf("<table"), g1.indexOf("<table") + 900))
    check("  the size column held while the rest scroll on a phone", /overflow-x-auto/.test(g1) && /sticky left-0/.test(g1))
    const g2 = guide(hoodie, { chart_source: "table", table_data: "Size | Waist\nS | 70\nM | 76" })
    check("This table only: the section's own table", /data-size-guide-section="table"/.test(g2) && g2.includes(">70<") && !g2.includes("Hoodies"))
    const g3 = guide(mugPage)
    check("a product with no chart: the section's own table (the five sizes it always had, until changed)", /data-size-guide-section="table"/.test(g3) && g3.includes("81-86"))
    check("  an emptied table and no chart: nothing on the page", guide(mugPage, { table_data: "" }) === "")
    check("  the builder says why", /data-size-guide-note/.test(guide(mugPage, {}, true)) && guide(mugPage, {}, true).includes("This product has no size chart"))
    check("a Highlight this size row is picked out", /data-highlight=""/.test(guide(hoodie, { highlight_size: "M" })))
    const table = sizeChartFromTable(SIZE_GUIDE_TABLE)!
    check("a typed table: numbers are measurements, words are labels", table.columns.map((c) => c.measure).join() === "false,true,true,true" && sizeChartFromTable("Size | EU\nS | 44\nM | Fits")!.columns[1].measure === false)
    const schema = JSON.parse(code("themes/default/sections/size_guide.json")) as O
    check("the section's settings say where the chart comes from", ["chart_source", "table_data", "table_unit"].every((id) => (schema.fields as O[]).some((f) => f.id === id)) && (schema.fields as O[]).find((f) => f.id === "chart_source")?.default === "product")
    check("faq: a Questions from setting, The product, else these by default", /"id": "faq_source"/.test(code("themes/default/sections/faq.json")) && /"default": "auto"/.test(code("themes/default/sections/faq.json").slice(code("themes/default/sections/faq.json").indexOf('"faq_source"'))))
    /* The .storelib ones get it from the platform, under Content, so their files (the AI's reference sections) stay as they are. */
    for (const type of ["faq_accordion", "faq_columns", "faq_cta"]) {
      const fields = (schemaFor(type, undefined, SECTION_SCHEMAS)?.fields ?? []) as O[]
      const at = fields.findIndex((f) => f.id === "faq_source")
      check(`${type}: the panel has Questions from, under Content, The product, else these by default`, at > 0 && fields[at - 1].id === "hdr_content" && fields[at].default === "auto" && fields[at].options.length === 3)
      check(`  ${type}'s file is as it was`, !/faq_source/.test(code(`themes/default/sections/${type}.storelib`)))
    }
  }

  console.log("\nThe OnePage's product sheet and storelib.com\n")
  {
    const api = code("app/api/onepage/product/route.ts")
    check("the sheet's read carries the questions and the size chart", /faqs: productFaqs\(p\.faqs\)/.test(api) && /sizeChartForProduct\(admin, id, creatorId/.test(api) && /\n\s+sizeChart,\n/.test(api))
    check("  still the one call storelib.me answers (no new call)", /onepage\\\/product/.test(code("lib/onepage/host-route.ts")))
    const sheet = code("components/onepage/product-sheet.tsx")
    check("  and the sheet draws both under the description", /<SizeChartPanel chart=\{p\.sizeChart\}/.test(sheet) && /<ProductQuestions faqs=\{p\.faqs\}/.test(sheet))
    const tees: SizeChart = { name: "Tees", unit: "cm", columns: cols(["Size", "Chest"]), rows: [["S", "86-91"]], notes: "Flat.", imageUrl: null }
    const panel = renderToStaticMarkup(createElement(SizeChartPanel, { chart: tees }))
    check("the panel: a Size guide row, the chart's name, a cm / in switch and the table", panel.includes("Size guide") && panel.includes("Tees") && /role="radiogroup"/.test(panel) && panel.includes("86-91") && panel.includes("Flat."))
    const q = renderToStaticMarkup(createElement(ProductQuestions, { faqs: [{ question: "Q<i>?</i>", answer: "line1\nline2" }] }))
    check("questions as plain text, lines kept", q.includes("Q&lt;i&gt;?&lt;/i&gt;") && /whitespace-pre-line/.test(q))
    check("storelib.com's product page keeps an answer's lines", /<p className="whitespace-pre-line">\{faq\.answer\}<\/p>/.test(code("app/(marketing)/p/[slug]/page.tsx")))
  }

  console.log("\nThe seller's side: Also show it on\n")
  {
    const t = tables()
    const db = fakeDb(t)
    const list = await listSizeCharts(db as never, CREATOR)
    check("the list says rules are ready and what a chart can be set for", list.rules === true && list.targets.collections.some((c) => c.id === SHIRTS) && list.targets.categories.join() === "Hoodies,Mugs,Polos,T-Shirts")
    check("  each chart with its collections and categories", list.charts.find((c) => c.name === "Shirts")?.collectionIds.join() === SHIRTS && list.charts.find((c) => c.name === "Hoodies")?.categories.join() === "hoodies")
    const body = { name: "Tees", unit: "cm", columns: cols(["Size", "Chest"]), rows: [["S", "86"]], notes: "", collectionIds: [SHIRTS, "d0000000-0000-4000-8000-00000000dead"], categories: [" T-Shirts ", "t-shirts", "Tanks"] }
    const saved = await saveSizeChart(db as never, CREATOR, TEE_CHART, body)
    const row = t.size_charts.find((c) => c.id === TEE_CHART)!
    check("saving keeps only this store's collections, categories trimmed without repeats", saved.ok && row.collection_ids.join() === SHIRTS && row.categories.join() === "T-Shirts,Tanks", row)
    const old = fakeDb(tables(), { missingColumns: ["collection_ids"] })
    const plain = await saveSizeChart(old as never, CREATOR, TEE_CHART, { ...body, collectionIds: [], categories: [] })
    check("before SQL part 309: a chart with none set still saves", plain.ok)
    const refused = await saveSizeChart(fakeDb(tables(), { missingColumns: ["collection_ids"] }) as never, CREATOR, TEE_CHART, body)
    check("  one set for collections says which part to run", refused.ok === false && /SQL part 309/.test((refused as O).error))
    const oldList = await listSizeCharts(fakeDb(tables(), { missingColumns: ["collection_ids"] }) as never, CREATOR)
    check("  and the list says rules are not ready, with the charts", oldList.ready && oldList.rules === false && oldList.charts.length === 3)
    const inherited = await productSizeChartId(fakeDb(tables()) as never, CREATOR, POLO)
    check("the product editor is told the polo shows Shirts, set for its collection", inherited.chartId === null && inherited.inherited?.name === "Shirts" && inherited.inherited.source === "collection")
    check("  the tee's own choice is just that", (await productSizeChartId(fakeDb(tables()) as never, CREATOR, TEE)).inherited === null)
    const editor = code("components/physical/size-chart-editor.tsx")
    check("the chart editor has Also show it on, with chips for collections and categories", /tt\("Also show it on"\)/.test(editor) && /data-chart-collection=/.test(editor) && /data-chart-category=/.test(editor) && /aria-pressed=\{on\}/.test(editor))
    check("  no hover that fires on touch", (editor.slice(editor.indexOf("function AlsoShowOn")).match(/\S*hover:bg\S*/g) ?? []).every((m) => m.includes("[@media(hover:hover)]:hover:")))
    check("the product card says where an inherited chart comes from", /data-size-chart-inherited=/.test(code("components/physical/size-chart-card.tsx")))
    check("a collection's change reaches product pages too", /sizeChartsChanged\(c\.creatorId\)/.test(code("app/api/collections/route.ts")) && (code("app/api/collections/[id]/route.ts").match(/sizeChartsChanged\(c\.creatorId\)/g) ?? []).length === 2)
    check("  and so does a new chart", /sizeChartsChanged\(c\.creatorId\)/.test(code("app/api/size-charts/route.ts")))
  }

  console.log("\nThe SQL part, the theme contracts and the Help Center\n")
  {
    const part = code("supabase/sql/run-now/309_size_chart_rules.sql")
    const lines = part.trim().split("\n")
    check("one summary line, then one statement per line, the reload last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("additive and safe to run again", /ADD COLUMN IF NOT EXISTS collection_ids uuid\[\] NOT NULL DEFAULT/.test(part) && /ADD COLUMN IF NOT EXISTS categories text\[\] NOT NULL DEFAULT/.test(part) && /DROP CONSTRAINT IF EXISTS size_charts_rules_len/.test(part) && !/DROP TABLE|DROP COLUMN/.test(part))
    check("  and waits for part 283", /to_regclass\('public\.size_charts'\) IS NULL/.test(part))
    check("listed, checked after, and copied to migrations byte for byte", /`309_size_chart_rules\.sql`/.test(code("supabase/sql/run-now/README.md")) && /as p309_size_chart_rules\b/.test(code("supabase/sql/run-now/99_check_after.sql")) && code("supabase/migrations/20270217_size_chart_rules.sql") === part)
    check("the Materia contracts are in the repository", ["docs/theme-contracts/size-charts.md", "docs/theme-contracts/product-faqs.md"].every((p) => /metafields\.storelib/.test(code(p))))
    const faqArticle = ALL_HELP_ARTICLES.find((a) => a.slug === "product-questions")
    const text = JSON.stringify(faqArticle?.body ?? [])
    check("Help: Add questions (FAQ) to a product, with where they show and theme notes", !!faqArticle && ["Questions from", "The product, else these", "The product only", "These questions only", "product.metafields.storelib.faqs", "Featured product", "OnePage"].every((w) => text.includes(w)))
    const sizes = JSON.stringify(ALL_HELP_ARTICLES.find((a) => a.slug === "set-up-size-charts")?.body ?? [])
    check("Help: size charts by collection and category, the order, the Size guide section, Use assigned Storelib size chart", ["Also show it on", "A chart set for a collection the product is in.", "Chart from", "This table only", "Use assigned Storelib size chart", "SQL part 309"].every((w) => sizes.includes(w)))
    check("the developer docs say the contract", ["answer_html", "notes_html", "`source`", "Featured product"].every((w) => code("content/developers/imported-shopify-themes.md").includes(w)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailed:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
