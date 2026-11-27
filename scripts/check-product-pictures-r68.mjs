#!/usr/bin/env node
/**
 * ===========================================================================
 *  A PRODUCT PICTURE FILLS ITS FRAME (r68), MEASURED IN CHROMIUM
 * ===========================================================================
 *   node scripts/check-product-pictures-r68.mjs <before|after> [out dir]
 *
 * Real markup: Materia's prerendered pages (public/theme-previews), the home
 * page and a product page of eight templates (the Notion ones, clothing,
 * streetwear, Redline, digital, ebooks), with every product card's and
 * gallery's picture swapped for one of five test pictures in turn:
 *
 *   wide     1920x1080 (16:9)        land     1600x1200 (4:3)
 *   square   1600x1600               tall     1200x1800 (2:3)
 *   cutout   1600x1000 PNG, a product on a see-through background
 *
 * Each page runs the head a live store's page carries: the trim and the fit
 * (lib/images/cover-trim.ts, lib/images/pic-fit.ts) and SHOP_CALM_HEAD
 * (lib/storelib-theme/compat/shop-calm.ts), with Materia's base.css, all from
 * r68-base ("before") or this checkout ("after"). A fresh browser profile per
 * page and width, so localStorage is empty: a first visit.
 *
 * For every card, featured product and gallery picture on screen, at 390
 * and 1440:
 *
 *   cover    the share of the frame the picture covers          (100%)
 *   column   the frame's width against its card's               (100%)
 *   stretch  its drawn ratio against its own                    (0)
 *   CLS      layout shift on the whole page, load and a scroll  (0)
 *
 * Screenshots at deviceScaleFactor 2. Exits 1 in "after" when any frame is
 * not covered, narrower than its card, stretched, or the page shifts.
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
const OUT = path.resolve(process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), "product-pictures-r68-")))
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(path.join(root, ".wb-probe"), { recursive: true })
const work = fs.mkdtempSync(path.join(root, ".wb-probe", "pp68-"))
const esbuild = path.join(root, "node_modules/.bin/esbuild")

/* ---- the head: r68-base's (before) or this checkout's (after) ---- */
function source(rel) {
  if (mode === "after") return fs.readFileSync(path.join(root, rel), "utf8")
  return execFileSync("git", ["show", `r68-base:${rel}`], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
}
for (const rel of ["lib/images/cover-trim.ts", "lib/images/pic-fit.ts", "lib/storelib-theme/compat/shop-calm.ts"]) fs.writeFileSync(path.join(work, path.basename(rel)), source(rel))
fs.writeFileSync(path.join(work, "entry.ts"), `export { COVER_TRIM_SCRIPT } from "./cover-trim"\nexport { SHOP_CALM_HEAD } from "./shop-calm"\n`)
execFileSync(esbuild, [path.join(work, "entry.ts"), "--bundle", "--format=esm", "--platform=neutral", "--log-level=error", `--outfile=${path.join(work, "head.mjs")}`])
const { COVER_TRIM_SCRIPT, SHOP_CALM_HEAD } = await import(path.join(work, "head.mjs"))
const HEAD = `<script>${COVER_TRIM_SCRIPT}</script>${SHOP_CALM_HEAD}`
const BASE_CSS = { base: source("theme-packages/materia/base/assets/base.css"), "base-static": source("theme-packages/materia/base/assets/base-static.css") }

/* ---- the pictures: a gradient, a subject in the middle, a marker in each corner ---- */
async function photo(w, h, a, b) {
  const m = Math.round(Math.min(w, h) * 0.05)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/><rect x="${w * 0.32}" y="${h * 0.22}" width="${w * 0.36}" height="${h * 0.56}" rx="${m}" fill="#1f2a37" opacity=".7"/>
<rect width="${m}" height="${m}" fill="#ff00ff"/><rect x="${w - m}" width="${m}" height="${m}" fill="#ffff00"/><rect y="${h - m}" width="${m}" height="${m}" fill="#00ffff"/><rect x="${w - m}" y="${h - m}" width="${m}" height="${m}" fill="#00ff00"/></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer()
}
async function cutout(w, h) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h * 0.58}" rx="${w * 0.4}" ry="${h * 0.26}" fill="#c0392b"/><rect x="${w * 0.22}" y="${h * 0.3}" width="${w * 0.3}" height="${h * 0.3}" rx="40" fill="#922b21"/><rect x="${w * 0.1}" y="${h * 0.74}" width="${w * 0.8}" height="${h * 0.06}" rx="20" fill="#f4f4f4" stroke="#333" stroke-width="6"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}
const PICS = {
  "wide.jpg": await photo(1920, 1080, "#f2a65a", "#5b3f8c"),
  "land.jpg": await photo(1600, 1200, "#8fd3b6", "#2f6f8f"),
  "square.jpg": await photo(1600, 1600, "#9cc9e8", "#e8d3a6"),
  "tall.jpg": await photo(1200, 1800, "#e8e2d6", "#b9ad97"),
  "cutout.png": await cutout(1600, 1000),
}
const KINDS = [
  ["wide", "wide.jpg", 16 / 9],
  ["land", "land.jpg", 4 / 3],
  ["square", "square.jpg", 1],
  ["tall", "tall.jpg", 2 / 3],
  ["cutout", "cutout.png", 1.6],
]

/* ---- the pages ---- */
const ORIGIN = "http://preview.test"
const TEMPLATES = ["notion-creator", "notion-sales-page", "notion-template-shop", "clothing", "streetwear", "streetwear-drop", "digital-products", "ebooks"]
const PAGES = []
for (const t of TEMPLATES) {
  PAGES.push({ name: `${t}-home`, path: `/theme-previews/${t}/index.html` })
  const first = fs.readdirSync(path.join(root, `public/theme-previews/${t}/products`)).filter((f) => f.endsWith(".html")).sort()[0]
  PAGES.push({ name: `${t}-product`, path: `/theme-previews/${t}/products/${first}` })
}
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" }
const FRAMES = ".product-item__media--ratio, .media-gallery__image"

async function serve(ctx, html) {
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.startsWith("/__pic/")) {
      const name = u.pathname.slice(7)
      const body = PICS[name]
      return body ? route.fulfill({ status: 200, contentType: name.endsWith(".png") ? "image/png" : "image/jpeg", body, headers: { "cache-control": "max-age=3600" } }) : route.fulfill({ status: 404 })
    }
    const bundle = /^\/theme-previews\/_base\/a\/(base|base-static)\.[0-9a-f]+\.css$/.exec(u.pathname)
    if (bundle) return route.fulfill({ status: 200, contentType: "text/css", body: BASE_CSS[bundle[1]] })
    if (html && html[u.pathname]) return route.fulfill({ status: 200, contentType: "text/html", body: html[u.pathname] })
    const file = path.join(root, "public", decodeURIComponent(u.pathname))
    if (!file.startsWith(path.join(root, "public")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: "" })
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) })
  })
  await ctx.route(/^https?:\/\/(?!preview\.test)/, (r) => r.abort())
}

/* The page as parsed (no script), its product pictures pointed at the test pictures, this round's head put first. */
async function prepare(browser, p) {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  await serve(ctx, null)
  const page = await ctx.newPage()
  await page.goto(ORIGIN + p.path, { waitUntil: "domcontentloaded" })
  const html = await page.evaluate(([kinds, sel]) => {
    let n = 0
    const byPos = {}
    for (const f of document.querySelectorAll(sel)) {
      const imgs = [...f.querySelectorAll("img")]
      if (!imgs.length) continue
      /* A gallery's slide and its thumbnail show the same picture. */
      const gal = f.classList.contains("media-gallery__image")
      const key = gal ? `${f.closest("[data-section-id],section,.shopify-section")?.id || "g"}:${f.getAttribute("data-position") || n}` : null
      const pick = key && byPos[key] !== undefined ? byPos[key] : n++ % kinds.length
      if (key) byPos[key] = pick
      const [kind, file] = kinds[pick]
      imgs.forEach((img, i) => {
        if (i > 0) return img.remove()
        img.src = `/__pic/${file}`
        img.removeAttribute("srcset")
        img.removeAttribute("data-srcset")
        img.setAttribute("loading", "eager")
        img.setAttribute("data-probe", kind)
      })
      f.querySelectorAll("source").forEach((s) => s.remove())
    }
    return "<!doctype html>" + document.documentElement.outerHTML
  }, [KINDS, FRAMES])
  await ctx.close()
  return html.replace(/<head([^>]*)>/i, (m) => `${m}${HEAD}`)
}

const MEASURE = ([kinds, sel]) => {
  const ratioOf = Object.fromEntries(kinds.map(([k, , r]) => [k, r]))
  const out = []
  for (const img of document.querySelectorAll("img[data-probe]")) {
    const f = img.closest(sel)
    if (!f) continue
    const fb = f.getBoundingClientRect()
    if (fb.width < 30 || fb.height < 30 || fb.right <= 1 || fb.left >= innerWidth - 1) continue
    if (getComputedStyle(f).visibility === "hidden" || getComputedStyle(img).visibility === "hidden" || getComputedStyle(img).display === "none") continue
    const fcs = getComputedStyle(f)
    const [bl, bt, br, bb] = [fcs.borderLeftWidth, fcs.borderTopWidth, fcs.borderRightWidth, fcs.borderBottomWidth].map((v) => parseFloat(v) || 0)
    const fr = { left: fb.left + bl, top: fb.top + bt, width: fb.width - bl - br, height: fb.height - bt - bb }
    const r = img.getBoundingClientRect()
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
    const x = r.left + (r.width - dw) * px
    const y = r.top + (r.height - dh) * py
    const L = Math.max(x, fr.left), T = Math.max(y, fr.top), R = Math.min(x + dw, fr.left + fr.width), B = Math.min(y + dh, fr.top + fr.height)
    const covered = (Math.max(0, R - L) * Math.max(0, B - T)) / (fr.width * fr.height)
    const card = f.closest(".product-item")
    const cw = card ? card.getBoundingClientRect().width : fr.width
    const kind = img.dataset.probe
    out.push({
      kind,
      where: f.classList.contains("media-gallery__image") ? (f.closest(".media-thumb-swiper,.thumbnail-slide,.thumbnails") ? "thumb" : "gallery") : "card",
      fit,
      position: cs.objectPosition,
      frame: [Math.round(fr.left), Math.round(fr.top + scrollY), Math.round(fr.width), Math.round(fr.height)],
      frameRatio: Math.round((fr.width / fr.height) * 1000) / 1000,
      cover: Math.round(covered * 1000) / 10,
      column: Math.round((fr.width / cw) * 1000) / 10,
      stretch: Math.round(Math.abs(dw / dh / ratioOf[kind] - 1) * 1000) / 1000,
      state: img.getAttribute("data-pic-fit"),
      bg: getComputedStyle(img).backgroundImage !== "none" ? "band" : getComputedStyle(f).backgroundColor,
    })
  }
  return out
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--hide-scrollbars"] })
const rows = []
const bad = []
const cls = []
const prepared = {}
for (const p of PAGES) prepared[p.path] = await prepare(browser, p)

for (const p of PAGES) {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: width < 800 })
    await ctx.addInitScript(() => {
      window.__cls = 0
      window.__shifts = []
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            if (e.hadRecentInput) continue
            window.__cls += e.value
            window.__shifts.push({ v: Math.round(e.value * 10000) / 10000, t: Math.round(e.startTime), src: (e.sources || []).map((s) => (s.node && s.node.className ? String(s.node.className).slice(0, 60) : s.node ? s.node.nodeName : "?")) })
          }
        }).observe({ type: "layout-shift", buffered: true })
      } catch {}
    })
    await serve(ctx, prepared)
    const page = await ctx.newPage()
    await page.goto(ORIGIN + p.path, { waitUntil: "load" })
    await page.waitForTimeout(900)
    const firstPaint = await page.evaluate(() => window.__cls)
    /* Down the page and back, so every row is drawn (lazy sections, scroll reveals). */
    await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight
      for (let y = 0; y < h; y += innerHeight * 0.7) {
        scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      scrollTo(0, 0)
      await new Promise((r) => setTimeout(r, 1500))
    })
    const found = await page.evaluate(MEASURE, [KINDS, FRAMES])
    const shift = await page.evaluate(() => ({ cls: Math.round(window.__cls * 10000) / 10000, shifts: window.__shifts.slice(0, 6) }))
    shift.load = Math.round(firstPaint * 10000) / 10000
    cls.push({ page: p.name, width, ...shift })
    /* A shift is the pictures' when a card, a frame or a gallery moved; others (a header, a hero's own reveal) are reported, not counted here. */
    shift.pics = Math.round(shift.shifts.filter((x) => x.src.some((c) => /product-item|media-gallery|product__media|card|pic/.test(c) && !/it-card|feature-product-form|mk-/.test(c))).reduce((a, x) => a + x.v, 0) * 10000) / 10000
    if (shift.pics > 0.001) bad.push({ page: p.name, width, cls: shift.cls, shifts: shift.shifts })
    for (const m of found) {
      rows.push({ page: p.name, width, ...m })
      /* A cut out product of another shape sits whole on its frame's own background, on purpose (lib/images/pic-fit.ts). */
      const cutout = m.state === "cutout" && m.fit === "contain"
      const ok = (m.cover >= 99.5 || cutout) && m.stretch <= 0.01 && (m.where !== "card" || m.column >= 99)
      if (!ok) bad.push({ page: p.name, width, ...m })
    }
    /* The first card or gallery in view, for people to look at. */
    const target = await page.evaluate((sel) => {
      const list = [...document.querySelectorAll(sel)].filter((f) => f.querySelector("img[data-probe]") && f.getBoundingClientRect().width > 60 && !f.closest(".media-thumb-swiper"))
      const f = list.find((x) => x.classList.contains("product-item__media--ratio")) || list[0]
      if (!f) return false
      const top = f.getBoundingClientRect().top + scrollY - 90
      scrollTo(0, Math.max(0, top))
      return true
    }, FRAMES)
    if (target) {
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(OUT, `${mode}-${p.name}-${width}.png`) })
    }
    await ctx.close()
  }
}
await browser.close()

const by = {}
for (const r of rows) {
  const k = `${r.page} ${r.where} ${r.kind}`
  const b = (by[k] ??= { n: 0, cover: 101, column: 101, stretch: 0, fit: new Set(), frame: new Set() })
  b.n++
  b.cover = Math.min(b.cover, r.cover)
  b.column = Math.min(b.column, r.column)
  b.stretch = Math.max(b.stretch, r.stretch)
  b.fit.add(r.fit)
  b.frame.add(r.frameRatio)
}
const lines = Object.entries(by).map(([k, b]) => `  ${k.padEnd(44)} n=${String(b.n).padStart(2)}  frame ${[...b.frame].slice(0, 3).join("/").padEnd(14)} fit ${[...b.fit].join("/").padEnd(14)} cover ${String(b.cover).padStart(5)}%  column ${String(b.column).padStart(5)}%  stretch ${b.stretch}`)
const allCover = rows.map((r) => r.cover)
const report = [
  `${mode}: ${rows.length} pictures on ${PAGES.length} pages at 390 and 1440 (first visit, empty localStorage)`,
  ...lines,
  "",
  "CLS per page (load and a scroll down and back):",
  "  page                            width  whole page  pictures' own",
  ...cls.map((c) => `  ${c.page.padEnd(30)} ${String(c.width).padStart(4)}  ${String(c.cls).padEnd(10)}  ${c.pics}${c.cls > 0.001 ? "  " + JSON.stringify(c.shifts.map((x) => [x.v, x.src[0]])) : ""}`),
  "",
  `mean cover ${Math.round((allCover.reduce((a, b) => a + b, 0) / Math.max(1, allCover.length)) * 10) / 10}%, lowest ${Math.min(...allCover)}%, frames under 99.5%: ${rows.filter((r) => r.cover < 99.5).length} of ${rows.length} (cut out products drawn whole: ${rows.filter((r) => r.state === "cutout").length}), mean cover without them ${Math.round((rows.filter((r) => r.state !== "cutout").reduce((a, r) => a + r.cover, 0) / Math.max(1, rows.filter((r) => r.state !== "cutout").length)) * 10) / 10}%, max page CLS ${Math.max(...cls.map((c) => c.cls))}, max pictures' CLS ${Math.max(...cls.map((c) => c.pics))}`,
  `${bad.length} problems. Screenshots: ${OUT}`,
]
for (const b of bad.slice(0, 15)) report.push("  BAD " + JSON.stringify(b))
fs.writeFileSync(path.join(OUT, `${mode}-rows.json`), JSON.stringify({ rows, cls }, null, 1))
fs.writeFileSync(path.join(OUT, `${mode}-report.txt`), report.join("\n") + "\n")
console.log(report.join("\n"))
fs.rmSync(work, { recursive: true, force: true })
process.exit(mode === "after" && bad.length ? 1 : 0)
