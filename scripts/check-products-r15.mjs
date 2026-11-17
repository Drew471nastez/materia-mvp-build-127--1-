/**
 * ===========================================================================
 *  PRODUCTS ROUND 15, MEASURED
 * ===========================================================================
 * The owner's requests for /app/products, on a phone (390x844 at 2x) and a
 * computer (1280x800), on the real components:
 *
 *   ADD        the bar's Add is the /app violet with a white plus and word,
 *              and a deeper violet under a hover (scripts/render-products-probe.tsx)
 *   FILTERS    the phone's Filters sheet has no X drawn; its checkboxes fill
 *              with the violet when ticked; Escape closes it, on the phone
 *              and in the computer's dialog
 *   CHOOSER    Create new product (scripts/render-new-product.tsx) is about
 *              15% shorter than the 470px sheet it was, with rows under 100px
 *              and 64px drawings
 *   IMPORT     a tap on Import keeps the sheet's top on screen on every
 *              frame, and raises no keyboard (nothing takes the focus)
 *   DUPLICATE  a preview of a product the store has says "Already in your
 *              products", Skip chosen; Import a copy brings back the type,
 *              a segmented control rather than a <select>
 *
 *   SHOTS_DIR=<dir> node scripts/check-products-r15.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { build } from "esbuild"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
/* The classes measured here are newer than any build: compile the stylesheet over the sources unless told otherwise. */
process.env.PROBE_CSS ??= "source"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".products-r15-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-products-r15-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/products"
const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)

const css = await appCss(root)
const inter = interFaces(root)
async function bundle(entry, out) {
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.products-r15-probe/navigation.js", "next/link": "./.products-r15-probe/link.jsx", "next/image": "./.products-r15-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, out),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, out), "utf8")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
}
const pages = {
  products: await bundle("scripts/render-products-probe.tsx", "products.js"),
  chooser: await bundle("scripts/render-new-product.tsx", "chooser.js"),
}
/* KEEP=1: the two pages, for a look by hand. */
if (process.env.KEEP) for (const [name, html] of Object.entries(pages)) writeFileSync(join(stubs, `${name}.html`), html)

/* The import route, answered in the page: a preview of a product the store already has. */
const FETCH = `
window.__posts = []
const realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  if (url.startsWith("/api/platform/flags")) return json({ communities: false })
  if (url.startsWith("/api/app/products/import/link")) {
    const body = JSON.parse(init.body)
    window.__posts.push(body)
    await new Promise((r) => setTimeout(r, 120))
    if (body.action === "preview") return json({ storeCurrency: "USD", existing: { productId: "p-old", title: "Lightroom Presets: Summer Pack", by: "slug" }, product: { source: "gumroad", externalId: "g1", url: body.url, title: "Lightroom Presets: Summer Pack", descriptionHtml: "", priceCents: 1900, currency: "USD", payWhatYouWant: false, images: [], variants: [], options: [], category: null, tags: [], vendor: null, type: "digital", warnings: ["Downloadable files and private course lessons cannot be fetched from a public link. Upload your files in the editor before publishing."] } })
    return json({ status: "imported", productId: "p-new", imagesFailed: 0 })
  }
  return realFetch(input, init)
}
`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
/* Headless Chromium says it has no pointer and no hover at all; a computer is told it has a mouse. */
const deskBrowser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { width: 1280, height: 800, deviceScaleFactor: 2 }
async function open(page, vp, hash) {
  const p = await (vp.hasTouch ? browser : deskBrowser).newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.evaluateOnNewDocument(FETCH)
  await p.setRequestInterception(true)
  p.on("request", (r) => (new URL(r.url()).pathname === "/__probe" ? r.respond({ status: 200, contentType: "text/html", body: pages[page] }) : r.respond({ status: 404, body: "" })))
  await p.goto(`https://storelib.com/__probe#${hash}`, { waitUntil: "domcontentloaded" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(600)
  return { p, errors }
}
const center = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, sel)
async function tap(p, sel) {
  const c = await center(p, sel)
  if (!c) throw new Error(`nothing at ${sel}`)
  await p.touchscreen.tap(c.x, c.y)
}
const tapText = async (p, scope, text) => {
  const c = await p.evaluate((scope, text) => { const el = [...document.querySelectorAll(`${scope} button, ${scope} label`)].find((b) => b.innerText.trim() === text); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, scope, text)
  if (!c) throw new Error(`no "${text}" in ${scope}`)
  await p.touchscreen.tap(c.x, c.y)
}
const sheetPanel = (p) => p.evaluate(() => { const el = document.querySelector("[data-app-sheet=open] [data-sheet-panel]"); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height), bottom: Math.round(r.bottom) } })

/* ── ADD ─────────────────────────────────────────────────────────────── */
console.log("\nADD")
{
  const { p, errors } = await open("products", PHONE, "many")
  await p.waitForSelector("[data-new-product]")
  const look = await p.evaluate(() => { const a = document.querySelector("[data-new-product]"); const s = getComputedStyle(a); return { bg: s.backgroundColor, color: s.color, icon: getComputedStyle(a.querySelector("svg")).color, h: a.getBoundingClientRect().height, text: a.innerText.trim() } })
  expect(look.bg === "rgb(139, 92, 246)" && look.color === "rgb(255, 255, 255)" && look.icon === "rgb(255, 255, 255)" && look.text === "Add", "Add: the violet, a white plus and word", look)
  const r = await p.evaluate(() => { const b = document.querySelector("[data-new-product]").getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top - 24), width: 390, height: b.height + 48 } })
  await p.screenshot({ path: join(shots, "phone-add.png"), clip: r })
  await p.screenshot({ path: join(shots, "phone-products.png") })
  expect(!errors.length, "no errors on the page", errors)
  await p.close()
  const d = await open("products", DESK, "many")
  await d.p.waitForSelector("[data-new-product]")
  await d.p.hover("[data-new-product]")
  await sleep(400)
  const hover = await d.p.evaluate(() => getComputedStyle(document.querySelector("[data-new-product]")).backgroundColor)
  expect(hover === "rgb(124, 58, 237)", "Add: a deeper violet under the pointer", hover)
  const b = await d.p.evaluate(() => { const r = document.querySelector("[data-new-product]").getBoundingClientRect(); return { x: r.x - 220, y: Math.max(0, r.y - 20), width: r.width + 240, height: r.height + 40 } })
  await d.p.screenshot({ path: join(shots, "desktop-add-hover.png"), clip: b })
  await d.p.close()
}

/* ── FILTERS ─────────────────────────────────────────────────────────── */
console.log("\nFILTERS")
{
  const { p, errors } = await open("products", PHONE, "many")
  await p.waitForSelector("[data-product-filters]")
  await tap(p, "[data-product-filters]")
  await sleep(800)
  const sheet = await sheetPanel(p)
  const xs = await p.evaluate(() => [...document.querySelectorAll("[data-filters-sheet] button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 2 && r.height > 2 && b.querySelector("svg") }).length)
  const closeBtn = await p.evaluate(() => { const b = [...document.querySelectorAll("[data-filters-sheet] button")].find((x) => x.innerText.trim() === "Close"); if (!b) return null; const r = b.getBoundingClientRect(); return { w: r.width, h: r.height } })
  expect(sheet && sheet.bottom === 844 && xs === 0, "the sheet is up, with no X drawn", { sheet, iconButtons: xs })
  expect(closeBtn && closeBtn.w <= 1 && closeBtn.h <= 1, "a Close for a screen reader, out of sight", closeBtn)
  await p.screenshot({ path: join(shots, "phone-filters.png") })
  await tapText(p, "[data-filters-sheet]", "Public")
  await tapText(p, "[data-filters-sheet]", "Available")
  await sleep(350)
  const boxes = await p.evaluate(() => [...document.querySelectorAll("[data-filters-sheet] input[type=checkbox]")].map((i) => ({ on: i.checked, bg: getComputedStyle(i).backgroundColor, w: i.getBoundingClientRect().width })))
  expect(boxes.filter((b) => b.on).every((b) => b.bg === "rgb(139, 92, 246)") && boxes.filter((b) => !b.on).every((b) => b.bg === "rgb(255, 255, 255)") && boxes.filter((b) => b.on).length === 2, "ticked boxes fill with the violet, the others stay white", boxes)
  await p.screenshot({ path: join(shots, "phone-filters-ticked.png") })
  await p.keyboard.press("Escape")
  await sleep(700)
  expect(!(await sheetPanel(p)), "Escape closes the sheet")
  expect(!errors.length, "no errors on the page", errors)
  await p.close()
  const d = await open("products", DESK, "many")
  await d.p.waitForSelector("[data-product-filters]")
  await d.p.click("[data-product-filters]")
  await sleep(500)
  const dialog = await d.p.evaluate(() => { const el = document.querySelector("[data-filters-sheet]"); return el ? { w: Math.round(el.getBoundingClientRect().width), x: [...el.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 2 && b.querySelector("svg")).length } : null })
  expect(dialog && dialog.x === 0, "the computer's dialog: no X either", dialog)
  await d.p.screenshot({ path: join(shots, "desktop-filters.png") })
  await d.p.keyboard.press("Escape")
  await sleep(400)
  expect(!(await d.p.$("[data-filters-sheet]")), "Escape closes the dialog")
  await d.p.close()
}

/* ── CHOOSER, IMPORT, DUPLICATE ──────────────────────────────────────── */
console.log("\nCHOOSER")
{
  const { p, errors } = await open("chooser", PHONE, "sheet")
  await tap(p, "[data-new-product]")
  await sleep(900)
  const sheet = await sheetPanel(p)
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-new-product-chooser] [data-kind]")].map((b) => ({ kind: b.dataset.kind, h: Math.round(b.getBoundingClientRect().height), art: Math.round((b.querySelector("svg, [aria-hidden]")?.getBoundingClientRect().width) ?? 0) })))
  const BEFORE = 470
  expect(sheet && sheet.height <= BEFORE * 0.88 && sheet.height >= BEFORE * 0.8, `about 15% shorter than the ${BEFORE}px sheet it was`, { height: sheet?.height, shorter: sheet ? `${Math.round((1 - sheet.height / BEFORE) * 100)}%` : null })
  expect(rows.every((r) => r.h < 100 && r.h >= 56), "rows under 100px, still a full press", rows)
  await p.screenshot({ path: join(shots, "phone-chooser.png") })
  await p.screenshot({ path: join(shots, "phone-chooser-art.png"), clip: { x: 16, y: sheet.top + 60, width: 120, height: sheet.height - 80 } })

  console.log("\nIMPORT")
  await p.evaluate(() => {
    window.__tops = []
    const t0 = performance.now()
    const tick = () => {
      const el = document.querySelector("[data-app-sheet=open] [data-sheet-panel]")
      const r = el?.getBoundingClientRect()
      if (r) window.__tops.push(Math.round(r.top))
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await tap(p, "[data-import-products]")
  await sleep(1600)
  const tops = await p.evaluate(() => window.__tops)
  const focus = await p.evaluate(() => document.activeElement?.tagName)
  expect(Math.min(...tops) >= 0, "the sheet's top stays on screen on every frame after Import", { min: Math.min(...tops), max: Math.max(...tops), frames: tops.length })
  expect(focus !== "INPUT", "no field takes the focus by itself on a phone (no keyboard)", focus)
  await p.screenshot({ path: join(shots, "phone-import.png") })

  console.log("\nDUPLICATE")
  await tap(p, "#product-import-url")
  await p.keyboard.type("https://seller.gumroad.com/l/summer-presets")
  await tapText(p, "[data-link-import]", "Continue")
  await sleep(700)
  const dup = await p.evaluate(() => ({ said: document.querySelector("[data-import-duplicate]")?.innerText.split("\n")[0], chosen: document.querySelector("[data-import-duplicate] [aria-checked=true]")?.textContent, select: !!document.querySelector("[data-link-import] select"), action: [...document.querySelectorAll("[data-link-preview] > button")].map((b) => b.innerText.trim()) }))
  expect(dup.said === "Already in your products" && dup.chosen === "Skip" && dup.action[0] === "Open product", "Already in your products, Skip chosen, Open product", dup)
  const top1 = await sheetPanel(p)
  expect(top1 && top1.top >= 0, "the sheet's top is on screen with the preview", top1)
  await p.screenshot({ path: join(shots, "phone-import-duplicate.png") })
  await tapText(p, "[data-import-duplicate]", "Import a copy")
  await sleep(400)
  const copy = await p.evaluate(() => ({ segmented: [...document.querySelectorAll("[data-link-preview] [role=radiogroup]")].map((g) => g.getAttribute("aria-label")), select: !!document.querySelector("[data-link-import] select"), action: [...document.querySelectorAll("[data-link-preview] > button")].map((b) => b.innerText.trim()) }))
  expect(copy.segmented.includes("Product type") && !copy.select && copy.action[0] === "Import a copy as draft", "Import a copy: the type as a segmented control, no <select>", copy)
  const top2 = await sheetPanel(p)
  expect(top2 && top2.top >= 0, "the sheet's top is on screen with the type shown", top2)
  await p.screenshot({ path: join(shots, "phone-import-copy.png") })
  await tapText(p, "[data-link-preview]", "Import a copy as draft")
  await sleep(500)
  const posted = await p.evaluate(() => window.__posts.at(-1))
  expect(posted?.action === "import" && posted.copy === true, "the import asks for a copy", posted)
  expect(!errors.length, "no errors on the page", errors)
  await p.close()

  const d = await open("chooser", DESK, "sheet")
  await d.p.click("[data-new-product]")
  await sleep(500)
  await d.p.screenshot({ path: join(shots, "desktop-chooser.png") })
  await d.p.click("[data-import-products]")
  await sleep(400)
  const deskFocus = await d.p.evaluate(() => document.activeElement?.id)
  expect(deskFocus === "product-import-url", "a computer's cursor goes straight to the link", deskFocus)
  await d.p.screenshot({ path: join(shots, "desktop-import.png") })
  await d.p.close()
}

await browser.close()
await deskBrowser.close()
console.log(`\nscreenshots in ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
