/**
 * ===========================================================================
 *  THE CHECKOUT, MEASURED
 * ===========================================================================
 * Claims about the checkout are claims about a browser, so they are checked
 * in one, at a phone's width and a laptop's:
 *
 *   • on a laptop, paying is the left column and the order the right;
 *   • on a phone, the order is a bar at the top with the total on it, and
 *     the code and the tip come back above Pay; nothing scrolls sideways;
 *   • no gift, no "Secured checkout by Stripe"; the tip and the code stay;
 *   • a tip and a code change the total, and the code is the server's word;
 *   • "Buying for a business" opens the company fields;
 *   • a free order posts to the free route and ends on the drawn check;
 *   • the header keeps Back to product and Continue Shopping.
 *
 *   pnpm build && node scripts/check-checkout.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-checkout-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".checkout-probe")
mkdirSync(stubs, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/checkout"
export const useRouter = () => ({ push(u) { window.__pushed = u }, prefetch() {}, replace(u) { window.__replaced = u }, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-checkout-probe.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
if (new URLSearchParams(location.search).get("case") === "paid") window.Capacitor = { isNativePlatform: () => true }
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
execFileSync(
  "npx",
  [
    "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
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
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

async function open(viewport, which) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}/?case=${which}`, { waitUntil: "load" })
  await p.waitForSelector("[data-page=checkout]")
  await sleep(350)
  return p
}
const text = (p) => p.evaluate(() => document.body.innerText)
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const clickText = (p, sel, t) => p.evaluate((s, want) => {
  const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === want)
  if (!el) return false
  el.click()
  return true
}, sel, t)
const visibleTotal = (p) => p.evaluate(() => {
  const dd = [...document.querySelectorAll("dl dd")].filter((d) => d.offsetParent && d.textContent.includes("USD"))
  return dd.map((d) => d.textContent.replace("USD", "").trim())[0] ?? null
})

console.log("\nlaptop, 1280 wide, a paid product")
{
  const p = await open({ width: 1280, height: 900 }, "paid")
  const cols = await p.evaluate(() => {
    const pay = document.querySelector("main").getBoundingClientRect()
    const order = document.querySelector("aside[aria-label='Order summary']").getBoundingClientRect()
    return { payLeft: Math.round(pay.left), payRight: Math.round(pay.right), orderLeft: Math.round(order.left), orderWidth: Math.round(order.width) }
  })
  expect(cols.orderWidth > 300 && cols.orderLeft >= cols.payRight - 1, "paying on the left, the order on the right", cols)
  const t = await text(p)
  expect(t.includes("Back to product") && t.includes("Continue Shopping"), "the header keeps Back to product and Continue Shopping")
  expect(!/gift/i.test(t), "no gift anywhere")
  expect(!t.includes("Secured checkout by Stripe"), "no 'Secured checkout by Stripe'")
  expect(t.includes("Add a tip for Andrew Rullz") && t.includes("Discount code"), "the tip and the discount code are there")
  expect(await p.evaluate(() => !!document.querySelector("input[placeholder='Enter discount code']")), "the code box says Enter discount code")
  expect((await visibleTotal(p)) === "$49.00", "the total starts at the price", await visibleTotal(p))
  await clickText(p, "aside [role=radio]", "$3")
  await sleep(250)
  expect((await visibleTotal(p)) === "$52.00", "a $3 tip is added to the total", await visibleTotal(p))
  await p.type("aside input[placeholder='Enter discount code']", "launch10")
  await clickText(p, "aside button", "Apply")
  await sleep(350)
  expect((await visibleTotal(p)) === "$47.10", "the server's discount comes off, the tip stays on", await visibleTotal(p))
  const sent = await p.evaluate(() => window.__commerceProbeCalls.find((c) => c.url.startsWith("/api/coupons/validate"))?.body)
  expect(sent && !("price_cents" in sent) && sent.productId === "p1", "the code check sends the product, never a price", sent)
  expect((await text(p)).includes("Pay $47.10"), "Pay shows the same total")
  await p.click("#buying-for-business")
  await sleep(350)
  const biz = await p.evaluate(() => {
    const el = document.getElementById("business-company")
    const r = el.getBoundingClientRect()
    return { h: Math.round(r.height), inert: !!el.closest("[inert]") }
  })
  expect(biz.h >= 44 && !biz.inert, "Buying for a business opens the company fields", biz)
  await sleep(600)
  const faded = await p.evaluate(() => [...document.querySelectorAll("aside .checkout-rise")].map((e) => getComputedStyle(e).opacity + ":" + e.getAnimations().map((a) => a.playState + "@" + Math.round(a.currentTime)).join("/")).filter((o) => !o.startsWith("1:")))
  expect(faded.length === 0, "a new line ends fully drawn, not half faded", faded)
  if (faded.length) console.log(await p.evaluate(() => { const e = document.querySelector(".checkout-rise"); const c = getComputedStyle(e); return [c.animationName, c.animationDuration, c.animationPlayState, c.animationDelay, c.animationFillMode, e.getAnimations().map((a) => a.playState + ":" + a.currentTime).join(",")].join(" | ") }))
  /* A tall viewport, not fullPage: fullPage resizes the page for the capture,
     which starts the rise animations over and photographs them at frame one. */
  await p.setViewport({ width: 1280, height: 1760 })
  await sleep(500)
  await p.screenshot({ path: join(shots, "checkout-1280.png") })
  expect((await p.evaluate(() => window.__errors)).length === 0, "no errors in the console", await p.evaluate(() => window.__errors))
  await p.close()
}

console.log("\nphone, 390 wide, a paid product")
{
  const p = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "paid")
  expect((await sideways(p)) <= 0, "nothing scrolls sideways", await sideways(p))
  const bar = await p.evaluate(() => {
    const b = document.querySelector("button[aria-controls='checkout-summary-phone']")
    const r = b.getBoundingClientRect()
    return { top: Math.round(r.top), h: Math.round(r.height), text: b.textContent.trim() }
  })
  expect(bar.top < 80 && bar.h >= 48 && bar.text.includes("$49.00"), "the order is a bar at the top, with the total", bar)
  expect(await p.evaluate(() => !document.querySelector("aside[aria-label='Order summary']").offsetParent), "the laptop's order column is not drawn")
  const beforePay = await p.evaluate(() => {
    const pay = [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Pay "))
    const tip = document.querySelector("section[aria-label='Order summary'] [role=radiogroup]")
    return { tipAbovePay: !!tip && tip.getBoundingClientRect().bottom < pay.getBoundingClientRect().top, payWidth: Math.round(pay.getBoundingClientRect().width) }
  })
  expect(beforePay.tipAbovePay, "the tip and the code sit just above Pay")
  expect(beforePay.payWidth >= 350, "Pay is the width of the screen less its gutters", beforePay.payWidth)
  const fonts = await p.evaluate(() => [...document.querySelectorAll("main input")].map((i) => parseFloat(getComputedStyle(i).fontSize)).filter((s) => s < 16))
  expect(fonts.length === 0, "every field is 16px, so iOS does not zoom into it", fonts)
  await p.click("button[aria-controls='checkout-summary-phone']")
  await sleep(350)
  const opened = await p.evaluate(() => Math.round(document.getElementById("checkout-summary-phone").getBoundingClientRect().height))
  expect(opened > 100, "tapping the bar opens the order", opened)
  await p.screenshot({ path: join(shots, "checkout-390.png"), fullPage: true })
  await p.close()
}

console.log("\nphone, 390 wide, a free product")
{
  const p = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "free")
  expect((await sideways(p)) <= 0, "nothing scrolls sideways", await sideways(p))
  expect(!(await text(p)).includes("Buying for a business"), "nothing to invoice on a free order")
  await clickText(p, "button", "Get it free")
  await sleep(200)
  expect((await text(p)).includes("Enter a valid email address."), "it says what is missing before sending anything")
  await p.type("#checkout-email", "ana@example.com")
  await p.type("#checkout-first-name", "Ana")
  await p.type("#checkout-last-name", "Pop")
  await clickText(p, "button", "Get it free")
  await sleep(200)
  expect((await text(p)).includes("Terms and Conditions"), "and asks for the terms")
  await p.click("#checkout-agree")
  await clickText(p, "button", "Get it free")
  await sleep(500)
  const posted = await p.evaluate(() => window.__commerceProbeCalls.find((c) => c.url === "/api/checkout/process")?.body)
  expect(posted && posted.agreedToTerms === true && !("tipCents" in posted), "the free route gets consent and no tip", posted)
  const overlay = await p.evaluate(() => document.querySelector(".checkout-paid")?.innerText ?? null)
  expect(!!overlay && overlay.includes("It's yours"), "it ends on the drawn check", overlay)
  await p.screenshot({ path: join(shots, "checkout-free-done.png") })
  await sleep(1000)
  /* Replaced, not pushed: Back from the receipt goes to the product, not to a finished checkout. */
  expect((await p.evaluate(() => window.__replaced)) === "/receipt/tok_free_1234567890" && !(await p.evaluate(() => window.__pushed)), "and then opens the receipt in its place", await p.evaluate(() => [window.__replaced, window.__pushed]))
  await p.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
