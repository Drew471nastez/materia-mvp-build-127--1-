/**
 * ===========================================================================
 *  ROUND AE3, MEASURED: FULFILL, HOLD, SEND AGAIN, THE SLIP, THE BUYER'S PAGE
 * ===========================================================================
 * The real components (scripts/render-fulfilment-ae3.tsx) and the real
 * packing slip (lib/physical/packing-slip.ts) in Chromium at 390x844 (touch,
 * CPU four times slower) and 1280x800:
 *
 *   fulfill dialog   inside the screen, nothing wider than it
 *   hold             Hold fulfillment from the card's menu, its dialog in the
 *                    screen; the On hold card, Fulfill off; Release, Fulfill on
 *   send again       the Printful card says why it was not sent, Send again
 *                    a tap target, and pressing it says it is sending
 *   packing slip     the bar's Back, A4 / Letter, Show prices and Print on
 *                    one row in the screen; printed (a PDF) on Letter or A4
 *                    as chosen, the bar left off the paper
 *   buyer's page     both parcels with their numbers, nothing wider than the
 *                    screen
 *
 *   node scripts/check-fulfilment-ae3.mjs [out dir for the screenshots]
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const shots = process.argv[2] ?? join(tmpdir(), "fulfilment-ae3")
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const out = join(root, ".fulfilment-ae3-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
writeFileSync(join(out, "slip-entry.ts"), `export { packingSlipHtml, slipLines, paperAsked, slipPaper } from "@/lib/physical/packing-slip"\n`)
let bundle
let slip
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-fulfilment-ae3.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="usd"', '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
    `--alias:server-only=${join(out, "empty.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "inherit", "inherit"] })
  execFileSync("pnpm", ["exec", "esbuild", join(out, "slip-entry.ts"), "--bundle", "--format=esm", "--platform=node", "--log-level=error", `--alias:@=${root}`, `--outfile=${join(out, "slip.mjs")}`], { stdio: ["ignore", "inherit", "inherit"] })
  bundle = readFileSync(join(out, "probe.js"))
  slip = await import(join(out, "slip.mjs"))
} finally {
  rmSync(out, { recursive: true, force: true })
}
const css = await appCss(root)
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`

const TT = (s, v) => s.replace(/\{(\w+)(?:, plural, one \{([^}]*)\} other \{([^}]*)\})?\}/g, (_, k, one, other) => (other ? (Number(v?.[k]) === 1 ? one : other).replace("#", String(v?.[k])) : String(v?.[k] ?? "")))
const ORDER = {
  id: "85737c57-0000-4000-8000-000000000001", createdAt: "2026-10-20T10:00:00Z", paidAt: "2026-10-20T10:01:00Z",
  address: { name: "Jordan Blake", line1: "12 Strada Lipscani", line2: "Ap. 4", city: "Bucharest", postalCode: "030031", country: "RO" },
  delivery: { name: "Standard" }, deliveryMethod: "ship", pickup: null, buyerName: "Jordan Blake", buyerNote: "Please leave it with the neighbour.",
  cartAttributes: { "Gift message": "Happy birthday, Ana" },
  lines: Array.from({ length: 14 }, (_, i) => ({ orderId: `l${i}`, title: i % 2 ? "Stoneware mug" : "Linen shirt", variantName: i % 2 ? "Sage" : "M / Natural", sku: `SKU-${100 + i}`, imageUrl: null, quantity: 1 + (i % 3), fulfilled: 0, requiresShipping: true, locationId: null, unitCents: 4500 + i * 100 })),
  shipments: [],
}
const TOTALS = { currency: "EUR", itemsSubtotalCents: 120000, discountCents: 0, shippingCents: 500, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, taxLabel: "Tax", totalCents: 120500, refundedCents: 0 }

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (u.pathname === "/slip") {
    const paper = slip.paperAsked(u.searchParams.get("paper"))
    const prices = u.searchParams.get("prices") === "1"
    const link = (k, v) => { const q = new URLSearchParams(u.searchParams); v === null ? q.delete(k) : q.set(k, v); return `/slip?${q}` }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    return res.end(slip.packingSlipHtml(ORDER, slip.slipLines(ORDER), { name: "Hana Shop", logoUrl: null }, { tt: TT, lang: "en", timeZone: "Europe/Berlin", back: "/app/orders", paper, paperShown: slip.slipPaper(paper, req.headers["accept-language"]), prices: prices ? { currency: "EUR", totals: TOTALS } : null, controls: { a4: link("paper", "a4"), letter: link("paper", "letter"), prices: link("prices", prices ? null : "1") } }))
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], headless: true })
let failed = 0
const check = (label, ok, detail) => {
  if (!ok) failed++
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail !== undefined ? `   (${JSON.stringify(detail)})` : ""}`)
}
const SIZES = [
  { tag: "phone", width: 390, height: 844, phone: true },
  { tag: "desktop", width: 1280, height: 800, phone: false },
]
async function open(size, path) {
  const page = await browser.newPage()
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.phone ? 2 : 1, isMobile: size.phone, hasTouch: size.phone })
  await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" })
  if (size.phone) {
    const cdp = await page.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(size.phone ? 3000 : 1500)
  return { page, errors }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
const press = async (page, sel, phone) => {
  const el = await page.waitForSelector(sel, { visible: true, timeout: 8000 })
  if (phone) await el.tap()
  else await el.click()
}
const pressText = (page, text) => page.evaluate((t) => {
  const el = [...document.querySelectorAll("button,a,[role=menuitem]")].find((b) => b.textContent.trim() === t)
  el?.click()
  return !!el
}, text)
/** The open dialog's box, against the screen. */
const dialogBox = (page) => page.evaluate(() => {
  const d = document.querySelector("[role=dialog]") ?? document.querySelector("[data-modal-sheet]")?.parentElement
  if (!d) return null
  const r = d.getBoundingClientRect()
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, inner: d.scrollWidth - d.clientWidth }
})
const inScreen = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.top >= 0 && b.bottom <= b.vh + 1 && b.inner <= 0

for (const size of SIZES) {
  console.log(`\n${size.tag} ${size.width}x${size.height}${size.phone ? ", touch, CPU x4" : ""}`)
  {
    const { page, errors } = await open(size, "/?view=seller")
    await page.waitForSelector("[data-fulfil]", { visible: true })
    check("seller: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    const send = await page.$eval("[data-partner-send]", (e) => ({ state: e.dataset.partnerSend, text: e.textContent }))
    const again = await page.$eval("[data-partner-resend]", (e) => Math.round(e.getBoundingClientRect().height))
    check("the Printful card says why it was not sent, Send again a tap target", send.state === "failed" && /no product with SKU TEE-M/.test(send.text) && again >= (size.phone ? 36 : 32), { state: send.state, height: again })
    await page.screenshot({ path: join(shots, `${size.tag}-seller.png`), fullPage: true })

    await press(page, '[data-ship-group="self"] [data-fulfil]', size.phone)
    await wait(size.phone ? 1200 : 500)
    const fb = await dialogBox(page)
    check("Fulfill items: the dialog inside the screen, nothing wider than it", inScreen(fb), fb)
    await page.screenshot({ path: join(shots, `${size.tag}-fulfil-dialog.png`) })
    await page.keyboard.press("Escape")
    await wait(600)
    if (await page.$("[data-sheet-close]")) await press(page, "[data-sheet-close]", size.phone)
    else if (await page.$("[role=dialog]")) await pressText(page, "Cancel")
    await wait(900)

    await press(page, '[data-ship-group="self"] button[aria-label$="more actions"]', size.phone)
    await wait(size.phone ? 1000 : 400)
    const opened = await pressText(page, "Hold fulfillment")
    await wait(size.phone ? 1200 : 500)
    const hb = await dialogBox(page)
    check("Hold fulfillment from the card's menu: its dialog inside the screen", opened && inScreen(hb), { opened, hb })
    await page.screenshot({ path: join(shots, `${size.tag}-hold-dialog.png`) })
    await page.select("[data-hold-reason]", "address")
    await page.type("[data-hold-note]", "Check the flat number")
    await press(page, "[data-hold-submit]", size.phone)
    await page.waitForSelector("[data-order-hold]", { visible: true, timeout: 8000 }).catch(() => null)
    const heldCard = await page.$eval("[data-order-hold]", (e) => e.textContent).catch(() => "")
    const disabled = await page.$$eval("[data-fulfil]", (b) => b.map((x) => x.disabled))
    const noResend = (await page.$("[data-partner-resend]")) === null
    const posts = await page.evaluate(() => window.__posts)
    check("held: the On hold card with its reason and note, every Fulfill off, no Send again", /On hold/.test(heldCard) && /Address to check/.test(heldCard) && /Check the flat number/.test(heldCard) && disabled.every(Boolean) && noResend, { heldCard, disabled, noResend })
    check("  sent as the route takes it", posts.some((p) => p.action === "hold" && p.reason === "address" && p.note === "Check the flat number"), posts)
    check("  nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `${size.tag}-held.png`), fullPage: true })
    await press(page, "[data-release-hold]", size.phone)
    await wait(800)
    const after = await page.$$eval("[data-fulfil]", (b) => b.map((x) => x.disabled))
    check("released: the card is gone, Fulfill on again", (await page.$("[data-order-hold]")) === null && after.every((d) => !d), after)
    await press(page, "[data-partner-resend]", size.phone)
    await wait(800)
    const sending = await page.$eval("[data-partner-send]", (e) => e.dataset.partnerSend).catch(() => null)
    check("Send again: the card says it is sending", sending === "resending", sending)
    check("seller: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "/slip?prices=1")
    const bar = await page.evaluate(() => {
      const b = document.querySelector("[data-slip-bar]").getBoundingClientRect()
      const kids = [...document.querySelectorAll("[data-slip-bar] a, [data-slip-bar] button")].map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height) } })
      return { height: Math.round(b.height), kids, vw: innerWidth }
    })
    const oneRow = new Set(bar.kids.map((k) => k.top)).size <= 2 && bar.kids.every((k) => k.left >= 0 && k.right <= bar.vw)
    check("slip: Back, A4, Letter, Hide prices and Print on one row inside the screen", oneRow && bar.height <= 72, { height: bar.height, kids: bar.kids.map((k) => [k.t, k.left, k.right, k.top]) })
    check("  Letter shown on for an en-US browser", await page.$eval('[data-slip-paper="letter"]', (a) => a.hasAttribute("aria-current")))
    check("  nothing wider than the screen, prices shown", (await overflow(page)) <= 0 && (await page.$("[data-slip-totals]")) !== null, await overflow(page))
    await page.screenshot({ path: join(shots, `${size.tag}-slip.png`), fullPage: true })
    await page.emulateMediaType("print")
    const barPrinted = await page.$eval("[data-slip-bar]", (b) => getComputedStyle(b).display)
    check("  in print the bar is left off the paper", barPrinted === "none", barPrinted)
    check("slip: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "/?view=buyer")
    const parcels = await page.$$eval("[data-shipment-status]", (s) => s.map((x) => ({ status: x.dataset.shipmentStatus, text: x.textContent })))
    check("buyer: both parcels, each with its number", parcels.length === 2 && parcels.some((p) => /00340434161234567890/.test(p.text)) && parcels.some((p) => /01234567890123/.test(p.text)), parcels.map((p) => p.status))
    check("  nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `${size.tag}-buyer.png`), fullPage: true })
    check("buyer: no page errors", errors.length === 0, errors)
    await page.close()
  }
}

/* Printed to PDF as Chromium's print does, with the page's own @page size. */
const pdfSize = (buf) => {
  const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(buf.toString("latin1"))
  return m ? [Math.round(Number(m[1])), Math.round(Number(m[2]))] : null
}
const pages = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length
console.log("\nprinted")
for (const [paper, want] of [["letter", [612, 792]], ["a4", [595, 842]]]) {
  const p = await browser.newPage()
  await p.goto(`${base}/slip?paper=${paper}&prices=1`, { waitUntil: "load" })
  const buf = Buffer.from(await p.pdf({ preferCSSPageSize: true, printBackground: true }))
  const size = pdfSize(buf)
  check(`${paper}: each sheet ${want.join(" x ")} pt, ${pages(buf)} sheet(s) for 14 items`, !!size && size[0] === want[0] && size[1] === want[1] && pages(buf) >= 1, size)
  await p.close()
}
{
  const p = await browser.newPage()
  await p.goto(`${base}/slip`, { waitUntil: "load" })
  const css = await p.evaluate(() => [...document.styleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join("\n"))
  check("none chosen: no @page size, so the print dialog keeps the printer's paper", !/@page\s*\{[^}]*size/.test(css))
  await p.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots in ${shots}`)
if (failed) {
  console.log(`${failed} failed`)
  process.exit(1)
}
console.log("all passed")
