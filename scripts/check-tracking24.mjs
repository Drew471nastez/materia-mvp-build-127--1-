/**
 * ===========================================================================
 *  COURIER TRACKING, IN THE REAL COMPONENTS (tests/tracking24.test.ts)
 * ===========================================================================
 * Mounts the real screens (scripts/render-tracking24.tsx, every /api
 * answered from demo data) and reads what they draw, at 1440x900 and at
 * 390x844 on a touch phone with the CPU slowed four times:
 *
 *   the buyer's page   the carrier's scans with place and time, Estimated
 *                      delivery, Show all, Returned to sender
 *   the seller's page  Updated automatically with the scans, Pause automatic
 *                      updates in the menu, the hand statuses still there;
 *                      the line that says tracking is not set up yet
 *   Settings           Courier tracking on, or not set up, and the store's
 *                      own AfterShip account with its webhook address
 *
 *   node scripts/check-tracking24.mjs [out dir for the screenshots]
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
const shots = process.argv[2] ?? join(tmpdir(), "tracking24")
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const out = join(root, ".tracking24-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-tracking24.tsx"),
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
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
const shot = async (page, sel, name) => {
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel)
  await wait(250)
  await page.screenshot({ path: join(shots, name) })
}

for (const size of SIZES) {
  console.log(`\n${size.tag} ${size.width}x${size.height}${size.phone ? ", touch, CPU x4" : ""}`)
  {
    const { page, errors } = await open(size, "view=buyer&mode=auto")
    const t = await text(page)
    const rows = await page.$$eval("[data-tracking-checkpoints] li", (l) => l.length)
    const firstRow = await page.$eval("[data-tracking-checkpoints] li", (l) => l.textContent)
    check("Buyer: the newest four scans, the newest first, with place", rows === 4 && /^Out for delivery\s*Denver, CO, USA/.test(firstRow), { rows, firstRow })
    check("Buyer: Estimated delivery under the package and on the steps", (await page.$("[data-estimated-delivery]")) !== null && /Est\. [A-Z][a-z]{2}, [A-Z][a-z]{2} \d+/.test(t))
    check("Buyer: Show all 6 updates opens the rest", t.includes("Show all 6 updates"))
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Show all"))?.click())
    await wait(300)
    check("  after pressing it, all six", (await page.$$eval("[data-tracking-checkpoints] li", (l) => l.length)) === 6)
    check("Buyer: Track package still links to the carrier", t.includes("Track package"))
    check("Buyer: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await shot(page, "[data-shipment-status]", `${size.tag}-buyer-tracking.png`)
    check("Buyer: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=buyer&mode=returned")
    const t = await text(page)
    check("Buyer (returned): Returned to sender, the problem in plain words, no estimate", t.includes("Returned to sender") && t.includes("The carrier is sending this package back to the shop.") && (await page.$("[data-estimated-delivery]")) === null)
    await shot(page, "[data-shipment-status]", `${size.tag}-buyer-returned.png`)
    check("Buyer (returned): no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=seller&mode=auto")
    const t = await text(page)
    check("Seller: Updated automatically, the carrier's state and the estimate", (await page.$('[data-tracking-mode="auto"]')) !== null && t.includes("Updated automatically") && t.includes("Out for delivery") && /Estimated delivery [A-Z][a-z]{2}, /.test(t))
    check("Seller: the carrier's scans on the shipment card", (await page.$$eval("[data-tracking-checkpoints] li", (l) => l.length)) === 4)
    check("Seller: Mark as delivered is still there for a hand override", (await page.$("[data-mark-delivered]")) !== null)
    check("Seller: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await shot(page, "[data-shipment]", `${size.tag}-seller-tracking.png`)
    await page.click('[data-shipment] button[aria-label$="more actions"]')
    await wait(size.phone ? 900 : 400)
    const menu = await text(page)
    check("Seller: the menu has Pause automatic updates and the hand statuses", menu.includes("Pause automatic updates") && menu.includes("Report a delivery problem"))
    await page.screenshot({ path: join(shots, `${size.tag}-seller-menu.png`) })
    const item = await page.evaluateHandle(() => [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent.trim() === "Pause automatic updates"))
    if (item.asElement()) await item.asElement().click()
    await wait(size.phone ? 1500 : 800)
    check("  pressing it: Automatic updates paused", (await text(page)).includes("Automatic updates paused"))
    check("Seller: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=seller&mode=off")
    const t = await text(page)
    check("Seller (no tracking set up): says automatic updates turn on when Storelib's tracking is set up", t.includes("Automatic updates turn on when Storelib's tracking is set up") && !t.includes("Updated automatically"))
    await shot(page, "[data-shipment]", `${size.tag}-seller-off.png`)
    check("Seller (off): no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=settings&mode=auto&own=1")
    const t = await text(page)
    check("Settings: on, with how many parcels, and the store's own AfterShip with its webhook address", t.includes("Your parcels are followed automatically") && t.includes("7 parcels on the way right now") && t.includes("••••9f2c") && (await page.$("[data-tracking-own] input[readonly]")) !== null)
    check("Settings: never shows a whole key", !/as_key|9f2c[0-9a-z]/.test(t))
    check("Settings: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `${size.tag}-settings-own.png`) })
    check("Settings: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page } = await open(size, "view=settings&mode=off")
    const t = await text(page)
    check("Settings (not set up): says so, and offers Use my own account", t.includes("Automatic updates turn on when Storelib's tracking is set up") && t.includes("Use my own account"))
    await page.screenshot({ path: join(shots, `${size.tag}-settings-off.png`) })
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
