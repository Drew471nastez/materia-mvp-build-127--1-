/**
 * ===========================================================================
 *  THE OFFERS GUIDE'S SCREENSHOTS, TAKEN FROM THE REAL SCREENS
 * ===========================================================================
 * Each picture in public/help/offers/ is a real component
 * (scripts/render-help-offer-shots.tsx) mounted outside Next with every /api
 * request answered from made up demo data priced by lib/offers itself, drawn
 * by Playwright's Chromium at 2x in light mode, cropped to the part an
 * article is about, and saved as WebP. Then lib/help/offer-shots.ts is
 * written with every picture's size, which the articles read.
 *
 *   node scripts/help-offer-shots.mjs                 every picture
 *   node scripts/help-offer-shots.mjs offers-list     only these (comma separated)
 *
 * Bundled the way scripts/help-shots.mjs bundles scripts/render-help-shots.tsx.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
/* Playwright's Chromium, as installed on the machine (it is not a dependency of this project); CHROMIUM names another Chromium. */
const { chromium } = createRequire(import.meta.url)("playwright")
const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null
const dest = join(root, "public/help/offers")
mkdirSync(dest, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── Build ─────────────────────────────────────────────────────────────── */

const out = join(root, ".help-offer-shots-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, sizes, quality, placeholder, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...rest.style } : rest.style }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-help-offer-shots.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="usd"', '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
    `--alias:server-only=${join(out, "empty.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "inherit", "inherit"] })
} catch (e) {
  rmSync(out, { recursive: true, force: true })
  throw e
}
/*
  Storelib's Featured products section, drawn by the theme engine here in Node
  (the browser bundle above has no engine) with the demo's mug, bowl and apron,
  and handed to the page as window.__featured.
*/
const featuredSection = execFileSync("npx", ["tsx", "-e", `
  const { renderStorelibSection } = require(${JSON.stringify(join(root, "lib/website-builder/storelib-runtime.ts"))})
  const demo = [["0f3a9c2e-2222-4222-8333-444455556666", "Speckled mug", "speckled-mug", 3200, "#efe6da"], ["0f3a9c2e-3333-4222-8333-444455556666", "Serving bowl", "serving-bowl", 4400, "#e9e5df"], ["0f3a9c2e-4444-4222-8333-444455556666", "Linen apron", "linen-apron", 3800, "#e6e8ea"]]
  const cards = demo.map(([id, title, slug, cents, bg]) => ({ id, type: "product", settings: { title, price: "$" + (cents / 100).toFixed(2), compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540"><rect width="720" height="540" fill="' + bg + '"/></svg>'), url: "/products/" + slug, slug, kind: "physical", available: true, tag: "", checkout_url: "/checkout?productId=" + id + "&src=website", variants: [] } }))
  const r = renderStorelibSection({ id: "featured", type: "product_featured", name: "Featured Products", settings: { source: "shop", product_count: 3, heading: "From the studio", show_rating: false }, blocks: [] }, {}, { template: "index" }, undefined, cards, { catalog: cards })
  process.stdout.write(JSON.stringify(r.ok ? { html: r.html, css: r.css } : { html: "", css: "" }))
`], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
const css = await appCss(root)
/* Inter from a build when there is one; otherwise the Inter installed on the machine, by its name. */
const inter = interFaces(root).replace(/url\(file:\/\/[^)]*\/static\/media\//g, "url(/media/")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}</style></head><body><div id="app"></div><script>window.__featured=${featuredSection.replace(/</g, "\\u003c")}</script><script src="/probe.js"></script></body></html>`
const bundle = readFileSync(join(out, "probe.js"))
rmSync(out, { recursive: true, force: true })

const server = createServer((req, res) => {
  const p = req.url.split("?")[0]
  if (p === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* ── The pictures ──────────────────────────────────────────────────────── */

const HELPERS = `
window.__press = (text, nth = 0) => {
  const b = [...document.querySelectorAll("button, [role=radio], [role=tab], a")].filter((e) => e.textContent.trim() === text || e.getAttribute("aria-label") === text)[nth]
  if (b) b.click()
  return !!b
}
window.__rect = (els, pad = 12) => {
  els = els.filter(Boolean)
  if (!els.length) return null
  const rs = els.map((e) => e.getBoundingClientRect())
  const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - pad), y = Math.max(0, Math.min(...rs.map((r) => r.top)) + scrollY - pad)
  return { x, y, width: Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + pad) - x, height: Math.max(...rs.map((r) => r.bottom)) + scrollY + pad - y }
}
/* A dialog on its own, drawn at full height instead of scrolling inside itself, on the page's grey. */
window.__wholeDialog = (pad = 16) => {
  const d = document.querySelector("[role=dialog]")
  if (!d) return null
  document.activeElement?.blur?.()
  for (const el of [d, ...d.querySelectorAll("*")]) { const cs = getComputedStyle(el); if (cs.overflowY === "auto" || cs.overflowY === "scroll") el.style.overflowY = "visible"; if (cs.maxHeight !== "none") el.style.maxHeight = "none"; if (el !== d && cs.height !== "auto" && el.scrollHeight > el.clientHeight + 1) el.style.height = "auto" }
  d.style.maxHeight = "none"; d.style.height = "auto"; d.style.top = "16px"; d.style.translate = "-50% 0"; d.style.transform = "none"
  for (const el of document.body.querySelectorAll("*")) if (!el.contains(d) && !d.contains(el)) el.style.visibility = "hidden"
  for (let n = d.parentElement; n && n !== document.body; n = n.parentElement) { n.style.background = "transparent"; n.style.backdropFilter = "none" }
  document.documentElement.style.background = document.body.style.background = "#f8f9fa"
  return window.__rect([d], pad)
}
`
const sel = (...selectors) => (p) => p.evaluate((s) => window.__rect(s.map((x) => document.querySelector(x)), 16), selectors)
const openRow = (id) => async (p) => { await p.evaluate((i) => document.querySelector(`table [data-row="${i}"] td`)?.click(), id); await wait(900) }
const O = (n) => `a1000000-0000-4000-8000-00000000000${n}`

const SHOTS = [
  { name: "offers-list", view: "list", width: 1200, height: 760, clip: sel("#shot h1", "[data-offers-card]") },
  { name: "offers-list-phone", view: "list", width: 390, height: 844, phone: true, clip: sel("#shot h1", "[data-offers-card]") },
  { name: "offers-empty", view: "empty", width: 1100, height: 700, clip: sel("#shot h1", "[data-offers-card]") },
  { name: "offer-new", view: "list", width: 1100, height: 1400, act: [async (p) => { await p.evaluate(() => document.querySelector("[data-offer-new]")?.click()); await wait(900) }], clip: (p) => p.evaluate(() => window.__wholeDialog()) },
  { name: "offer-upsell-editor", view: "list", width: 1100, height: 1700, act: [openRow(O(2))], clip: (p) => p.evaluate(() => window.__wholeDialog()) },
  { name: "offer-bundle-editor", view: "list", width: 1100, height: 1500, act: [openRow(O(1))], clip: (p) => p.evaluate(() => window.__wholeDialog()) },
  { name: "offer-quantity-break-editor", view: "list", width: 1100, height: 2000, act: [openRow(O(3))], clip: (p) => p.evaluate(() => window.__wholeDialog()) },
  {
    name: "offer-try-cart", view: "list", width: 1100, height: 2000,
    act: [openRow(O(3)), async (p) => { await p.evaluate(() => document.querySelector("[data-try-price]")?.click()); await wait(900) }],
    clip: async (p) => { await p.evaluate(() => window.__wholeDialog()); return p.evaluate(() => window.__rect([document.querySelector("[data-try-cart]")], 6)) },
  },
  { name: "product-page-offers", view: "product", width: 1100, height: 1200, settle: 1800, clip: sel("#shot") },
  { name: "product-page-offers-phone", view: "product", width: 390, height: 844, phone: true, grow: false, settle: 1800, clip: sel("[data-offers-block]") },
  { name: "featured-products-offers", view: "featured", width: 1200, height: 1400, settle: 2400, clip: sel("#shot section") },
  { name: "cart-page-offers", view: "cart", width: 1100, height: 1100, settle: 2200, clip: sel("#shot main, #shot > div") },
  { name: "checkout-offers", view: "checkout", width: 1200, height: 1100, settle: 2200, clip: async () => ({ x: 80, y: 96, width: 480, height: 716 }) },
]

const browser = await chromium.launch({ args: ["--hide-scrollbars"], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
for (const s of SHOTS) {
  if (only && !only.has(s.name)) continue
  const context = await browser.newContext({ viewport: { width: s.width, height: s.height ?? 900 }, deviceScaleFactor: 2, isMobile: !!s.phone, hasTouch: !!s.phone, colorScheme: "light", reducedMotion: "reduce" })
  const page = await context.newPage()
  await page.addInitScript(HELPERS)
  const errs = []
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)))
  await page.goto(`${base}/?view=${s.view}${s.q ? "&" + s.q : ""}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(s.settle ?? 1400)
  try {
    for (const a of s.act ?? []) await a(page)
    let clip = await s.clip(page)
    /* A dialog is fixed to the window: one taller than it is drawn whole only in a window as tall. */
    if (clip && clip.y + clip.height > (s.height ?? 900) && s.grow !== false) {
      await page.setViewportSize({ width: s.width, height: Math.ceil(clip.y + clip.height + 24) })
      await wait(500)
      clip = await s.clip(page)
    }
    if (!clip || clip.width <= 0 || clip.height <= 0) throw new Error("nothing to crop to")
    const png = await page.screenshot({ clip, type: "png", fullPage: true })
    const file = join(dest, `${s.name}.webp`)
    const info = await sharp(png).webp({ quality: 80, effort: 6 }).toFile(file)
    console.log(`ok   ${s.name} ${info.width}x${info.height} ${Math.round(info.size / 1024)}KB${errs.length ? "  errors: " + errs.join(" | ") : ""}`)
  } catch (e) {
    console.log(`FAIL ${s.name}: ${e.message}${errs.length ? "  errors: " + errs.join(" | ") : ""}`)
  }
  await context.close()
}
await browser.close()
server.close()

/* ── The size table the articles read ──────────────────────────────────── */

const rows = []
for (const f of readdirSync(dest).filter((f) => f.endsWith(".webp")).sort()) {
  const m = await sharp(join(dest, f)).metadata()
  rows.push(`  "${f.slice(0, -5)}": [${Math.round(m.width / 2)}, ${Math.round(m.height / 2)}],`)
}
writeFileSync(join(root, "lib/help/offer-shots.ts"), `/**
 * ===========================================================================
 *  THE OFFERS GUIDE'S SCREENSHOTS, AND THEIR SIZES
 * ===========================================================================
 * Every picture in public/help/offers/, with its size in CSS pixels (the
 * files are 2x), so an article's image keeps its space while it loads.
 *
 * HOW THEY ARE MADE. Each is the real component (Products › Upsells and
 * bundles and its editor, Storelib's product section blocks, the website's
 * cart page and checkout) mounted outside Next with every /api request
 * answered from made up demo data, a ceramics studio called Fern & Clay,
 * and every price in them worked out by lib/offers. Written by
 * scripts/help-offer-shots.mjs (scripts/render-help-offer-shots.tsx); when
 * a screen changes, run it again.
 *
 * tests/help-offers.test.ts checks every name here has its file and every
 * file is used by an article.
 */
export const OFFER_SHOTS = {
${rows.join("\n")}
} as const satisfies Record<string, readonly [number, number]>
`)
console.log(`${rows.length} pictures, sizes in lib/help/offer-shots.ts`)
