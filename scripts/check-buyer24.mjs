/**
 * ===========================================================================
 *  ROUND 24 BUYER CONTACT, IN THE REAL COMPONENTS (tests/buyer24.test.ts)
 * ===========================================================================
 * Mounts the real screens (scripts/render-buyer24.tsx, every /api answered
 * from demo data) and reads what they draw, at 1440x900 and at 390x844 on a
 * touch phone with the CPU slowed four times:
 *
 *   the buyer's page   Need help with this order?: Contact the shop with its
 *                      topics, a photo picked and sent as a form, Cancel order
 *                      and Return items in the same panel, the shop's email
 *                      and phone; a parcel never marked delivered says the
 *                      last day for returns
 *   the conversation   the photo, Ask Storelib for help
 *   the seller's order Messages from the buyer with the reply box, the cart's
 *                      attributes and a line's properties in Notes, Delivery
 *                      not confirmed on the shipment
 *   a product page     saved before the block: Delivery and pickup after the
 *                      low stock line
 *
 *   node scripts/check-buyer24.mjs [out dir for the screenshots]
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
const shots = process.argv[2] ?? join(tmpdir(), "buyer24")
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const out = join(root, ".buyer24-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-buyer24.tsx"),
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
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
const PNG = join(tmpdir(), "buyer24-photo.png")
writeFileSync(PNG, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"))

for (const size of SIZES) {
  console.log(`\n${size.tag} ${size.width}x${size.height}${size.phone ? ", touch, CPU x4" : ""}`)

  {
    const { page, errors } = await open(size, "view=status&cancel=1")
    let t = await text(page)
    check("Order page: Need help with this order?, with Contact the shop", t.includes("Need help with this order?") && (await page.$("[data-order-help-open]")) !== null)
    check("Order page: Cancel order and Return items in the same panel", (await page.$("[data-help-options] [data-cancel-button]")) !== null && (await page.$("[data-help-options] [data-return-button]")) !== null)
    check("Order page: the shop's email and phone", t.includes("hello@fernandclay.example") && t.includes("+1 303 555 0142"))
    check("Order page: a parcel never marked delivered says the last day for returns", (await page.$("[data-return-assumed]")) !== null, t.slice(0, 300))
    await page.evaluate(() => document.querySelector("[data-order-help]")?.scrollIntoView({ block: "start" }))
    await wait(300)
    await page.screenshot({ path: join(shots, `${size.tag}-order-help.png`) })
    await page.click("[data-order-help-open]")
    await wait(400)
    const topics = await page.$$eval("[data-topic]", (els) => els.map((e) => e.textContent.trim()))
    check("Contact the shop: the topics", ["A question", "Change the address", "Cancel the order", "It arrived damaged", "Something is missing", "I want to return it", "I want a refund", "Something else"].every((x) => topics.includes(x)), topics)
    await page.click('[data-topic="cancel"]')
    await wait(200)
    check("Choosing Cancel the order points to Cancel order", (await page.$('[data-help-shortcut="cancel"]')) !== null)
    await page.click('[data-topic="damaged"]')
    await page.type("[data-order-help-message]", "The bowl arrived cracked down the side.")
    const input = await page.$('[data-case-photos] input[type="file"]')
    await input.uploadFile(PNG)
    await wait(800)
    check("A photo picked shows as a thumbnail", (await page.$$("[data-case-photos] img")).length === 1)
    check("Form: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `${size.tag}-contact-form.png`) })
    await page.click("[data-order-help-send]")
    await wait(1000)
    const calls = await page.evaluate(() => window.__calls)
    check("Send posts the words and the photo as a form", calls.some((c) => /^POST \/api\/order-help form photos=1$/.test(c)), calls)
    t = await text(page)
    check("Sent: the buyer is told, with the conversation's link", t.includes("Sent to Fern & Clay") && (await page.$("[data-order-help-case]")) !== null)
    await page.screenshot({ path: join(shots, `${size.tag}-contact-sent.png`) })
    await page.evaluate(() => document.querySelector("[data-help-options] [data-return-button]")?.click())
    await wait(600)
    check("Return items from the panel opens the return form", (await page.$("[data-return-form]")) !== null)
    check("Order page: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=case")
    const t = await text(page)
    check("Conversation: the buyer's photo shows", (await page.$("[data-message-photos] img")) !== null)
    check("Conversation: Ask Storelib for help after three days unanswered", (await page.$("[data-case-ask-storelib]")) !== null && t.includes("hasn't answered for three days"))
    check("Conversation: photos can go with a reply", (await page.$("[data-case-photos-add]")) !== null)
    await page.screenshot({ path: join(shots, `${size.tag}-case.png`), fullPage: true })
    await page.click("[data-case-ask-storelib]")
    await wait(300)
    await page.click("[data-case-escalate]")
    await wait(800)
    check("Asked: Storelib has it, and the shop has been told", (await text(page)).includes("Storelib has your case"))
    check("Conversation: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    check("Conversation: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=seller")
    await wait(800)
    const t = await text(page)
    check("Seller's order: Messages from the buyer, with the reply box", (await page.$("[data-order-messages]")) !== null && (await page.$("[data-case-reply]")) !== null && t.includes("The bowl arrived cracked"))
    check("Seller's order: the buyer's photo in the thread", (await page.$("[data-order-messages] [data-message-photos] img")) !== null)
    check("Seller's order: the cart's attributes and the line's properties in Notes", (await page.$("[data-order-attributes]")) !== null && t.includes("Happy housewarming, Ana!") && t.includes("Engraving: A & J"))
    check("Seller's order: the shipment reads Delivery not confirmed, with what to do", t.includes("Delivery not confirmed") && (await page.$("[data-delivery-unconfirmed]")) !== null)
    check("Seller's order: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `${size.tag}-seller-order.png`), fullPage: true })
    check("Seller's order: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=product")
    const order = await page.$$eval("[data-block-type]", (els) => els.map((e) => e.getAttribute("data-block-type")))
    const t = await text(page)
    check("Product page saved before the block: Delivery and pickup right after the low stock line", order.indexOf("delivery") === order.indexOf("low_stock") + 1 && order.includes("delivery"), order)
    check("  it says the delivery and the pickup point", (await page.$("[data-delivery]")) !== null && /Studio/.test(t), t.slice(0, 400))
    await page.evaluate(() => document.querySelector("[data-delivery]")?.scrollIntoView({ block: "center" }))
    await wait(300)
    await page.screenshot({ path: join(shots, `${size.tag}-product-delivery.png`) })
    check("Product: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    check("Product: no page errors", errors.length === 0, errors)
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
