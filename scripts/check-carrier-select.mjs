/**
 * ===========================================================================
 *  THE CARRIER PICKER, PHOTOGRAPHED AND MEASURED
 * ===========================================================================
 * components/physical/carrier-picker.tsx with ./carrier-live.tsx under it, as
 * Fulfill items draws them for a parcel to Romania
 * (scripts/render-carrier-select.tsx), in Chromium at 1440x900 and at a phone
 * (390x844, touch, CPU four times slower), with stand-ins for
 * /api/physical/carriers and the order's label route.
 *
 *   FIRST     the field starts on the shop's default
 *   OPEN      the list is there on the first frames after the press, with
 *             every carrier, before the connected carriers have answered
 *             (held back 1.2s on purpose)
 *   FOLD IN   Starred, Connected, Your carriers, Popular in Romania, All
 *             carriers, the list still open
 *   SEARCH    "fan" puts FAN Courier first
 *   HONEST    no price or delivery time anywhere until Show rates; then the
 *             provider's own numbers, and only those
 *   STAR      a star is one PUT with the new list
 *   LAYOUT    inside the screen, nothing sideways, 48px rows on a phone
 *   CONTRAST  every word at 4.5:1 or better
 *   COLOUR    nothing purple or violet
 *   LOGO      a tile that 404s (DPD here) leaves its letters, no broken image
 *
 *   PROBE_CSS=source node scripts/check-carrier-select.mjs
 *   SHOTS_DIR=... keeps the screenshots.
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const out = mkdtempSync(join(tmpdir(), "storelib-carrier-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const stubs = join(root, ".carrier-select-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/orders"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
try {
  execFileSync("npx", ["esbuild", join(root, "scripts/render-carrier-select.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error"], { cwd: root, stdio: "inherit" })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
const css = (await appCss(root)) + "\n" + interFaces(root)
const html = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`

/* ── the stand-ins ─────────────────────────────────────────────────── */
let prefs
const puts = []
const reset = () => {
  prefs = { favourites: ["FAN Courier"], defaultCarrier: "FAN Courier", lastCarrier: null, custom: [{ id: "vanman", name: "Van Man", urlTemplate: "https://track.example.com/{tracking}" }], ready: true }
  puts.length = 0
}
const CONNECTED = { carriers: [{ carrier: "USPS", provider: { id: "shippo", name: "Shippo" }, services: ["Priority Mail", "Ground Advantage"] }, { carrier: "UPS", provider: { id: "shippo", name: "Shippo" }, services: ["UPS Ground"] }], errors: [] }
const RATES = { provider: "shippo", shipmentId: "s1", rates: [{ carrier: "USPS", service: "Priority Mail", days: 2, price: "$9.10", cents: 910, currency: "USD" }, { carrier: "USPS", service: "Ground Advantage", days: 5, price: "$6.40", cents: 640, currency: "USD" }, { carrier: "UPS", service: "UPS Ground", days: 4, price: "$11.20", cents: 1120, currency: "USD" }], addressOk: true, warnings: [] }
const server = createServer((req, res) => {
  const json = (body, ms = 60, status = 200) => setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, ms)
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (req.url === "/api/physical/carriers?connected=1") return json(CONNECTED, 1200)
  if (req.url === "/api/physical/carriers") {
    if (req.method === "PUT") {
      let b = ""
      req.on("data", (c) => (b += c))
      req.on("end", () => { const body = JSON.parse(b); puts.push(body); Object.assign(prefs, body); json(prefs) })
      return
    }
    return json(prefs)
  }
  if (req.url.startsWith("/api/physical/orders/o1/label")) {
    if (req.method === "POST") return json(RATES, 300)
    return json({ apps: [{ id: "shippo", name: "Shippo", test: false }], defaultPackageId: "pk1", to: { complete: true, line: "1 Main St" }, packages: [], labels: [] })
  }
  if (req.url.startsWith("/carriers/dpd.webp")) { res.writeHead(404); return res.end() }
  /* The app's own public files (the flag sprite), as the site serves them. */
  const pub = join(root, "public", decodeURIComponent(req.url.split("?")[0]))
  if (req.url.length > 1 && pub.startsWith(join(root, "public")) && existsSync(pub) && statSync(pub).isFile()) {
    res.writeHead(200, { "content-type": pub.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" })
    return res.end(readFileSync(pub))
  }
  if (req.url.startsWith("/api/")) return json({ error: "Not here." }, 10, 404)
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const ORIGIN = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--disable-gpu"] })

/* Checks every element under these roots: contrast of its own text and no purple in any colour it paints. */
const look = (p, sel) =>
  p.evaluate((sel) => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number)
    const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c.slice(0, 3) } return [255, 255, 255] }
    const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 30) return null; const d = mx - mn; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h }
    const els = [...document.querySelectorAll(sel)].flatMap((r) => [r, ...r.querySelectorAll("*")])
    let worst = { ratio: 99, text: "" }
    const purple = []
    for (const el of els) {
      const cs = getComputedStyle(el)
      for (const prop of ["color", "backgroundColor", "borderTopColor", "fill", "stroke"]) {
        const c = rgb(cs[prop] || "")
        if (c.length < 3 || c[3] === 0) continue
        const h = hue(c.slice(0, 3))
        if (h !== null && h >= 250 && h <= 320) purple.push(`${el.tagName}.${prop}=${cs[prop]}`)
      }
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!own || el.closest("[data-carrier-mark]") || el.closest("[data-carrier-add]") || el.getBoundingClientRect().width === 0) continue
      const r = ratio(rgb(cs.color).slice(0, 3), bgOf(el))
      if (r < worst.ratio) worst = { ratio: Math.round(r * 100) / 100, text: el.textContent.trim().slice(0, 40) }
    }
    return { worst, purple: purple.slice(0, 5) }
  }, sel)

try {
  for (const [name, vp] of [["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }], ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const phone = name === "390"
    reset()
    console.log(`\n${name}: Fulfill items, the carrier field`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    if (phone) { const cdp = await p.target().createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }) }
    await p.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" })
    await p.waitForSelector("[data-carrier-field]")
    await p.evaluate(() => document.fonts.ready)
    await sleep(400)
    await p.screenshot({ path: join(shots, `carrier-${name}-closed.png`) })
    const field = await p.$eval("[data-carrier-field]", (b) => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), text: b.textContent.trim(), value: b.getAttribute("data-carrier-field") } })
    expect(field.h >= (phone ? 44 : 40), "the field is a full height field", field)
    expect(field.value === "fan-courier", "it starts on the shop's default", field)

    /* OPEN: time from the press to rows on screen, the connected carriers still on their way. */
    const opened = await p.evaluate(async (phone) => {
      const t0 = performance.now()
      const b = document.querySelector("[data-carrier-field]")
      b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: phone ? "touch" : "mouse", button: 0 }))
      b.click()
      for (;;) {
        const rows = document.querySelectorAll("[data-carrier-list] [data-carrier-option]")
        if (rows.length) return { ms: Math.round(performance.now() - t0), rows: rows.length, connected: !!document.querySelector('[data-carrier-list] [role="group"][aria-label="Connected"]') }
        await new Promise((r) => requestAnimationFrame(r))
        if (performance.now() - t0 > 3000) return { ms: 9999, rows: 0 }
      }
    }, phone)
    expect(opened.ms <= (phone ? 250 : 120), `the list is there ${phone ? "within 250ms on a phone four times slower" : "within 120ms"}`, opened)
    expect(opened.rows >= 27 && !opened.connected, "with every carrier, before the connected ones have answered", opened)
    await sleep(phone ? 700 : 350)
    await p.screenshot({ path: join(shots, `carrier-${name}-open.png`) })
    await sleep(1300)
    const groups = await p.$$eval("[data-carrier-list] [role=group]", (g) => g.map((x) => [x.getAttribute("aria-label") || "", [...x.querySelectorAll("[data-carrier-option]")].map((o) => o.getAttribute("data-carrier-option"))]))
    const titles = groups.map((g) => g[0]).filter(Boolean)
    expect(titles.join("|") === "Starred|Connected|Your carriers|Popular in Romania|All carriers", "Starred, Connected, Your carriers, Popular in Romania, All carriers; the list still open", titles)
    const of = (t) => (groups.find((g) => g[0] === t) || [null, []])[1]
    expect(of("Starred").join() === "fan-courier" && of("Connected").join() === "usps,ups" && of("Your carriers").join() === "name:Van Man", "each in its group", { starred: of("Starred"), connected: of("Connected"), own: of("Your carriers") })
    const all = groups.flatMap((g) => g[1])
    expect(all.filter((v) => v === "usps").length === 1 && all.filter((v) => v === "fan-courier").length === 1, "a carrier is listed once", null)
    await p.screenshot({ path: join(shots, `carrier-${name}-connected.png`) })

    const box = await p.evaluate(() => {
      const el = document.querySelector("[data-carrier-popover]") || document.querySelector("[data-carrier-list]").closest("[data-sheet-panel]") || document.querySelector("[data-carrier-list]")
      const r = el.getBoundingClientRect()
      const rows = [...document.querySelectorAll("[data-carrier-list] [data-carrier-option]")].filter((b) => b.getBoundingClientRect().height > 0).map((b) => Math.round(b.getBoundingClientRect().height))
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight, sideways: document.documentElement.scrollWidth - innerWidth, minRow: Math.min(...rows) }
    })
    expect(box.left >= 0 && box.right <= box.w && box.bottom <= box.h + 1 && box.sideways <= 0, "the list is inside the screen, nothing sideways", box)
    expect(box.minRow >= (phone ? 48 : 40), `rows at least ${phone ? 48 : 40}px`, box.minRow)
    const seen = await look(p, "[data-carrier-list], [data-carrier-field]")
    expect(seen.worst.ratio >= 4.5, "every word at 4.5:1 or better", seen.worst)
    expect(seen.purple.length === 0, "nothing purple or violet", seen.purple)
    const priceBefore = await p.evaluate(() => ({ money: /\$\d/.test(document.body.innerText), days: /\d+ days?/.test(document.body.innerText) }))
    expect(!priceBefore.money && !priceBefore.days, "no price and no delivery time before a provider priced this parcel", priceBefore)
    /* The DPD tile's file 404s here: its pixels should be the plain tile and its letters, not a broken picture. */
    await p.evaluate(() => document.querySelector('[data-carrier-option="dpd"]').scrollIntoView({ block: "center" }))
    await sleep(500)
    const tileShot = async (id) => {
      const clip = await p.$eval(`[data-carrier-option="${id}"] [data-carrier-logo]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX + 1, y: r.top + scrollY + 1, width: r.width - 2, height: r.height - 2 } })
      const png = await p.screenshot({ clip, encoding: "base64", captureBeyondViewport: false })
      writeFileSync(join(shots, `tile-${name}-${id}.png`), Buffer.from(png, "base64"))
      return p.evaluate(async (b64) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
        const c = new OffscreenCanvas(bmp.width, bmp.height)
        const x = c.getContext("2d")
        x.drawImage(bmp, 0, 0)
        const d = x.getImageData(0, 0, bmp.width, bmp.height).data
        let plain = 0, dark = 0
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - 241) < 6 && Math.abs(d[i + 1] - 242) < 6 && Math.abs(d[i + 2] - 244) < 6) plain++
          else if (d[i] < 120 && d[i + 1] < 120 && d[i + 2] < 120) dark++
        }
        const n = d.length / 4
        return { plain: +(plain / n).toFixed(2), dark: +(dark / n).toFixed(2) }
      }, png)
    }
    const dpd = { ...(await tileShot("dpd")), letters: await p.$eval('[data-carrier-option="dpd"] [data-carrier-logo-letters]', (e) => e.textContent), status: await p.evaluate(async () => (await fetch("/carriers/dpd.webp")).status) }
    const fan = await tileShot("fan-courier")
    expect(dpd.status === 404 && dpd.letters === "D" && dpd.plain > 0.6 && dpd.dark > 0.02, "a tile whose file 404s (DPD) is the plain tile with its letters, nothing broken drawn", dpd)
    expect(fan.plain < 0.3, "a tile that loads (FAN Courier) is its logo", fan)
    await p.screenshot({ path: join(shots, `carrier-${name}-logo-fallback.png`) })

    /* SEARCH */
    await p.type("[data-carrier-search]", "fan")
    await sleep(150)
    const first = await p.$eval("[data-carrier-list] [data-carrier-option]", (b) => b.getAttribute("data-carrier-option"))
    expect(first === "fan-courier", "'fan' puts FAN Courier first", first)
    await p.screenshot({ path: join(shots, `carrier-${name}-search.png`) })
    await p.evaluate(() => { const i = document.querySelector("[data-carrier-search]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })) })
    await sleep(150)

    /* STAR */
    await p.evaluate(() => document.querySelector('[data-carrier-star="DPD"]').click())
    await sleep(400)
    expect(puts.length === 1 && JSON.stringify(puts[0].favourites) === '["FAN Courier","DPD"]', "a star is one PUT with the new list", puts)

    /* PICK USPS from Connected, then Show rates */
    await p.evaluate(() => document.querySelector('[data-carrier-option="usps"]').click())
    await sleep(phone ? 800 : 300)
    const services = await p.$$eval("[data-carrier-service]", (li) => li.map((l) => l.innerText.replace(/\s+/g, " ").trim()))
    expect(services.join("|") === "Priority Mail|Ground Advantage", "USPS chosen: the service names from the Shippo account, no prices", services)
    await p.evaluate(() => document.querySelector("[data-carrier-rates]").click())
    const loading = await p.evaluate(() => !!document.querySelector("[data-carrier-rates-loading]"))
    expect(loading, "Show rates says it is asking")
    await sleep(1200)
    const priced = await p.$$eval("[data-carrier-service]", (li) => li.map((l) => l.innerText.replace(/\s+/g, " ").trim()))
    expect(priced.join("|") === "Priority Mail 2 days $9.10|Ground Advantage 5 days $6.40", "then the provider's own days and prices, and nothing else", priced)
    await p.screenshot({ path: join(shots, `carrier-${name}-rates.png`) })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall good")
process.exit(broken ? 1 : 0)
