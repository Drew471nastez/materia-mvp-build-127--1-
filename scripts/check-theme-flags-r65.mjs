#!/usr/bin/env node
/**
 * Round 65 (m1): every Materia template's country flag fills its circle, wherever the template draws the selector
 * (header, top bar, footer, phone tab bar, the open list), measured in Chromium at 360, 390 and 1280.
 *
 *   node scripts/check-theme-flags-r65.mjs [out dir]
 *
 * The prerendered pages (public/theme-previews) still carry the emoji flag r64 replaced; each is pointed at the file
 * objects.ts flagImage writes now (/flags/US.svg), and this checkout's base.css is served for the snapshot's. For
 * every flag on screen: the picture's box against its circle's (must be the same), and the share of the circle the
 * drawn flag covers (the holder is painted magenta; every pixel inside the circle that is not magenta is flag).
 */
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const sharp = require("sharp")

const root = process.cwd()
const OUT = path.resolve(process.argv[2] || ".")
fs.mkdirSync(OUT, { recursive: true })
const ORIGIN = "http://preview.test"
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }
const dirs = fs.readdirSync(path.join(root, "public/theme-previews")).filter((d) => !d.startsWith("_") && fs.existsSync(path.join(root, "public/theme-previews", d, "index.html")) && fs.readFileSync(path.join(root, "public/theme-previews", d, "index.html"), "utf8").includes("localization-flags"))

const browser = await chromium.launch({ args: ["--no-sandbox", "--hide-scrollbars"] })
const rows = []
for (const d of dirs) {
  for (const width of [360, 390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: width < 800 })
    await ctx.route(/^https?:\/\/(?!preview\.test)/, (r) => r.abort())
    await ctx.route(`${ORIGIN}/**`, async (route) => {
      const u = new URL(route.request().url())
      const bundle = /^\/theme-previews\/_base\/a\/(base|base-static)\.[0-9a-f]+\.css$/.exec(u.pathname)
      if (bundle) return route.fulfill({ status: 200, contentType: "text/css", body: fs.readFileSync(path.join(root, `theme-packages/materia/base/assets/${bundle[1]}.css`)) })
      const file = path.join(root, "public", decodeURIComponent(u.pathname))
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: "" })
      let body = fs.readFileSync(file)
      if (u.pathname.endsWith(".html")) body = body.toString("utf8").replace(/data:image\/svg\+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww\.w3\.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2032%2024%22%3E%3Ctext[^"']*/g, "/flags/US.svg")
      return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || "application/octet-stream", body })
    })
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/theme-previews/${d}/index.html`, { waitUntil: "load" })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(700)
    const holders = await page.$$(".localization-flags")
    let i = 0
    for (const h of holders) {
      const geo = await h.evaluate((el) => {
        const img = el.querySelector("img")
        const a = el.getBoundingClientRect()
        if (!img || a.width < 4 || getComputedStyle(el).visibility === "hidden" || !el.checkVisibility?.()) return null
        const b = img.getBoundingClientRect()
        el.style.background = "#ff00ff"
        const where = el.closest("footer") ? "footer" : el.closest("header, .header, [id^=shopify-section-header], .top-bar, [class*=topbar]") ? "header" : el.closest(".mobile-navigation, [class*=mobile-navigation]") ? "tab bar" : "other"
        return { where, box: [a.width, a.height], img: [b.width - a.width, b.height - a.height, b.left - a.left, b.top - a.top], fit: getComputedStyle(img).objectFit, ok: img.complete && img.naturalWidth > 0 }
      })
      if (!geo) continue
      await h.scrollIntoViewIfNeeded()
      const buf = await h.screenshot({ animations: "disabled" })
      const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      const W = info.width, H = info.height, r = Math.min(W, H) / 2 - 1.5
      let n = 0, flag = 0
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - W / 2, dy = y + 0.5 - H / 2
        if (dx * dx + dy * dy > r * r) continue
        n++
        const k = (y * W + x) * 4
        if (!(data[k] > 200 && data[k + 1] < 70 && data[k + 2] > 200)) flag++
      }
      const row = { theme: d, width, where: geo.where, circle: `${Math.round(geo.box[0])}x${Math.round(geo.box[1])}`, offset: geo.img.map((v) => Math.round(v * 10) / 10), fit: geo.fit, loaded: geo.ok, covered: Math.round((flag / Math.max(1, n)) * 1000) / 10 }
      rows.push(row)
      if (width !== 360 && i++ === 0) await h.screenshot({ path: path.join(OUT, `flag-${d}-${geo.where.replace(/ /g, "")}-${width}.png`) })
    }
    await ctx.close()
  }
}
await browser.close()
const bad = rows.filter((r) => !r.loaded || r.covered < 99 || r.offset.some((v) => Math.abs(v) > 0.6) || r.circle.split("x")[0] !== r.circle.split("x")[1])
const by = {}
for (const r of rows) {
  const k = `${r.where} ${r.circle}`
  const b = (by[k] ??= { n: 0, min: 101, themes: new Set() })
  b.n++
  b.min = Math.min(b.min, r.covered)
  b.themes.add(r.theme)
}
console.log(`${rows.length} flags on ${dirs.length} templates at 360, 390, 1280`)
for (const [k, b] of Object.entries(by)) console.log(`  ${k.padEnd(18)} n=${String(b.n).padStart(3)} templates=${b.themes.size}  least covered ${b.min}%`)
for (const b of bad.slice(0, 15)) console.log("  SHORT", JSON.stringify(b))
console.log(`${bad.length} flags not filling their circle`)
process.exit(bad.length ? 1 : 0)
