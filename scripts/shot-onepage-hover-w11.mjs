/**
 * Wave 11 (hover): pictures of the owner's four cases, at rest and on hover, and a contact sheet of every theme's
 * buttons (a link, the owner's "My Link" card, a product card's button, the newsletter's) at rest and on hover, drawn
 * by scripts/render-onepage-hover-w11.tsx with a real pointer.
 *
 *   OUT=<dir> node scripts/shot-onepage-hover-w11.mjs        writes <dir>/owner-*.png and <dir>/sheet-*.png
 *   THEMES=a,b     only these themes on the sheet
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const OUT = process.env.OUT || "onepage-hover-shots"
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-hover-w11.tsx" })
const launch = () =>
  puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
const browser = await launch()

async function open(theme) {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 })
  await page.goto(`${base}/app/onepage?t=${theme}`)
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]))
  await sleep(1200)
  return page
}

/** A block's control at rest and on hover (the pointer on `hoverSel`, the control itself by default), as PNGs. */
async function both(page, sel, pad = 14) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    el.scrollIntoView({ block: "center" })
    return true
  }, sel)
  if (!ok) return null
  await page.mouse.move(2, 2)
  await sleep(500)
  const clip = await page.evaluate(
    (sel, pad) => {
      const r = document.querySelector(sel).getBoundingClientRect()
      return { x: Math.max(0, r.left - pad) + visualViewport.pageLeft, y: Math.max(0, r.top - pad) + visualViewport.pageTop, width: Math.min(innerWidth - Math.max(0, r.left - pad), r.width + 2 * pad), height: Math.min(innerHeight, r.height + 2 * pad) }
    },
    sel,
    pad,
  )
  const rest = await page.screenshot({ clip, captureBeyondViewport: false, encoding: "base64" })
  const c = await page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect()
    return { x: r.left + r.width * 0.7, y: r.top + r.height * 0.6 }
  }, sel)
  await page.mouse.move(c.x, c.y)
  /* Rested: the hover's fade done, and anything woken by it done too. */
  await sleep(900)
  const hover = await page.screenshot({ clip, captureBeyondViewport: false, encoding: "base64" })
  await page.mouse.move(2, 2)
  return { rest, hover }
}

/* The owner's four: Classic 98's product card (18 on hover, 19 at rest), its "My Link" (20), Grunge Zine's product card (21). */
const OWNER = [
  { name: "owner-18-19-classic98-product", theme: "classic98", sel: '[data-op-block="p-side"] [data-product-block]' },
  { name: "owner-20-classic98-my-link", theme: "classic98", sel: '[data-op-block="lv1"] a' },
  { name: "owner-21-grunge-zine-product", theme: "grunge2", sel: '[data-op-block="p-side"] [data-product-block]' },
  { name: "owner-extra-classic98-callout", theme: "classic98", sel: '[data-op-block="p-callout"] [data-product-block]' },
]
for (const o of OWNER) {
  const page = await open(o.theme)
  const s = await both(page, o.sel)
  if (s) {
    writeFileSync(`${OUT}/${o.name}-rest.png`, Buffer.from(s.rest, "base64"))
    writeFileSync(`${OUT}/${o.name}-hover.png`, Buffer.from(s.hover, "base64"))
  }
  await page.close()
}

/* The sheet: every theme, four buttons, rest and hover. */
const probe = await browser.newPage()
await probe.goto(`${base}/app/onepage?t=default`)
await sleep(500)
let themes = await probe.evaluate(() => globalThis.__themeIds)
const names = await probe.evaluate(() => globalThis.__themeNames)
await probe.close()
if (process.env.THEMES) themes = process.env.THEMES.split(",")
const CONTROLS = [
  ["link", '[data-op-block="l1"] a.op-btn'],
  ["My Link", '[data-op-block="lv1"] a'],
  ["product", '[data-op-block="p-side"] [data-product-cta]'],
  ["subscribe", '[data-op-block="e1"] button[type=submit]'],
]
const rows = []
for (const t of themes) {
  const page = await open(t)
  const cells = []
  for (const [label, sel] of CONTROLS) {
    /* A product's button plays its hover when its card is pointed at: the card is pointed at, the button pictured. */
    const s = await both(page, sel, 8)
    cells.push({ label, ...(s || {}) })
  }
  rows.push({ t, name: names[t] || t, cells })
  await page.close()
}
const html = (chunk) => `<!doctype html><meta charset=utf-8><style>body{margin:0;padding:16px;font:12px/1.3 system-ui,sans-serif;background:#f4f4f6;color:#111}
table{border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #ddd;vertical-align:middle;text-align:left}th{font-weight:600}
img{display:block;max-width:180px;max-height:120px;height:auto}.n{font-weight:700;width:120px}.st{color:#666;font-size:10px}</style>
<table><tr><th>theme</th>${CONTROLS.map(([l]) => `<th colspan=2>${l}<div class=st>rest · hover</div></th>`).join("")}</tr>
${chunk.map((r) => `<tr><td class=n>${r.name}<div class=st>${r.t}</div></td>${r.cells.map((c) => (c.rest ? `<td><img src="data:image/png;base64,${c.rest}"></td><td><img src="data:image/png;base64,${c.hover}"></td>` : `<td colspan=2>–</td>`)).join("")}</tr>`).join("")}</table>`
const sheet = await browser.newPage()
for (let i = 0; i * 14 < rows.length; i++) {
  await sheet.setViewport({ width: 1560, height: 800, deviceScaleFactor: 1 })
  await sheet.setContent(html(rows.slice(i * 14, i * 14 + 14)))
  await sleep(300)
  await sheet.screenshot({ path: `${OUT}/sheet-${i + 1}.png`, fullPage: true })
}
await browser.close()
server.close()
console.log(`wrote ${OUT}`)
