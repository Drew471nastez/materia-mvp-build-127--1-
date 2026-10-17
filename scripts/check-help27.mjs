/**
 * ===========================================================================
 *  ROUND 27 ORDER HELP, IN THE REAL COMPONENTS (tests/help27.test.ts)
 * ===========================================================================
 * Mounts the real screens (scripts/render-help27.tsx, one in-memory case
 * behind every /api route) and measures them at 390x844 on a touch phone
 * with the CPU slowed four times, and at 820, 1024, 1440 and 1920 wide:
 *
 *   the buyer's page   the way back to the order, the conversation and the
 *                      reply box, the order and the shop beside it from
 *                      1024 px (under it on a phone), photos in a viewer,
 *                      Romanian; nothing wider than the screen
 *   live               the store answers in its thread and the buyer's page
 *                      shows it without a reload, and back
 *   the store          Support with the case open: the thread and the day to
 *                      answer by; the list
 *   Storelib           Resolution center with the case open: the order
 *                      beside the thread
 *
 *   node scripts/check-help27.mjs [out dir for the screenshots]
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const shots = process.argv[2] ?? join(tmpdir(), "help27")
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const out = join(root, ".help27-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-help27.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="usd"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL=""', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=""',
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
  `--alias:server-only=${join(out, "empty.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "inherit", "inherit"] })
const bundle = readFileSync(join(out, "probe.js"))
rmSync(out, { recursive: true, force: true })
const css = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.split("?")[0] === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
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
async function open(size, q) {
  const page = await browser.newPage()
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.phone ? 3 : 1, isMobile: !!size.phone, hasTouch: !!size.phone })
  if (size.phone) {
    const cdp = await page.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await page.goto(`${base}/?${q}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(size.phone ? 3000 : 1500)
  return { page, errors }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) } : null }, sel)

const SIZES = [
  { tag: "390", width: 390, height: 844, phone: true },
  { tag: "820", width: 820, height: 1180 },
  { tag: "1024", width: 1024, height: 768 },
  { tag: "1440", width: 1440, height: 900 },
  { tag: "1920", width: 1920, height: 1080 },
]

for (const size of SIZES) {
  console.log(`\nbuyer ${size.tag}${size.phone ? ", touch, CPU x4" : ""}`)
  for (const lang of size.tag === "390" || size.tag === "1440" ? ["en", "ro"] : ["en"]) {
    const { page, errors } = await open(size, `view=buyer&lang=${lang}`)
    const t = await page.evaluate(() => document.body.innerText)
    check(`${lang}: the way back to the order`, (await page.$('[data-case-back][href^="/checkout/physical/order/"]')) !== null && (await page.$("[data-case-order-link]")) !== null)
    check(`${lang}: the thread with the shop's answer and the photos`, (await page.$$('[data-case-thread] [data-message="store"]')).length >= 1 && (await page.$$("[data-message-photos] img")).length === 3)
    const conv = await box(page, "[data-case-conversation]")
    const aside = await box(page, "[data-case-aside]")
    if (size.width >= 1024) check(`${lang}: the order and the shop sit beside the conversation`, aside && conv && aside.x > conv.x + conv.w - 2 && Math.abs(aside.y - conv.y) < 4, { conv, aside })
    else check(`${lang}: the order and the shop come under the conversation`, aside && conv && aside.y >= conv.bottom, { conv, aside })
    if (size.width >= 1440) check(`${lang}: the conversation keeps a reading width`, conv && conv.w <= 800, conv)
    check(`${lang}: nothing wider than the screen`, (await overflow(page)) <= 0, await overflow(page))
    if (lang === "ro") check("ro: in Romanian", /Înapoi la comanda #DA0D603D/.test(t) && /Așteaptă răspunsul magazinului/.test(t) && /Vizitează magazinul|Comanda ta/.test(t), t.slice(0, 300))
    await page.screenshot({ path: join(shots, `buyer-${lang}-${size.tag}.png`), fullPage: true })
    if (lang === "en") {
      await page.click("[data-message-photos] a")
      await wait(500)
      check(`${lang}: a photo opens in the viewer over the page`, (await page.$("[data-photo-viewer] img")) !== null)
      await page.screenshot({ path: join(shots, `buyer-photo-${size.tag}.png`) })
      await page.keyboard.press("ArrowRight")
      await wait(150)
      const second = await page.evaluate(() => document.querySelector("[data-photo-viewer] img")?.getAttribute("alt"))
      check(`${lang}: arrows move to the next photo`, second === "mug-close.jpg", second)
      await page.keyboard.press("Escape")
      await wait(200)
      check(`${lang}: Escape closes it`, (await page.$("[data-photo-viewer]")) === null)
      /* A reply from the buyer. */
      await page.type("#case-reply", "Perfect, thank you!")
      await page.click("[data-case-send]")
      await wait(900)
      check(`${lang}: the reply is sent and shows in the thread`, (await page.evaluate(() => [...document.querySelectorAll('[data-case-thread] [data-message="buyer"]')].some((li) => li.textContent.includes("Perfect, thank you!")))))
    }
    check(`${lang}: no page errors`, errors.length === 0, errors)
    await page.close()
  }
}

console.log("\nlive: the store answers, the buyer's open page shows it, and back")
{
  const { page, errors } = await open({ width: 1600, height: 1000 }, "view=both")
  const before = await page.$$eval('[data-pane="buyer"] [data-message="store"]', (els) => els.length)
  await page.type('[data-pane="seller"] textarea', "A new mug went out today, tracking AWB 1ONB2499.")
  const sentAt = Date.now()
  await page.click('[data-pane="seller"] [data-case-reply]')
  let seen = 0
  for (let i = 0; i < 100 && !seen; i++) {
    await wait(100)
    const n = await page.$$eval('[data-pane="buyer"] [data-message="store"]', (els) => els.length)
    if (n > before) seen = Date.now() - sentAt
  }
  check("the store's answer appears on the buyer's page without a reload", seen > 0, { before })
  console.log(`        seen after ${seen} ms (polling only here: no Realtime in the probe)`)
  await page.screenshot({ path: join(shots, "live-store-to-buyer.png") })
  const sBefore = await page.$$eval('[data-pane="seller"] [data-message="buyer"]', (els) => els.length)
  await page.type('[data-pane="buyer"] #case-reply', "Got the tracking, thanks!")
  const at2 = Date.now()
  await page.click('[data-pane="buyer"] [data-case-send]')
  let seen2 = 0
  for (let i = 0; i < 100 && !seen2; i++) {
    await wait(100)
    const n = await page.$$eval('[data-pane="seller"] [data-message="buyer"]', (els) => els.length)
    if (n > sBefore) seen2 = Date.now() - at2
  }
  check("the buyer's answer appears in the store's thread without a reload", seen2 > 0)
  console.log(`        seen after ${seen2} ms`)
  const reads = await page.evaluate(() => window.__calls.filter((c) => /^GET \/api\/(order-help|store\/cases)\//.test(c)))
  check("the pages keeping up ask only for what is new (?after=)", reads.slice(2).every((c) => /after=\d+/.test(c)), reads.slice(0, 6))
  await page.screenshot({ path: join(shots, "live-buyer-to-store.png") })
  check("live: no page errors", errors.length === 0, errors)
  await page.close()
}

for (const size of [SIZES[0], SIZES[3], SIZES[4]]) {
  console.log(`\nstore and Storelib ${size.tag}`)
  {
    const { page, errors } = await open(size, "view=seller")
    await wait(600)
    check("Support: the case open, the thread and the reply box", (await page.$("[data-buyer-case] [data-case-reply]")) !== null && (await page.$$('[data-buyer-case] [data-message="buyer"]')).length >= 2)
    check("Support: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `seller-case-${size.tag}.png`), fullPage: true })
    check("Support: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=support")
    await wait(600)
    check("Support list: the cases with whose turn it is", (await page.$$("[data-buyer-cases] [data-case]")).length === 3)
    await page.screenshot({ path: join(shots, `support-list-${size.tag}.png`) })
    check("Support list: no page errors", errors.length === 0, errors)
    await page.close()
  }
  {
    const { page, errors } = await open(size, "view=admin")
    await wait(800)
    const t = await page.evaluate(() => document.body.innerText)
    check("Storelib: the case open with the order beside it", (await page.$("[data-admin-case-order]")) !== null && /Speckled mug/.test(t) && /1ONB2427/.test(t))
    check("Storelib: the internal note in the thread", (await page.$('[data-admin-case-message="note"]')) !== null)
    check("Storelib: the waiting count on the tab", /Buyer cases \(1\)/.test(t))
    check("Storelib: nothing wider than the screen", (await overflow(page)) <= 0, await overflow(page))
    await page.screenshot({ path: join(shots, `admin-case-${size.tag}.png`), fullPage: true })
    check("Storelib: no page errors", errors.length === 0, errors)
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
