/**
 * ===========================================================================
 *  EVERY PICKER OF A PRODUCT PAGE, IN A BROWSER, AGAINST ONE TRUTH
 * ===========================================================================
 *   npx tsx scripts/check-variants25.ts <theme.zip | theme folder> [...]
 *
 * A theme (Dawn, Horizon, or tests/fixtures/shopify-posture, with its
 * variant template) goes through the import's own converter and is served
 * by the live site's own handler (lib/storelib-theme/compat/site.ts), with
 * a shop of two products that have what makes variants hard:
 *
 *   Black Sleeve   Size S M L XL: S in stock, M 3 left, L dearer with a
 *                  compare at price and its own SKU, XL sold out
 *   Linen shirt    Colour Black Sand Ocean by Size S M: Black/M and
 *                  Ocean/S sold out, Ocean/M not made at all; each colour
 *                  its own photo
 *
 * What each value should do is worked out here from Shopify's own rules,
 * not from the compat layer: the variant a choice names, a value's
 * availability given the values chosen before it, the price, the SKU, the
 * photo. Then headless Chromium chooses every value in every picker the
 * theme draws (buttons, swatches, a dropdown, a sticky bar's select) and
 * reads back what the page says: the form's variant id, the address's
 * ?variant=, the selected label, the price, the buy button, which values
 * read as unavailable, the sticky bar, and the cart after Add to cart.
 *
 * CANVAS=1 does the same in the builder's canvas: the page in a sandboxed
 * frame, every request of its scripts answered by the builder
 * (lib/storelib-theme/compat/canvas-cart.ts), as compat-canvas.tsx does.
 *
 * PICKER=dropdown draws the theme's main picker as dropdowns. OUT= the
 * folder for screenshots (default /tmp/variants25). Exits 1 on any failure.
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, join, relative } from "node:path"
import JSZip from "jszip"
import puppeteer, { type Frame, type Page } from "puppeteer-core"
import sharp from "sharp"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { shopifyGlobalAsset } from "../lib/storelib-theme/compat/shopify-global-assets"
import { formFields } from "../lib/storelib-theme/compat/form-fields"
import { themeOfInstall, type StoredSection } from "../lib/storelib-theme/compat/page"
import { compileScss } from "../lib/storelib-theme/compat/scss"
import { answer, themeAsset, readCartCookie, writeCartCookie, CART_COOKIE, type SiteData } from "../lib/storelib-theme/compat/site"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"
import { answerInCanvas, canvasPages, type CanvasCart } from "../lib/storelib-theme/compat/canvas-cart"

const OUT = process.env.OUT ?? "/tmp/variants25"
mkdirSync(OUT, { recursive: true })
let failed = 0
const fails: string[] = []
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) {
    failed++
    fails.push(label)
  }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

// ── The shop, and Shopify's rules about it ──────────────────────────────────

interface V { id: string; options: string[]; cents: number; compare?: number; available: boolean; left?: number | null; max?: number | null; sku?: string; image?: string }
interface P { id: string; handle: string; title: string; options: { name: string; values: string[] }[]; variants: V[]; images: string[] }

const PRODUCTS: P[] = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    handle: "black-sleeve",
    title: "Black Sleeve",
    options: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
    images: ["https://img.test/p0-front.png", "https://img.test/p1-back.png"],
    variants: [
      { id: "10000000-0000-4000-8000-0000000000a1", options: ["S"], cents: 3500, available: true, sku: "BS-S" },
      { id: "10000000-0000-4000-8000-0000000000a2", options: ["M"], cents: 3500, available: true, left: 3, max: 3, sku: "BS-M" },
      { id: "10000000-0000-4000-8000-0000000000a3", options: ["L"], cents: 3800, compare: 4500, available: true, sku: "BS-L" },
      { id: "10000000-0000-4000-8000-0000000000a4", options: ["XL"], cents: 3800, available: false, sku: "BS-XL" },
    ],
  },
  {
    id: "00000000-0000-4000-8000-0000000000b1",
    handle: "linen-shirt",
    title: "Linen shirt",
    options: [{ name: "Color", values: ["Black", "Sand", "Ocean"] }, { name: "Size", values: ["S", "M"] }],
    images: ["https://img.test/p2-main.png"],
    variants: [
      { id: "20000000-0000-4000-8000-0000000000b1", options: ["Black", "S"], cents: 4000, available: true, sku: "LS-BK-S", image: "https://img.test/p3-black.png" },
      { id: "20000000-0000-4000-8000-0000000000b2", options: ["Black", "M"], cents: 4200, available: false, sku: "LS-BK-M", image: "https://img.test/p3-black.png" },
      { id: "20000000-0000-4000-8000-0000000000b3", options: ["Sand", "S"], cents: 4000, compare: 5000, available: true, sku: "LS-SD-S", image: "https://img.test/p4-sand.png" },
      { id: "20000000-0000-4000-8000-0000000000b4", options: ["Sand", "M"], cents: 4200, available: true, left: 2, max: 2, sku: "LS-SD-M", image: "https://img.test/p4-sand.png" },
      { id: "20000000-0000-4000-8000-0000000000b5", options: ["Ocean", "S"], cents: 4000, available: false, sku: "LS-OC-S", image: "https://img.test/p5-ocean.png" },
    ],
  },
]

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`

/** The card the live site's loader hands the theme for a product page (lib/website-builder/compat-site.ts). */
function cardOf(p: P) {
  return {
    id: p.id,
    settings: {
      title: p.title,
      slug: p.handle,
      url: `/products/${p.handle}`,
      price: dollars(Math.min(...p.variants.map((v) => v.cents))),
      compare_price: "",
      image: p.images[0],
      images: p.images,
      kind: "physical",
      available: p.variants.some((v) => v.available),
      category: "Shirts",
      description: "Washed cotton.",
      low_stock_at: 5,
      options: p.options,
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.options.join(" / "),
        options: v.options,
        price: dollars(v.cents),
        compare_price: v.compare ? dollars(v.compare) : "",
        available: v.available,
        ...(v.left !== undefined ? { left: v.left } : {}),
        max: v.max ?? null,
        tracked: true,
        policy: "deny",
        sku: v.sku ?? "",
        ...(v.image ? { image: v.image } : {}),
      })),
    },
  }
}

/** Shopify: the variant every chosen value names, or none. */
function variantFor(p: P, chosen: string[]): V | null {
  return p.variants.find((v) => v.options.every((o, i) => o === chosen[i])) ?? null
}

/** Shopify: a value is available when a variant with it, and with the values chosen for the options before it, can be bought. */
function valueAvailable(p: P, chosen: string[], pos: number, value: string): boolean {
  return p.variants.some((v) => v.available && v.options[pos] === value && chosen.slice(0, pos).every((c, j) => v.options[j] === c))
}

// ── The theme, served ────────────────────────────────────────────────────────

async function zipOf(path: string): Promise<JSZip> {
  if (statSync(path).isDirectory()) {
    const zip = new JSZip()
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else zip.file(relative(path, p), readFileSync(p))
      }
    }
    walk(path)
    /* The fixture's product page with a picker and a sticky bar: its alternate template, as the main one. */
    const alt = zip.file("templates/product.variants.json")
    if (alt) zip.file("templates/product.json", await alt.async("string"))
    return zip
  }
  return JSZip.loadAsync(readFileSync(path))
}

async function serve(path: string) {
  const r = await convertShopifyTheme(await zipOf(path), { fallbackName: basename(path, ".zip") })
  if (!r.ok) throw new Error(r.error)
  const files = r.theme.files
  const theme = themeOfInstall(files, r.theme.settings, {
    assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
  })
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections])) as Record<string, StoredSection[]>
  /* PICKER=dropdown: the main picker drawn as dropdowns, as a creator may set it. */
  if (process.env.PICKER === "dropdown") {
    for (const s of pages.product ?? []) {
      const walk = (blocks: unknown) => {
        for (const b of (Array.isArray(blocks) ? blocks : Object.values((blocks ?? {}) as object)) as { type?: string; settings?: Record<string, unknown>; blocks?: unknown }[]) {
          if (/variant[_-]picker/.test(b.type ?? "")) b.settings = { ...(b.settings ?? {}), picker_type: "dropdown", variant_style: "dropdowns" }
          if (b.blocks) walk(b.blocks)
        }
      }
      walk((s as { blocks?: unknown }).blocks)
    }
  }
  const products = PRODUCTS.map(cardOf)
  const site: SiteData = { creatorId: "c", theme, pages, products, collections: [], menus: {}, shop: { name: "Solara", currency: "USD", moneyFormat: "${{amount}}" }, host: "127.0.0.1" }
  let canvasCart: CanvasCart = { cart: [], note: "" }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    /* The builder's canvas, as compat-canvas.tsx draws it: the page in a sandboxed frame, what its scripts ask answered by the parent. */
    if (url.pathname === "/__canvas") {
      const path = url.searchParams.get("path") ?? "/"
      const drawn = await answer({ ...site, designMode: true, extraBodyEnd: `<script>window.__slSite="https://solara.example";${CANVAS_BRIDGE}</script>` }, { method: "GET", path: path.split("?")[0], query: new URLSearchParams(path.split("?")[1] ?? ""), body: null, cart: canvasCart.cart })
      const doc = String(drawn.body).replace(/<head\b[^>]*>/i, (m) => `${m}<script>window.__slPath=${JSON.stringify(path.split("?")[0])};window.__slSeed={};</script>${CANVAS_HEAD}`)
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(`<!doctype html><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style><iframe id="f" sandbox="allow-scripts allow-forms allow-popups"></iframe><script>var f=document.getElementById("f");f.srcdoc=${JSON.stringify(doc).replace(/</g, "\\u003c")};addEventListener("message",function(e){var m=e.data;if(!m||m.storelib!==1||m.type!=="request")return;fetch("/__canvas-answer",{method:"POST",body:JSON.stringify({m:m,path:${JSON.stringify(path.split("?")[0])}})}).then(function(r){return r.json()}).then(function(a){a.storelib=1;a.type="response";a.id=m.id;e.source.postMessage(a,"*")})});</script>`)
      return
    }
    if (url.pathname === "/__canvas-answer") {
      const sent: Buffer[] = []
      for await (const c of req) sent.push(c as Buffer)
      const { m, path } = JSON.parse(Buffer.concat(sent).toString("utf8"))
      /* As compat-canvas.tsx answers: the page's product, with its facts, for a section drawn again on a choice. */
      const handle = String(path).split("/").pop()
      const r = await answerInCanvas({ ...site, designMode: true, pages: canvasPages(theme, "product", (pages.product ?? []) as never), product: async (h) => products.find((p) => p.settings.slug === h || p.settings.slug === handle && h === handle) ?? null }, canvasCart, { method: m.method, url: m.url, body: m.body, ajax: m.ajax === true }, path)
      canvasCart = r.state
      const { type: contentType, ...rest } = r.answer
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ contentType, ...rest }))
      return
    }
    if ((url.pathname.startsWith("/api/site-theme/shopify/") || url.pathname.startsWith("/api/site-theme/helpers/"))) {
      const js = shopifyGlobalAsset(decodeURIComponent(url.pathname.split("/").pop() ?? ""))
      res.writeHead(js ? 200 : 404, { "content-type": "application/javascript", "Access-Control-Allow-Origin": "*" })
      return res.end(js ?? "")
    }
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }), { scss: compileScss })
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type, "Access-Control-Allow-Origin": "*" })
      res.end(a.body)
      return
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString("utf8")
    const type = String(req.headers["content-type"] ?? "")
    let body: Record<string, unknown> | null = null
    if (raw && type.includes("json")) body = JSON.parse(raw)
    else if (raw && type.includes("urlencoded")) body = formFields(new URLSearchParams(raw).entries())
    else if (raw && type.includes("multipart")) {
      const parts: [string, string][] = []
      for (const part of raw.split(/--[-\w]+/)) {
        const m = part.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/)
        if (m) parts.push([m[1], m[2]])
      }
      body = formFields(parts)
    }
    const cookie = String(req.headers.cookie ?? "").match(new RegExp(`${CART_COOKIE}=([^;]*)`))?.[1]
    const { cart, note } = readCartCookie(cookie)
    const ajax = req.headers["x-requested-with"] === "XMLHttpRequest" || type.includes("json") || String(req.headers.accept ?? "").includes("application/json")
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart, note, ajax })
    const headers: Record<string, string> = { ...(out.headers ?? {}), "Content-Type": out.type }
    if (out.cart) headers["Set-Cookie"] = `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "")}; Path=/; SameSite=Lax`
    res.writeHead(out.status, headers)
    res.end(out.body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, name: r.theme.name.toLowerCase().replace(/\W+/g, "-") }
}

// ── What the page says ───────────────────────────────────────────────────────

interface Read {
  url: string
  formId: string | null
  /** Per option name: the checked/selected value of the main picker. */
  chosen: Record<string, string | null>
  /** Per option name and value: whether the main picker draws it as unavailable. */
  off: Record<string, Record<string, boolean>>
  /** The selected-value labels the main picker draws ("Size: M"), by option name. */
  labels: Record<string, string>
  price: string
  button: { disabled: boolean; text: string } | null
  /** Buy it now (the theme's dynamic checkout button), when the form has one. */
  buyNow: boolean | null
  sku: string
  stock: string
  media: string
  sticky: { variant: string; select: string | null; disabledOptions: string[]; button: boolean | null } | null
  errors: string[]
}

async function read(page: Page | Frame, p: P): Promise<Read> {
  return page.evaluate((optionNames: string[], values: string[][]) => {
    const main = document.querySelector("main, #MainContent") ?? document.body
    const isShown = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const pickerRoot = main.querySelector("variant-selects, variant-picker, variant-radios, [data-variant-picker], .product-form__variants") ?? main
    const form = main.querySelector<HTMLFormElement>("form[action$='/cart/add'][data-type='add-to-cart-form'], product-form form, form.product-form, form[action$='/cart/add']")
    const idInput = form?.querySelector<HTMLInputElement | HTMLSelectElement>("[name='id']") ?? null
    const chosen: Record<string, string | null> = {}
    const off: Record<string, Record<string, boolean>> = {}
    const labels: Record<string, string> = {}
    optionNames.forEach((name, i) => {
      off[name] = {}
      const radios = [...pickerRoot.querySelectorAll<HTMLInputElement>("input[type=radio]")].filter((r) => values[i].includes(r.value) && (r.name.toLowerCase().includes(name.toLowerCase()) || r.dataset.optionName === name || r.closest("fieldset")?.querySelector("legend")?.textContent?.includes(name)))
      const select = [...pickerRoot.querySelectorAll<HTMLSelectElement>("select")].find((s) => [...s.options].some((o) => values[i].includes(o.value)) && (s.name.toLowerCase().includes(name.toLowerCase()) || (s.closest("[class*=dropdown], .variant-option, .product-form__input")?.textContent ?? "").includes(name)))
      if (radios.length) {
        chosen[name] = radios.find((r) => r.checked)?.value ?? null
        for (const r of radios) off[name][r.value] = r.classList.contains("disabled") || r.classList.contains("visually-disabled") || r.classList.contains("is-unavailable") || r.disabled || r.getAttribute("aria-disabled") === "true" || r.dataset.optionAvailable === "false" || r.dataset.available === "false"
        const legend = radios[0].closest("fieldset")?.querySelector("legend")
        if (legend) labels[name] = (legend.textContent ?? "").replace(/\s+/g, " ").trim()
      } else if (select) {
        chosen[name] = select.value
        for (const o of select.options) off[name][o.value] = o.disabled || o.classList.contains("disabled") || /unavailable|sold out/i.test(o.textContent ?? "")
        const label = select.closest(".product-form__input, .variant-option, [class*=dropdown]")?.querySelector("label, legend")
        if (label) labels[name] = (label.textContent ?? "").replace(/\s+/g, " ").trim()
      } else chosen[name] = null
    })
    /* Labels that carry the chosen value apart from the legend (Dawn's swatch legend, a theme's "Size: M"). */
    for (const el of main.querySelectorAll<HTMLElement>("[data-selected-value], .variant-option__swatch-value, [data-option-label]")) {
      const at = el.closest("fieldset, .product-form__input, .variant-option, [data-option-index]")
      const name = optionNames.find((n) => (at?.textContent ?? "").includes(n))
      /* A swatch standing for the value (Dawn's dropdown with swatches) has no words to read. */
      const words = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      if (name && isShown(el) && words) labels[name] = `${name}: ${words}`
    }
    const priceEl = [...main.querySelectorAll(".price, product-price, [ref='priceContainer'], [data-product-price]")].find(isShown)
    const btn = form?.querySelector<HTMLButtonElement>("button[name='add'], button[type='submit'], [ref='addToCartButton']") ?? null
    const sku = [...main.querySelectorAll("[id^='Sku-'], .product__sku, product-sku-component, [data-product-sku], .product-sku")].map((e) => e.textContent ?? "").join(" ").replace(/\s+/g, " ").trim()
    const stock = [...main.querySelectorAll("[id^='Inventory-'], .product__inventory, product-inventory, [data-product-stock], .product-inventory")].map((e) => e.textContent ?? "").join(" ").replace(/\s+/g, " ").trim()
    /* The gallery's picture in front: the active slide, else the first one on screen. */
    const imgs = [...main.querySelectorAll<HTMLImageElement>("media-gallery img, .product__media img, media-gallery-component img, slideshow-component img, [data-product-media] img, .product-gallery img")].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 80 && r.left >= -2 && r.left < innerWidth && getComputedStyle(i).visibility !== "hidden" })
    const active = imgs.find((i) => i.closest(".is-active, [aria-current='true'], [aria-hidden='false'].slideshow-slide, [data-media-active]")) ?? imgs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]
    const media = (active?.currentSrc || active?.src || "").replace(/^.*\/(p\d[\w-]*)\.png.*$/, "$1")
    const stickyEl = document.querySelector("sticky-add-to-cart, .sticky-add-to-cart, [data-sticky-atc], .sticky-atc")
    const stickySelect = stickyEl?.querySelector<HTMLSelectElement>("select") ?? null
    const sticky = stickyEl ? {
      variant: (stickyEl.querySelector(".sticky-add-to-cart__variant, [data-sticky-variant]")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      select: stickySelect ? stickySelect.value : null,
      disabledOptions: stickySelect ? [...stickySelect.options].filter((o) => o.disabled).map((o) => o.value) : [],
      button: (() => { const b = stickyEl.querySelector<HTMLButtonElement>("button[ref='addToCartButton'], button[type=submit], .sticky-add-to-cart__button, button[name=add]"); return b ? b.disabled : null })(),
    } : null
    return {
      url: location.pathname + location.search,
      formId: idInput ? (idInput as HTMLInputElement).value || null : null,
      chosen,
      off,
      labels,
      price: (priceEl?.textContent ?? "").replace(/\s+/g, " ").trim(),
      button: btn ? { disabled: btn.disabled || btn.getAttribute("aria-disabled") === "true", text: (btn.textContent ?? "").replace(/\s+/g, " ").trim() } : null,
      buyNow: (() => { const b = main.querySelector<HTMLButtonElement>("[data-storelib-buy-now], form [name='checkout']"); return b ? b.disabled : null })(),
      sku,
      stock,
      media,
      sticky,
      errors: ((window as unknown as { __errs?: string[] }).__errs ?? []).slice(),
    }
  }, p.options.map((o) => o.name), p.options.map((o) => o.values))
}

/** Choose one value in the main picker as a visitor does: its label pressed, or the select changed. */
async function choose(page: Page | Frame, p: P, pos: number, value: string): Promise<string> {
  return page.evaluate((name: string, values: string[], value: string) => {
    const main = document.querySelector("main, #MainContent") ?? document.body
    const root = main.querySelector("variant-selects, variant-picker, variant-radios, [data-variant-picker], .product-form__variants") ?? main
    const radio = [...root.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((r) => r.value === value && (r.name.toLowerCase().includes(name.toLowerCase()) || r.dataset.optionName === name || r.closest("fieldset")?.querySelector("legend")?.textContent?.includes(name)))
    if (radio) {
      const label = radio.labels?.[0] ?? (radio.id ? root.querySelector<HTMLElement>(`label[for="${CSS.escape(radio.id)}"]`) : null) ?? radio.closest("label")
      ;(label ?? radio).click()
      return "radio"
    }
    const select = [...root.querySelectorAll<HTMLSelectElement>("select")].find((s) => [...s.options].some((o) => o.value === value) && [...s.options].every((o) => values.includes(o.value) || !o.value))
    if (select) {
      select.value = value
      select.dispatchEvent(new Event("change", { bubbles: true }))
      return "select"
    }
    return ""
  }, p.options[pos].name, p.options[pos].values, value)
}

/** Waits for the page to settle after a choice: no request in flight for 400 ms. */
async function settle(page: Page) {
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 }).catch(() => {})
  /* A phone at a quarter of the speed takes longer to put the answer on the page. */
  await new Promise((r) => setTimeout(r, (page.viewport()?.width ?? 1440) < 600 ? 1000 : 250))
}

/** What the page should say for a choice, by Shopify's rules. */
function expect(p: P, chosen: string[]) {
  const v = variantFor(p, chosen)
  return { v, off: Object.fromEntries(p.options.map((o, pos) => [o.name, Object.fromEntries(o.values.map((x) => [x, !valueAvailable(p, chosen, pos, x)]))])) }
}

function compareRead(where: string, p: P, chosen: string[], got: Read, opts: { strictUrl: boolean }) {
  const want = expect(p, chosen)
  const v = want.v
  const shownChoice = p.options.map((o) => got.chosen[o.name])
  check(`${where}: the picker shows ${chosen.join(" / ")}`, shownChoice.every((c, i) => c === chosen[i]), JSON.stringify(got.chosen))
  check(`${where}: the form buys ${v ? v.options.join(" / ") : "nothing (no such variant)"}`, v ? got.formId === v.id : got.formId === null || got.formId === "" || !!got.button?.disabled, `id ${got.formId}`)
  if (opts.strictUrl) check(`${where}: the address says ?variant= of the choice`, v ? new URL(got.url, "http://x").searchParams.get("variant") === v.id : true, got.url)
  for (const o of p.options) {
    const wrong = o.values.filter((x) => (got.off[o.name]?.[x] ?? false) !== want.off[o.name][x])
    check(`${where}: ${o.name} values read as available exactly when Shopify says`, wrong.length === 0, wrong.length ? `wrong: ${wrong.map((x) => `${x} drawn ${got.off[o.name]?.[x] ? "unavailable" : "available"}`).join(", ")}` : Object.entries(got.off[o.name] ?? {}).map(([k, x]) => `${k}${x ? "x" : ""}`).join(" "))
    const label = got.labels[o.name]
    if (label && /:/.test(label)) check(`${where}: the ${o.name} label names the chosen value`, label.replace(/\s/g, "").endsWith(`:${chosen[p.options.indexOf(o)]}`) || label.includes(`: ${chosen[p.options.indexOf(o)]}`), label)
  }
  if (v) {
    check(`${where}: the price is ${dollars(v.cents)}${v.compare ? ` with ${dollars(v.compare)} struck` : ""}`, got.price.includes(dollars(v.cents)) && (!v.compare || got.price.includes(dollars(v.compare))) && (!!v.compare || !/\$\d+\.\d\d.*\$\d+\.\d\d/.test(got.price.replace(dollars(v.cents), ""))), got.price.slice(0, 80))
    if (got.button) check(`${where}: the buy button ${v.available ? "sells" : "says sold out"}`, v.available ? !got.button.disabled : got.button.disabled, `${got.button.disabled ? "disabled" : "enabled"} "${got.button.text.slice(0, 30)}"`)
    if (got.buyNow !== null) check(`${where}: Buy it now is ${v.available ? "on" : "off"}`, got.buyNow === !v.available, got.buyNow ? "disabled" : "enabled")
    if (got.sku) check(`${where}: the SKU is ${v.sku}`, got.sku.includes(v.sku ?? "?"), got.sku)
    if (got.stock && v.left) check(`${where}: the stock line says ${v.left} left`, got.stock.includes(String(v.left)), got.stock.slice(0, 60))
    if (got.stock && !v.left) check(`${where}: the stock line names no count`, !/\b\d+ (left|in stock)\b/i.test(got.stock), got.stock.slice(0, 60))
    if (v.image && got.media) check(`${where}: the gallery shows the variant's photo`, v.image.includes(`/${got.media}.png`), got.media)
  } else {
    if (got.button) check(`${where}: the buy button refuses a choice with no variant`, got.button.disabled, got.button.text)
    if (got.buyNow !== null) check(`${where}: Buy it now is off for a choice with no variant`, got.buyNow === true, got.buyNow ? "disabled" : "enabled")
  }
  if (got.sticky) {
    const title = v ? v.options.join(" / ") : ""
    if (got.sticky.select !== null) {
      check(`${where}: the sticky bar's select follows the choice`, v ? got.sticky.select === v.id : true, `${got.sticky.select}`)
      const offIds = p.variants.filter((x) => !x.available).map((x) => x.id).sort()
      check(`${where}: the sticky bar's select offers no sold out variant`, JSON.stringify([...got.sticky.disabledOptions].sort()) === JSON.stringify(offIds), `disabled ${got.sticky.disabledOptions.length}`)
    }
    if (got.sticky.variant) check(`${where}: the sticky bar names the choice`, !v || got.sticky.variant === title, got.sticky.variant)
    if (got.sticky.button !== null && v) check(`${where}: the sticky bar's button ${v.available ? "sells" : "is off"}`, got.sticky.button === !v.available, String(got.sticky.button))
  }
  check(`${where}: no script error`, got.errors.length === 0, got.errors[0] ?? "")
}

async function run(path: string) {
  const { server, base, name } = await serve(path)
  console.log(`\n${name}${process.env.PICKER ? ` (${process.env.PICKER})` : ""}${process.env.CANVAS === "1" ? " in the canvas" : ""}`)
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 300_000 })
  const COLOURS: Record<string, string> = { p0: "#e8e0d0", p1: "#b9b2a6", p2: "#d9d4c7", p3: "#1d1d1d", p4: "#d8c39c", p5: "#3d6e8f" }
  const PNG: Record<string, Buffer> = {}
  for (const [k, c] of Object.entries(COLOURS)) PNG[k] = await sharp({ create: { width: 600, height: 600, channels: 3, background: c } }).png().toBuffer()
  try {
    for (const [width, height, label] of ([[1440, 900, "desktop"], [390, 844, "phone"]] as const).filter(([, , l]) => !process.env.VIEW || process.env.VIEW === l)) {
      const page = await browser.newPage()
      await page.setViewport({ width, height, isMobile: label === "phone", hasTouch: label === "phone" })
      await page.evaluateOnNewDocument("window.__name = (f) => f; window.__errs = []; addEventListener('error', function (e) { window.__errs.push(String(e.message).slice(0, 160)) }); addEventListener('unhandledrejection', function (e) { var r = e.reason; if (r && r.name === 'AbortError') return; window.__errs.push('rejection: ' + String(r && r.message || r).slice(0, 160)) })")
      if (label === "phone") {
        const cdp = await page.createCDPSession()
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      }
      await page.setRequestInterception(true)
      const consoleLines: string[] = []
      page.on("console", (m) => {
        if (/shopify|liquid/i.test(m.text())) consoleLines.push(m.text().slice(0, 160))
        if (process.env.DEBUG && (m.type() === "error" || m.type() === "warn")) console.log("    console:", m.text().slice(0, 300))
      })
      page.on("pageerror", (e) => { if (process.env.DEBUG) console.log("    pageerror:", String(e).slice(0, 300)) })
      const inFlight = new Set<string>()
      page.on("requestfinished", (r) => inFlight.delete(r.url()))
      page.on("requestfailed", (r) => inFlight.delete(r.url()))
      /* A page that never finishes loading is a failure with what it waited for, not a crash. */
      const canvas = process.env.CANVAS === "1"
      /* The document the theme draws: the page itself, or the canvas's frame. */
      const doc = (): Page | Frame => (canvas ? page.frames().find((f) => f !== page.mainFrame()) ?? page.mainFrame() : page)
      const open = async (path: string) => {
        try {
          await page.goto(canvas ? `${base}/__canvas?path=${encodeURIComponent(path)}` : `${base}${path}`, { waitUntil: "load", timeout: 45_000 })
          if (canvas) await doc().waitForSelector("main, #MainContent", { timeout: 20_000 }).catch(() => {})
          return true
        } catch (e) {
          check(`${label} ${path}: the page finishes loading`, false, `${String(e).slice(0, 80)}; waiting for ${[...inFlight].slice(0, 4).join(" ")}`)
          return false
        }
      }
      page.on("request", (r) => {
        inFlight.add(r.url())
        const u = r.url()
        const img = u.match(/^https:\/\/img\.test\/(p\d)/)
        if (img) return r.respond({ status: 200, contentType: "image/png", body: PNG[img[1]] ?? PNG.p0 })
        if (process.env.DEBUG && u.startsWith(base) && !/\/assets\//.test(u)) console.log("    >", r.method(), u.slice(base.length, base.length + 160))
        if (u.startsWith(base) || u.startsWith("data:")) return r.continue()
        return r.abort()
      })
      for (const p of PRODUCTS.filter((x) => !process.env.ONLY || x.handle === process.env.ONLY)) {
        console.log(` ${label}: ${p.title}`)
        try {
          await productChecks(p)
        } catch (e) {
          check(`${label} ${p.handle}: the page answers the probe`, false, String(e).slice(0, 160))
        }
      }
      async function productChecks(p: P) {
        if (!(await open(`/products/${p.handle}`))) return
        await settle(page)
        const first = p.variants.find((v) => v.available)!
        let got = await read(doc(), p)
        compareRead(`${label} ${p.handle} on arrival`, p, first.options, got, { strictUrl: false })
        const html = await doc().content()
        check(`${label} ${p.handle}: no Shopify or Liquid named in the page a buyer sees`, !/<!--[^>]*\b(shopify|liquid)\b[^>]*-->|<meta[^>]+generator[^>]+(shopify|liquid)/i.test(html) && !/\b(Shopify|Liquid)\b/.test(await doc().evaluate(() => document.body.innerText)), "")
        /* Every value of every option, in order, as a visitor goes through them. */
        let chosen = [...first.options]
        for (const [pos, o] of p.options.entries()) {
          for (const value of o.values) {
            const how = await choose(doc(), p, pos, value)
            if (!how) {
              const at = await doc().evaluate(() => { const m = document.querySelector("main, #MainContent") ?? document.body; return (m.querySelector("variant-selects, variant-picker, variant-radios, [data-variant-picker], .product-form__variants")?.innerHTML ?? "no picker").slice(0, 1500) })
              check(`${label} ${p.handle}: ${o.name} ${value} can be chosen`, false, `no input; ${at.replace(/\s+/g, " ").slice(0, 400)}`)
              continue
            }
            await settle(page)
            /* The address changes only when the choice does, as on Shopify. */
            const moved = chosen[pos] !== value
            chosen = [...chosen]
            chosen[pos] = value
            got = await read(doc(), p)
            compareRead(`${label} ${p.handle} ${how} ${o.name}=${value}`, p, chosen, got, { strictUrl: moved && !canvas })
          }
        }
        await page.screenshot({ path: `${OUT}/${name}-${label}-${p.handle}.png` })
        /* Arriving with ?variant=: the page opens on that variant. */
        for (const v of p.variants) {
          if (!(await open(`/products/${p.handle}?variant=${v.id}`))) continue
          await settle(page)
          compareRead(`${label} ${p.handle} ?variant=${v.options.join("/")}`, p, v.options, await read(doc(), p), { strictUrl: false })
        }
        /* The sticky bar's own select, where the theme draws one: each variant chosen there moves the main picker too. */
        const hasStickySelect = await doc().evaluate(() => !!document.querySelector("sticky-add-to-cart select, .sticky-add-to-cart select, [data-sticky-atc] select, .sticky-atc select"))
        if (hasStickySelect) {
          for (const v of p.variants.filter((x) => x.available)) {
            await doc().evaluate((id: string) => {
              const s = document.querySelector<HTMLSelectElement>("sticky-add-to-cart select, .sticky-add-to-cart select, [data-sticky-atc] select, .sticky-atc select")!
              s.value = id
              s.dispatchEvent(new Event("change", { bubbles: true }))
            }, v.id)
            await settle(page)
            compareRead(`${label} ${p.handle} sticky select ${v.options.join("/")}`, p, v.options, await read(doc(), p), { strictUrl: !canvas })
          }
        }
        /* Add to cart puts the variant chosen in the cart. */
        const want = p.variants.filter((v) => v.available).slice(-1)[0]
        if (!(await open(`/products/${p.handle}`))) return
        await doc().evaluate(() => fetch("/cart/clear.js", { method: "POST" }))
        for (const [pos, value] of want.options.entries()) { await choose(doc(), p, pos, value); await settle(page) }
        await doc().evaluate(() => {
          const main = document.querySelector("main, #MainContent") ?? document.body
          const b = main.querySelector<HTMLButtonElement>("form[action$='/cart/add'] button[name='add'], form[action$='/cart/add'] button[type='submit'], product-form-component button[ref='addToCartButton'], [ref='addToCartButton']")
          b?.click()
        })
        await new Promise((r) => setTimeout(r, 1500))
        await settle(page)
        const cart = await doc().evaluate(async () => (await fetch("/cart.js")).json())
        /* In the canvas, Add to cart fills the builder's cart, read through the frame's own /cart.js. */
        check(`${label} ${p.handle}: Add to cart puts ${want.options.join(" / ")} in the cart`, (cart.items ?? []).some((i: { variant_id?: string }) => i.variant_id === want.id), JSON.stringify((cart.items ?? []).map((i: { variant_id: string; variant_title: string }) => i.variant_title)))
        check(`${label} ${p.handle}: nothing in the console names Shopify or Liquid`, consoleLines.length === 0, consoleLines[0] ?? "")
      }
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
}

async function main() {
  const paths = process.argv.slice(2)
  if (!paths.length) {
    console.log("usage: npx tsx scripts/check-variants25.ts <theme.zip | folder> [...]")
    process.exit(2)
  }
  for (const p of paths) await run(p)
  console.log(failed ? `\n${failed} failed:\n${[...new Set(fails)].slice(0, 60).join("\n")}` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main()
