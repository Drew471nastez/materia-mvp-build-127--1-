/**
 * ===========================================================================
 *  ROUND 13: PRODUCT QUESTIONS AND SIZE CHARTS, IN EVERY PLACE, IN A BROWSER
 * ===========================================================================
 *   PROBE_CSS=source npx tsx scripts/check-sizefaq-r13.ts [path to the Materia repo]
 *   SHOTS=<dir>   where the pictures go (default .wb-probe/sizefaq-r13)
 *   ONLY=native,canvas,materia,onepage
 *
 * A store of three real shaped products, read through the real server code
 * (lib/products/product-section-data.ts, lib/size-charts/storefront.ts,
 * lib/website-builder/product-extras.ts) from tables in memory:
 *
 *   TEE     its own questions and its own chart
 *   POLO    no chart of its own: the one set for its collection, Shirts
 *   MUG     neither
 *
 * Every place is drawn at 1440 (a mouse) and 390 (touch, the CPU four times
 * slower), photographed, and read back:
 *
 *   native    a Storelib theme's product page as the live site draws it
 *             (ThemePage, the .storelib sections prerendered as
 *             render-product.tsx does): the product section's Size guide
 *             and Product questions, the Size guide section, an Accordion
 *             FAQ set to the product's questions; Size guide opened, inches
 *   canvas    the same page in the real website builder (editor-probe-
 *             harness), and the chart edited in Products while the builder
 *             is open in another tab: the canvas shows the new one on return
 *             (the product is opened from the 1440 toolbar, then the window
 *             is made a phone's for the 390 picture)
 *   materia   the owner's Materia theme (its repository, as Storelib reads it
 *             back) on the live handler, the store's charts read once
 *             (sizeChartsForStore) (lib/storelib-theme/compat/site.ts)
 *             and in a sandboxed canvas frame: the product page's Size Chart
 *             Popup, and a Featured product on the home page with a Size
 *             Table ("Use assigned Storelib size chart")
 *   onepage   a OnePage product block opening its sheet: Size guide and the
 *             questions (the one call the sheet makes is checked against
 *             onePageRoute for storelib.me)
 */
import "./allow-server-only.cjs"
import { createServer, type Server } from "node:http"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { productSectionData } from "../lib/products/product-section-data"
import { pageProductOf, withProductFaqs } from "../lib/products/page-product"
import { productFaqs } from "../lib/products/product-faqs"
import { sizeChartForProduct, sizeChartsForStore } from "../lib/size-charts/storefront"
import { productExtras, withExtras } from "../lib/website-builder/product-extras"
import { withDeliveryBlock, withOffersBlock, withProductBlocks } from "../lib/website-builder/product-page"
import { SECTION_SCHEMAS } from "../lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "../lib/website-builder/theme-settings-schema"
import { renderWithSources } from "../lib/website-builder/storefront-render"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { mergePages } from "../lib/github-sync/layout"
import { answer, themeAsset, type SiteData } from "../lib/storelib-theme/compat/site"
import { shopifyGlobalAsset } from "../lib/storelib-theme/compat/shopify-global-assets"
import { compileScss } from "../lib/storelib-theme/compat/scss"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"
import { onePageRoute } from "../lib/onepage/host-route"
import type { SectionInstance } from "../lib/website-builder/types"

type O = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(root, ".wb-probe", "sizefaq-r13")
mkdirSync(SHOTS, { recursive: true })
const ONLY = process.env.ONLY ?? ""
const want = (p: string) => !ONLY || ONLY.split(",").includes(p)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let bad = 0
const expect = (ok: boolean, what: string, got?: unknown) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined || ok ? "" : `   (${JSON.stringify(got).slice(0, 700)})`}`)
  if (!ok) bad++
}

/* ── The store ────────────────────────────────────────────────────────── */

const CREATOR = "11111111-1111-4111-8111-111111111111"
const TEE = "a0000000-0000-4000-8000-000000000001"
const POLO = "a0000000-0000-4000-8000-000000000002"
const MUG = "a0000000-0000-4000-8000-000000000004"
const SHIRTS = "d0000000-0000-4000-8000-000000000001"
const px = (n: number, w = 900, h = 900) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${30 + n * 40},22%,${84 - n * 6}%)"/><path d="M${w * 0.3} ${h * 0.25}h${w * 0.4}l${w * 0.12} ${h * 0.14}-${w * 0.09} ${h * 0.07}v${h * 0.4}h-${w * 0.46}v-${h * 0.4}l-${w * 0.09}-${h * 0.07}z" fill="hsl(${30 + n * 40},18%,${48 - n * 4}%)"/></svg>`)}`
const tees = { columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }, { name: "Length", measure: true }, { name: "Sleeve", measure: true }], rows: [["S", "86-91", "69", "20"], ["M", "91-97", "71", "21"], ["L", "97-102", "74", "22"], ["XL", "102-107", "76", "23"]] }
function tables(): Record<string, O[]> {
  const product = (id: string, title: string, slug: string, category: string, extra: O = {}) => ({ id, creator_id: CREATOR, title, slug, type: "physical", category, status: "published", price_cents: 2800, compare_at_cents: null, description: "<p>Heavy cotton jersey, cut straight, washed soft.</p>", thumbnail_url: px(id === TEE ? 1 : id === POLO ? 2 : 3), gallery_urls: [], ...extra })
  return {
    products: [
      product(TEE, "Classic tee", "classic-tee", "T-Shirts", { faqs: [{ question: "Does it shrink?", answer: "No. It is pre-washed, so it keeps its size.\nWash cold, dry flat." }, { question: "How does it fit?", answer: "True to size, with a straight cut. Size up for a loose fit." }, { question: "Is it <b>organic</b>?", answer: "Yes, 100% organic cotton." }] }),
      product(POLO, "Pique polo", "pique-polo", "Polos", { faqs: [] }),
      product(MUG, "Stoneware mug", "stoneware-mug", "Mugs", { faqs: null }),
    ],
    product_variants: [TEE, POLO].flatMap((p, i) => ["S", "M", "L", "XL"].map((s, j) => ({ id: `b000000${i}-0000-4000-8000-00000000000${j}`, product_id: p, name: s, option1: s, option2: null, option3: null, price_cents: 2800, compare_at_price_cents: null, image_url: null, active: true, track_inventory: false, inventory_policy: "deny", position: j }))),
    product_options: [TEE, POLO].map((p, i) => ({ id: `f000000${i}-0000-4000-8000-000000000001`, product_id: p, name: "Size", position: 0, values: ["S", "M", "L", "XL"] })),
    size_charts: [
      { id: "c0000000-0000-4000-8000-000000000001", creator_id: CREATOR, name: "Tees", unit: "cm", ...tees, notes: "Measured flat, in centimetres.", image_url: null, collection_ids: [], categories: [] },
      { id: "c0000000-0000-4000-8000-000000000002", creator_id: CREATOR, name: "Shirts", unit: "in", columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }, { name: "EU", measure: false }], rows: [["S", "36-38", "46"], ["M", "38-40", "48"], ["L", "40-42", "50"]], notes: "Measured around the body.", image_url: null, collection_ids: [SHIRTS], categories: [] },
    ],
    product_size_charts: [{ product_id: TEE, size_chart_id: "c0000000-0000-4000-8000-000000000001", creator_id: CREATOR }],
    product_collections: [{ id: SHIRTS, creator_id: CREATOR, kind: "manual", rules: [], match: "all" }],
    product_collection_items: [{ collection_id: SHIRTS, product_id: POLO }],
  }
}
/** The server's client as PostgREST answers, from those tables. */
function db(t: Record<string, O[]>) {
  return {
    from(table: string) {
      const filters: ((r: O) => boolean)[] = []
      const rows = () => (t[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const b: O = {
        select: () => b,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
        neq: () => b,
        is: () => b,
        in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), b),
        order: () => b,
        limit: () => b,
        range: () => b,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
      }
      return b
    },
    rpc: async () => ({ data: null, error: null }),
  }
}

const themeDefaults = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as O

/** A section from its schema's first preset, as the builder adds one. */
function section(type: string, id: string, settings: O = {}): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const preset = schema.presets?.[0]
  const blocks = (preset?.blocks ?? []).map((b, j) => ({ id: `${id}-b${j}`, type: b.type, settings: { ...(b.settings ?? {}) } }))
  return { id, type, name: schema.name, settings: { ...(preset?.settings ?? {}), ...settings }, blocks }
}

async function productData(id: string) {
  const t = tables()
  const row = t.products.find((p) => p.id === id)!
  return productSectionData(db(t) as never, row as never, { files: true })
}

/** The product page's sections, as components/website-builder/theme/render-product.tsx hands them over. */
async function livePage(id: string) {
  const data = await productData(id)
  const raw = [
    section("product", "product"),
    section("size_guide", "size", { heading: "Find your size", description: "Every measurement is of the garment, laid flat.", show_fit_guide: false, padding_top: 48, padding_bottom: 48 }),
    section("faq_accordion", "faq", { faq_source: "product", eyebrow: "Questions", heading: "About this tee", padding_top: 48, padding_bottom: 64 }),
  ]
  const placed = raw.map((s) => (s.type === "product" ? withOffersBlock(withDeliveryBlock(withProductBlocks(s))) : s))
  const withProduct = placed.map((s) => (s.type === "product" ? { ...s, settings: { ...s.settings, _product_data: data } } : s))
  const about = pageProductOf(withProduct, withProductBlocks)
  const sections = withProduct.map((s) => withProductFaqs(s, about))
  const prerendered = renderWithSources(DEFAULT_THEME_SOURCES, sections, themeDefaults as never, "product")
  return { theme: themeDefaults, sections, prerendered, data }
}

/* ── Browser ──────────────────────────────────────────────────────────── */

const VIEWS = {
  1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const
async function open(browser: Browser, width: 1440 | 390): Promise<{ p: Page; errors: string[] }> {
  const p = await browser.newPage()
  await p.setViewport(VIEWS[width])
  if (width === 390) await (await p.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const errors: string[] = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  /* A new visitor each time: no unit kept from the last page (the charts remember a buyer's cm or in). */
  await p.evaluateOnNewDocument(`try { localStorage.removeItem("storelib_size_unit") } catch (e) {}`)
  return { p, errors }
}
const tap = async (p: Page, selector: string, width: number) => {
  const el = await p.waitForSelector(selector, { visible: true, timeout: 8000 })
  await el!.evaluate((e) => e.scrollIntoView({ block: "center" }))
  await sleep(250)
  if (width === 390) await el!.tap()
  else await el!.click()
}
const noSideScroll = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

function esbuild(entry: string, out: string) {
  const dir = join(root, ".wb-probe", "sizefaq-stubs")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "next-navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} })
export const usePathname = () => "/products/classic-tee"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, priority, quality, sizes, unoptimized, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
  execFileSync("pnpm", ["exec", "esbuild", join(root, entry), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${out}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;', '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`, `--alias:next/link=${join(dir, "next-link.js")}`, `--alias:next/image=${join(dir, "next-image.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { cwd: root, stdio: "inherit" })
}

function serve(handler: (url: URL, req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void | Promise<void>): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => void handler(new URL(req.url ?? "/", "http://127.0.0.1"), req, res))
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` })))
}

/* ── NATIVE: the live product page ────────────────────────────────────── */

async function native(browser: Browser) {
  console.log("\nNATIVE: a Storelib theme's live product page")
  const { appCss } = await import("./probe-css.mjs")
  const css = await appCss(root)
  const out = join(root, ".wb-probe", "sizefaq-site.js")
  esbuild("scripts/render-sizefaq-site.tsx", out)
  const js = readFileSync(out, "utf8")
  const pages: Record<string, O> = { tee: await livePage(TEE), polo: await livePage(POLO), mug: await livePage(MUG) }
  expect(pages.tee.data.size_chart?.name === "Tees" && pages.polo.data.size_chart?.name === "Shirts" && !pages.mug.data.size_chart, "the product section's own read: the tee's chart, the polo's collection chart, none for the mug", [pages.tee.data.size_chart?.name, pages.polo.data.size_chart?.name, pages.mug.data.size_chart])
  const { server, base } = await serve((url, _req, res) => {
    const key = url.searchParams.get("p") ?? "tee"
    if (url.pathname === "/probe.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(js)
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0"><div id="mount" style="display:contents"></div><script>window.SIZEFAQ_PAGE=${JSON.stringify(pages[key]).replace(/</g, "\\u003c")}</script><script src="/probe.js"></script></body></html>`)
  })
  try {
    for (const width of [1440, 390] as const) {
      for (const key of ["tee", "polo", "mug"]) {
        const { p, errors } = await open(browser, width)
        await p.goto(`${base}/?p=${key}`, { waitUntil: "load" })
        await p.waitForFunction(() => window.__sizefaqReady === true, { timeout: 30000 })
        await sleep(600)
        const read = await p.evaluate(() => ({
          guide: document.querySelector("[data-size-guide-section]")?.getAttribute("data-size-guide-section") ?? null,
          guideText: (document.querySelector("[data-size-guide-section]") as HTMLElement | null)?.innerText ?? "",
          link: !!document.querySelector("[data-size-guide]"),
          faqBlock: (document.querySelector("[data-product-faq]") as HTMLElement | null)?.innerText ?? "",
          accordion: (document.querySelector("[data-section-type='faq_accordion']") as HTMLElement | null)?.innerText ?? null,
        }))
        if (key === "tee") {
          expect(read.guide === "product" && /Tees/.test(read.guideText) && /86-91/.test(read.guideText), `${width}: tee, the Size guide section draws its own chart`, read)
          expect(read.link, `${width}: tee, Size guide beside the size option`)
          expect(/Does it shrink\?/.test(read.faqBlock), `${width}: tee, its questions in the product section's Product questions block`, read.faqBlock.slice(0, 200))
          expect(!!read.accordion && /Does it shrink\?/.test(read.accordion) && /Is it <b>organic<\/b>\?/.test(read.accordion), `${width}: tee, the Accordion FAQ (The product only) draws them, a typed tag as words`, read.accordion?.slice(0, 300))
        } else if (key === "polo") {
          expect(read.guide === "product" && /Shirts/.test(read.guideText) && /EU/.test(read.guideText), `${width}: polo, the chart set for its collection`, read.guideText.slice(0, 200))
          expect(read.accordion === null, `${width}: polo, no questions: the product only FAQ is not on the page`)
        } else {
          expect(read.guide === "table" && !read.link, `${width}: mug, no chart: the section's own table, no Size guide link`, read)
        }
        expect(await noSideScroll(p), `${width}: ${key}, no sideways scroll`)
        await p.evaluate(() => document.querySelector("[data-size-guide-section]")?.scrollIntoView({ block: "start" }))
        await sleep(300)
        await p.screenshot({ path: join(SHOTS, `native-live-${key}-${width}.png`), fullPage: true })
        if (key === "tee") {
          await tap(p, "[data-size-guide-section] [role=radio]:nth-child(2)", width)
          await sleep(400)
          const inches = await p.evaluate(() => (document.querySelector("[data-size-guide-section]") as HTMLElement).innerText)
          expect(/33\.9-35\.8/.test(inches) && /\(in\)/.test(inches), `${width}: inches, converted`, inches.slice(0, 200))
          await p.screenshot({ path: join(SHOTS, `native-live-tee-inches-${width}.png`) })
          await tap(p, "[data-size-guide]", width)
          await p.waitForSelector("[data-size-chart-dialog]", { visible: true, timeout: 5000 }).catch(() => {})
          await sleep(500)
          const dialog = await p.evaluate(() => (document.querySelector("[data-size-chart-dialog]") as HTMLElement | null)?.innerText ?? "")
          expect(/Tees/.test(dialog) && /Measured flat/.test(dialog), `${width}: Size guide opens the chart over the page`, dialog.slice(0, 160))
          await p.screenshot({ path: join(SHOTS, `native-live-tee-dialog-${width}.png`) })
          await p.keyboard.press("Escape")
          await sleep(300)
          await tap(p, "[data-section-type='faq_accordion'] summary", width)
          await sleep(300)
          await p.evaluate(() => document.querySelector("[data-section-type='faq_accordion']")?.scrollIntoView({ block: "center" }))
          await p.screenshot({ path: join(SHOTS, `native-live-tee-faq-${width}.png`) })
        }
        expect(errors.length === 0, `${width}: ${key}, no script errors`, errors)
        await p.close()
      }
    }
  } finally {
    server.close()
  }
}

/* ── CANVAS: the same page in the real website builder ────────────────── */

async function canvas(browser: Browser) {
  console.log("\nCANVAS: the product page in the website builder")
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const js = readFileSync(bundle)
  const products = await Promise.all([TEE, POLO, MUG].map(async (id) => ({ ...(await productData(id)), status: "published" })))
  const pageSections = [section("header", "header"), section("product", "product"), section("size_guide", "size", { heading: "Find your size", show_fit_guide: false }), section("faq_accordion", "faq", { faq_source: "product", heading: "About this tee" }), section("footer", "footer")]
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div>
<script>window.PROBE_SHORT=true;window.PROBE_PAGES=${JSON.stringify({ product: pageSections, about: ["header", "text_rich", "footer"] }).replace(/</g, "\\u003c")};window.PROBE_PAGE_DELAY_MS=0;window.PROBE_PRODUCTS=${JSON.stringify(products).replace(/</g, "\\u003c")};</script><script src="/editor-probe.js"></script></body></html>`
  const { server, base } = await serve((url, _req, res) => {
    if (url.pathname.startsWith("/editor-probe.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js)
    res.writeHead(200, { "content-type": "text/html" }).end(html)
  })
  const readCanvas = (p: Page) => p.evaluate(() => ({ guide: document.querySelector("#wb-preview-root [data-size-guide-section]")?.getAttribute("data-size-guide-section") ?? null, text: (document.querySelector("#wb-preview-root [data-size-guide-section]") as HTMLElement | null)?.innerText ?? "", faq: (document.querySelector("#wb-preview-root [data-section-type='faq_accordion']") as HTMLElement | null)?.innerText ?? "" }))
  try {
    for (const width of [1440, 390] as const) {
      /* The page menu is the computer's toolbar: the product is opened at 1440, then the window is made a phone's (the editor's phone layout). */
      const { p, errors } = await open(browser, 1440)
      await p.goto(`${base}/editor`, { waitUntil: "load" })
      await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 2, { timeout: 90_000 })
      await sleep(800)
      const opened = await p.evaluate(async (id) => {
        const sw = document.querySelector<HTMLElement>("[data-page-switcher]")
        if (!sw) return "no switcher"
        sw.click()
        for (let i = 0; i < 30 && !document.querySelector(".wb-pages-menu"); i++) await new Promise((r) => setTimeout(r, 100))
        const menu = document.querySelector(".wb-pages-menu")
        if (!menu) return "no menu"
        if (!menu.querySelector(`[data-page-row='product:${id}']`)) menu.querySelector<HTMLElement>("[data-page-group-toggle='products']")?.click()
        for (let i = 0; i < 30 && !menu.querySelector(`[data-page-row='product:${id}']`); i++) await new Promise((r) => setTimeout(r, 100))
        const row = menu.querySelector<HTMLElement>(`[data-page-row='product:${id}']`)
        if (!row) return "no row"
        ;(row.matches("button, a") ? row : row.querySelector<HTMLElement>("button, a") ?? row).click()
        return "ok"
      }, TEE)
      expect(opened === "ok", `${width}: the tee's product page opens from the page menu`, opened)
      let read: O = {}
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        read = await readCanvas(p)
        if (read.guide === "product" && /Does it shrink/.test(read.faq)) break
      }
      if (width === 390) {
        await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
        await sleep(1500)
        read = await readCanvas(p)
      }
      expect(read.guide === "product" && /Tees/.test(read.text), `${width}: canvas, the Size guide section draws the tee's chart`, read)
      expect(/this product's size chart from Products/.test(read.text), `${width}: canvas, a line says where the chart comes from`)
      expect(/Does it shrink\?/.test(read.faq), `${width}: canvas, the FAQ section draws the tee's questions`, read.faq.slice(0, 200))
      await p.evaluate(() => document.querySelector("#wb-preview-root [data-size-guide-section]")?.scrollIntoView({ block: "start" }))
      await sleep(500)
      await p.screenshot({ path: join(SHOTS, `canvas-tee-${width}.png`) })
      if (width === 1440) {
        /* The chart and questions edited in Products, in another tab; the builder comes back into view (the editor reads the product again after 15s). */
        await p.evaluate(() => {
          const w = window as unknown as { PROBE_PRODUCTS: O[] }
          w.PROBE_PRODUCTS = w.PROBE_PRODUCTS.map((x, i) => (i === 0 ? { ...x, size_chart: { ...x.size_chart, name: "Tees, recut", rows: [["S", "88-93", "70", "20"], ...x.size_chart.rows.slice(1)] }, faqs: [{ question: "Is it boxy?", answer: "A little." }, ...x.faqs] } : x))
        })
        await sleep(15_500)
        await p.evaluate(() => {
          window.dispatchEvent(new Event("focus"))
          document.dispatchEvent(new Event("visibilitychange"))
        })
        let again: O = {}
        for (let i = 0; i < 30; i++) {
          await sleep(300)
          again = await readCanvas(p)
          if (/recut/.test(again.text)) break
        }
        expect(/Tees, recut/.test(again.text) && /88-93/.test(again.text) && /Is it boxy\?/.test(again.faq), "canvas: a chart and questions changed in Products show when the builder is looked at again", again)
        await p.screenshot({ path: join(SHOTS, `canvas-tee-after-edit-${width}.png`) })
      }
      expect(errors.length === 0, `${width}: canvas, no script errors`, errors)
      await p.close()
    }
  } finally {
    server.close()
  }
}

/* ── MATERIA: the owner's imported theme, live and in the canvas ──────── */

async function materia(browser: Browser, repo: string) {
  console.log(`\nMATERIA: ${repo}`)
  const rows: Record<string, string> = {}
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === ".git") continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else {
        const r = relative(repo, p)
        if (/\.(png|jpe?g|gif|webp|woff2?|ttf|otf|mp4|ico|avif)$/i.test(r)) continue
        rows[r] = readFileSync(p, "utf8")
      }
    }
  }
  walk(repo)
  const settings = JSON.parse(rows["config/settings.json"])
  const changed: Record<string, string> = {}
  for (const [k, v] of Object.entries(rows)) if (/^templates\/.*\.json$/.test(k) || /^sections\/.*-group\.json$/.test(k)) changed[k] = v
  const pages = Object.fromEntries(mergePages([], changed, { knownTypes: () => true, maxSections: 200, newPageKey: () => true }).pages.map((p) => [p.page_key, p.sections])) as O
  /* The home page's Featured product: the tee, with a Size Table set to "Use assigned Storelib size chart" and its own rows as the fallback. */
  for (const s of pages.home ?? []) if (s.type === "featured-product") {
    s.settings = { ...(s.settings ?? {}), product: "/products/classic-tee" }
    s.blocks = [...(Array.isArray(s.blocks) ? s.blocks : []), { id: "probe-size-table", type: "size_table", settings: { use_storelib_chart: true, title: "Size guide", collapsible: true, start_open: true, table_data: "Size | Chest\nS | 1\nM | 2" } }]
  }
  const theme = themeOfInstall(rows, settings, { assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`, assetText: (n) => rows[`shopify/assets/${n}`] ?? null })
  /* The cards as the live site holds them: the shop's list copy, and the catalogue with each product's questions and chart (lib/website-builder/compat-site.ts). */
  const t = tables()
  const card = (p: O) => ({ id: p.id, type: "product" as const, settings: { title: p.title, slug: p.slug, url: `/products/${p.slug}`, price: "$28.00", compare_price: "", image: p.thumbnail_url, images: [p.thumbnail_url], kind: "physical", available: true, category: p.category, description: "Heavy cotton jersey.", options: p.id === MUG ? [] : [{ name: "Size", values: ["S", "M", "L", "XL"] }], variants: p.id === MUG ? [{ id: `${p.id}-only`, name: "Default", options: [], price: "$28.00", available: true }] : ["S", "M", "L", "XL"].map((s) => ({ id: `${p.id}-${s}`, name: s, options: [s], price: "$28.00", available: true })) } as O })
  const shop = t.products.map(card)
  const catalog = withExtras(shop, await productExtras(db(t) as never, CREATOR, shop))
  /* The product page's own read (lib/website-builder/compat-site.ts product()): its questions and its chart. */
  const pageProduct = async (h: string) => {
    const c = catalog.find((x) => x.settings.slug === h)
    if (!c) return null
    const row = t.products.find((p) => p.id === c.id)!
    return { ...c, descriptionHtml: row.description, settings: { ...c.settings, faqs: productFaqs(row.faqs), size_chart: await sizeChartForProduct(db(t) as never, c.id, CREATOR) } }
  }
  const sizeCharts = await sizeChartsForStore(db(t) as never, CREATOR)
  const site: SiteData = { creatorId: CREATOR, theme, pages, products: shop as never, pickable: catalog as never, sizeCharts, collections: [], menus: {}, shop: { name: "Atelier Nord", currency: "USD", moneyFormat: "${{amount}}" }, host: "127.0.0.1", product: pageProduct as never }
  const { server, base } = await serve(async (url, req, res) => {
    if (url.pathname.startsWith("/api/site-theme/shopify/") || url.pathname.startsWith("/api/site-theme/helpers/")) {
      const js = shopifyGlobalAsset(decodeURIComponent(url.pathname.split("/").pop() ?? ""))
      res.writeHead(js ? 200 : 404, { "content-type": "application/javascript" })
      return void res.end(js ?? "")
    }
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } } as never), { scss: compileScss })
      if (!a) return void res.writeHead(404).end()
      return void res.writeHead(200, { "content-type": a.type }).end(a.body)
    }
    if (url.pathname === "/__canvas") {
      const path = url.searchParams.get("path") ?? "/"
      const drawn = await answer({ ...site, designMode: true, extraBodyEnd: `<script>${CANVAS_BRIDGE}</script>` }, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })
      const doc = String(drawn.body).replace(/<head\b[^>]*>/i, (m) => `${m}<base href="${base}/">${CANVAS_HEAD}`)
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      return void res.end(`<!doctype html><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style><iframe id="f" sandbox="allow-scripts allow-same-origin allow-popups" srcdoc="${doc.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe>`)
    }
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body: null, cart: [] })
    res.writeHead(out.status, { ...(out.headers ?? {}), "content-type": out.type })
    res.end(out.body)
  })
  try {
    for (const width of [1440, 390] as const) {
      const { p, errors } = await open(browser, width)
      await p.goto(`${base}/products/classic-tee`, { waitUntil: "load" })
      await sleep(1200)
      const popupChart = await p.evaluate(() => [...document.querySelectorAll(".mt-sheet [data-mt-size-chart]")].map((e) => (e as HTMLElement).textContent?.replace(/\s+/g, " ").trim() ?? "").join(" | "))
      expect(/Tees/.test(popupChart) && /86-91/.test(popupChart), `${width}: Materia product page, its Size Chart Popup holds the tee's chart`, popupChart.slice(0, 200))
      /* textContent: the questions sit in one of the theme's folding rows, closed. */
      const faq = await p.evaluate(() => (document.querySelector("main") ?? document.body).textContent?.includes("Does it shrink?") ?? false)
      expect(faq, `${width}: Materia product page, the tee's questions are on it`)
      await p.screenshot({ path: join(SHOTS, `materia-product-tee-${width}.png`) })
      const opener = await p.$("[data-mt-sheet-open]")
      if (opener) {
        await opener.evaluate((e) => (e as HTMLElement).scrollIntoView({ block: "center" }))
        await sleep(300)
        if (width === 390) await opener.tap()
        else await opener.click()
        await sleep(900)
        const shown = await p.evaluate(() => [...document.querySelectorAll("dialog.mt-sheet")].some((d) => (d as HTMLDialogElement).open))
        expect(shown, `${width}: a tap on Size Guide opens the theme's sheet`)
        await p.screenshot({ path: join(SHOTS, `materia-product-tee-sheet-${width}.png`) })
      } else expect(false, `${width}: Materia's Size Guide opener is on the product page`)
      expect(await noSideScroll(p), `${width}: Materia product page, no sideways scroll`)
      if (errors.length) console.log(`        (script errors on this page: ${errors.slice(0, 3).join(" / ")})`)
      await p.close()

      const h = await open(browser, width)
      await h.p.goto(`${base}/`, { waitUntil: "load" })
      await sleep(1200)
      const table = await h.p.evaluate(() => (document.getElementById("SizeTable-probe-size-table") as HTMLElement | null)?.innerText ?? null)
      expect(!!table && /Tees/.test(table) && /86-91/.test(table), `${width}: Materia home, the Featured product's Size Table draws the tee's assigned chart, not its own rows`, table?.slice(0, 200))
      expect(await h.p.evaluate(() => document.body.textContent?.includes("Does it shrink?") ?? false), `${width}: Materia home, the Featured product carries the tee's questions`)
      await h.p.evaluate(() => document.getElementById("SizeTable-probe-size-table")?.scrollIntoView({ block: "center" }))
      await sleep(500)
      await h.p.screenshot({ path: join(SHOTS, `materia-home-featured-${width}.png`) })
      await h.p.close()

      const c = await open(browser, width)
      await c.p.goto(`${base}/__canvas?path=/`, { waitUntil: "load" })
      await sleep(1500)
      const frame = c.p.frames().find((f) => f !== c.p.mainFrame())
      const inCanvas = frame ? await frame.evaluate(() => (document.getElementById("SizeTable-probe-size-table") as HTMLElement | null)?.innerText ?? null).catch(() => null) : null
      expect(!!inCanvas && /Tees/.test(inCanvas), `${width}: Materia in the canvas, the same chart`, inCanvas?.slice(0, 120))
      if (frame) await frame.evaluate(() => document.getElementById("SizeTable-probe-size-table")?.scrollIntoView({ block: "center" })).catch(() => {})
      await sleep(400)
      await c.p.screenshot({ path: join(SHOTS, `materia-canvas-home-${width}.png`) })
      await c.p.close()
    }
    const { p } = await open(browser, 1440)
    await p.goto(`${base}/products/pique-polo`, { waitUntil: "load" })
    await sleep(900)
    const polo = await p.evaluate(() => [...document.querySelectorAll(".mt-sheet [data-mt-size-chart]")].map((e) => (e as HTMLElement).textContent?.replace(/\s+/g, " ").trim() ?? "").join(" | "))
    expect(/Shirts/.test(polo) && /EU/.test(polo), "Materia: the polo's page holds the chart set for its collection", polo.slice(0, 160))
    await p.close()
  } finally {
    server.close()
  }
}

/* ── ONEPAGE: the product sheet ───────────────────────────────────────── */

async function onepage(browser: Browser) {
  console.log("\nONEPAGE: a product's sheet")
  const route = onePageRoute({ host: "storelib.me", pathname: "/api/onepage/product", search: `?id=${TEE}`, method: "GET", userAgent: "Mozilla/5.0", mainDomain: "storelib.com", platformSubdomains: ["www", "app", "api", "admin", "dashboard", "localhost", "domains", "mcp"] })
  expect(route?.kind === "next", "storelib.me answers the sheet's one call itself (onePageRoute)", route)
  const { serveEditorProbe } = await import("./onepage-probe-server.mjs")
  const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-sizefaq-onepage.tsx", fail: (m: string) => { throw new Error(m) } })
  const t = tables()
  const row = t.products[0]
  const sheet = {
    product: { id: TEE, title: row.title, slug: row.slug, type: "physical", descriptionHtml: row.description, priceCents: 2800, compareAtCents: null, pwyw: false, pwywMinCents: 0, currency: "usd", images: [px(1)], variants: [], soldOut: false, left: null, pageUrl: "/p/classic-tee", ships: true, faqs: productFaqs(row.faqs), sizeChart: await sizeChartForProduct(db(t) as never, TEE, CREATOR, { category: row.category }) },
    seller: { name: "Atelier Nord", avatarUrl: null },
    checkout: { instant: false, reason: "This one is bought on its checkout page.", url: `/checkout?productId=${TEE}`, tax: null, marketingOptIn: false, lastNameRequired: false },
    buyer: null,
  }
  try {
    for (const width of [1440, 390] as const) {
      const { p, errors } = await open(browser, width)
      await p.evaluateOnNewDocument(`window.SIZEFAQ_SHEET = ${JSON.stringify(sheet)}`)
      await p.goto(`${base}/`, { waitUntil: "load" })
      await p.waitForSelector("[data-product-tap='sheet']", { timeout: 15000 })
      await tap(p, "[data-product-tap='sheet']", width)
      await p.waitForSelector("[data-product-sheet]", { visible: true, timeout: 8000 }).catch(() => {})
      await p.waitForSelector("[data-size-chart-panel]", { timeout: 8000 }).catch(() => {})
      await sleep(900)
      const read = await p.evaluate(() => ({ panel: (document.querySelector("[data-size-chart-panel]") as HTMLElement | null)?.innerText ?? null, questions: (document.querySelector("[data-product-questions]") as HTMLElement | null)?.innerText ?? null }))
      expect(!!read.panel && /Size guide/.test(read.panel) && /Tees/.test(read.panel), `${width}: the sheet has a Size guide row with the tee's chart`, read)
      expect(!!read.questions && /Does it shrink\?/.test(read.questions) && /Is it <b>organic<\/b>\?/.test(read.questions), `${width}: and its questions, a typed tag as words`, read.questions?.slice(0, 200))
      await p.screenshot({ path: join(SHOTS, `onepage-sheet-${width}.png`) })
      await tap(p, "[data-size-chart-panel] summary", width)
      await sleep(500)
      await tap(p, "[data-size-chart-units] [role=radio]:nth-child(2)", width)
      await sleep(400)
      const inches = await p.evaluate(() => (document.querySelector("[data-size-chart-panel]") as HTMLElement).innerText)
      expect(/33\.9-35\.8/.test(inches), `${width}: the sheet's chart opens, and switches to inches`, inches.slice(0, 160))
      await p.screenshot({ path: join(SHOTS, `onepage-sheet-chart-${width}.png`) })
      expect(errors.length === 0, `${width}: the sheet, no script errors`, errors)
      await p.close()
    }
  } finally {
    server.close()
  }
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
  try {
    if (want("native")) await native(browser)
    if (want("canvas")) await canvas(browser)
    const repo = process.argv[2]
    if (want("materia")) {
      if (repo && existsSync(join(repo, "storelib.json"))) await materia(browser, repo)
      else console.log("\nMATERIA: skipped, no repository given")
    }
    if (want("onepage")) await onepage(browser)
  } finally {
    await browser.close()
  }
  console.log(`\n${bad ? `${bad} FAILED` : "all ok"}; pictures in ${SHOTS}`)
  process.exit(bad ? 1 : 0)
})()
