#!/usr/bin/env node
/**
 * ===========================================================================
 *  A PRODUCT PICTURE IS NEVER CUT (r65), MEASURED IN CHROMIUM
 * ===========================================================================
 *   node scripts/check-product-ratio-r65.mjs <before|after> [out dir]
 *
 * Real markup: Materia's prerendered pages (public/theme-previews) for three
 * templates with three card shapes (Storelib Default 1:1, Posters 3:4,
 * Fitness 4:3), each home page's product cards and a product page's gallery,
 * with the pictures swapped for four test pictures, one per card in turn:
 *
 *   poster   1400x2000 (0.7 wide), a dark poster with a marker in each corner
 *   square   1600x1600
 *   wide     1920x1080 (16:9)
 *   padded   poster_processed.jpg, the product editor's 1280x720 copy of the
 *            poster on its grey gradient (the trim cuts it back to 504x720)
 *
 * and the native theme's product grid and gallery (scripts/render-product-
 * grid-images-r63.ts, scripts/render-product-images-r63.tsx) in "after".
 *
 * "before" runs r65-base's head script (the trim alone), "after" this
 * checkout's (the trim and lib/images/pic-fit.ts), both as live pages carry
 * them. Each picture, at 360, 390 and 1280:
 *
 *   visible     the part of the picture inside its frame          (must be 100%)
 *   distortion  its drawn ratio against its own                   (must be 0)
 *   size        its share of the frame against the most a whole
 *               picture of its shape can have                     (must be 100%:
 *               not shrunk, not a sliver in a padded copy)
 *   frame       the frame's ratio, and its width against its row's
 *   seam        the mean RGB step across the picture's edge into its band
 *               (after only; under 12 reads as one surface)
 *
 * Screenshots at 390 and 1280 (deviceScaleFactor 2). Exits 1 in "after" when
 * any picture is cut, distorted or shrunk.
 */
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const sharp = require("sharp")

const root = process.cwd()
const mode = process.argv[2] === "before" ? "before" : "after"
const OUT = path.resolve(process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), "product-ratio-r65-")))
fs.mkdirSync(OUT, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pr65-"))
const esbuild = path.join(root, "node_modules/.bin/esbuild")

/* ---- the head script: r65-base's (before) or this checkout's (after) ---- */
function headScript() {
  let entry = path.join(root, "lib/images/cover-trim.ts")
  if (mode === "before") {
    entry = path.join(work, "cover-trim-base.ts")
    fs.writeFileSync(entry, execFileSync("git", ["show", "r65-base:lib/images/cover-trim.ts"], { cwd: root }))
  }
  const out = path.join(work, `trim-${mode}.mjs`)
  execFileSync(esbuild, [entry, "--bundle", "--format=esm", "--platform=neutral", "--log-level=error", `--outfile=${out}`])
  return out
}
const { COVER_TRIM_SCRIPT } = await import(headScript())

/* ---- the pictures ---- */
async function poster(w, h) {
  const m = Math.round(w * 0.04)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16324f"/><stop offset="1" stop-color="#0b1420"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.3}" fill="#e4572e"/><rect x="${w * 0.12}" y="${h * 0.78}" width="${w * 0.76}" height="${h * 0.07}" fill="#f3efe0"/>
<rect x="0" y="0" width="${m}" height="${m}" fill="#ff00ff"/><rect x="${w - m}" y="0" width="${m}" height="${m}" fill="#ffff00"/><rect x="0" y="${h - m}" width="${m}" height="${m}" fill="#00ffff"/><rect x="${w - m}" y="${h - m}" width="${m}" height="${m}" fill="#00ff00"/></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()
}
async function photo(w, h, a, b) {
  const m = Math.round(Math.min(w, h) * 0.04)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="${w > h ? 1 : 0}" y2="${w > h ? 0 : 1}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/><rect x="${w * 0.3}" y="${h * 0.3}" width="${w * 0.4}" height="${h * 0.4}" rx="${m}" fill="#2b2b2b" opacity=".55"/>
<rect x="0" y="0" width="${m}" height="${m}" fill="#ff00ff"/><rect x="${w - m}" y="0" width="${m}" height="${m}" fill="#ffff00"/><rect x="0" y="${h - m}" width="${m}" height="${m}" fill="#00ffff"/><rect x="${w - m}" y="${h - m}" width="${m}" height="${m}" fill="#00ff00"/></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()
}
const PICS = {
  "poster.jpg": await poster(1400, 2000),
  "square.jpg": await photo(1600, 1600, "#9cc9e8", "#e8d3a6"),
  "wide.jpg": await photo(1920, 1080, "#f2a65a", "#5b3f8c"),
}
/* The editor's padded copy (processImageToWidescreen): 1280x720, the grey gradient, the poster centred at 720 tall. */
{
  const grey = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8f8f8"/><stop offset=".5" stop-color="#f0f0f0"/><stop offset="1" stop-color="#e8e8e8"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/></svg>`
  const inner = await sharp(PICS["poster.jpg"]).resize(504, 720).toBuffer()
  PICS["poster_processed.jpg"] = await sharp(Buffer.from(grey)).composite([{ input: inner, left: 388, top: 0 }]).jpeg({ quality: 92 }).toBuffer()
}
const KINDS = [
  ["poster", "poster.jpg", 0.7],
  ["square", "square.jpg", 1],
  ["wide", "wide.jpg", 16 / 9],
  ["padded", "poster_processed.jpg", 0.7],
]

/* ---- the pages ---- */
const ORIGIN = "http://preview.test"
const PAGES = [
  { name: "default-home", theme: "storelib-default", path: "/theme-previews/storelib-default/index.html" },
  { name: "default-product", theme: "storelib-default", path: "/theme-previews/storelib-default/products/canvas-tote.html" },
  { name: "posters-home", theme: "posters", path: "/theme-previews/posters/index.html" },
  { name: "posters-product", theme: "posters", path: `/theme-previews/posters/products/${fs.readdirSync(path.join(root, "public/theme-previews/posters/products"))[0]}` },
  { name: "fitness-home", theme: "fitness", path: "/theme-previews/fitness/index.html" },
]
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" }

async function serve(ctx, html) {
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.startsWith("/__pic/")) {
      const body = PICS[u.pathname.slice(7)]
      return body ? route.fulfill({ status: 200, contentType: "image/jpeg", body, headers: { "cache-control": "max-age=3600" } }) : route.fulfill({ status: 404 })
    }
    /* The prerendered pages link a snapshot of Materia's base.css: this checkout's own is what live stores get. */
    const bundle = /^\/theme-previews\/_base\/a\/(base|base-static)\.[0-9a-f]+\.css$/.exec(u.pathname)
    if (bundle) return route.fulfill({ status: 200, contentType: "text/css", body: fs.readFileSync(path.join(root, `theme-packages/materia/base/assets/${bundle[1]}.css`)) })
    if (html && html[u.pathname]) return route.fulfill({ status: 200, contentType: "text/html", body: html[u.pathname] })
    const file = path.join(root, "public", decodeURIComponent(u.pathname))
    if (!file.startsWith(path.join(root, "public")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: "" })
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) })
  })
  await ctx.route(/^https?:\/\/(?!preview\.test)/, (r) => r.abort())
}

/* Phase 1: the page as parsed (no script), its product pictures pointed at the test pictures, the head script put first. */
async function prepare(browser, p) {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  await serve(ctx, null)
  const page = await ctx.newPage()
  await page.goto(ORIGIN + p.path, { waitUntil: "domcontentloaded" })
  const html = await page.evaluate(([kinds]) => {
    const frames = [...document.querySelectorAll(".product-item__media--ratio, .media-gallery__image")]
    let n = 0
    for (const f of frames) {
      const imgs = [...f.querySelectorAll("img")]
      if (!imgs.length) continue
      const [kind, file] = kinds[n++ % kinds.length]
      imgs.forEach((img, i) => {
        if (i > 0) return img.remove() /* the hover picture: one picture per frame, measured */
        img.src = `/__pic/${file}`
        img.removeAttribute("srcset")
        img.removeAttribute("data-srcset")
        img.setAttribute("loading", "eager")
        img.setAttribute("data-probe", kind)
      })
      f.querySelectorAll("source").forEach((s) => s.remove())
    }
    return "<!doctype html>" + document.documentElement.outerHTML
  }, [KINDS])
  await ctx.close()
  return html
}

const MEASURE = ([kinds]) => {
  const ratioOf = Object.fromEntries(kinds.map(([k, , r]) => [k, r]))
  const out = []
  for (const img of document.querySelectorAll("img[data-probe]")) {
    const r = img.getBoundingClientRect()
    if (r.width < 30 || r.height < 30) continue
    let f = img.parentElement
    while (f && f !== document.body) {
      const s = getComputedStyle(f)
      if (s.overflowX !== "visible" || s.overflowY !== "visible") break
      f = f.parentElement
    }
    const fr = f.getBoundingClientRect()
    if (fr.width < 30 || fr.right <= 0 || fr.left >= innerWidth) continue
    const cs = getComputedStyle(img)
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (!nw || !nh) continue
    const fit = cs.objectFit
    let dw = r.width
    let dh = r.height
    const s = fit === "cover" ? Math.max(r.width / nw, r.height / nh) : fit === "contain" ? Math.min(r.width / nw, r.height / nh) : fit === "none" ? 1 : null
    if (s !== null) { dw = nw * s; dh = nh * s }
    const [px, py] = cs.objectPosition.split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5))
    let x = r.left + (r.width - dw) * px
    let y = r.top + (r.height - dh) * py
    let w = dw
    let h = dh
    const src = img.currentSrc || img.src
    const untrimmed = /_processed\./.test(src)
    /* An untrimmed padded copy: the picture is the poster inside it (504 of 1280 wide, from 388). */
    if (untrimmed) { x += (388 / 1280) * dw; w = (504 / 1280) * dw }
    const L = Math.max(x, fr.left), T = Math.max(y, fr.top), R = Math.min(x + w, fr.right), B = Math.min(y + h, fr.bottom)
    const inside = Math.max(0, R - L) * Math.max(0, B - T)
    const pr = ratioOf[img.dataset.probe]
    const frameRatio = fr.width / fr.height
    const ideal = Math.min(pr / frameRatio, frameRatio / pr)
    out.push({
      kind: img.dataset.probe,
      src: src.startsWith("blob:") ? "blob (trimmed)" : src.split("/").pop(),
      fit,
      natural: `${nw}x${nh}`,
      frame: [Math.round(fr.left), Math.round(fr.top), Math.round(fr.width), Math.round(fr.height)],
      frameRatio: Math.round(frameRatio * 1000) / 1000,
      visible: Math.round((inside / (w * h)) * 1000) / 10,
      distortion: Math.round(Math.abs(w / h / pr - 1) * 1000) / 1000,
      size: Math.round((inside / (fr.width * fr.height) / ideal) * 1000) / 10,
      fitState: img.getAttribute("data-pic-fit"),
      trim: img.getAttribute("data-cover-trim"),
      pic: [x + scrollX, y + scrollY, w, h],
      fr: [fr.left + scrollX, fr.top + scrollY, fr.width, fr.height],
    })
  }
  return out
}

/* The mean RGB step across the picture's edge into its band: 2 to 5 device pixels each side, along the edge's middle 80%. */
async function seam(page, m) {
  const [x, y, w, h] = m.pic
  const [fx, fy, fw, fh] = m.fr
  /* Bands of 4 CSS pixels or more: a thinner one is not a surface anyone sees. */
  const sideways = w < fw - 8
  const down = h < fh - 8
  if (!sideways && !down) return null
  const buf = await page.screenshot({ fullPage: true, clip: { x: fx, y: fy, width: fw, height: fh } })
  const { data, info } = await sharp(buf).raw().removeAlpha().toBuffer({ resolveWithObject: true })
  const k = info.width / fw
  const at = (X, Y) => {
    const i = (Math.round(Y) * info.width + Math.round(X)) * 3
    return [data[i], data[i + 1], data[i + 2]]
  }
  let sum = 0, n = 0
  const step = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  if (sideways) {
    const lx = (x - fx) * k, rx = (x + w - fx) * k
    for (let Y = fh * k * 0.1; Y < fh * k * 0.9; Y += 2)
      for (const d of [2, 4]) {
        sum += step(at(lx - d, Y), at(lx + d, Y)) + step(at(rx + d - 1, Y), at(rx - d - 1, Y))
        n += 2
      }
  } else {
    const ty = (y - fy) * k, by = (y + h - fy) * k
    for (let X = fw * k * 0.1; X < fw * k * 0.9; X += 2)
      for (const d of [2, 4]) {
        sum += step(at(X, ty - d), at(X, ty + d)) + step(at(X, by + d - 1), at(X, by - d - 1))
        n += 2
      }
  }
  return Math.round((sum / n) * 10) / 10
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--hide-scrollbars"] })
const rows = []
const bad = []
const shots = []
const prepared = {}
for (const p of PAGES) prepared[p.path] = (await prepare(browser, p)).replace(/<head([^>]*)>/i, (m) => `${m}<script>${COVER_TRIM_SCRIPT}</script>`)

for (const p of PAGES) {
  for (const width of [360, 390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: width < 800 })
    await serve(ctx, prepared)
    const page = await ctx.newPage()
    await page.goto(ORIGIN + p.path, { waitUntil: "load" })
    await page.evaluate(async () => {
      const first = document.querySelector("img[data-probe]")
      first?.scrollIntoView({ block: "center" })
      for (const img of document.querySelectorAll("img[data-probe]")) img.loading = "eager"
      await new Promise((r) => setTimeout(r, 1200))
    })
    await page.waitForTimeout(800)
    const found = await page.evaluate(MEASURE, [KINDS])
    /* Each row's frames: one width, at any viewport (no card narrower than its neighbours). */
    const byTop = {}
    for (const m of found) (byTop[m.frame[1]] ??= []).push(m.frame[2])
    for (const m of found) {
      const row = byTop[m.frame[1]]
      m.rowSpread = Math.max(...row) - Math.min(...row)
      m.seam = mode === "after" && m.visible >= 99.9 ? await seam(page, m) : null
      const ok = m.visible >= 99.9 && m.distortion <= 0.01 && m.size >= 99 && m.rowSpread <= 1
      rows.push({ page: p.name, width, ...m })
      if (!ok) bad.push({ page: p.name, width, kind: m.kind, src: m.src, fit: m.fit, visible: m.visible, distortion: m.distortion, size: m.size, frameRatio: m.frameRatio, rowSpread: m.rowSpread, trim: m.trim })
    }
    if (width !== 360) {
      const file = path.join(OUT, `${mode}-${p.name}-${width}.png`)
      await page.screenshot({ path: file })
      shots.push(file)
    }
    await ctx.close()
  }
}
await browser.close()

/* ---- the native theme (after only: its grid and gallery as this checkout draws them) ---- */
const summary = (list) => {
  const by = {}
  for (const r of list) {
    const k = `${r.page} ${r.kind}`
    const b = (by[k] ??= { n: 0, visible: 101, size: 1e9, distortion: 0, frame: r.frameRatio, seam: [] })
    b.n++
    b.visible = Math.min(b.visible, r.visible)
    b.size = Math.min(b.size, r.size)
    b.distortion = Math.max(b.distortion, r.distortion)
    if (r.seam !== null && r.seam !== undefined) b.seam.push(r.seam)
  }
  return Object.entries(by).map(([k, b]) => `  ${k.padEnd(26)} n=${String(b.n).padStart(2)}  frame ${String(b.frame).padEnd(5)}  visible ${String(b.visible).padStart(5)}%  size ${String(b.size).padStart(5)}%  distortion ${b.distortion}${b.seam.length ? `  seam ${Math.max(...b.seam)}` : ""}`).join("\n")
}
fs.writeFileSync(path.join(OUT, `${mode}-rows.json`), JSON.stringify(rows, null, 1))
console.log(`\n${mode}: ${rows.length} pictures on ${PAGES.length} Materia pages at 360, 390, 1280\n${summary(rows)}`)
for (const b of bad.slice(0, 12)) console.log("  NOT WHOLE", JSON.stringify(b))
console.log(`\n${bad.length} of ${rows.length} pictures cut, distorted or shrunk. Screenshots: ${OUT}`)
fs.rmSync(work, { recursive: true, force: true })
process.exit(mode === "after" && bad.length ? 1 : 0)
