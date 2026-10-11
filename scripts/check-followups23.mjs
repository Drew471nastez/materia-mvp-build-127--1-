/**
 * ===========================================================================
 *  ROUND 23 FOLLOW-UPS, IN THE REAL COMPONENTS (tests/followups23.test.ts)
 * ===========================================================================
 * Mounts the real screens the way scripts/help-shots.mjs does
 * (scripts/render-help-shots.tsx, every /api answered from demo data) and
 * reads what they draw, at 1440x900 and at 390x844 on a touch phone with the
 * CPU slowed four times:
 *
 *   Locations          a Printful location says Connected to Printful
 *   the product        print on demand at Printful: not counted, never sold out
 *   the order          a buyer's cancel request, with its two answers;
 *                      a delivery problem in red with the next step
 *   the buyer's page   Cancel order, the request waiting, the shop's no;
 *                      the delivery problem heading
 *   Website settings   Commerce names Microsoft Clarity, Klaviyo and Omnisend
 *
 *   node scripts/check-followups23.mjs [out dir for the screenshots]
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
const shots = process.argv[2] ?? join(tmpdir(), "followups23")
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const out = join(root, ".followups23-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-help-shots.tsx"),
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
const server = createServer((req, res) => {
  const p = req.url.split("?")[0]
  if (p === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
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
  await wait(size.phone ? 3500 : 1800)
  return { page, errors }
}
const text = (page) => page.evaluate(() => document.body.innerText)
const pressText = (page, t) => page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === t); b?.click(); return !!b }, t)
/* Nothing wider than the screen: no sideways scroll on a phone. */
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

for (const size of SIZES) {
  console.log(`\n${size.tag} ${size.width}x${size.height}${size.phone ? ", touch, CPU x4" : ""}`)

  {
    const { page, errors } = await open(size, "view=locations")
    const t = await text(page)
    check("Locations: the Printful location says Connected to Printful", t.includes("Connected to Printful") && (await page.$('[data-location-partner="connected"]')) !== null)
    check("Locations: no location says Provider not connected", !t.includes("Provider not connected"))
    check("Locations: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `${size.tag}-locations.png`) })
    check("Locations: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=product&pod=1")
    const t = await text(page)
    check("Product at Printful: the Inventory card says it isn't counted", (await page.$("[data-made-to-order]")) !== null && t.includes("Not counted: Printful makes each one when it sells, so it never shows as sold out."))
    check("Product at Printful: no Track inventory switch and no quantities", !t.includes("Track inventory") && !t.includes("Keep selling when out of stock"))
    const inv = await page.evaluate(() => document.querySelector("#physical-inventory")?.getBoundingClientRect().height ?? 0)
    await page.evaluate(() => document.querySelector("#physical-inventory")?.scrollIntoView({ block: "start" }))
    await wait(300)
    await page.screenshot({ path: join(shots, `${size.tag}-product-pod.png`) })
    check("Product at Printful: the Inventory card stays short (one line, not stock fields)", inv > 0 && inv < 200, inv)
    check("Product: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    check("Product: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=order&cancel=1")
    const card = await page.$("[data-cancel-request]")
    const t = await text(page)
    check("Order: a buyer's request shows Cancel requested with the reason", !!card && t.includes("Cancel requested") && t.includes("Reason: Ordered the wrong size"))
    check("Order: it offers Keep order and Cancel order", (await page.$("[data-cancel-keep]")) !== null && (await page.$("[data-cancel-approve]")) !== null)
    const r = await page.evaluate(() => { const b = document.querySelector("[data-cancel-approve]")?.getBoundingClientRect(); return b ? { h: b.height, right: b.right, w: innerWidth } : null })
    check("Order: its buttons fit the screen and are tall enough to press", !!r && r.right <= r.w && r.h >= (size.phone ? 36 : 32), r)
    await card?.scrollIntoView()
    await page.screenshot({ path: join(shots, `${size.tag}-order-cancel-request.png`) })
    check("Order: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=order&order=shipped&problem=1")
    const t = await text(page)
    const tone = await page.evaluate(() => { const el = [...document.querySelectorAll("span")].find((s) => s.textContent.trim() === "Delivery problem"); return el ? getComputedStyle(el).color : null })
    check("Order: a failed shipment's badge says Delivery problem", tone !== null, tone)
    const [r, g, b] = (tone?.match(/\d+/g) ?? []).map(Number)
    check("  in red, not the green of Fulfilled", !!tone && r > 2 * g && r > 2 * b, tone)
    check("Order: with the next step written under it", (await page.$("[data-delivery-problem]")) !== null && t.includes("mark it in transit or delivered when it moves"))
    await (await page.$("[data-delivery-problem]"))?.scrollIntoView()
    await page.screenshot({ path: join(shots, `${size.tag}-order-problem.png`) })
    check("Order (problem): no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=status&cancel=can_request")
    check("Buyer page: Cancel order is there while the order is Unfulfilled", (await page.$("[data-cancel-button]")) !== null)
    await page.evaluate(() => document.querySelector("[data-cancel-button]")?.click())
    await wait(400)
    const form = await page.$("[data-cancel-form]")
    const t = await text(page)
    check("  pressing it opens the request with Keep my order and Ask to cancel", !!form && t.includes("Keep my order") && t.includes("Ask to cancel"))
    await form?.scrollIntoView()
    await page.screenshot({ path: join(shots, `${size.tag}-buyer-cancel-form.png`) })
    check("  no Return items while nothing has shipped", !t.includes("Return items"))
    check("Buyer page: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    check("Buyer page: no page errors", errors.length === 0, errors)
    await page.close()
  }
  for (const [state, words] of [["requested", "You asked to cancel this order."], ["declined", "is going ahead with this order"]]) {
    const { page } = await open(size, `view=status&cancel=${state}`)
    const t = await text(page)
    check(`Buyer page (${state}): says "${words}", no Cancel order button`, t.includes(words) && (await page.$("[data-cancel-button]")) === null)
    if (state === "requested") await page.screenshot({ path: join(shots, `${size.tag}-buyer-cancel-requested.png`) })
    await page.close()
  }
  {
    const { page } = await open(size, "view=status&problem=1")
    const t = await text(page)
    check("Buyer page: a failed shipment heads with There's a problem with your delivery", t.includes("There's a problem with your delivery") && t.includes("Delivery problem"))
    await page.close()
  }
  if (!size.phone) {
    const { page, errors } = await open(size, "view=website-commerce")
    await wait(1500)
    const t = await text(page)
    check("Website settings › Commerce names Microsoft Clarity, Klaviyo and Omnisend", ["Microsoft Clarity", "Klaviyo", "Omnisend", "Pinterest Tag"].every((n) => t.includes(n)))
    await page.evaluate(() => [...document.querySelectorAll("p,span,div")].find((e) => e.children.length === 0 && e.textContent.includes("Microsoft Clarity"))?.scrollIntoView({ block: "center" }))
    await wait(300)
    await page.screenshot({ path: join(shots, `${size.tag}-website-commerce.png`) })
    check("Website settings: no page errors", errors.length === 0, errors)
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
