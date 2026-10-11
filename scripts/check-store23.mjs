/**
 * ===========================================================================
 *  ROUND 23, S23: THE STORE'S SETTINGS, SEEN WHERE A BUYER SEES THEM
 * ===========================================================================
 * The real checkout, receipt, order page and Store details components
 * (scripts/render-store23.tsx) in Chromium, on a phone (390x844, touch, the
 * CPU slowed four times) and a laptop (1440x900):
 *
 *   • the website's own checkout and Storelib's cart checkout ask a signed
 *     out buyer to sign in when the store requires it, and show no form;
 *   • Customer information set to Required is required on the page: First
 *     and Last, Company, Phone, Apartment; the news box is there, unticked;
 *   • the tax line is named as Settings › Taxes names it, "VAT 19%", on every
 *     checkout, the receipt and the order page, with the currency;
 *   • the receipt and the order page say who sold it: the legal name, its
 *     address and VAT number (Store details › Business details);
 *   • nothing scrolls sideways.
 *
 * CSS from a production build (.next/static/chunks, or STORELIB_CSS_DIR).
 *   node scripts/check-store23.mjs        SHOTS_DIR=... to keep the pictures
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = process.env.STORELIB_CSS_DIR || join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first, or set STORELIB_CSS_DIR.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-store23-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".store23-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/checkout"
export const useRouter = () => ({ push(u) { window.__pushed = u }, prefetch() {}, replace(u) { window.__replaced = u }, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-store23.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
try {
  execFileSync(
    join(root, "node_modules/.bin/esbuild"),
    [
      join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@=${root}`,
      "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok || got === undefined ? "" : `   (${typeof got === "string" ? got.slice(0, 300) : JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, timeout: 180000, protocolTimeout: 300000, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage"] })

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const LAPTOP = { width: 1440, height: 900 }
async function open(viewport, which) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  if (viewport.isMobile) {
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await p.goto(`${origin}/?case=${which}`, { waitUntil: "load", timeout: 180000 })
  await p.waitForSelector(`[data-case="${which}"]`, { timeout: 180000 })
  await sleep(viewport.isMobile ? 1200 : 600)
  return p
}
const text = (p) => p.evaluate(() => document.body.innerText)
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const shot = async (p, name) => p.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
const errors = (p) => p.evaluate(() => (window.__errors || []).filter((e) => !/Stripe|stripe|Failed to load resource|placeholder\.supabase/.test(e)))

for (const [label, vp] of [["phone 390, touch, 4x slower CPU", PHONE], ["laptop 1440", LAPTOP]]) {
  const tag = vp.isMobile ? "390" : "1440"
  console.log(`\n${label}`)
  {
    const p = await open(vp, "site-gate")
    const t = await text(p)
    expect(/Sign in to check out/.test(t) && !!(await p.$('[data-checkout-account="sign-in"] a[href^="/account/login"]')), "the website's own checkout (custom domains, imported themes): Sign in to check out, to the site's own sign in", t.slice(0, 200))
    expect((await sideways(p)) <= 0, "  nothing scrolls sideways", await sideways(p))
    await shot(p, `site-gate-${tag}`)
    await p.close()
  }
  {
    const p = await open(vp, "site")
    const t = await text(p)
    const fields = await p.evaluate(() => [...document.querySelectorAll("input,select")].map((i) => (i.getAttribute("aria-label") || i.getAttribute("placeholder") || i.getAttribute("name") || i.id || "") + (i.required ? "*" : "")))
    expect(/First name/i.test(t) && /Last name/i.test(t), "First and last name apart, as set", fields)
    expect(/Company/i.test(t + fields.join(" ")) && /Phone/i.test(t + fields.join(" ")) && /Apartment|suite/i.test(t + fields.join(" ")), "  Company, Phone and Apartment asked for, as set", fields)
    const news = await p.evaluate(() => { const box = [...document.querySelectorAll("input[type=checkbox]")].find((b) => /news/i.test(b.closest("label,div")?.textContent || "")); return box ? { checked: box.checked } : null })
    expect(!!news && news.checked === false, "  the email news box is there, unticked", news)
    expect(t.includes("VAT 19%") && t.includes("7.60"), "the tax line reads VAT 19%, 7.60", t.match(/.*(VAT|Tax).*/g))
    expect((await sideways(p)) <= 0, "  nothing scrolls sideways", await sideways(p))
    expect((await errors(p)).length === 0, "  no errors", await errors(p))
    await shot(p, `site-form-${tag}`)
    await p.close()
  }
  {
    const p = await open(vp, "physical-gate")
    const t = await text(p)
    expect(/sign in/i.test(t), "Storelib's cart checkout: sign in first", t.slice(0, 200))
    await shot(p, `physical-gate-${tag}`)
    await p.close()
  }
  {
    const p = await open(vp, "physical")
    await sleep(900)
    /* On a phone the order sits behind Show order summary. */
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Show order summary/.test(b.textContent || ""))?.click())
    await sleep(400)
    const t = await text(p)
    expect(t.includes("VAT 19%"), "the cart checkout names the tax VAT 19%", t.match(/.*(VAT|Tax).*/g))
    expect(/Company/i.test(t) && /Apartment|suite/i.test(t), "  and asks for Company and Apartment, as set", t.slice(0, 400))
    expect((await sideways(p)) <= 0, "  nothing scrolls sideways", await sideways(p))
    await shot(p, `physical-form-${tag}`)
    await p.close()
  }
  {
    const p = await open(vp, "digital")
    const t = await text(p)
    expect(t.includes("VAT 19%") && t.includes("9.31") && t.includes("58.31"), "the single product checkout: VAT 19%, 9.31 on 49.00, 58.31 due", t.match(/.*(VAT|Tax|\$).*/g))
    expect((await sideways(p)) <= 0, "  nothing scrolls sideways", await sideways(p))
    await shot(p, `digital-${tag}`)
    await p.close()
  }
  {
    const p = await open(vp, "receipt")
    const t = await text(p)
    expect(t.includes("VAT 19%") && t.includes("9.31"), "the receipt: VAT 19%", t.match(/.*(VAT|Tax).*/g))
    expect(t.includes("Sold by Bread Studio SRL") && t.includes("VAT number RO12345678") && t.includes("Cluj-Napoca"), "  sold by the business, its address and VAT number", t.match(/.*(Sold by|VAT number|Cluj).*/g))
    expect((await sideways(p)) <= 0, "  nothing scrolls sideways", await sideways(p))
    await shot(p, `receipt-${tag}`)
    await p.close()
  }
  {
    const p = await open(vp, "order")
    const t = await text(p)
    expect(t.includes("VAT 19%") && /USD\s*\$52\.60/.test(t), "the order page: VAT 19% and the total with its currency", t.match(/.*(VAT|Total|USD).*/g))
    expect(t.includes("Oct 11, 2026") && t.includes("Sold by Bread Studio SRL") && t.includes("VAT number RO12345678"), "  its date, and who sold it", t.match(/.*(Order|Sold by).*/g))
    expect((await sideways(p)) <= 0, "  nothing scrolls sideways", await sideways(p))
    await shot(p, `order-${tag}`)
    await p.close()
  }
  {
    const p = await open(vp, "store")
    await sleep(500)
    const t = await text(p)
    const vals = await p.evaluate(() => ({ legal: document.querySelector("#legal-name")?.value, vat: document.querySelector("#legal-tax-id")?.value, city: document.querySelector("#legal-city")?.value, label: document.querySelector("label[for=legal-tax-id]")?.textContent }))
    expect(t.includes("Business details") && vals.legal === "Bread Studio SRL" && vals.vat === "RO12345678" && vals.city === "Cluj-Napoca", "Store details › Business details reads back what is saved", vals)
    expect(/VAT number/.test(vals.label || ""), "  the tax number is called what Romania calls it", vals.label)
    expect((await sideways(p)) <= 0, "  nothing scrolls sideways", await sideways(p))
    await shot(p, `store-details-${tag}`)
    await p.close()
  }
}

await browser.close()
server.close()
console.log(`\npictures in ${shots}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
