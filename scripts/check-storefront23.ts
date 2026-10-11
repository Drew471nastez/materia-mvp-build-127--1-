/**
 * ===========================================================================
 *  PHYSICAL COMMERCE ON THE STOREFRONT, IN A REAL BROWSER (round 23, W23)
 * ===========================================================================
 *   npx tsx scripts/check-storefront23.ts [compat] [canvas] [storelib] [domains]
 *
 *   compat    tests/fixtures/shopify-posture through the import's own
 *             converter, its product and cart sections written as Dawn
 *             writes them, served by the live site's own handler
 *             (lib/storelib-theme/compat/site.ts) with the cart in its
 *             cookie, the shop's stock and Limit sales, and Website settings
 *             › Commerce's banner and returns line on. A visitor opens the
 *             product, adds two, opens the cart, types a quantity over what
 *             is left and a note, and presses Check out: the checkout it
 *             lands on is read for its lines and its note.
 *   canvas    the real editor (scripts/render-editor-probe.tsx) on the same
 *             theme: the header's link to the product opens its page in the
 *             canvas with the stock, the stop and pickup; two sold elsewhere,
 *             the builder comes back into view and the page says so.
 *   storelib  Storelib's own product section and cart page
 *             (scripts/render-storefront23.tsx): Delivery and pickup for the
 *             chosen option, Only 3 left, Sold out, the quantity's stop, Add
 *             to cart, the note, Check out to the website's checkout.
 *   domains   Website settings › Domains in each state: none, waiting for
 *             DNS, securing, live (the Storelib address says where visitors
 *             go), and two domains.
 *
 * Each at 1440x900, and at 390x844 with touch and the CPU slowed 4x. Nothing
 * may scroll sideways. Measurements, not opinions; exits 1 on any failure.
 * Screenshots go to $OUT (default /tmp/storefront23).
 */
import { createServer, type IncomingMessage, type Server } from "node:http"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import JSZip from "jszip"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { CART_COOKIE, answer, readCartCookie, themeAsset, writeCartCookie, type CartStock, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { formFields } from "../lib/storelib-theme/compat/form-fields"
import { readSiteCheckoutParams } from "../lib/checkout/site-checkout"
import { returnsLine } from "../lib/website-builder/site-commerce"

const OUT = process.env.OUT ?? "/tmp/storefront23"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
mkdirSync(OUT, { recursive: true })
const root = process.cwd()
const parts = new Set(process.argv.slice(2))
const all = parts.size === 0
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${d ? `  (${d})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900, touch: false },
  { label: "phone", width: 390, height: 844, touch: true },
] as const

async function pageFor(browser: Browser, vp: (typeof VIEWPORTS)[number]): Promise<Page> {
  /* A browser of its own each time: no cart, no cookie, nothing stored from the last. */
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.touch, hasTouch: vp.touch, deviceScaleFactor: vp.touch ? 2 : 1 })
  if (vp.touch) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await page.evaluateOnNewDocument("window.__name = (f) => f")
  return page
}
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

/* ── The imported theme ─────────────────────────────────────────────────── */

const PRODUCT_SECTION = readFileSync(join(root, "tests/storefront23.test.ts"), "utf8").match(/const PRODUCT_SECTION = `([\s\S]*?)`\n/)![1]
const CART_SECTION = readFileSync(join(root, "tests/storefront23.test.ts"), "utf8").match(/const CART_SECTION = `([\s\S]*?)`\n/)![1]

let converted: Awaited<ReturnType<typeof convertShopifyTheme>> extends infer R ? (R extends { ok: true; theme: infer T } ? T | null : null) : null = null
const SHIRT = "00000000-0000-4000-8000-000000000001"
const SMALL_ID = "10000000-0000-4000-8000-000000000001"

async function compatSite(): Promise<{ site: SiteData; theme: SiteData["theme"] }> {
  const dir = join(root, "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  zip.file("sections/main-product-info.liquid", PRODUCT_SECTION)
  zip.file("sections/main-cart.liquid", CART_SECTION)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  const t = r.theme
  converted = t
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/assets/${encodeURIComponent(n)}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const PID = "00000000-0000-4000-8000-000000000001"
  const SMALL = "10000000-0000-4000-8000-000000000001", MEDIUM = "10000000-0000-4000-8000-000000000003", LARGE = "10000000-0000-4000-8000-000000000002"
  const variants = [
    { id: SMALL, name: "Small", price: "$49.00", compare_price: "$69.00", available: true },
    { id: MEDIUM, name: "Medium", price: "$49.00", compare_price: "$69.00", available: true },
    { id: LARGE, name: "Large", price: "$52.00", available: false },
  ]
  const card = { id: PID, settings: { title: "Posture shirt", slug: "posture-shirt", url: "/products/posture-shirt", price: "$49.00", compare_price: "$69.00", image: "", images: [], kind: "physical", available: true, description: "", variants, options: [{ name: "Size", values: ["Small", "Medium", "Large"] }] } }
  const withStock = { ...card, settings: { ...card.settings, low_stock_at: 5, variants: variants.map((v) => (v.id === SMALL ? { ...v, left: 3, max: 3, pickup: [{ name: "Main Street", city: "Lisbon", ready: "Usually ready in 24 hours" }] } : v.id === MEDIUM ? { ...v, left: null, max: 4 } : { ...v, left: null, max: 0 })) } }
  const stock: CartStock = { variants: { [SMALL]: 3, [MEDIUM]: 4, [LARGE]: 0 }, perOrder: 4 }
  const site: SiteData = {
    creatorId: "c",
    theme,
    pages,
    products: [card] as never,
    collections: [{ id: "c1", title: "Shirts", handle: "shirts", description: "", image: "", url: "/collections/shirts", products: [card] as never, products_count: 1 }] as never,
    menus: compatMenus({ "main-menu": { title: "Main", links: [{ title: "Shirts", url: "/collections/shirts" }, { title: "Shirt", url: "/products/posture-shirt" }] } } as never, Object.keys(pages)),
    shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}", policies: [{ handle: "refund-policy", title: "Refund policy", body: "<p>Thirty days.</p>" }] },
    host: "posturex.test",
    product: async (h) => (h === "posture-shirt" ? (withStock as never) : null),
    stock: async (id) => (id === PID ? stock : null),
    commerce: { freeShippingFromCents: 15000, returnsLine: returnsLine({ enabled: true, windowDays: 30 }) },
  }
  return { site, theme }
}

const bodyText = (req: IncomingMessage) => new Promise<string>((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)) })

async function serveCompat(): Promise<{ server: Server; port: number }> {
  const { site, theme } = await compatSite()
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://posturex.test")
    if (url.pathname.startsWith("/assets/")) {
      const a = themeAsset(theme, decodeURIComponent(url.pathname.slice(8)), () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type })
      res.end(a.body)
      return
    }
    if (url.pathname === "/checkout") {
      /* Where the theme's Check out lands: the website's own checkout, read for what it was given. */
      const p = readSiteCheckoutParams(url.searchParams)
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><meta name="viewport" content="width=device-width"><pre id="handoff">${JSON.stringify({ items: p.items, note: p.note, whole: p.wholeCart }).replace(/</g, "&lt;")}</pre>`)
      return
    }
    const cookie = (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(`${CART_COOKIE}=`))?.slice(CART_COOKIE.length + 1)
    const held = readCartCookie(cookie)
    const raw = req.method === "POST" ? await bodyText(req) : ""
    const type = req.headers["content-type"] ?? ""
    const body = req.method !== "POST" ? null : type.includes("json") ? JSON.parse(raw || "{}") : formFields(new URLSearchParams(raw).entries())
    const ajax = req.headers["x-requested-with"] === "XMLHttpRequest" || type.includes("application/json") || String(req.headers.accept ?? "").includes("application/json")
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart: held.cart, note: held.note, ajax, referer: undefined })
    const headers: Record<string, string> = { ...(out.headers ?? {}), "Content-Type": out.type, "Cache-Control": "no-store" }
    if (out.cart) headers["Set-Cookie"] = `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "")}; Path=/; SameSite=Lax`
    res.writeHead(out.status, headers)
    res.end(out.body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, port: (server.address() as { port: number }).port }
}

async function compat(browser: Browser) {
  console.log("\nimported theme, live")
  const { server, port } = await serveCompat()
  const base = `http://posturex.test:${port}`
  try {
    for (const vp of VIEWPORTS) {
      const page = await pageFor(browser, vp)
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
      await page.goto(`${base}/products/posture-shirt`, { waitUntil: "networkidle0" })
      const facts = await page.evaluate(() => ({
        title: document.querySelector(".product__title")?.textContent,
        price: document.querySelector(".price")?.textContent,
        stock: document.querySelector(".product__inventory")?.textContent,
        max: (document.querySelector(".quantity__input") as HTMLInputElement | null)?.max,
        pickup: document.querySelector(".pickup-availability")?.textContent,
        large: [...document.querySelectorAll(".variant-select option")].map((o) => `${o.textContent}${(o as HTMLOptionElement).disabled ? " (off)" : ""}`),
        banner: document.querySelector("#sl-free-shipping")?.textContent,
      }))
      await page.screenshot({ path: `${OUT}/compat-product-${vp.label}.png` })
      check(`${vp.label}: the product page: price and compare at, Only 3 left, pickup, Large off`, facts.title === "Posture shirt" && facts.price === "$69.00$49.00" && facts.stock === "Low stock: 3 left" && facts.max === "3" && /Main Street/.test(facts.pickup ?? "") && facts.large.includes("Large - Sold out (off)"), facts)
      check(`${vp.label}: the free shipping banner on an empty cart`, facts.banner === "Spend $150.00 more for free shipping", facts.banner)
      check(`${vp.label}: nothing scrolls sideways on the product page`, (await sideways(page)) <= 0)

      /* Over what is left: the browser's own number field stops it (the theme's max), so nothing is sent. */
      await page.$eval(".quantity__input", (el) => ((el as HTMLInputElement).value = "5"))
      const sent = await page.evaluate(() => (document.querySelector(".product-form") as HTMLFormElement).checkValidity())
      check(`${vp.label}: five of Small is stopped by the theme's own quantity field`, sent === false)
      await page.$eval(".quantity__input", (el) => ((el as HTMLInputElement).value = "2"))
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), vp.touch ? page.tap(".product-form button[name='add']") : page.click(".product-form button[name='add']")])
      const cart = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)?.getBoundingClientRect()
        const btn = r(".cart__checkout"), line = r("[data-cart-returns]")
        return {
          path: location.pathname,
          lines: [...document.querySelectorAll(".cart-item")].map((l) => l.textContent),
          total: document.querySelector(".totals__value")?.textContent,
          banner: document.querySelector("#sl-free-shipping")?.textContent,
          bannerTop: r("#sl-free-shipping")?.top,
          returns: document.querySelector("[data-cart-returns]")?.textContent,
          under: btn && line ? Math.round(line.top - btn.bottom) : null,
        }
      })
      await page.screenshot({ path: `${OUT}/compat-cart-${vp.label}.png`, fullPage: true })
      check(`${vp.label}: Add to cart opens the cart with two of Small`, cart.path === "/cart" && cart.lines.length === 1 && /Small/.test(cart.lines[0] ?? "") && cart.total === "$98.00", cart)
      check(`${vp.label}: the banner, first on the page, says what is left to spend`, cart.banner === "Spend $52.00 more for free shipping" && cart.bannerTop === 0, cart)
      check(`${vp.label}: the returns line sits just under Check out`, /Returns accepted within 30 days of delivery\. Return policy/.test(cart.returns ?? "") && cart.under !== null && cart.under >= 0 && cart.under < 40, cart)
      check(`${vp.label}: nothing scrolls sideways on the cart`, (await sideways(page)) <= 0)

      /* A quantity over what is left and a note, then Check out. */
      await page.$eval(".cart-item__qty", (el) => ((el as HTMLInputElement).value = "9"))
      await page.type(".cart__note", "Gift wrap, please")
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), vp.touch ? page.tap(".cart__checkout") : page.click(".cart__checkout")])
      const handoff = await page.evaluate(() => ({ path: location.pathname, host: location.host, data: JSON.parse(document.getElementById("handoff")?.textContent ?? "{}") }))
      check(`${vp.label}: Check out lands on the website's checkout on its own host`, handoff.path === "/checkout" && handoff.host === `posturex.test:${location_port(base)}`, handoff)
      check(`${vp.label}: with Small at 3, the most there is, and the note`, handoff.data.items?.length === 1 && handoff.data.items[0].quantity === 3 && handoff.data.note === "Gift wrap, please" && handoff.data.whole === true, handoff.data)

      /* Back to the cart: Remove empties it. */
      await page.goto(`${base}/cart`, { waitUntil: "networkidle0" })
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), vp.touch ? page.tap(".cart-item__remove") : page.click(".cart-item__remove")])
      const empty = await page.evaluate(() => ({ empty: document.querySelector(".cart__empty")?.textContent, banner: document.querySelector("#sl-free-shipping")?.textContent }))
      check(`${vp.label}: Remove empties the cart, and the banner counts from nothing again`, empty.empty === "Your cart is empty" && empty.banner === "Spend $150.00 more for free shipping", empty)
      check(`${vp.label}: no script errors`, errors.length === 0, errors[0] ?? "")
      await page.close()
    }
  } finally {
    server.close()
  }
}
const location_port = (base: string) => new URL(base).port

/* ── The builder's canvas on the imported theme ─────────────────────────── */

async function canvas(browser: Browser) {
  console.log("\nthe builder's canvas, imported theme")
  const { site } = await compatSite()
  const t = converted!
  const { bundle, css } = (await import("./editor-probe-harness.mjs" as string)) as { bundle: string; css: string }
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, v]) => p.startsWith("shopify/") && !v.startsWith("base64:")))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: t.settings, pages, sources, files }
  const card = site.products[0]
  const stockAnswer = (left: number) => ({
    product: { id: SHIRT },
    variants: [
      { id: SMALL_ID, name: "Small", left, maxQuantity: left, soldOut: false, pickup: [{ name: "Main Street", city: "Lisbon", ready: "Usually ready in 24 hours" }] },
      { id: "10000000-0000-4000-8000-000000000003", name: "Medium", left: null, maxQuantity: 4, soldOut: false, pickup: [] },
      { id: "10000000-0000-4000-8000-000000000002", name: "Large", left: null, maxQuantity: 0, soldOut: true, pickup: [] },
    ],
  })
  const globals = {
    PROBE_SHORT: false,
    PROBE_COMPAT: compat,
    PROBE_PRODUCTS: [{ id: SHIRT, title: "Posture shirt", slug: "posture-shirt", status: "published", price: 49, type: "physical" }],
    PROBE_CARDS: { shop: [card], catalog: [card] },
    PROBE_STOREFRONT: { [SHIRT]: stockAnswer(3) },
    PROBE_STORE_MENUS: { available: true, stored: true, menus: { "main-menu": { title: "Main", links: [{ title: "Shirt", url: "/products/posture-shirt" }] } } },
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body><div id="app"></div><script>${Object.entries(globals).map(([k, v]) => `window.${k}=${JSON.stringify(v).replace(/</g, "\\u003c")};`).join("")}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(readFileSync(bundle)); return }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const text = t.files[`shopify/assets/${decodeURIComponent(asset[1])}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      res.writeHead(200, { "Content-Type": asset[1].endsWith(".css") ? "text/css" : "text/javascript", "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    for (const vp of VIEWPORTS) {
      const page = await pageFor(browser, vp)
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
      await page.goto(base, { waitUntil: "domcontentloaded" })
      const frame = async (want?: (doc: Document) => boolean) => {
        for (let i = 0; i < 200; i++) {
          const h = await page.$("[data-compat-frame='front']").catch(() => null)
          const f = h ? await h.contentFrame().catch(() => null) : null
          if (f && (await f.evaluate((w) => document.readyState !== "loading" && !!document.querySelector(".shopify-section") && (!w || new Function("d", `return (${w})(d)`)(document)), want ? want.toString() : "").catch(() => false))) return f
          await sleep(100)
        }
        await page.screenshot({ path: `${OUT}/canvas-stuck-${vp.label}.png` })
        throw new Error("the canvas never drew the page")
      }
      let f = await frame()
      await sleep(600)
      /* The header's link to the product, pressed in the canvas: the builder opens the product page. */
      const fb = (await (await page.$("[data-compat-frame='front']"))!.boundingBox())!
      const at = await f.evaluate(() => {
        /* One on screen: on a phone the header's menu is in its drawer, and the footer's link is below the fold until scrolled to. */
        const a = [...document.querySelectorAll<HTMLAnchorElement>("a")].find((x) => x.getAttribute("href") === "/products/posture-shirt" && x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== "hidden")
        if (!a) return null
        a.scrollIntoView({ block: "center" })
        const r = a.getClientRects()[0] ?? a.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      if (!at) {
        check(`${vp.label}: the header has a link to the product`, false)
        await page.close()
        continue
      }
      /* A tap on a phone selects what it lands on, as the builder's phone canvas does; the click opens the page on both. */
      await sleep(400)
      if (process.env.DEBUG) console.log("    link at", at, "frame", fb)
      await page.mouse.click(fb.x + at.x, fb.y + at.y)
      f = await frame((d) => /Low stock: \d+ left/.test(d.body.textContent ?? ""))
      const shown = await f.evaluate(() => ({
        stock: document.querySelector(".product__inventory")?.textContent,
        max: (document.querySelector(".quantity__input") as HTMLInputElement | null)?.max,
        pickup: document.querySelector(".pickup-availability p")?.textContent,
        large: [...document.querySelectorAll(".variant-select option")].map((o) => `${o.textContent}${(o as HTMLOptionElement).disabled ? " (off)" : ""}`),
      }))
      await page.screenshot({ path: `${OUT}/canvas-product-${vp.label}.png` })
      check(`${vp.label}: the canvas's product page shows Only 3 left, the stop at 3, pickup and Large sold out`, shown.stock === "Low stock: 3 left" && shown.max === "3" && shown.pickup === "Pickup available at Main Street" && shown.large.includes("Large - Sold out (off)"), shown)
      /* Two sold elsewhere while the builder was in another tab: it comes back, and the page says so. */
      await page.evaluate((next) => { (window as unknown as { PROBE_STOREFRONT: unknown }).PROBE_STOREFRONT = next }, { [SHIRT]: stockAnswer(1) })
      const t0 = Date.now()
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      f = await frame((d) => /Low stock: 1 left/.test(d.body.textContent ?? ""))
      check(`${vp.label}: back in the builder, the canvas says 1 left (${Date.now() - t0}ms)`, Date.now() - t0 < 4000)
      check(`${vp.label}: no script errors in the editor`, errors.length === 0, errors[0] ?? "")
      await page.close()
    }
  } finally {
    server.close()
  }
}

/* ── Storelib's own product section and cart, and Website settings › Domains ── */

async function bundleHarness(): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "storefront23-"))
  const stubs = join(out, "stubs")
  mkdirSync(stubs, { recursive: true })
  const { writeFileSync } = await import("node:fs")
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/products/posture-shirt"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, placeholder, blurDataURL, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-storefront23.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", "--jsx=automatic", "--platform=browser",
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--log-level=error",
  ], { cwd: root, stdio: ["ignore", "inherit", "inherit"] })
  return join(out, "probe.js")
}

async function serveHarness(bundle: string): Promise<{ server: Server; port: number }> {
  const { appCss, interFaces } = (await import("./probe-css.mjs" as string)) as { appCss: (r: string) => Promise<string>; interFaces: (r: string) => string }
  const css = (await appCss(root)) + "\n" + interFaces(root)
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://shop.test")
    if (url.pathname === "/probe.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(js); return }
    if (url.pathname === "/checkout") {
      const p = readSiteCheckoutParams(url.searchParams)
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><pre id="handoff">${JSON.stringify({ items: p.items, note: p.note, whole: p.wholeCart }).replace(/</g, "&lt;")}</pre>`)
      return
    }
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(html)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, port: (server.address() as { port: number }).port }
}

async function storelib(browser: Browser, port: number) {
  console.log("\nStorelib's product section and cart")
  for (const vp of VIEWPORTS) {
    const page = await pageFor(browser, vp)
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
    await page.goto(`http://shop.test:${port}/?view=product`, { waitUntil: "networkidle0" })
    await page.waitForSelector("[data-delivery]", { timeout: 15000 })
    const read = () => page.evaluate(() => ({
      ship: document.querySelector('[data-delivery-line="ship"]')?.textContent,
      pickup: document.querySelector('[data-delivery-line="pickup"]')?.textContent ?? null,
      low: document.querySelector("[data-low-stock]")?.textContent ?? null,
      add: (document.querySelector("[data-add-to-cart]") as HTMLButtonElement | null)?.textContent,
      addOff: (document.querySelector("[data-add-to-cart]") as HTMLButtonElement | null)?.disabled,
    }))
    const small = await read()
    const box = await page.$eval("[data-delivery]", (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), w: Math.round(r.width) } })
    await page.screenshot({ path: `${OUT}/storelib-product-${vp.label}.png`, fullPage: false, clip: { x: 0, y: Math.max(0, box.top - (vp.touch ? 520 : 420)), width: vp.width, height: vp.touch ? 760 : 700 } })
    check(`${vp.label}: Small: delivery with its days and where it turns free, pickup at Main Street, Only 3 left`, small.ship === "Delivery $4.99 to Portugal, 3 to 5 business daysFree delivery on orders over $75.00" && small.pickup === "Pickup available at Main Street, LisbonUsually ready in 24 hours" && /Only 3 left/.test(small.low ?? ""), small)
    const pick = async (value: string) => {
      const btn = await page.$$(`[data-block-type="variant_picker"] button`)
      for (const b of btn) if ((await b.evaluate((e) => e.textContent?.trim())) === value) { if (vp.touch) await b.tap(); else await b.click(); break }
      await sleep(300)
    }
    await pick("Medium")
    const medium = await read()
    check(`${vp.label}: Medium: delivery stays, no pickup there, no number left`, medium.ship === small.ship && medium.pickup === null && medium.low === null, medium)
    await pick("Large")
    const large = await read()
    check(`${vp.label}: Large: Sold out, Add to cart off`, large.add === "Sold out" && large.addOff === true, large)
    await pick("Small")
    if (vp.touch) await page.tap("[data-add-to-cart]")
    else await page.click("[data-add-to-cart]")
    await page.waitForSelector("[data-cart-note] textarea", { timeout: 10000 })
    await page.type("[data-cart-note] textarea", "Leave it at the door")
    const noteBox = await page.$eval("[data-cart-note]", (el) => { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { w: Math.round(r.width), right: Math.round(r.right) } })
    await sleep(200)
    await page.screenshot({ path: `${OUT}/storelib-cart-${vp.label}.png` })
    check(`${vp.label}: the cart asks for a note for what ships, inside the page`, noteBox.w > 200 && noteBox.right <= vp.width, noteBox)
    const returns = await page.$eval("[data-cart-returns]", (el) => el.textContent).catch(() => null)
    check(`${vp.label}: the returns line under Check out (Website settings › Commerce)`, returns === "Returns accepted within 30 days of delivery. Return policy", returns)
    check(`${vp.label}: nothing scrolls sideways`, (await sideways(page)) <= 0)
    const checkout = await page.$$eval("button", (bs) => bs.findIndex((b) => b.textContent === "Check out"))
    const buttons = await page.$$("button")
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), vp.touch ? buttons[checkout].tap() : buttons[checkout].click()])
    const handoff = await page.evaluate(() => ({ path: location.pathname, data: JSON.parse(document.getElementById("handoff")?.textContent ?? "{}") }))
    check(`${vp.label}: Check out goes to this site's checkout with Small, one, and the note`, handoff.path === "/checkout" && handoff.data.items?.length === 1 && handoff.data.items[0].variantId === "20000000-0000-4000-8000-000000000001" && handoff.data.items[0].quantity === 1 && handoff.data.note === "Leave it at the door", handoff)
    check(`${vp.label}: no script errors`, errors.length === 0, errors[0] ?? "")
    await page.close()
  }
}

async function domains(browser: Browser, port: number) {
  console.log("\nWebsite settings › Domains")
  for (const vp of VIEWPORTS) {
    for (const state of ["none", "pending", "securing", "live", "two"]) {
      const page = await pageFor(browser, vp)
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
      await page.goto(`http://shop.test:${port}/?view=domains&state=${state}`, { waitUntil: "networkidle0" })
      await page.waitForFunction(() => /Custom domain/.test(document.body.textContent ?? ""), { timeout: 15000 })
      await sleep(400)
      const t = await page.evaluate(() => document.body.innerText)
      await page.screenshot({ path: `${OUT}/domains-${state}-${vp.label}.png` })
      const want: Record<string, () => boolean> = {
        none: () => /Connect a domain you own/.test(t) && /Every address here shows your live website/.test(t) && !/Sent to/.test(t),
        pending: () => /Waiting for DNS/.test(t) && /216\.198\.79\.1/.test(t) && /domains\.storelib\.com/.test(t) && /Issued once DNS is set/.test(t) && !/Sent to/.test(t),
        securing: () => /Securing/.test(t) && /Certificate being issued/.test(t) && !/Sent to/.test(t),
        live: () => /Connected/.test(t) && /Secured with HTTPS/.test(t) && /Sent to www\.posturex\.com/.test(t) && /Your website is at www\.posturex\.com/.test(t) && /Redirects/.test(t),
        two: () => /Sends visitors to the primary address/.test(t) && /Sent to www\.posturex\.com/.test(t) && !/to www\.posturex\.shop/.test(t),
      }
      check(`${vp.label}: ${state}: the states say what is true`, want[state](), t.slice(0, 400).replace(/\n+/g, " | "))
      check(`${vp.label}: ${state}: nothing scrolls sideways`, (await sideways(page)) <= 0)
      check(`${vp.label}: ${state}: no script errors`, errors.length === 0, errors[0] ?? "")
      await page.close()
    }
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--host-resolver-rules=MAP shop.test 127.0.0.1, MAP posturex.test 127.0.0.1"] })
  try {
    if (all || parts.has("compat")) await compat(browser)
    if (all || parts.has("canvas")) await canvas(browser)
    if (all || parts.has("storelib") || parts.has("domains")) {
      const bundle = await bundleHarness()
      const { server, port } = await serveHarness(bundle)
      try {
        if (all || parts.has("storelib")) await storelib(browser, port)
        if (all || parts.has("domains")) await domains(browser, port)
      } finally {
        server.close()
      }
    }
  } finally {
    await browser.close()
  }
  console.log(`\n${failed ? `${failed} failed` : "all passed"}; screenshots in ${OUT}`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
