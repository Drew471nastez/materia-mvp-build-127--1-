/**
 * ===========================================================================
 *  THE HELP CENTER'S SCREENSHOTS, TAKEN FROM THE REAL SCREENS
 * ===========================================================================
 * Each picture in public/help/physical/ is a real component
 * (scripts/render-help-shots.tsx) mounted outside Next with every /api
 * request answered from made up demo data, drawn by Chromium at 2x in light
 * mode (Website settings is the builder's own dark screen), cropped to the
 * part an article is about, and saved as WebP. Then lib/help/physical-shots.ts
 * is written with every picture's size, which the articles read.
 *
 *   node scripts/help-shots.mjs                 every picture
 *   node scripts/help-shots.mjs taxes-settings  only these (comma separated)
 *
 * Bundled the way scripts/check-physical-commerce.mjs bundles
 * scripts/render-physical.tsx. The text is drawn in Inter when a production
 * build is there to take it from (this checkout's or, in a worktree, the main
 * one's), and in the fallback face otherwise.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const dest = join(root, "public/help/physical")
mkdirSync(dest, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── Build ─────────────────────────────────────────────────────────────── */

/* Inside the checkout, so the stand-ins resolve react from its node_modules; removed once bundled. */
const out = join(root, ".help-shots-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-help-shots.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"',
  /* Public settings a screen reads at build time: placeholders, never a real key. */
  '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="usd"', '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
  `--alias:server-only=${join(out, "empty.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "inherit", "inherit"] })
const css = await appCss(root)
/* Inter's faces point at a build's media folder on disk; the page is served over http, so they are served from there too. */
const faces = interFaces(root)
const mediaDir = faces.match(/url\(file:\/\/([^)]*\/static\/media)\//)?.[1] ?? null
const inter = faces.replace(/url\(file:\/\/[^)]*\/static\/media\//g, "url(/media/")
if (!inter) console.log("(no build to take Inter from: the pictures use the fallback face)")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
const bundle = readFileSync(join(out, "probe.js"))
rmSync(out, { recursive: true, force: true })

const server = createServer((req, res) => {
  const p = req.url.split("?")[0]
  if (p.startsWith("/media/") && mediaDir && /^[\w.-]+$/.test(p.slice(7))) { try { res.writeHead(200, { "content-type": "font/woff2" }); return res.end(readFileSync(join(mediaDir, p.slice(7)))) } catch { res.writeHead(404); return res.end() } }
  if (p === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  /* The site's own public files the screens ask for: the flags sprite, the integrations' marks. */
  const file = join(root, "public", p)
  if (/^\/(flags|integrations|images\/brand)\/[\w.-]+$/.test(p) && existsSync(file)) { res.writeHead(200, { "content-type": p.endsWith(".svg") ? "image/svg+xml" : p.endsWith(".webp") ? "image/webp" : "image/png" }); return res.end(readFileSync(file)) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* ── The pictures ──────────────────────────────────────────────────────── */

/* In the page: helpers to find cards by their title and press buttons by their words. */
const HELPERS = `
window.__card = (title) => {
  const el = [...document.querySelectorAll("h1,h2,h3,p,span,div")].find((e) => e.children.length <= 2 && e.textContent.trim() === title)
  return el ? el.closest(".rounded-2xl, section") : null
}
window.__cardHas = (text) => {
  const el = [...document.querySelectorAll("p,span,div")].find((e) => e.children.length === 0 && e.textContent.trim().startsWith(text))
  return el ? el.closest(".rounded-2xl, section") : null
}
window.__press = (text, nth = 0) => {
  const b = [...document.querySelectorAll("button, [role=radio], a")].filter((e) => e.textContent.trim() === text || e.getAttribute("aria-label") === text)[nth]
  if (b) b.click()
  return !!b
}
/* A dialog on its own: everything else on the page, the dimmed backdrop too, is hidden, the caret is put away, and the crop is the dialog's white panel on the page's own grey. */
window.__dialog = (pad = 16) => {
  const d = document.querySelector("[role=dialog]")
  if (!d) return null
  document.activeElement?.blur?.()
  for (const el of document.body.querySelectorAll("*")) if (!el.contains(d) && !d.contains(el)) el.style.visibility = "hidden"
  for (let n = d.parentElement; n && n !== document.body; n = n.parentElement) { n.style.background = "transparent"; n.style.backdropFilter = "none" }
  document.documentElement.style.background = document.body.style.background = "#f8f9fa"
  const white = [d, ...d.querySelectorAll("*")].filter((e) => getComputedStyle(e).backgroundColor === "rgb(255, 255, 255)").sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0] ?? d
  return window.__rect([white], pad)
}
window.__rect = (els, pad = 12) => {
  els = els.filter(Boolean)
  if (!els.length) return null
  const rs = els.map((e) => e.getBoundingClientRect())
  const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - pad), y = Math.max(0, Math.min(...rs.map((r) => r.top)) + scrollY - pad)
  return { x, y, width: Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + pad) - x, height: Math.max(...rs.map((r) => r.bottom)) + scrollY + pad - y }
}
`
const ITEMS = Buffer.from(JSON.stringify([["0f3a9c2e-1111-4222-8333-444455556666", "00000000-0000-4000-8000-000000000000", 2], ["0f3a9c2e-1111-4222-8333-444455556667", "00000000-0000-4000-8000-000000000016", 1]])).toString("base64url")

const cards = (...titles) => (p) => p.evaluate((t) => window.__rect(t.map((x) => window.__card(x))), titles)
const press = (text, nth = 0, after = 500) => async (p) => { const ok = await p.evaluate((t, n) => window.__press(t, n), text, nth); if (!ok) throw new Error(`no button "${text}"`); await wait(after) }
const viewport = (h) => async () => ({ x: 0, y: 0, width: 0, height: h })

const SHOTS = [
  { name: "new-product-kinds", view: "kinds", width: 520, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("#shot > div")])) },
  { name: "fulfil-question", phone: true, view: "first", q: "first=1", width: 900, clip: cards("How do you fulfil your physical orders?") },
  { name: "shipping-general-profile", phone: true, view: "delivery", width: 900, clip: (p) => p.evaluate(() => window.__rect([window.__cardHas("Every physical product uses these rates")])) },
  { name: "shipping-add-rate", phone: true, view: "delivery", width: 900, act: [press("Add rate", 0)], clip: (p) => p.evaluate(() => window.__rect([document.querySelector("[data-rate-form]")], 16)) },
  { name: "shipping-packages", view: "delivery", width: 900, clip: cards("Packages") },
  { name: "locations-list", view: "locations", width: 900, clip: cards("Locations") },
  { name: "location-form", phone: true, view: "locations", width: 900, act: [press("Edit Studio")], clip: (p) => p.evaluate(() => window.__rect([document.querySelector("[data-location-uses]").parentElement])) },
  { name: "location-pickup", view: "locations", width: 900, act: [press("Edit Studio")], clip: (p) => p.evaluate(() => window.__rect([document.querySelector("[data-location-uses]")])) },
  { name: "low-stock", view: "locations", width: 900, clip: cards("Low stock") },
  { name: "returns-settings", phone: true, view: "returns", width: 900, clip: cards("Returns", "Return reasons") },
  { name: "product-inventory", view: "product", width: 820, clip: cards("Inventory") },
  { name: "product-variants", phone: true, view: "product", width: 820, clip: cards("Variants") },
  { name: "product-shipping", view: "product", width: 820, clip: cards("Shipping") },
  /* Who ships the product: its own card, or (since the editor follows the store's answer) the Fulfilment part of Advanced with its own answer turned on. */
  {
    name: "product-fulfillment", view: "product", width: 820,
    act: [async (p) => {
      if (await p.evaluate(() => !!window.__card("Fulfillment"))) return
      await p.evaluate(() => document.querySelector("#physical-advanced > button[aria-expanded=false]")?.click())
      await wait(400)
      await p.evaluate(() => { const l = [...document.querySelectorAll("label")].find((x) => x.textContent.includes("Fulfil this product differently")); if (l) l.click() })
      await wait(500)
    }],
    clip: (p) => p.evaluate(() => window.__rect([window.__card("Fulfillment") ?? document.querySelector("#physical-advanced-fulfilment")])),
  },
  { name: "order-unfulfilled", phone: true, view: "order", width: 820, clip: (p) => p.evaluate(() => window.__rect([...document.querySelectorAll("#shot section")].slice(0, 3))) },
  /* Fulfill items, as the order page opens it: the quantities, a tracking number (the carrier is read from it) and the email to the buyer. */
  { name: "order-fulfill-items", view: "order", width: 1100, phone: true, act: [press("Fulfill items"), async (p) => { await p.type("[role=dialog] input[placeholder=Optional]", "9400100000000000000000"); await wait(200); await p.select("[role=dialog] select", "USPS"); await wait(300) }], clip: (p) => p.evaluate(() => window.__dialog()) },
  { name: "order-shipped", phone: true, view: "order", q: "order=shipped", width: 820, clip: (p) => p.evaluate(() => window.__rect([...document.querySelectorAll("#shot section")].slice(0, 2))) },
  { name: "order-pickup", view: "order", q: "order=pickup", width: 820, clip: (p) => p.evaluate(() => window.__rect([...document.querySelectorAll("#shot section")].slice(0, 2))) },
  { name: "inventory-page", phone: true, view: "inventory", width: 1200, height: 760, clip: viewport(760) },
  /* The website's checkout, on the site's own address (app/checkout/site), with a stand in for Stripe's card form. */
  {
    name: "checkout-ship", view: "site-checkout", width: 1200, height: 1500,
    act: [async (p) => {
      await p.type("#checkout-email, input[type=email]", "sam@example.com")
      const setSel = (sel, v) => p.evaluate((sel, v) => { const s = document.querySelector(sel); if (!s) return; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })) }, sel, v)
      await setSel("select[autocomplete=country]", "US")
      await wait(500)
      for (const [sel, v] of [["input[autocomplete=name]", "Sam Rivera"], ["input[autocomplete=address-line1]", "48 Maple Avenue"], ["input[autocomplete=address-level2]", "Denver"], ["input[autocomplete=postal-code]", "80203"]]) { if (await p.$(sel)) await p.type(sel, v) }
      await setSel("select[autocomplete=address-level1]", "CO")
      await p.evaluate(() => document.activeElement?.blur())
      await wait(1000)
    }],
    clip: viewport(1500),
  },
  { name: "checkout-pickup", view: "site-checkout", width: 1200, height: 1000, act: [async (p) => { await p.type("input[type=email]", "sam@example.com"); await p.evaluate(() => { [...document.querySelectorAll("[role=radio]")].find((b) => b.innerText.trim() === "Pick up")?.click(); document.activeElement?.blur() }); await wait(900) }], clip: viewport(1000) },
  { name: "product-buy-box", view: "buybox", width: 520, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("#shot")], 0)) },
  { name: "buyer-order-page", view: "status", width: 900, height: 1100, clip: viewport(1100) },
  { name: "taxes-settings", phone: true, view: "taxes", width: 820, clip: cards("Tax", "Tax regions") },
  { name: "taxes-create-region", view: "taxes", width: 1000, act: [press("Create region"), async (p) => { await p.evaluate(() => { const s = document.querySelectorAll("[role=dialog] select")[1]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "CO"); s.dispatchEvent(new Event("change", { bubbles: true })) }); await wait(200); const inputs = await p.$$("[role=dialog] input"); await inputs[inputs.length - 1].type("2.9"); await wait(200) }], clip: (p) => p.evaluate(() => window.__dialog()) },
  { name: "checkout-settings", phone: true, view: "checkout-settings", width: 820, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("[data-checkout-settings]")])) },
  { name: "sales-channels", phone: true, view: "channels", width: 820, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("#shot > *")])) },
  { name: "customer-emails", phone: true, view: "emails", width: 820, clip: cards("Customer emails") },
  {
    name: "payouts-balance", view: "payouts", width: 1200, height: 900,
    act: [async (p) => { await p.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "usd")); if (s) { const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "usd"); s.dispatchEvent(new Event("change", { bubbles: true })) } }); await wait(1200) }],
    clip: (p) => p.evaluate(() => { const h = [...document.querySelectorAll("h1")].find((e) => e.textContent.trim() === "Payouts"); return window.__rect([h, window.__card("Balance")], 16) }),
  },
  { name: "upsells-and-bundles", view: "offers", width: 1100, height: 760, clip: viewport(760) },
  { name: "website-commerce", view: "website-commerce", width: 1280, height: 860, clip: viewport(860), settle: 2500 },
  /* Website settings › Commerce › On this website (stock left, the low stock message, the free shipping banner, the return policy in the cart). */
  { name: "website-on-this-website", view: "website-commerce", width: 1280, height: 860, settle: 2500, act: [async (p) => { await p.evaluate(() => window.__card("On this website")?.scrollIntoView({ block: "center" })); await wait(400) }], clip: cards("On this website") },
  { name: "website-policies", view: "website-policies", width: 1280, height: 860, clip: viewport(860), settle: 2500 },
  { name: "website-domains", view: "website-domains", width: 1280, height: 860, clip: viewport(860), settle: 2500 },
  { name: "store-details", view: "store", width: 820, phone: true, clip: (p) => p.evaluate(() => window.__rect([...document.querySelectorAll("#shot .rounded-2xl")].slice(0, 3))) },
  { name: "integrations-directory", view: "integrations", width: 1060, height: 900, phone: true, settle: 1800, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("[data-integrations-search]"), document.querySelector("[data-integration-pills]"), ...[...document.querySelectorAll("[data-integration-card]")].slice(0, innerWidth < 600 ? 3 : 6)], 16)) },
  { name: "integration-page", view: "integrations", q: "integration=meta-pixel", width: 1060, height: 1000, settle: 1800, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("[data-integration-page]")], 16)) },
  /* The real emails, as their templates write them. */
  { name: "low-stock-email", view: "email-low-stock", width: 640, height: 900, settle: 1200, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("#shot iframe")], 0)) },
  { name: "shipping-email", view: "email-shipped", width: 640, height: 1400, settle: 1200, clip: (p) => p.evaluate(() => window.__rect([document.querySelector("#shot iframe")], 0)) },
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], headless: true })
const made = []
/*
  Each shot at its own width, and the ones marked phone: true again at 390
  CSS pixels (an iPhone's width), saved as <name>-phone.webp: the article
  shows that one on a narrow screen. On a phone, a shot cropped to the
  viewport is cropped to the whole drawn screen instead, up to 1800 pixels.
*/
const runs = SHOTS.flatMap((s) => [s, ...(s.phone ? [{ ...s, name: `${s.name}-phone`, width: 390, height: 844, phoneOf: s }] : [])])
for (const s of runs) {
  if (only && !only.has(s.name) && !(s.phoneOf && only.has(s.phoneOf.name))) continue
  const page = await browser.newPage()
  await page.setViewport({ width: s.width, height: s.height ?? 900, deviceScaleFactor: 2, isMobile: !!s.phoneOf, hasTouch: !!s.phoneOf })
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }])
  await page.evaluateOnNewDocument(HELPERS)
  const errs = []
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)))
  /* The page and its script come from this server; nothing outside it is waited for. */
  await page.goto(`${base}/?view=${s.view}${s.q ? "&" + s.q : ""}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(s.settle ?? 1400)
  try {
    for (const a of s.act ?? []) await a(page)
    let clip = await s.clip(page)
    if (!clip) throw new Error("nothing to crop to")
    if (clip.width === 0) {
      if (s.phoneOf) {
        const full = await page.evaluate(() => Math.max(document.querySelector("#shot")?.getBoundingClientRect().height ?? 0, innerHeight))
        clip = { x: 0, y: 0, width: s.width, height: Math.min(1800, Math.ceil(full)) }
      } else clip = { x: 0, y: 0, width: s.width, height: clip.height }
    }
    const png = await page.screenshot({ clip, type: "png", captureBeyondViewport: true })
    const out = join(dest, `${s.name}.webp`)
    const info = await sharp(png).webp({ quality: 80, effort: 6 }).toFile(out)
    made.push({ name: s.name, width: info.width, height: info.height, kb: Math.round(info.size / 1024) })
    console.log(`ok   ${s.name} ${info.width}x${info.height} ${Math.round(info.size / 1024)}KB${errs.length ? "  errors: " + errs.join(" | ") : ""}`)
  } catch (e) {
    console.log(`FAIL ${s.name}: ${e.message}${errs.length ? "  errors: " + errs.join(" | ") : ""}`)
  }
  await page.close()
}
await browser.close()
server.close()

/* ── The size table the articles read ──────────────────────────────────── */

const rows = []
for (const f of readdirSync(dest).filter((f) => f.endsWith(".webp")).sort()) {
  const m = await sharp(join(dest, f)).metadata()
  rows.push(`  "${f.slice(0, -5)}": [${Math.round(m.width / 2)}, ${Math.round(m.height / 2)}],`)
}
writeFileSync(join(root, "lib/help/physical-shots.ts"), `/**
 * ===========================================================================
 *  THE PHYSICAL PRODUCTS GUIDE'S SCREENSHOTS, AND THEIR SIZES
 * ===========================================================================
 * Every picture in public/help/physical/, with its size in CSS pixels (the
 * files are 2x), so an article's image keeps its space while it loads.
 *
 * HOW THEY ARE MADE. Each is the real component (Settings' sections, the
 * product cards, the order page, Inventory, checkout, the buyer's order
 * page, Payouts through its demo, Website settings) mounted outside Next with
 * every /api request answered from made up demo data: a ceramics studio
 * called Fern & Clay, a buyer called Sam Rivera at example.com, a tracking
 * number of zeros. Nothing real is in them: no person, no account, no id.
 * Written by scripts/help-shots.mjs, which takes the pictures
 * (scripts/render-help-shots.tsx); when a screen changes, run it again.
 *
 * tests/help-center.test.ts checks every name here has its file and every
 * file is used by an article.
 */
export const PHYSICAL_SHOTS = {
${rows.join("\n")}
} as const satisfies Record<string, readonly [number, number]>
`)
console.log(`${rows.length} pictures, sizes in lib/help/physical-shots.ts`)
