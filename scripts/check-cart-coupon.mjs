/**
 * ===========================================================================
 *  A DISCOUNT CODE ON THE CART, AND FROM A LINK, MEASURED
 * ===========================================================================
 * Checked in a browser, on the real components with the routes stubbed the
 * way the real ones answer:
 *
 *   • the cart's code box sits in the summary column, and Apply takes the
 *     server's discount off, with the code and a way to remove it;
 *   • ?discountCode= in the link applies itself as the page opens, on the
 *     cart and on the product checkout, and says why quietly when it cannot;
 *   • a new quantity prices the code again;
 *   • a code that makes the basket free asks for a name, an address and the
 *     Terms, and the button says Get it free;
 *   • fields are 16px, nothing scrolls sideways, on a light and a dark site.
 *
 *   pnpm build && node scripts/check-cart-coupon.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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

const out = mkdtempSync(join(tmpdir(), "storelib-cart-coupon-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
/* In the project, so the stubs resolve react from its node_modules; removed once bundled (.gitignore has .*-probe/). */
const stubs = join(root, ".cartcode-probe")
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
const entry = (name, probe) => writeFileSync(join(stubs, `${name}.tsx`), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, probe)}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
if (new URLSearchParams(location.search).get("case") === "paid") window.Capacitor = { isNativePlatform: () => true }
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
entry("cart", "scripts/render-cart-probe.tsx")
entry("checkout", "scripts/render-checkout-probe.tsx")
for (const name of ["cart", "checkout"]) {
  execFileSync(
    "pnpm",
    [
      "exec", "esbuild", join(stubs, `${name}.tsx`), "--bundle", "--format=iife", `--outfile=${join(out, `${name}.js`)}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@=${root}`,
      "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"',
      '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      "--log-level=warning",
    ],
    { cwd: root, stdio: "inherit" },
  )
}
rmSync(stubs, { recursive: true, force: true })
const bundles = { cart: readFileSync(join(out, "cart.js")), checkout: readFileSync(join(out, "checkout.js")) }
const page = (name) =>
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/${name}.js"></script></body></html>`
const server = createServer((req, res) => {
  for (const name of Object.keys(bundles)) {
    if (req.url.startsWith(`/${name}.js`)) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundles[name]) }
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(req.url.startsWith("/checkout") ? "checkout" : "cart"))
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
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

async function open(path, viewport = PHONE) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}${path}`, { waitUntil: "load" })
  await sleep(500)
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
const row = (p, label) => p.evaluate((l) => {
  const dt = [...document.querySelectorAll("dl dt")].find((d) => d.textContent.trim().startsWith(l))
  return dt ? dt.nextElementSibling.textContent.trim() : null
}, label)
const validations = (p) => p.evaluate(() => window.__commerceProbeCalls.filter((c) => c.url.startsWith("/api/coupons/validate")).length)

console.log("\ncart, phone, light site")
{
  const p = await open("/cart")
  expect((await sideways(p)) <= 0, "nothing scrolls sideways", await sideways(p))
  expect((await row(p, "Subtotal")) === "$53.00", "the subtotal is the basket's", await row(p, "Subtotal"))
  const fonts = await p.evaluate(() => [...document.querySelectorAll("input")].map((i) => parseFloat(getComputedStyle(i).fontSize)).filter((s) => s < 16))
  expect(fonts.length === 0, "the code field is 16px, so iOS does not zoom into it", fonts)
  const geo = await p.evaluate(() => {
    const input = document.getElementById("cart-discount-code").getBoundingClientRect()
    const pay = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Check out").getBoundingClientRect()
    return { inputLeft: Math.round(input.left), payLeft: Math.round(pay.left), above: input.bottom < pay.top, h: Math.round(input.height) }
  })
  expect(geo.above && Math.abs(geo.inputLeft - geo.payLeft) <= 1 && geo.h >= 44, "the code box is above Check out, in its column, a thumb tall", geo)
  await p.type("#cart-discount-code", "nope")
  await clickText(p, "button", "Apply")
  await sleep(300)
  const err = await p.evaluate(() => { const e = document.getElementById("cart-discount-code-error"); return e ? { t: e.textContent, role: e.getAttribute("role") } : null })
  expect(err?.t === "That code is not valid." && err.role === "alert", "a typed code that is wrong says so, as an alert", err)
  await p.evaluate(() => { const i = document.getElementById("cart-discount-code"); i.select() })
  await p.type("#cart-discount-code", "save20")
  await clickText(p, "button", "Apply")
  await sleep(300)
  expect((await row(p, "Discount")) === "−$10.60" && (await row(p, "Total")) === "$42.40", "Apply takes the server's discount off: $53.00 less $10.60 is $42.40", [await row(p, "Discount"), await row(p, "Total")])
  expect((await text(p)).includes("SAVE20 · 20% off") && (await p.evaluate(() => !!document.querySelector("button[aria-label='Remove discount code']"))), "the code shows as applied, with a way to remove it")
  const sent = await p.evaluate(() => window.__commerceProbeCalls.filter((c) => c.url.startsWith("/api/coupons/validate")).pop()?.body)
  expect(Array.isArray(sent?.items) && sent.items.length === 2 && !JSON.stringify(sent).includes("priceCents"), "the check sends the basket's lines, never a price", sent)
  await p.screenshot({ path: join(shots, "cart-390-applied.png"), fullPage: true })
  const before = await validations(p)
  await p.click("button[aria-label='One more Printed zine']")
  await sleep(150)
  await p.click("button[aria-label='One more Printed zine']")
  await sleep(900)
  expect((await validations(p)) === before + 1, "two quick presses on + price the code again once, after they stop", (await validations(p)) - before)
  expect((await row(p, "Total")) === "$61.60", "and the total is the new basket's: $77.00 less 20%", await row(p, "Total"))
  await p.click("button[aria-label='Remove discount code']")
  await sleep(200)
  expect((await row(p, "Discount")) === null && (await row(p, "Subtotal")) === "$77.00", "removing the code puts the subtotal back", await row(p, "Subtotal"))
  await clickText(p, "button", "Check out")
  await sleep(200)
  const pay = await p.evaluate(() => window.__commerceProbeCalls.filter((c) => c.url.startsWith("/api/checkout/cart")).pop()?.body)
  expect(pay && !("couponCode" in pay), "a removed code is not sent to Check out", pay)
  expect((await p.evaluate(() => window.__errors)).length === 0, "no errors in the console", await p.evaluate(() => window.__errors))
  await p.close()
}

console.log("\ncart, from a link with ?discountCode=")
{
  const p = await open("/cart?discountCode=SAVE20")
  expect((await validations(p)) === 1, "the link's code is checked once as the page opens", await validations(p))
  expect((await row(p, "Total")) === "$42.40" && (await text(p)).includes("SAVE20 · 20% off"), "and is applied without pressing Apply", await row(p, "Total"))
  await clickText(p, "button", "Check out")
  await sleep(200)
  const pay = await p.evaluate(() => window.__commerceProbeCalls.filter((c) => c.url.startsWith("/api/checkout/cart")).pop()?.body)
  expect(pay?.couponCode === "SAVE20", "Check out sends the applied code for the server to price", pay)
  await p.close()

  const q = await open("/cart?discountCode=old")
  const note = await q.evaluate(() => { const e = document.getElementById("cart-discount-code-error"); return e ? { t: e.textContent, role: e.getAttribute("role"), color: getComputedStyle(e).color } : null })
  expect(note?.t === "That code has expired." && note.role === "status" && !/185, 28, 28/.test(note.color), "a link's code that cannot apply says why, quietly, not in red", note)
  expect((await q.evaluate(() => document.getElementById("cart-discount-code").value)) === "old", "and stays in the field, to see or change")
  await q.screenshot({ path: join(shots, "cart-390-link-expired.png"), fullPage: true })
  await q.close()
}

console.log("\ncart, a code that makes it free")
{
  const p = await open("/cart?discountCode=FREEBIE")
  const t = await text(p)
  expect((await row(p, "Total")) === "$0.00" && t.includes("Get it free") && !t.includes("Payment is handled by Stripe"), "the total is $0.00 and the button says Get it free", await row(p, "Total"))
  const fields = await p.evaluate(() => ["First name", "Last name", "Email"].map((l) => !!document.querySelector(`input[aria-label='${l}']`)).concat(!!document.querySelector("input[type=checkbox]")))
  expect(fields.every(Boolean), "it asks for a name, an address and the Terms, there being no Stripe page to ask", fields)
  await clickText(p, "button", "Get it free")
  await sleep(250)
  expect((await text(p)).includes("Enter your name and email"), "without them it says what is missing")
  await p.type("input[aria-label='First name']", "Ada")
  await p.type("input[aria-label='Email']", "ada@example.com")
  await p.click("input[type=checkbox]")
  await clickText(p, "button", "Get it free")
  await sleep(250)
  const sent = await p.evaluate(() => window.__commerceProbeCalls.filter((c) => c.url.startsWith("/api/checkout/cart")).pop()?.body)
  expect(sent?.couponCode === "FREEBIE" && sent.buyer?.email === "ada@example.com" && sent.buyer.agreedToTerms === true, "and sends them with the code", sent)
  expect((await sideways(p)) <= 0, "nothing scrolls sideways", await sideways(p))
  await p.screenshot({ path: join(shots, "cart-390-free.png"), fullPage: true })
  await p.close()
}

console.log("\ncart, laptop, dark site")
{
  const p = await open("/cart?theme=dark&discountCode=SAVE20", { width: 1280, height: 900 })
  const geo = await p.evaluate(() => {
    const code = document.querySelector("button[aria-label='Remove discount code']").parentElement.getBoundingClientRect()
    const dl = document.querySelector("dl").getBoundingClientRect()
    return { codeW: Math.round(code.width), dlW: Math.round(dl.width), codeRight: Math.round(code.right), dlRight: Math.round(dl.right) }
  })
  expect(geo.codeW === 300 && geo.dlW === 300 && geo.codeRight === geo.dlRight, "the code and the totals share the 300px summary column", geo)
  await p.screenshot({ path: join(shots, "cart-1280-dark.png") })
  await p.close()
}

console.log("\nproduct checkout, from a link with ?discountCode=")
{
  const p = await open("/checkout?case=paid&discountCode=launch10", { width: 1280, height: 900 })
  const t = await text(p)
  expect(t.includes("LAUNCH10") && t.includes("10% off"), "the link's code is applied as the page opens", t.includes("LAUNCH10"))
  expect((await p.evaluate(() => window.__commerceProbeCalls.filter((c) => c.url.startsWith("/api/coupons/validate")).length)) === 1, "checked once")
  await p.close()
  const q = await open("/checkout?case=paid&discountCode=spring", { width: 1280, height: 900 })
  const note = await q.evaluate(() => { const e = document.querySelector("aside [id$='-error']"); return e ? { t: e.textContent, role: e.getAttribute("role"), color: getComputedStyle(e).color } : null })
  expect(note?.t === "That code is not valid." && note.role === "status" && !/220, 38, 38/.test(note.color), "one that cannot apply says why quietly, in grey", note)
  await q.screenshot({ path: join(shots, "checkout-1280-link-invalid.png") })
  await q.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
