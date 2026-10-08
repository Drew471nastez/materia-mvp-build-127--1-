/**
 * ===========================================================================
 *  THE CANVAS KEEPS WHAT A SETTING DID NOT CHANGE
 * ===========================================================================
 * A product grid in the builder kept its names and prices and lost every
 * photo the moment a setting moved in the sidebar: the new markup was applied
 * over the old (lib/website-builder/morph-html.ts) and took off the mark that
 * says a picture has loaded (lib/website-builder/media-fade.ts), and the
 * theme's stylesheet faded every unmarked picture to nothing. A section with
 * its own cart lost its count and its lines the same way, because the hooks
 * wrote them into the markup before it was replaced.
 *
 * Held here on the real canvas pieces (scripts/render-canvas-stability.tsx),
 * in headless Chromium, with pictures served slowly as a network would:
 *
 *   LOADED      every product card in an agent's grid and a built-in grid
 *               shows its photo
 *   SETTINGS    thirty quick changes (columns, gap, card, heading, shape,
 *               price on and off, colour): no photo drops below full opacity
 *               on any frame, and the <img> elements are the same ones, not
 *               decoded again
 *   THEME       a theme setting changed: the same
 *   REFETCH     the product list loaded again (new objects, same products)
 *   STRUCTURE   reorder, duplicate, remove, undo: every card in place, every
 *               photo shown
 *   WIDTHS      a phone, then a laptop
 *   CART        a section's own cart keeps its count, its lines and its
 *               filled state through a change to its own settings and to
 *               another section's
 *
 *   node scripts/check-canvas-stability.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".canvas-stability-probe")
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://shop.example"

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "empty.js"), "export {}\n")
  /* The bundler the editor ships with supplies node:crypto in the browser; this is the same hash's shape, for the compile cache's key. */
  writeFileSync(join(stubs, "crypto.js"), `export function createHash() { let s = ""; return { update(v) { s += v; return this }, digest() { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(16) + s.length.toString(16) } } }\n`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-canvas-stability.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.canvas-stability-probe/navigation.js", "next/link": "./.canvas-stability-probe/link.jsx", "server-only": "./.canvas-stability-probe/empty.js", "node:crypto": "./.canvas-stability-probe/crypto.js" },
    /* Next supplies process.env and Buffer in the browser; the compiler measures a file's bytes with Buffer.byteLength. */
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};var Buffer={byteLength:function(s){return new TextEncoder().encode(String(s)).length}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  }).catch(async (e) => {
    throw e
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const sources = {
    "sections/ai_product_grid.storelib": readFileSync(join(root, "scripts/fixtures/ai-product-grid.storelib"), "utf8"),
    "sections/own_cart.storelib": readFileSync(join(root, "scripts/fixtures/own-cart.storelib"), "utf8"),
  }
  const probe = JSON.stringify({ sources }).replace(/</g, "\\u003c")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="app"></div><script>window.__PROBE__=${probe}</script><script src="/app.js"></script></body></html>`

  /* Six photos, each its own colour, served a little slowly. */
  const photos = {}
  for (let i = 1; i <= 6; i++) {
    photos[i] = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 40 * i, g: 200 - 20 * i, b: 90 } } }).png().toBuffer()
  }
  const photoFor = (url) => {
    const m = decodeURIComponent(url).match(/\/img\/p(\d)\.png/)
    return m ? photos[Number(m[1])] : null
  }

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const p = await browser.newPage()
  await p.setViewport({ width: 1280, height: 2400 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  let imageRequests = 0
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const url = r.url()
    if (url === `${ORIGIN}/`) return void r.respond({ status: 200, contentType: "text/html", body: html })
    /* Its own file: the compiler's own strings hold markup an inline script would end early on. */
    if (url === `${ORIGIN}/app.js`) return void r.respond({ status: 200, contentType: "text/javascript", body: js })
    const photo = photoFor(url)
    if (photo) {
      imageRequests++
      await sleep(120)
      return void r.respond({ status: 200, contentType: "image/png", body: photo, headers: { "cache-control": "max-age=3600" } })
    }
    return void r.respond({ status: 204, body: "" })
  })
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
  await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
  await sleep(1200)
  expect((await p.evaluate(() => window.__render)) === "ok", "the canvas is drawn by the real pieces", errors)

  /* What every product card in a section shows, measured. */
  const cards = (sectionId) =>
    p.evaluate((id) => {
      const box = document.querySelector(`[data-section-id="${id}"]`)
      if (!box) return null
      return [...box.querySelectorAll('[data-card="product"]')].map((card) => {
        const img = card.querySelector("img")
        return {
          title: card.querySelector("h3")?.textContent ?? "",
          src: img?.getAttribute("src") ?? "",
          loaded: !!img && img.complete && img.naturalWidth > 0,
          marked: !!img?.hasAttribute("data-sl-loaded"),
          opacity: img ? getComputedStyle(img).opacity : "none",
        }
      })
    }, sectionId)
  const allShown = (list) => Array.isArray(list) && list.length > 0 && list.every((c) => c.src && c.loaded && c.marked && c.opacity === "1")
  const shownIn = async (ids, label) => {
    await sleep(700)
    for (const id of ids) {
      const list = await cards(id)
      expect(allShown(list) && list.length === 6, `${label}: every card in ${id} shows its photo`, list?.filter((c) => !(c.src && c.loaded && c.marked && c.opacity === "1")).slice(0, 3) ?? "missing")
    }
  }

  if (process.env.PROBE_DEBUG) console.log(await p.evaluate(() => [...document.querySelectorAll("[data-probe-root] > *")].map((e) => e.outerHTML.slice(0, 600)).join("\n---\n")))
  console.log("\nLOADED")
  await shownIn(["ai-grid", "built-grid"], "first paint")
  const titles = (await cards("ai-grid")).map((c) => c.title)
  expect(titles.join() === "Product 1,Product 2,Product 3,Product 4,Product 5,Product 6", "the agent's grid draws the shop's real products", titles)

  /* Tags each picture, then samples every frame: the lowest opacity any already-loaded picture reached. */
  const startWatch = () =>
    p.evaluate(() => {
      const imgs = [...document.querySelectorAll('[data-card="product"] img')]
      imgs.forEach((img, i) => { img.__probe = i })
      const w = { min: 1, frames: 0, imgs, run: true }
      const tick = () => {
        if (!w.run) return
        w.frames++
        for (const img of document.querySelectorAll('[data-card="product"] img')) {
          if (img.__probe === undefined) continue
          const o = Number(getComputedStyle(img).opacity)
          if (o < w.min) w.min = o
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      window.__watch = w
    })
  const stopWatch = () =>
    p.evaluate(() => {
      const w = window.__watch
      w.run = false
      const now = [...document.querySelectorAll('[data-card="product"] img')]
      return { min: w.min, frames: w.frames, same: now.filter((img) => img.__probe !== undefined).length, total: now.length }
    })

  console.log("\nSETTINGS, thirty quick changes")
  await startWatch()
  const changes = [
    ["ai-grid", { columns: { desktop: 4, mobile: 2 } }], ["ai-grid", { gap: 24 }], ["ai-grid", { card_style: "bordered" }],
    ["ai-grid", { heading: "New" }], ["ai-grid", { heading: "New arrivals" }], ["ai-grid", { ratio: "3 / 4" }],
    ["ai-grid", { show_price: false }], ["ai-grid", { show_price: true }], ["ai-grid", { heading_color: "#aa3300" }],
    ["ai-grid", { padding_top: 80 }], ["built-grid", { columns: { desktop: 4, tablet: 2, mobile: 2 } }], ["built-grid", { shape: "3 / 4" }],
    ["built-grid", { heading: "Shop all" }], ["built-grid", { show_price: false }], ["built-grid", { show_price: true }],
  ]
  const imagesBefore = imageRequests
  for (let round = 0; round < 2; round++) {
    for (const [id, patch] of changes) {
      await p.evaluate((id, patch) => window.__canvas.setting(id, patch), id, patch)
      await sleep(16)
    }
  }
  await sleep(300)
  const s1 = await stopWatch()
  expect(s1.min === 1, "no photo dropped below full opacity on any frame", s1)
  expect(s1.same === s1.total && s1.total === 12, "the <img> elements are the same ones: nothing decoded again", s1)
  expect(imageRequests === imagesBefore, "and no photo was fetched again", { before: imagesBefore, after: imageRequests })
  await shownIn(["ai-grid", "built-grid"], "after the changes")

  console.log("\nTHEME")
  await startWatch()
  await p.evaluate(() => window.__canvas.theme({ button_style: "outline", page_width: 1100 }))
  await sleep(200)
  const s2 = await stopWatch()
  expect(s2.min === 1 && s2.same === s2.total, "a theme setting changes nothing about the photos", s2)
  await shownIn(["ai-grid", "built-grid"], "after the theme")

  console.log("\nREFETCH")
  await startWatch()
  await p.evaluate(() => window.__canvas.refetch(1))
  await sleep(200)
  const s3 = await stopWatch()
  expect(s3.min === 1 && s3.same === s3.total, "the product list loaded again keeps every photo", s3)
  await shownIn(["ai-grid", "built-grid"], "after a refetch")

  console.log("\nSTRUCTURE")
  await p.evaluate(() => window.__canvas.reorder())
  await shownIn(["ai-grid", "built-grid"], "reordered")
  await p.evaluate(() => window.__canvas.duplicate("ai-grid"))
  await shownIn(["ai-grid", "ai-grid-copy", "built-grid"], "duplicated")
  await p.evaluate(() => window.__canvas.setting("ai-grid-copy", { heading: "The copy" }))
  const original = await p.evaluate(() => document.querySelector('[data-section-id="ai-grid"] h2')?.textContent)
  expect(original === "New arrivals", "a change to the copy leaves the original alone", original)
  await p.evaluate(() => window.__canvas.remove("built-grid"))
  await shownIn(["ai-grid", "ai-grid-copy"], "one removed")
  await p.evaluate(() => { window.__canvas.undo(); window.__canvas.undo(); window.__canvas.undo() })
  await shownIn(["ai-grid", "built-grid"], "three undos")
  const back = await p.evaluate(() => [...document.querySelectorAll("[data-section-id]")].map((el) => el.getAttribute("data-section-id")))
  expect(back.join() === "built-grid,ai-grid,own-cart-1", "undo brings back the order and the sections", back)

  console.log("\nWIDTHS")
  await p.setViewport({ width: 390, height: 2400 })
  await shownIn(["ai-grid", "built-grid"], "a phone")
  await p.setViewport({ width: 1440, height: 2400 })
  await shownIn(["ai-grid", "built-grid"], "a laptop")

  console.log("\nCART")
  const cart = () =>
    p.evaluate(() => ({
      count: document.querySelector("[data-storelib-cart-count]")?.textContent,
      lines: document.querySelectorAll("[data-storelib-cart-line-item]").length,
      empty: document.querySelector("[data-storelib-cart-empty]")?.hidden,
      filled: document.querySelector("[data-storelib-cart-filled]")?.hidden,
      add: document.querySelector("[data-storelib-add-to-cart]")?.textContent,
    }))
  await p.evaluate(() => document.querySelector('[data-section-id="own-cart-1"] [data-storelib-add-to-cart]').click())
  await sleep(150)
  let c = await cart()
  expect(c.count === "1" && c.lines === 1 && c.empty === true && c.filled === false, "a product added: the count, the line and the filled state", c)
  await p.evaluate(() => window.__canvas.setting("own-cart-1", { add_label: "Add it" }))
  await sleep(150)
  c = await cart()
  expect(c.add === "Add it", "the section's own setting changed", c.add)
  expect(c.count === "1" && c.lines === 1 && c.empty === true && c.filled === false, "and its cart kept its count, its line and its filled state", c)
  await p.evaluate(() => window.__canvas.setting("ai-grid", { heading: "Another change" }))
  await sleep(150)
  c = await cart()
  expect(c.count === "1" && c.lines === 1 && c.empty === true && c.filled === false, "a change to another section leaves the cart alone", c)

  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
