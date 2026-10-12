/**
 * ===========================================================================
 *  BUY A LABEL, IN THE REAL COMPONENTS (tests/shippingapps24.test.ts)
 * ===========================================================================
 * Mounts the order page's panel and the shipping app cards
 * (scripts/render-shipping-label.tsx, every /api answered from demo data)
 * and walks the label flow at 1440x900 and at 390x844 on a touch phone with
 * the CPU slowed four times:
 *
 *   Fulfill items    Add tracking or Buy a label; Buy a label shows from,
 *                    to, the default box, the weight in the store's units
 *   Get rates        three rates, cheapest first, the address warning above
 *   Buy label        the price on the button; bought: Print label, the PDF
 *                    opened in a new tab, the items shipped with the number
 *   the shipment     its label, its cost, Print label, Void label
 *   the cards        Shippo (test, labels bought) and ShipStation (orders
 *                    sent, its last error) as their pages show them
 *
 *   node scripts/check-shippingapps24.mjs [out dir for the screenshots]
 *
 * Prints one line per check and exits 1 when any fails.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const shots = process.argv[2] ?? join(tmpdir(), "shippingapps24")
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const out = join(root, ".shippingapps24-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-shipping-label.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="usd"', '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
    `--alias:server-only=${join(out, "empty.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "inherit", "inherit"] })
} finally {
  /* the bundle is read below before the folder goes */
}
const bundle = readFileSync(join(out, "probe.js"))
rmSync(out, { recursive: true, force: true })
const css = await appCss(root)
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
/* The label the provider hands back: a one page PDF, served here as Shippo's S3 address would be. */
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 288 432]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
let pdfServed = 0
const server = createServer((req, res) => {
  const p = req.url.split("?")[0]
  if (p === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (p === "/label.pdf") { pdfServed++; res.writeHead(200, { "content-type": "application/pdf" }); return res.end(PDF) }
  const file = join(root, "public", p)
  if (/^\/(flags|integrations|images\/brand)\/[\w.-]+$/.test(p) && existsSync(file)) { res.writeHead(200, { "content-type": p.endsWith(".svg") ? "image/svg+xml" : "image/png" }); return res.end(readFileSync(file)) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], headless: true })
let failed = 0
const check = (label, ok, detail) => {
  if (!ok) failed++
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${!ok && detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
}

const SIZES = [
  { tag: "desktop", width: 1440, height: 900, phone: false },
  { tag: "phone", width: 390, height: 844, phone: true },
]

async function open(size, q) {
  const page = await browser.newPage()
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.phone ? 3 : 1, isMobile: size.phone, hasTouch: size.phone })
  if (size.phone) {
    const cdp = await page.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
  await page.goto(`${base}/?${q}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(size.phone ? 3500 : 1500)
  return { page, errors }
}
const text = (page) => page.evaluate(() => document.body.innerText)
const click = (page, sel) => page.evaluate((sel) => { const b = document.querySelector(sel); b?.click(); return !!b }, sel)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
/* Waits until a selector is there, up to a few seconds (a slowed phone draws a sheet in its own time). */
async function until(page, sel, ms = 8000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await page.$(sel)) return true
    await wait(120)
  }
  return false
}
/** The open sheet or dialog: where the label flow is drawn. */
const dialogBox = (page) => page.evaluate(() => {
  const el = document.querySelector("[data-ship-mode]")?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]')
  const r = el?.getBoundingClientRect()
  return r ? { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight } : null
})

for (const size of SIZES) {
  console.log(`\n${size.tag} ${size.width}x${size.height}${size.phone ? ", touch, CPU x4" : ""}`)
  const { page, errors } = await open(size, "view=order")
  const pages = []
  browser.on("targetcreated", (t) => pages.push(t.url()))

  check("the order has Fulfill items", await until(page, "[data-fulfil]"))
  await click(page, "[data-fulfil]")
  check("Fulfill items offers Add tracking and Buy a label", await until(page, '[data-ship-mode-option="label"]'))
  await page.screenshot({ path: join(shots, `${size.tag}-1-fulfil.png`) })
  await click(page, '[data-ship-mode-option="label"]')
  check("Buy a label: from, to, the package and the weight", await until(page, "[data-label-fields]"))
  await wait(size.phone ? 900 : 300)
  let t = await text(page)
  check("  ships from the Studio's address, to the buyer's", /From\s*Studio, 120 Alder Street/.test(t) && /To\s*Sam Rivera, 48 Maple Avenue/.test(t))
  const pkg = await page.evaluate(() => document.querySelector("[data-label-package] select, select[data-label-package]")?.selectedOptions?.[0]?.textContent ?? null)
  check("  the default box chosen, its size in inches (the store is imperial)", !!pkg && /Small box/.test(pkg) && /in/.test(pkg) && /\(default\)/.test(pkg), pkg)
  const weight = await page.evaluate(() => (document.querySelector("[data-label-weight]") ?? document.querySelector("[data-label-weight] input"))?.value ?? null)
  check("  the weight: the items plus the box, in pounds", weight === "3.77", weight)
  check("  a test key is said", (await page.$("[data-label-test]")) !== null)
  const getRates = await page.evaluate(() => document.querySelector("[data-label-submit]")?.textContent?.trim())
  check("  the footer's button is Get rates", getRates === "Get rates", getRates)
  await page.screenshot({ path: join(shots, `${size.tag}-2-label-fields.png`) })

  await click(page, "[data-label-submit]")
  await wait(120)
  const getting = await page.evaluate(() => document.querySelector("[data-label-submit]")?.textContent?.trim())
  check("  while asking: Getting rates…", getting === "Getting rates…", getting)
  check("Rates come back", await until(page, "[data-label-rates]"))
  await wait(size.phone ? 900 : 300)
  const rates = await page.$$eval("[data-label-rate]", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()))
  check("  three, cheapest first, with carrier, service, days and price", rates.length === 3 && /USPS Ground Advantage/.test(rates[0]) && /\$6\.12/.test(rates[0]) && /\$11\.20/.test(rates[2]) && /5 business days/.test(rates[0]), rates)
  check("  the address warning above them", (await page.$("[data-label-warning]")) !== null)
  const picked = await page.evaluate(() => document.querySelector('[data-label-rate][aria-checked="true"]')?.getAttribute("data-label-rate"))
  check("  the cheapest picked", picked === "rate_ga", picked)
  await page.evaluate(() => document.querySelector('[data-label-rate="rate_pri"]')?.click())
  await wait(200)
  const buyText = await page.evaluate(() => document.querySelector("[data-label-submit]")?.textContent?.trim())
  check("  picking Priority puts its price on the button", buyText === "Buy label · $9.45", buyText)
  const rateBox = await page.evaluate(() => { const r = document.querySelector('[data-label-rate="rate_pri"]')?.getBoundingClientRect(); return r ? { h: Math.round(r.height), right: Math.round(r.right), w: innerWidth } : null })
  check("  each rate is a full row, tall enough to press", !!rateBox && rateBox.h >= 44 && rateBox.right <= rateBox.w, rateBox)
  const box = await dialogBox(page)
  check("  the dialog fits the screen", !!box && box.left >= 0 && box.right <= box.w, box)
  check("  nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
  await page.evaluate(() => document.querySelector("[data-label-rates]")?.scrollIntoView({ block: "center" }))
  await wait(250)
  await page.screenshot({ path: join(shots, `${size.tag}-3-rates.png`) })

  const before = pdfServed
  await click(page, "[data-label-submit]")
  await wait(120)
  const buying = await page.evaluate(() => document.querySelector("[data-label-submit]")?.textContent?.trim())
  check("Buying: the button says so", buying === "Buying label…", buying)
  check("Bought: the label, its cost, Print label", await until(page, "[data-label-bought]"))
  await wait(size.phone ? 1200 : 500)
  t = await text(page)
  check("  says USPS Priority Mail, $9.45, the tracking number, a test label", /Label bought: USPS Priority Mail, \$9\.45/.test(t) && /Tracking 9400111899223197428490/.test(t) && /Test label/.test(t))
  const print = await page.evaluate(() => { const a = document.querySelector("[data-label-print]"); const r = a?.getBoundingClientRect(); return a ? { href: a.getAttribute("href"), target: a.getAttribute("target"), h: Math.round(r.height) } : null })
  check("  Print label opens the PDF in a new tab, a big button", !!print && /\/label\.pdf$/.test(print.href) && print.target === "_blank" && print.h >= 40, print)
  check("  the PDF was opened as soon as it was bought", pages.some((u) => /\/label\.pdf$/.test(u)) || pdfServed > before, { pages, served: pdfServed - before })
  /* The PDF's tab took the focus: back to the order, as the seller would after printing. */
  for (const other of await browser.pages()) if (other !== page && /label\.pdf/.test(other.url())) await other.close()
  await page.bringToFront()
  await wait(300)
  await page.screenshot({ path: join(shots, `${size.tag}-4-bought.png`) })

  await click(page, "[data-label-done]")
  check("The shipment card: Fulfilled, the label with its cost and Print label", await until(page, "[data-shipment-label]"))
  await wait(size.phone ? 900 : 300)
  t = await text(page)
  check("  USPS and the number on the card, the label as your cost", /USPS/.test(t) && /9400111899223197428490/.test(t) && /Shippo label · \$9\.45 your cost · test/.test(t))
  check("  nothing left Unfulfilled", (await page.$("[data-unfulfilled-card]")) === null)
  await page.evaluate(() => document.querySelector("[data-shipment-label]")?.scrollIntoView({ block: "center" }))
  await wait(200)
  await page.screenshot({ path: join(shots, `${size.tag}-5-shipment.png`) })
  check("the order page: no page errors", errors.length === 0, errors)
  check("  nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
  await page.close()

  {
    const { page, errors } = await open(size, "view=cards")
    const t = await text(page)
    check("Shippo's card: Connected · Test, where to buy, labels bought, last talked to", /Connected · Test/.test(t) && /Fulfill items › Buy a label/.test(t) && /Labels bought\s*14/.test(t) && /Test: labels are free samples/.test(t))
    check("ShipStation's card: orders out, tracking back, orders sent, its last error", /Paid orders you ship yourself/.test(t) && /As each label ships in ShipStation/.test(t) && /Orders sent\s*37/.test(t) && /Invalid country code/.test(t))
    check("  neither says Coming soon", !/Coming soon/.test(t))
    await page.screenshot({ path: join(shots, `${size.tag}-6-cards.png`), fullPage: true })
    check("the cards: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    check("the cards: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page } = await open(size, "view=cards&open=1")
    const fields = await page.evaluate(() => ({ key: !!document.querySelector('[data-integration="shipstation"] [data-integration-key]'), secret: !!document.querySelector('[data-integration="shipstation"] [data-integration-secret]') }))
    check("ShipStation's Manage asks for the key and the secret", fields.key && fields.secret, fields)
    await page.evaluate(() => document.querySelector('[data-integration="shipstation"] [data-integration-secret]')?.scrollIntoView({ block: "center" }))
    await wait(200)
    await page.screenshot({ path: join(shots, `${size.tag}-7-shipstation-keys.png`) })
    await page.close()
  }
}

await browser.close()
server.close()
console.log(`\nscreenshots in ${shots}`)
if (failed) {
  console.log(`${failed} failed`)
  process.exit(1)
}
console.log("all passed")
