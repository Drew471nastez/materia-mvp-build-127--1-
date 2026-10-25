/**
 * ===========================================================================
 *  ADD BLOCK IN AN IMPORTED THEME: THE PREVIEW IS THE BLOCK, MEASURED
 * ===========================================================================
 * The block library used to draw each block of an imported theme by drawing
 * its whole section (a main product section: gallery, form, every block)
 * and cropping. Now it draws the block from its own markup
 * (components/website-builder/compat/compat-section-preview.tsx blockMarkup).
 * This renders that markup in headless Chromium inside the theme's own CSS,
 * at the canvas width, and measures:
 *
 *   DRAWN     how long blockMarkup takes for each block, in Node
 *   ALONE     the document holds the block and nothing of the section: no
 *             gallery, no other block, and the page is no taller than the
 *             block plus its wrapper's padding
 *   STYLED    the theme's CSS applies to it (its colour and size from the
 *             theme's stylesheet)
 *   FALLBACK  a block with no markup of its own answers null (the icon)
 *
 * Run with:  npx tsx scripts/check-compat-block-preview.mjs
 */
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { existsSync } from "node:fs"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme.ts"
import { blockMarkup } from "../components/website-builder/compat/compat-section-preview.tsx"

const schema = (o) => `\n\n<schema>\n${JSON.stringify(o)}\n</schema>\n`
const CSS = ".t{color:rgb(200, 30, 60);font-size:40px;margin:0;line-height:48px}.price{font-size:20px;line-height:24px;margin:0}.gallery{height:900px}"
const files = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head><style>${CSS}</style>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
  "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="main"><div class="gallery">GALLERY</div>{%- for block in section.blocks -%}{%- case block.type -%}{%- when 'title' -%}<h1 class="t" {{ block.shopify_attributes }}>{{ product.title }}</h1>{%- when 'price' -%}<p class="price" {{ block.shopify_attributes }}>{{ product.price | money }}</p>{%- when 'inline' -%}{%- endcase -%}{%- endfor -%}</div>`)}${schema({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [{ type: "title", name: "Title" }, { type: "price", name: "Price" }, { type: "inline", name: "Inline" }] } })}`,
}
const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
const card = { id: "p1", settings: { title: "Classic tee", slug: "classic-tee", url: "/products/classic-tee", price: "$48.00", available: true } }
const page = { designMode: true, products: [card], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, template: "index", path: "/" }

const results = []
let failed = 0
const say = (ok, line) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`)
}

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
  ;({ chromium } = require(join(globalRoot, "playwright")))
}
const exe = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH].find((p) => p && existsSync(p) && !p.endsWith("/chromium"))
const browser = await chromium.launch(exe ? { executablePath: exe } : {})
const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } })
for (const type of ["title", "price"]) {
  const t0 = performance.now()
  const html = blockMarkup(theme, page, "main-product", { id: "block-picker-preview", type, settings: {} }, files, 1200, 800)
  const ms = performance.now() - t0
  await tab.setContent(`<!doctype html><html><head><style>${CSS}html,body{margin:0}</style></head><body><main>${html}</main></body></html>`)
  const m = await tab.evaluate(() => {
    const b = document.querySelector('[data-block-id="block-picker-preview"]')
    const r = b?.getBoundingClientRect()
    return { found: !!b, w: r?.width ?? 0, h: r?.height ?? 0, page: Math.round(document.body.getBoundingClientRect().height), gallery: !!document.querySelector(".gallery"), others: document.querySelectorAll("[data-block-id]").length, color: b ? getComputedStyle(b).color : "", size: b ? getComputedStyle(b).fontSize : "" }
  })
  results.push({ type, ms: Number(ms.toFixed(2)), ...m })
  console.log(`\n${type}: drawn in ${ms.toFixed(2)} ms, block ${m.w}x${m.h}, page ${m.page}px tall, colour ${m.color}, ${m.size}`)
  say(ms < 50, "DRAWN under 50 ms")
  say(m.found && m.w > 0 && m.h > 0, "the block is painted")
  say(!m.gallery && m.others === 1, "ALONE: no gallery, no other block")
  say(m.page <= m.h + 2, `ALONE: the page is the block's height (${m.page} vs ${m.h})`)
  if (type === "title") say(m.color === "rgb(200, 30, 60)" && m.size === "40px", "STYLED: the theme's CSS applies")
}
const none = blockMarkup(theme, page, "main-product", { id: "x", type: "inline", settings: {} }, files, 1200, 800)
say(none === null, "FALLBACK: a block with nothing of its own answers null (icon)")
await browser.close()
console.log(`\n${JSON.stringify(results)}`)
console.log(failed ? `\n${failed} failed` : "\nall measured")
process.exit(failed ? 1 : 0)
