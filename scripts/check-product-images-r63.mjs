/**
 * ===========================================================================
 *  EVERY PRODUCT PICTURE FILLS ITS FRAME (r63)
 * ===========================================================================
 * The native theme's product pictures, measured in Chromium at 360, 390, 768
 * and 1280 with pictures of the shapes creators upload (tall 4:5, square,
 * wide 16:9, a small 600px one, 2:3 and 3:2):
 *
 *   the main product section's gallery   scripts/render-product-images-r63.tsx
 *       (the real ProductSection), every media ratio and layout
 *   the shop's product grid              scripts/render-product-grid-images-r63.ts
 *       (the real theme engine), every photo shape
 *
 * For each picture: its box against its frame (the nearest ancestor that
 * clips), and the part of the frame the drawn picture covers, from its
 * natural size, object-fit and object-position. A picture fills its frame
 * when its box is the frame's and it covers at least 99.5% of it.
 *
 *   node scripts/check-product-images-r63.mjs [SHOTS_DIR]
 *
 * Exits 1 when any picture does not fill its frame. Materia's templates are
 * measured from their prerendered previews by the same rule (the r63 report).
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const shots = process.argv[2] || mkdtempSync(join(tmpdir(), "product-images-r63-"))
mkdirSync(shots, { recursive: true })
const work = join(root, ".wb-probe", "product-images-r63")
mkdirSync(work, { recursive: true })

/* The pictures: a colour each, a white edge and cross so a crop shows. */
const SHAPES = { tall45: [1600, 2000], square: [1600, 1600], wide169: [1920, 1080], small600: [600, 750], portrait23: [1000, 1500], landscape32: [1500, 1000] }
const COLOURS = ["#c82828", "#1e78c8", "#28a050", "#dca014", "#8c3cb4", "#141414"]
const files = {}
for (const [i, [name, [w, h]]] of Object.entries(SHAPES).entries()) {
  const b = Math.max(6, Math.round(w / 80))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${COLOURS[i]}"/><rect x="${b / 2}" y="${b / 2}" width="${w - b}" height="${h - b}" fill="none" stroke="#fff" stroke-width="${b}"/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#fff" stroke-width="${b}"/></svg>`
  files[name] = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer()
}

execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, "scripts/render-product-images-r63.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(work, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;', '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { cwd: root, stdio: "inherit" })
execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, "scripts/render-product-grid-images-r63.ts"), "--bundle", "--platform=node", "--format=esm", `--alias:@=${root}`, "--packages=external", "--loader:.css=empty", "--log-level=error", `--outfile=${join(work, "grid.mjs")}`], { cwd: root, stdio: "inherit" })
writeFileSync(join(work, "app.css"), await appCss(root))
const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="app.css"><style>body{margin:0;font-family:Inter,sans-serif}</style>`
writeFileSync(join(work, "product.html"), `<!doctype html><html class="light"><head>${head}</head><body><div id="root"></div><script src="probe.js"></script></body></html>`)
const cases = []
for (const shape of ["1 / 1", "4 / 3", "3 / 4"]) {
  const grid = JSON.parse(execFileSync(process.execPath, [join(work, "grid.mjs")], { cwd: root, encoding: "utf8", env: { ...process.env, SHAPE: shape } }))
  const name = `grid-${shape.replace(/\D+/g, "x")}`
  writeFileSync(join(work, `${name}.html`), `<!doctype html><html><head>${head}<style>${grid.css}</style></head><body><div style="container-type:inline-size" data-section-id="shop-all-products">${grid.html}</div></body></html>`)
  cases.push({ name, url: `file://${join(work, `${name}.html`)}` })
}
for (const ratio of ["natural", "square", "portrait", "landscape"])
  for (const layout of ["stacked", "stacked_2col", "slideshow", "carousel"])
    for (const imgs of ["tall45,wide169,square", "landscape32,portrait23,small600", "wide169"])
      cases.push({ name: `product-${ratio}-${layout}-${imgs.replace(/,/g, "+")}`, url: `file://${join(work, "product.html")}?ratio=${ratio}&layout=${layout}&imgs=${imgs}` })

function measure() {
  const out = []
  for (const img of document.querySelectorAll("[data-media-item] img, .card__media img")) {
    const r = img.getBoundingClientRect()
    if (r.width < 40 || r.height < 40) continue
    const cs = getComputedStyle(img)
    let f = img.parentElement
    while (f && f !== document.body) {
      const s = getComputedStyle(f)
      if (s.overflow !== "visible" || s.overflowX !== "visible") break
      f = f.parentElement
    }
    const fr = f.getBoundingClientRect()
    if (fr.right <= 0 || fr.left >= innerWidth) continue
    const nw = img.naturalWidth, nh = img.naturalHeight, fit = cs.objectFit
    let dw = r.width, dh = r.height
    if (nw && nh) {
      const s = fit === "cover" ? Math.max(r.width / nw, r.height / nh) : fit === "contain" ? Math.min(r.width / nw, r.height / nh) : null
      if (s !== null) { dw = nw * s; dh = nh * s }
    }
    const [px, py] = cs.objectPosition.split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5))
    const dx = r.left + (r.width - dw) * px, dy = r.top + (r.height - dh) * py
    const L = Math.max(dx, r.left, fr.left), T = Math.max(dy, r.top, fr.top), R = Math.min(dx + dw, r.right, fr.right), B = Math.min(dy + dh, r.bottom, fr.bottom)
    out.push({
      src: img.currentSrc.split("/").pop(), fit, img: [r.left, r.top, r.width, r.height].map(Math.round), frame: [fr.left, fr.top, fr.width, fr.height].map(Math.round),
      covered: Math.round(((Math.max(0, R - L) * Math.max(0, B - T)) / (fr.width * fr.height)) * 1000) / 1000,
      squash: fit === "fill" && nw ? Math.round(Math.abs(r.width / r.height / (nw / nh) - 1) * 1000) / 1000 : 0,
    })
  }
  return out
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--allow-file-access-from-files", "--hide-scrollbars"] })
let total = 0
const bad = []
let shifts = 0
for (const c of cases) {
  for (const width of [360, 390, 768, 1280]) {
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const m = r.url().match(/^https:\/\/img\.test\/([a-z0-9]+)\.jpg/)
      if (m && files[m[1]]) r.respond({ status: 200, contentType: "image/jpeg", body: files[m[1]] })
      else r.continue()
    })
    await page.evaluateOnNewDocument(() => {
      window.__cls = 0
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
    })
    await page.setViewport({ width, height: 900, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: width < 800 })
    await page.goto(c.url, { waitUntil: "networkidle0" })
    await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000) })))))
    await new Promise((r) => setTimeout(r, 300))
    const found = await page.evaluate(measure)
    const cls = await page.evaluate(() => window.__cls)
    if (cls > 0.001 && c.name.startsWith("product")) shifts++
    for (const i of found) {
      total++
      const ok = i.covered >= 0.995 && i.squash < 0.01 && Math.abs(i.img[2] - i.frame[2]) <= 1.5 && Math.abs(i.img[3] - i.frame[3]) <= 1.5
      if (!ok) bad.push({ case: c.name, width, ...i })
    }
    if (/grid-4x3|natural-(slideshow|stacked_2col|carousel)-tall45\+wide169\+square/.test(c.name)) await page.screenshot({ path: join(shots, `${c.name}-${width}.png`) })
    await page.close()
  }
}
await browser.close()
rmSync(work, { recursive: true, force: true })
for (const b of bad.slice(0, 20)) console.log("  not filling", JSON.stringify(b))
console.log(`\n${total} pictures measured in ${cases.length} cases at 4 widths: ${bad.length} not filling their frame; ${shifts} product pages shifted while their pictures loaded.\nScreenshots: ${shots}`)
process.exit(bad.length ? 1 : 0)
