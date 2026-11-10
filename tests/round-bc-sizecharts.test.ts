/**
 * ===========================================================================
 *  ROUND BC: SIZE CHARTS FOR PHYSICAL PRODUCTS
 * ===========================================================================
 * A store writes its size tables once (Products › Size charts, or right in
 * the product editor's Size chart card) and gives one to each product it
 * fits. The product page shows it: a Size guide link beside the size option
 * by itself, or the Size chart block, on a Storelib theme; on an imported
 * Shopify theme a link beside the size, an app block, a snippet and
 * product.metafields.storelib.size_chart.
 *
 * Checked here: the chart's shape and its cm and in conversion, the reads
 * and writes (only the owner's own charts and products, and nothing breaks
 * before SQL part 283 has run), the product page's drawing on both kinds of
 * theme, the seller's screens, the SQL part and the help article.
 *
 * Run with:  npx tsx tests/round-bc-sizecharts.test.ts
 * (the server module is loaded with its server-only marker read as the empty
 * module it is on the server, so React's server renderer can draw the blocks)
 */
import { readFileSync } from "node:fs"
import Module from "node:module"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SAMPLE_SIZE_CHART, checkSizeChart, convertCell, hasMeasurements, isSizeOptionName, readSizeChart, rowsIn, sizeChartJson, sizeChartTemplate, sizeOptionIndex, SIZE_CHART_TEMPLATES, type SizeChart } from "../lib/size-charts/model"
import { sizeChartForProduct } from "../lib/size-charts/storefront"
import { SIZE_CHART_CSS, sizeChartDialogHtml, sizeChartHtml } from "../lib/size-charts/html"
import { SIZE_CHART_APP_BLOCK, holdsSizeChartBlock, isSizeChartAppBlock, sizeChartOf, themeReadsSizeChart, withSizeGuide } from "../lib/storelib-theme/compat/size-chart"
import { productObject } from "../lib/storelib-theme/compat/objects"
import { withPageFacts } from "../lib/storelib-theme/compat/product-facts"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage } from "../lib/storelib-theme/compat/page"
import { ProductBlock, type ProductCtx } from "../components/website-builder/sections/renderers/product/product-blocks"
import { themeBlockCatalog } from "../lib/website-builder/storelib-schemas"
import { UI_WORDS } from "../lib/markets/ui-words"
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
type O = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const PRODUCT = "33333333-3333-4333-8333-333333333333"
const OTHER_PRODUCT = "44444444-4444-4444-8444-444444444444"
const CHART = "55555555-5555-4555-8555-555555555555"
const OTHER_CHART = "66666666-6666-4666-8666-666666666666"

const tees: SizeChart = {
  name: "Tees",
  unit: "cm",
  columns: [
    { name: "Size", measure: false },
    { name: "EU", measure: false },
    { name: "Chest", measure: true },
    { name: "Length", measure: true },
  ],
  rows: [
    ["S", "44", "86-91", "69"],
    ["M", "46", "91-97", "71,5"],
    ["L", "48", "One size up", ""],
  ],
  notes: "Measured flat.",
  imageUrl: null,
}

/* ── A stand-in for the server's database client: tables in memory, filters applied, a missing table answered as PostgREST does. ── */
function fakeDb(tables: Record<string, O[]>, missing: string[] = []) {
  const calls: { table: string; op: string; filters: [string, unknown][]; values?: unknown }[] = []
  const db = {
    calls,
    from(table: string) {
      const filters: [string, unknown][] = []
      let op = "select"
      let values: unknown
      let head = false
      /* `.in()` as PostgREST applies it (round 13: one read for a whole list of products). */
      const rows = () => (tables[table] ??= []).filter((r) => filters.every(([k, v]) => (v && typeof v === "object" && "in" in (v as O) ? ((v as O).in as unknown[]).includes(r[k]) : r[k] === v)))
      const result = (single: "one" | "maybe" | "many") => {
        calls.push({ table, op, filters: [...filters], values })
        if (missing.includes(table)) return { data: null, error: { code: "PGRST205", message: "missing" } }
        if (op === "insert") {
          const row = { id: CHART, ...(values as O) }
          tables[table].push(row)
          return { data: single === "many" ? [row] : row, error: null }
        }
        if (op === "upsert") {
          const v = values as O
          tables[table] = tables[table].filter((r) => r.product_id !== v.product_id)
          tables[table].push(v)
          return { data: null, error: null }
        }
        const matched = rows()
        if (op === "update") matched.forEach((r) => Object.assign(r, values as O))
        if (op === "delete") tables[table] = tables[table].filter((r) => !matched.includes(r))
        if (head) return { data: null, count: matched.length, error: null }
        if (single === "many") return { data: matched, error: null }
        return { data: matched[0] ?? null, error: single === "one" && !matched[0] ? { code: "PGRST116" } : null }
      }
      const b: O = {
        select: (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), b),
        eq: (k: string, v: unknown) => (filters.push([k, v]), b),
        in: (k: string, v: unknown[]) => (filters.push([k, { in: v }]), b),
        order: () => b,
        limit: () => b,
        update: (v: unknown) => ((op = "update"), (values = v), b),
        insert: (v: unknown) => ((op = "insert"), (values = v), b),
        delete: () => ((op = "delete"), b),
        upsert: (v: unknown) => ((op = "upsert"), (values = v), b),
        maybeSingle: async () => result("maybe"),
        single: async () => result("one"),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result("many")).then(ok, bad),
      }
      return b
    },
  }
  return db
}

/* `server-only` throws outside a server bundle; here, as on the server, it is nothing. The push suites' loader does the same. */
function allowServerOnly() {
  const M = Module as unknown as { _resolveFilename: (this: unknown, request: string, ...rest: unknown[]) => string }
  const resolve = M._resolveFilename
  M._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    if (request === "server-only") return resolve.call(this, request, ...rest).replace(/index\.js$/, "empty.js")
    return resolve.call(this, request, ...rest)
  }
}

;(async () => {
  allowServerOnly()
  const { deleteSizeChart, listSizeCharts, productSizeChartId, saveSizeChart, setProductSizeChart } = await import("../lib/size-charts/server")
  console.log("\nThe chart: read, checked, converted\n")
  {
    const read = readSizeChart({ name: "  Tees  ", unit: "mm", columns: ["Size", { name: "Chest" }, { name: "EU", measure: false }], rows: [["S", "86"], [], ["", "", ""], ["M", "91", "46", "extra"]] })!
    check("a column given as a word is a size label first, a measurement after", read.columns[0].measure === false && read.columns[1].measure === true && read.columns[2].measure === false)
    check("rows are as long as the columns, empty ones left out", read.rows.length === 2 && read.rows.every((r) => r.length === 3) && read.rows[1].join("|") === "M|91|46")
    check("an unknown unit reads as cm; the name is trimmed", read.unit === "cm" && read.name === "Tees")
    check("nothing to show is null: no columns, or no rows", readSizeChart({ name: "x", columns: [], rows: [["S"]] }) === null && readSizeChart({ name: "x", columns: ["Size"], rows: [] }) === null && readSizeChart(null) === null)
    check("a picture must be https or Storelib's own path", readSizeChart({ ...tees, imageUrl: "javascript:alert(1)" })!.imageUrl === null && readSizeChart({ ...tees, imageUrl: "https://cdn.test/a.png" })!.imageUrl === "https://cdn.test/a.png")
    const long = readSizeChart({ name: "x".repeat(200), columns: Array.from({ length: 30 }, (_, i) => `C${i}`), rows: Array.from({ length: 90 }, (_, i) => [`S${i}`, "y".repeat(99)]) })!
    check("limits: 80 name, 10 columns, 40 sizes, 40 a cell", long.name.length === 80 && long.columns.length === 10 && long.rows.length === 40 && long.rows[0][1].length === 40)
    check("saving needs a name", checkSizeChart({ ...tees, name: " " }).ok === false)
    check("saving needs every column named", checkSizeChart({ ...tees, columns: [...tees.columns, { name: "", measure: true }] }).ok === false)
    const noSize = checkSizeChart({ ...tees, rows: [["", "44", "86", "69"]] })
    check("saving needs a size in every row's first cell, said by the column's name", noSize.ok === false && /Size column/.test((noSize as { error: string }).error))
    check("too many columns is refused, not cut", checkSizeChart({ ...tees, columns: Array.from({ length: 11 }, (_, i) => ({ name: `C${i}`, measure: true })) }).ok === false)
    check("a good chart is kept as it is", checkSizeChart(tees).ok === true)

    check("cm to in: a range stays a range, to one decimal", convertCell("86-91", "cm", "in") === "33.9-35.8", convertCell("86-91", "cm", "in"))
    check("in to cm", convertCell("34", "in", "cm") === "86.4", convertCell("34", "in", "cm"))
    check("a comma decimal stays a comma", convertCell("71,5", "cm", "in") === "28,1", convertCell("71,5", "cm", "in"))
    check("words are left as typed", convertCell("One size up", "cm", "in") === "One size up" && convertCell("", "cm", "in") === "")
    check("the same unit changes nothing", convertCell("86", "cm", "cm") === "86")
    const inches = rowsIn(tees, "in")
    check("only the measurement columns convert: EU 44 stays 44, Chest becomes inches", inches[0][1] === "44" && inches[0][2] === "33.9-35.8" && inches[0][0] === "S", inches[0])
    check("the chart's own unit is returned as typed", rowsIn(tees, "cm") === tees.rows)
    check("the switch shows only with a number under a measurement", hasMeasurements(tees) && !hasMeasurements({ columns: [{ name: "Size", measure: false }, { name: "Fit", measure: true }], rows: [["S", "Loose"]] }))

    check("the size option, in the languages shops use", ["Size", "size", "Sizes", "Shoe size", "Talla", "Taille", "Größe", "Groesse", "Tamanho", "Taglia", "Maat", "Rozmiar", "Beden", "サイズ"].every(isSizeOptionName))
    check("  and not a colour or a material", !isSizeOptionName("Color") && !isSizeOptionName("Material") && !isSizeOptionName(undefined))
    check("which option is the size", sizeOptionIndex([{ name: "Color" }, { name: "Size" }]) === 1 && sizeOptionIndex(["Colour"]) === -1)

    const t = sizeChartTemplate("tops")
    check("every starting point leaves its numbers empty", SIZE_CHART_TEMPLATES.every((k) => sizeChartTemplate(k).rows.every((r) => r.slice(1).every((c) => c === ""))))
    check("  with its sizes and a label first column", t.rows.map((r) => r[0]).join() === "XS,S,M,L,XL,XXL" && t.columns[0].measure === false && t.columns.slice(1).every((c) => c.measure))
    check("  shoes: EU, UK and US are labels, foot length is the measurement", sizeChartTemplate("shoes").columns.map((c) => `${c.name}:${c.measure}`).join() === "EU:false,UK:false,US:false,Foot length:true")
    check("  column names put in the seller's language as they are made", sizeChartTemplate("tops", (s) => `~${s}`).columns[1].name === "~Chest")
    const json = sizeChartJson(tees) as O
    check("the shape a theme reads carries the rows in cm and in", json.rows_cm === tees.rows && (json.rows_in as string[][])[0][2] === "33.9-35.8" && json.unit === "cm" && json.image === null)
  }

  console.log("\nA product page reads its own chart, and nobody else's\n")
  {
    const chartRow = { id: CHART, creator_id: CREATOR, name: "Tees", unit: "cm", columns: tees.columns, rows: tees.rows, notes: "Measured flat.", image_url: null }
    const db = fakeDb({ product_size_charts: [{ product_id: PRODUCT, size_chart_id: CHART, creator_id: CREATOR }], size_charts: [chartRow] })
    const got = await sizeChartForProduct(db, PRODUCT, CREATOR)
    check("the product's chart, as a visitor sees it", got?.name === "Tees" && got.rows.length === 3 && got.notes === "Measured flat.")
    check("  with no id on it", got !== null && !("id" in got))
    check("another store's creator id reads nothing", (await sizeChartForProduct(db, PRODUCT, OTHER)) === null)
    const crossed = fakeDb({ product_size_charts: [{ product_id: PRODUCT, size_chart_id: OTHER_CHART, creator_id: CREATOR }], size_charts: [{ ...chartRow, id: OTHER_CHART, creator_id: OTHER }] })
    check("a link pointing at another store's chart draws nothing", (await sizeChartForProduct(crossed, PRODUCT, CREATOR)) === null)
    check("before SQL part 283: no chart, no error", (await sizeChartForProduct(fakeDb({}, ["product_size_charts", "size_charts"]), PRODUCT, CREATOR)) === null)
    check("a product without a chart: null", (await sizeChartForProduct(fakeDb({ product_size_charts: [], size_charts: [] }), OTHER_PRODUCT, CREATOR)) === null)
    const section = code("lib/products/product-section-data.ts")
    check("the product section's data carries it, for physical products only", /* round 13: the category goes along, for a chart set for it */ /type === "physical" \? sizeChartForProduct\(db, row\.id, row\.creator_id \?\? null, /.test(section) && /size_chart: sizeChart,/.test(section))
    check("  and so do an imported theme's page facts (live and the canvas's ?facts=1)", /sizeChart: data\.size_chart \?\? null/.test(code("lib/storelib-theme/compat/product-facts-server.ts")))
  }

  console.log("\nThe owner's reads and writes\n")
  {
    const chartRow = { id: CHART, creator_id: CREATOR, name: "Tees", unit: "cm", columns: tees.columns, rows: tees.rows, notes: null, image_url: null, updated_at: "2026-10-24T10:00:00Z" }
    const tables = () => ({
      products: [{ id: PRODUCT, creator_id: CREATOR }, { id: OTHER_PRODUCT, creator_id: OTHER }],
      size_charts: [{ ...chartRow }, { ...chartRow, id: OTHER_CHART, creator_id: OTHER, name: "Theirs" }],
      product_size_charts: [{ product_id: PRODUCT, size_chart_id: CHART, creator_id: CREATOR }],
    })
    const db = fakeDb(tables())
    const list = await listSizeCharts(db, CREATOR)
    check("the list is the owner's charts, each with how many products use it", list.ready && list.charts.length === 1 && list.charts[0].name === "Tees" && list.charts[0].productCount === 1)
    const before = await listSizeCharts(fakeDb({}, ["size_charts", "product_size_charts"]), CREATOR)
    check("before SQL part 283: an empty list that says it is not ready", before.ready === false && before.charts.length === 0)
    const notReady = await saveSizeChart(fakeDb({}, ["size_charts"]), CREATOR, null, tees as unknown as O)
    check("  and a save says which part to run", notReady.ok === false && /SQL part 283/.test((notReady as { error: string }).error) && (notReady as { status: number }).status === 503)

    const theirs = await saveSizeChart(db, CREATOR, OTHER_CHART, { ...tees, name: "Mine now" } as unknown as O)
    check("another store's chart cannot be edited: not found", theirs.ok === false && (theirs as { status: number }).status === 404)
    const update = db.calls.find((c) => c.table === "size_charts" && c.op === "update")!
    check("  the update is filtered by the owner's creator id", update.filters.some(([k, v]) => k === "creator_id" && v === CREATOR))
    const fresh = fakeDb(tables())
    const made = await saveSizeChart(fresh, CREATOR, null, { ...tees, creator_id: OTHER } as unknown as O)
    const inserted = fresh.calls.find((c) => c.op === "insert")!.values as O
    check("a new chart is the owner's, whatever the body says", made.ok && inserted.creator_id === CREATOR)
    check("a bad chart is refused before anything is written", (await saveSizeChart(fresh, CREATOR, null, { name: "", columns: [], rows: [] })).ok === false)
    const gone = await deleteSizeChart(fakeDb(tables()), CREATOR, OTHER_CHART)
    check("another store's chart cannot be deleted", gone.ok === false && (gone as { status: number }).status === 404)

    const own = fakeDb(tables())
    check("a product's chart is read by the owner's creator id", (await productSizeChartId(own, CREATOR, PRODUCT)).chartId === CHART && (await productSizeChartId(own, OTHER, PRODUCT)).chartId === null)
    const notMine = await setProductSizeChart(fakeDb(tables()), CREATOR, OTHER_PRODUCT, CHART)
    check("another store's product cannot be given a chart", notMine.ok === false && (notMine as { status: number }).status === 404)
    const t2 = tables()
    const crossed = await setProductSizeChart(fakeDb(t2), CREATOR, PRODUCT, OTHER_CHART)
    check("a product cannot be given another store's chart", crossed.ok === false && t2.product_size_charts[0].size_chart_id === CHART)
    const t3 = tables()
    t3.size_charts.push({ ...chartRow, id: OTHER_CHART, creator_id: CREATOR, name: "Jeans" })
    const moved = await setProductSizeChart(fakeDb(t3), CREATOR, PRODUCT, OTHER_CHART)
    check("the owner's product gets the owner's chart, one link per product", moved.ok && t3.product_size_charts.length === 1 && t3.product_size_charts[0].size_chart_id === OTHER_CHART && t3.product_size_charts[0].creator_id === CREATOR)
    const t4 = tables()
    const cleared = await setProductSizeChart(fakeDb(t4), CREATOR, PRODUCT, null)
    check("No size chart takes the link away", cleared.ok && t4.product_size_charts.length === 0)
    check("a chart id that is not an id is refused", (await setProductSizeChart(fakeDb(tables()), CREATOR, PRODUCT, "x")).ok === false)

    for (const route of ["app/api/size-charts/route.ts", "app/api/size-charts/[id]/route.ts", "app/api/size-charts/product/route.ts"]) {
      const src = code(route)
      const handlers = (src.match(/export async function (GET|POST|PUT|DELETE)/g) ?? []).length
      /* Changed on purpose (round 41 team): the physical commerce switch first, then the owner or a team member with Products */
      check(`${route}: every handler starts with the physical commerce owner check`, handlers > 0 && (src.match(/await physicalCaller\("products"(?:, \{ read: true \})?\)/g) ?? []).length === handlers && !/shopCaller/.test(src))
    }
    check("a changed chart or choice reaches the website at the next visit", /revalidateTag\(creatorShopTag\(creatorId\), "max"\)/.test(code("app/api/size-charts/changed.ts")) && /sizeChartsChanged/.test(code("app/api/size-charts/product/route.ts")) && /sizeChartsChanged/.test(code("app/api/size-charts/[id]/route.ts")))
    const page = code("app/(storelib)/app/products/size-charts/page.tsx")
    /* Changed on purpose (round 41 team): the store comes from teamPageStore("products"): the owner's own, or the store a team member with Products works in */
    check("Products › Size charts is behind the physical commerce switch and the owner", /await requirePhysicalPage\(\)/.test(page) && /listSizeCharts\(createAdminClient\(\), access\.creatorId\)/.test(page) && /teamPageStore\("products"\)/.test(page))
  }

  console.log("\nThe SQL part\n")
  {
    const part = code("supabase/sql/run-now/283_size_charts.sql")
    const lines = part.trim().split("\n")
    check("one summary line, then one statement per line, the reload last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines[lines.length - 1] === "notify pgrst, 'reload schema';" && !/^--/m.test(part))
    check("safe to run again", /CREATE TABLE IF NOT EXISTS public\.size_charts/.test(part) && /CREATE TABLE IF NOT EXISTS public\.product_size_charts/.test(part) && /DROP POLICY IF EXISTS "storelib owner reads size_charts"/.test(part) && /DROP TRIGGER IF EXISTS size_charts_touch/.test(part))
    check("row level security on both, nothing for visitors, writes for the server alone", /ALTER TABLE public\.size_charts ENABLE ROW LEVEL SECURITY/.test(part) && /ALTER TABLE public\.product_size_charts ENABLE ROW LEVEL SECURITY/.test(part) && /REVOKE ALL ON public\.size_charts, public\.product_size_charts FROM PUBLIC, anon/.test(part) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.size_charts, public\.product_size_charts FROM authenticated/.test(part))
    check("an owner reads their own, through their creator row", /c\.id = size_charts\.creator_id AND c\.user_id = \(SELECT auth\.uid\(\)\)/.test(part) && /c\.id = product_size_charts\.creator_id AND c\.user_id = \(SELECT auth\.uid\(\)\)/.test(part))
    check("a product shows one chart; a chart or a product deleted takes its links", /product_id uuid PRIMARY KEY REFERENCES public\.products\(id\) ON DELETE CASCADE/.test(part) && /size_chart_id uuid NOT NULL REFERENCES public\.size_charts\(id\) ON DELETE CASCADE/.test(part))
    check("the same limits as the editor", /BETWEEN 1 AND 80/.test(part) && /BETWEEN 1 AND 10/.test(part) && /<= 40/.test(part) && /unit IN \('cm', 'in'\)/.test(part))
    check("its copy in migrations is byte for byte", code("supabase/migrations/20270215_size_charts.sql") === part)
    check("listed, and checked after", /`283_size_charts\.sql`/.test(code("supabase/sql/run-now/README.md")) && /as p283_size_charts/.test(code("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log("\nA Storelib theme's product page\n")
  {
    const schema = JSON.parse(code("themes/default/sections/product.json")) as O
    const block = (schema.blocks as O[]).find((b) => b.type === "size_chart")
    check("the product section offers a Size chart block, once", block?.limit === 1 && ["label", "style", "opens", "show_icon", "color"].every((id) => (block.fields as O[]).some((f) => f.id === id)))
    check("  right after the variant picker in Add block", (schema.blocks as O[]).findIndex((b) => b.type === "size_chart") === (schema.blocks as O[]).findIndex((b) => b.type === "variant_picker") + 1)
    check("the variant picker has its Size guide link setting, on by default", ((schema.blocks as O[]).find((b) => b.type === "variant_picker")!.fields as O[]).some((f) => f.id === "size_guide" && f.default === true))
    check("Size guide and Size chart are shop words, translatable", UI_WORDS.size_guide === "Size guide" && UI_WORDS.size_chart === "Size chart")

    const palette = { heading: "#111", text: "#222", paragraph: "#333", text_muted: "#666", border: "#ddd", bg: "#fff", background: "#fff" } as O
    const product = {
      id: PRODUCT, title: "Classic tee", slug: "classic-tee", type: "physical", description: "", price_cents: 2800, compare_at_cents: null, thumbnail_url: "", gallery_urls: [],
      options: [{ name: "Color", values: ["Sand"] }, { name: "Size", values: ["S", "M"] }],
      variants: [
        { id: "v1", name: "Sand / S", options: ["Sand", "S", null], price_cents: 2800, compare_at_cents: null, image_url: null, available: true, left: null, max_quantity: 5 },
        { id: "v2", name: "Sand / M", options: ["Sand", "M", null], price_cents: 2800, compare_at_cents: null, image_url: null, available: true, left: null, max_quantity: 5 },
      ],
      size_chart: tees,
    }
    const ctx = (over: Partial<ProductCtx> = {}): ProductCtx => ({
      product: product as never, sample: false, variant: null, chosen: ["Sand", "M", null], choose: () => {}, facts: { payWhatYouWant: false } as never, canBuy: true, quantity: 1, setQuantity: () => {}, maxQuantity: 5,
      pwywInput: "", setPwywInput: () => {}, pwywError: null, palette: palette as never, inEditor: false, inert: false,
      buy: { add: () => {}, now: () => {}, added: false, unavailable: null }, wishlist: { saved: false, toggle: () => {} }, radius: "8px", buttonRadius: {}, money: (c: number) => `$${c / 100}`, ...over,
    })
    const draw = (type: string, c: ProductCtx, settings: O = {}) => renderToStaticMarkup(createElement(ProductBlock, { block: { id: "b", type, settings } as never, ctx: c }))
    const picker = draw("variant_picker", ctx())
    const sizeLegend = picker.slice(picker.lastIndexOf("<legend"), picker.lastIndexOf("</legend>"))
    check("the variant picker puts Size guide beside the size option by itself", /data-size-guide=""/.test(sizeLegend) && sizeLegend.includes("Size guide") && sizeLegend.includes(">Size<"), sizeLegend)
    check("  and only there, not beside Color", (picker.match(/data-size-guide/g) ?? []).length === 1)
    check("  it opens a dialog (and is a button, not a link away)", /aria-haspopup="dialog"/.test(sizeLegend) && /<button/.test(sizeLegend))
    check("  off with the picker's setting", !/data-size-guide/.test(draw("variant_picker", ctx(), { size_guide: false })))
    check("  stepped aside while the section has a Size chart block", !/data-size-guide/.test(draw("variant_picker", ctx({ hasSizeChartBlock: true }))))
    check("  a product without a chart has none", !/data-size-guide/.test(draw("variant_picker", ctx({ product: { ...product, size_chart: null } as never }))))
    const noSizeOption = draw("variant_picker", ctx({ product: { ...product, options: [{ name: "Color", values: ["Sand"] }] } as never, chosen: ["Sand", null, null] }))
    check("  a chart and no size option: the link under the options", /data-size-guide/.test(noSizeOption) && noSizeOption.indexOf("data-size-guide") > noSizeOption.lastIndexOf("</fieldset>"))
    const blockHtml = draw("size_chart", ctx(), { style: "button", label: "Fit guide" })
    check("the Size chart block draws its own words as a button", blockHtml.includes("Fit guide") && /h-11 w-full/.test(blockHtml))
    check("  nothing on a live page for a product without a chart", draw("size_chart", ctx({ product: { ...product, size_chart: null } as never })) === "<div class=\"empty:hidden\" data-block-id=\"b\" data-block-type=\"size_chart\" style=\"margin-top:0;margin-bottom:16px\"></div>")
    check("  in the builder, a quiet line saying where the chart comes from", /data-editor-note/.test(draw("size_chart", ctx({ inEditor: true, product: { ...product, size_chart: null } as never }))))
    check("  and the sample chart before a product is chosen", /data-size-guide/.test(draw("size_chart", ctx({ inEditor: true, sample: true, product: { ...product, size_chart: null } as never }))) && SAMPLE_SIZE_CHART.rows.length > 0)
    const section = code("components/website-builder/sections/renderers/ProductSection.tsx")
    check("the section tells the picker when it holds a Size chart block", /hasSizeChartBlock: \(section\.blocks \?\? \[\]\)\.some\(\(b\) => b\.type === "size_chart" && !b\.hidden\)/.test(section))
    const dialog = code("components/website-builder/sections/renderers/product/size-chart.tsx")
    check("the chart opens over the canvas frame in the builder, over the page live", /closest<HTMLElement>\(".wb-canvas-frame"\) \?\? document\.body/.test(dialog))
    check("  a sheet from the bottom on a phone, a pop-up or a side panel on a computer", /const shape = phone \? "sheet" : opens/.test(dialog) && /translate-y-full/.test(dialog) && /translate-x-full/.test(dialog))
    check("  cm and in, remembered on the device, and the chosen size marked", /storelib_size_unit/.test(dialog) && /data-chosen/.test(dialog) && /role="radiogroup"/.test(dialog))
    check("  Escape closes it; the seller's words are text, never markup", /e\.key === "Escape"/.test(dialog) && !/dangerouslySetInnerHTML/.test(dialog))
  }

  console.log("\nAn imported Shopify theme\n")
  {
    const card = { id: PRODUCT, settings: { title: "Classic tee", slug: "classic-tee", url: "/products/classic-tee", price: "$28.00", kind: "physical", available: true, variants: [{ id: "v-s", name: "S", price: "", available: true }, { id: "v-m", name: "M", price: "", available: true }], options: [{ name: "Size", values: ["S", "M"] }] } }
    const withChart = withPageFacts(card, { variants: [], perOrder: null, lowAt: null, showLeft: false, sizeChart: tees })
    check("the page facts put the product's chart on its card", (withChart.settings as O).size_chart === tees)
    check("  facts without one leave the card as it was", !("size_chart" in (withPageFacts(card, { variants: [], perOrder: null, lowAt: null, showLeft: false }).settings as O)))
    const p = productObject(withChart as never) as O
    const mf = p.metafields.storelib.size_chart
    check("product.metafields.storelib.size_chart: prints as the name, .value the chart", String(mf.name ?? "") === "" && mf.value.name === "Tees" && mf.value.columns.length === 4 && mf.value.rows_in[0][2] === "33.9-35.8" && mf.namespace === "storelib" && mf.key === "size_chart")
    check("  a product without a chart has no such metafield", (productObject(card as never) as O).metafields.storelib.size_chart === undefined)
    check("  read back the same", sizeChartOf(p)?.rows.length === 3)
    check("a theme that reads it draws it itself", themeReadsSizeChart(["{% assign c = product.metafields.storelib.size_chart.value %}"]) && !themeReadsSizeChart(["{{ product.title }}"]))
    check("size chart apps' blocks are drawn as the chart (Kiwi Sizing, a size chart app, Storelib's own)", isSizeChartAppBlock("shopify://apps/kiwi-sizing/blocks/size-chart/abc") && isSizeChartAppBlock("shopify://apps/easy-size-chart/blocks/button/1") && isSizeChartAppBlock(SIZE_CHART_APP_BLOCK) && !isSizeChartAppBlock("shopify://apps/judge-me-reviews/blocks/preview_badge/1"))
    check("  found inside nested blocks", holdsSizeChartBlock([{ type: "group", blocks: [{ type: SIZE_CHART_APP_BLOCK }] }]) && !holdsSizeChartBlock([{ type: "title" }]))

    const evil: SizeChart = { ...tees, name: "<img src=x onerror=alert(1)>", notes: "</p><script>alert(1)</script>", columns: [{ name: "Size\"><b>", measure: false }, { name: "Chest", measure: true }], rows: [["<i>S</i>", "86"]] }
    const html = sizeChartHtml(evil, { uid: 'p"1', label: "Size <guide>" })
    check("every word the seller typed is escaped", !/<script>|<img src=x|<i>S<\/i>|<b>/.test(html) && html.includes("&lt;img src=x") && html.includes("Size &lt;guide&gt;"))
    check("no script: a popover opened by its button, closed by its cross", !/<script/i.test(html) && /popovertarget="storelib-size-chart-p1"/.test(html) && /id="storelib-size-chart-p1" class="slsc" popover/.test(html) && /popovertargetaction="hide"/.test(html))
    check("cm and in as two radio buttons and both tables", /class="slsc__u slsc__u--cm" type="radio"[^>]* checked/.test(html) && /slsc__t--in/.test(html) && /33\.9/.test(html))
    check("  a chart with nothing to convert has no switch", !/slsc__u/.test(sizeChartDialogHtml({ ...tees, columns: [{ name: "Size", measure: false }, { name: "EU", measure: false }], rows: [["S", "44"]] }, { uid: "x", label: "Size guide" })))
    check("  hidden until opened, also where popovers are not known", /\.slsc\{display:none\}/.test(SIZE_CHART_CSS) && /\.slsc:popover-open\{display:block\}/.test(SIZE_CHART_CSS) && /\.slsc\[data-sl-open\]\{display:block\}/.test(SIZE_CHART_CSS))

    const dawn = `<variant-selects><fieldset class="js product-form__input"><legend class="form__label">Size</legend><input type="radio" value="S"></fieldset></variant-selects><product-form><form method="post" action="/cart/add" id="product-form-main"><input type="hidden" name="id" value="v-s"><button>Add</button></form></product-form>`
    const opts = { uid: PRODUCT, label: "Size guide" }
    const legend = withSizeGuide(dawn, ["Size"], tees, opts)!
    check("beside the size: inside the theme's own <legend>, after the name", /<legend class="form__label">Size<button type="button" class="slsc-open"/.test(legend), legend.slice(0, 300))
    check("  the chart after the section's markup, once", legend.indexOf('class="slsc"') > legend.indexOf("</product-form>") && (legend.match(/class="slsc" popover/g) ?? []).length === 1)
    const dropdown = withSizeGuide(dawn.replace('<legend class="form__label">Size</legend>', '<label class="form__label" for="o1">Size</label><select id="o1"></select>'), ["Size"], tees, opts)!
    check("  a dropdown's <label>: right after it, never inside it", /<\/label><button type="button" class="slsc-open"/.test(dropdown))
    check("  matched by the product's own option name (Talla)", /Talla<button/.test(withSizeGuide(dawn.replace(">Size<", ">Talla<"), ["Talla"], tees, opts) ?? ""))
    const above = withSizeGuide(`<form action="/cart/add" id="product-form-installment"></form>${dawn.replace(/<legend[\s\S]*?<\/legend>/, "")}`, ["Color"], tees, opts)!
    check("no size option: a line above the buy form, out of its <product-form>, never at the instalments form", above.indexOf('class="slsc-line"') < above.indexOf("<product-form>") && above.indexOf('class="slsc-line"') > above.indexOf("installment"))
    check("never in a section without a product form, and never twice", withSizeGuide("<div>Size</div>", ["Size"], tees, opts) === null && withSizeGuide(legend, ["Size"], tees, opts) === null)

    /* A small theme, drawn whole: the link appears in the main product section, the app block draws the chart once. */
    const files: Record<string, string> = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
      "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="p">{%- for block in section.blocks -%}{%- case block.type -%}{%- when '@app' -%}{% render block %}{%- when 'picker' -%}{%- for option in product.options_with_values -%}<fieldset><legend>{{ option.name }}</legend></fieldset>{%- endfor -%}{%- endcase -%}{%- endfor -%}{% form 'product', product %}<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}"><button>Add</button>{% endform %}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [{ type: "@app" }, { type: "picker", name: "Picker" }] } })}\n</schema>\n`,
      "sections/own-chart.storelib": `${wrapCompatTemplate(`<div class="own">{% render 'storelib-size-chart' %}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "own-chart", name: "Own", settings: [] })}\n</schema>\n`,
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const page = { designMode: false, products: [withChart], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, template: "product", path: "/products/classic-tee", product: withChart }
    const auto = drawPage(theme, page as never, [{ id: "main", type: "main-product", blocks: [{ id: "pk", type: "picker", settings: {} }] }] as never, { scripts: false }).html
    check("drawn whole: Size guide beside Size in the theme's own legend", /<legend>Size<button type="button" class="slsc-open"/.test(auto), auto.slice(auto.indexOf('class="p"'), auto.indexOf('class="p"') + 400))
    check("  with the chart and its styles once", (auto.match(/class="slsc" popover/g) ?? []).length === 1 && (auto.match(/data-storelib-size-chart-css/g) ?? []).length === 1)
    const app = drawPage(theme, page as never, [{ id: "main", type: "main-product", blocks: [{ id: "chart", type: SIZE_CHART_APP_BLOCK, settings: { label: "Fit guide", style: "button" } }, { id: "pk", type: "picker", settings: {} }] }] as never, { scripts: false }).html
    check("the Size chart app block draws the link and the chart where it is placed", /class="shopify-app-block" data-block-id="chart"/.test(app) && app.includes("Fit guide") && /slsc-open--button/.test(app))
    check("  and the automatic link steps aside", !/<legend>Size<button/.test(app) && (app.match(/class="slsc" popover/g) ?? []).length === 1)
    const snippet = drawPage(theme, page as never, [{ id: "own", type: "own-chart" }] as never, { scripts: false }).html
    check("{% render 'storelib-size-chart' %} draws it in a theme's own code", /<div class="own"><style data-storelib-size-chart-css>[\s\S]*class="slsc" popover/.test(snippet))
    const plain = { ...card, settings: { ...card.settings } }
    const none = drawPage(theme, { ...page, products: [plain], product: plain } as never, [{ id: "main", type: "main-product", blocks: [{ id: "chart", type: SIZE_CHART_APP_BLOCK, settings: {} }, { id: "pk", type: "picker", settings: {} }] }] as never, { scripts: false }).html
    check("a product without a chart: no link, no chart, no block", !/slsc-open|class="slsc"/.test(none))
    const canvasNone = drawPage(theme, { ...page, designMode: true, products: [plain], product: plain } as never, [{ id: "main", type: "main-product", blocks: [{ id: "chart", type: SIZE_CHART_APP_BLOCK, settings: {} }] }] as never, { scripts: false }).html
    check("  in the builder the app block says where its chart comes from", /slsc-note/.test(canvasNone))

    const catalog = themeBlockCatalog({ "layout/theme.storelib": files["layout/theme.storelib"] }, { builtIn: false })
    check("Add block offers Size chart under Apps in an imported theme", catalog[SIZE_CHART_APP_BLOCK]?.name === "Size chart")
    check("an import names size chart apps' blocks as drawn by Storelib", /isSizeChartAppBlock\(b\.type\) \? sizes/.test(code("lib/storelib-theme/shopify/convert.ts")))
  }

  console.log("\nThe seller's screens\n")
  {
    const cards = code("components/physical/product-cards.tsx")
    check("the product editor's physical cards have a Size chart card under Variants", cards.indexOf("<SizeChartCard") > cards.indexOf('id="physical-variants"') && cards.indexOf("<SizeChartCard") < cards.indexOf('id="physical-shipping"'))
    check("  its choice is saved with the product, after the product's own save", /return \(await sizeChart\.current\?\.save\(id\)\) \?\? null/.test(cards))
    const card = code("components/physical/size-chart-card.tsx")
    check("  it writes only a change, and only once the tables exist", /if \(!ready \|\| chosen === saved\.current\) return null/.test(card))
    check("  before SQL part 283 it says so and the product saves as usual", /SQL part 283/.test(card) && /The product saves as usual/.test(card))
    check("  a chart made from the card is the one the product gets", /if \(!editing\.chart\) choose\(id\)/.test(card))
    /* The fields moved to size-chart-form.tsx, shared with the chart's own page (tests/offers-subpages.test.ts); the dialog stays for the product editor. */
    const editor = code("components/physical/size-chart-editor.tsx") + code("components/physical/size-chart-form.tsx")
    check("the table editor over the product editor is the app's Modal: a dialog on a computer, the bottom sheet on a phone", /* Changed on purpose (wave 10): the shared SheetDialog (components/ui/sheet-dialog), its own exit on a computer and the app's sheet on a phone (tests/size-chart-dialog-w10.test.ts). */ /<SheetDialog\s+open=\{open\}/.test(editor) && /from "@\/components\/ui\/sheet-dialog"/.test(editor))
    check("  columns and sizes added and removed, a ruler per column, cm or in", ["addColumn", "removeColumn", "addRow", "removeRow", "data-column-measure", 'data-size-unit={u}'].every((s) => editor.includes(s)))
    check("  the first column stays while the rest scroll sideways", /sticky left-0/.test(editor) && /overflow-x-auto/.test(editor))
    check("  16px type on a phone so iOS does not zoom (the compact field)", /FIELD_COMPACT/.test(editor))
    check("  deleting asks once, inside the same sheet, saying how many products lose it", /confirmDelete/.test(editor) && /products lose this chart/.test(editor))
    check("  every word through tt()", !/>\s*[A-Z][a-z]+ [a-z]+[^<{]*</.test(editor.replace(/\{tt\([^)]*\)\}/g, "")))
    const sidebar = code("components/app/sidebar.tsx")
    check("Size charts sits under Products beside Collections, while physical commerce is on", /\.\.\.\(physicalCommerce \? \[\{ href: "\/app\/products\/size-charts", label: tt\("Size charts"\) \}\] : \[\]\)/.test(sidebar))
    check("  a list, not the product editor (setup pill and the spinner)", /\(\?!\(collections\|size-charts\)\(\\\/\|\$\)\)/.test(sidebar) && /"\/app\/products\/size-charts"/.test(code("lib/ui/app-navigation.ts")) && /"\/app\/products\/size-charts"/.test(code("lib/navigation/app-home.ts")))
    const catalogEs = code("lib/i18n/catalog/es.ts")
    check("the screens' words are in the dashboard's languages", ["Size charts", "New size chart", "Measured in", "Add size", "Edit chart", "Chest", "Inseam"].every((w) => catalogEs.includes(`"${w}":`)))
  }

  console.log("\nThe Size charts list, in the Coupons list's frame (wave 6)\n")
  {
    const list = code("app/(storelib)/app/products/size-charts/size-charts-client.tsx")
    const coupons = code("app/(storelib)/app/coupons/coupons-client.tsx")
    check("the same bar, width and title as Coupons", /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>/.test(list) && /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>/.test(coupons) && /text-\[24px\] font-bold text-\[#1a1a2e\] sm:text-\[28px\]/.test(list))
    check("  New size chart is the near black button with a plus, not the violet one", /const NEW_BUTTON = cn\(inkDepth,/.test(list) && /<Plus /.test(list) && !/accentDepth/.test(list))
    check("  one card, with views and their counts", /className=\{cn\(card, "mt-3 overflow-hidden"\)\}/.test(list) && /role="tablist" aria-label=\{tt\("Views"\)\}/.test(list) && /tt\("In use"\)/.test(list) && /tt\("Not in use"\)/.test(list))
    check("  each row has the Coupons row menu: edit, duplicate, delete", /<ResponsiveActionMenu/.test(list) && /<RowMenuButton label=\{tt\("Actions for \{name\}"/.test(list) && /tt\("Duplicate"\)/.test(list) && /variant: "destructive"/.test(list))
    check("  duplicate saves a copy through the API; delete asks first, then deletes through it", /api<[^>]+>\("\/api\/size-charts", \{ method: "POST", body \}\)/.test(list) && /\/api\/size-charts\/\$\{confirmDelete\.id\}`, \{ method: "DELETE" \}/.test(list) && /role="dialog" aria-modal="true"/.test(list))
    check("  a chart's page says where it stands beside its name, as a coupon's does", /<StatusBadge tone=\{used \? "success" : "neutral"\}>/.test(code("app/(storelib)/app/products/size-charts/size-chart-page.tsx")))
  }

  console.log("\nThe help article and the developer docs\n")
  {
    const article = ALL_HELP_ARTICLES.find((a) => a.slug === "set-up-size-charts")
    check("Set up size charts, in the physical products guide's Products group", !!article && article.category === "physical-products" && (article as O).section === "Products")
    const text = JSON.stringify(article)
    check("  it walks through making a chart, giving it to a product, what buyers see, and an imported theme", ["Make a size chart", "Give a product its size chart", "What buyers see", "On an imported theme", "Common mistakes"].every((h) => text.includes(h)))
    check("  the words on the buttons are the buttons' words", ["Create size chart", "Create chart", "Add size", "Measured in", "New chart", "Edit chart", "No size chart", "Size guide"].every((w) => text.includes(w)))
    check("  with the diagram of one chart for many products", text.includes('"figure":"size-chart-shared"') && /"size-chart-shared": \(label\)/.test(code("components/help/help-figures.tsx")))
    check("  no em dashes, none of the banned words", !/[—–]/.test(text) && !/\b(unlock|elevate|seamless|powerful|effortless|supercharge)/i.test(text))
    check("the Size charts page links to it", /\/help\/physical-products\/set-up-size-charts/.test(code("app/(storelib)/app/products/size-charts/size-charts-client.tsx")))
    const dev = code("content/developers/imported-shopify-themes.md")
    check("the developer docs document the metafield, its keys, the snippet, the filter and the app block", ["product.metafields.storelib.size_chart", "rows_cm", "rows_in", "{% render 'storelib-size-chart' %}", "storelib_size_chart", "Size chart"].every((w) => dev.includes(w)))
    check("  and the docs the site serves are generated from it", /metafields\.storelib\.size_chart/.test(code("lib/developers/content.generated.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
})()
