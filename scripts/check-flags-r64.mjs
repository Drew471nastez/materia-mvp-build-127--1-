#!/usr/bin/env node
/**
 * Round 64 (k1): the country selector's flags, measured in Chromium.
 *
 *   node scripts/check-flags-r64.mjs <before|after> [site url] [out dir]
 *
 * Opens a live Materia site's footer country selector at 390 and 1280
 * (deviceScaleFactor 2), closed and open, screenshots both, and measures
 * US, GB, RO, FR, JP, BR, CA and DE: the drawn flag's centre against its
 * circle's centre (the holder painted magenta, every pixel inside the
 * circle that is not magenta is flag) and how much of the circle it covers,
 * plus how many flag files were asked for when the list opened.
 * "before" is the live page as it is. "after" is the same page (fetched with
 * curl: Playwright's own fetch has no proxy in a cloud session) with the
 * flag addresses objects.ts flagImage now writes, the branch's theme.js, and
 * /flags/*.svg from this checkout's public/flags.
 */
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
const require = createRequire(import.meta.url)
const WT = process.cwd()
const { chromium } = require("playwright")
const sharp = require("sharp")

const mode = process.argv[2] || "before"
const url = process.argv[3] || "https://liam-bailey.storelib.com/"
const OUT = process.argv[4] || "."
fs.mkdirSync(OUT, { recursive: true })
const liveHtml = mode === "after" ? execFileSync("curl", ["-s", url], { maxBuffer: 64 << 20 }).toString("utf8") : ""
const CODES = ["US", "GB", "RO", "FR", "JP", "BR", "CA", "DE"]
const spriteTs = fs.readFileSync(WT + "/lib/account/flag-sprite.ts", "utf8")
const FLAG_CODES = new Set(spriteTs.match(/new Set\("([A-Z]+)"/)[1].match(/../g))
const BLANK = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="3" height="2" fill="#e5e7eb"/></svg>')
const newFlag = (cc) => (FLAG_CODES.has(cc) ? `/flags/${cc}.svg` : BLANK)

function rewrite(html) {
  // <img src="data:...emoji..."> written by the old flagImage
  html = html.replace(/data:image\/svg\+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww\.w3\.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2032%2024%22%3E%3Ctext[^"']*/g, (m) => {
    const t = decodeURIComponent(m.slice("data:image/svg+xml,".length))
    const cps = [...t.replace(/<[^>]*>/g, "")].map((c) => c.codePointAt(0)).filter((c) => c >= 0x1f1e6 && c <= 0x1f1ff)
    const cc = cps.map((c) => String.fromCharCode(c - 0x1f1e6 + 65)).join("")
    return newFlag(cc)
  })
  // the country list JSON: the flag is no longer a data: SVG, so country-options.liquid keeps its address
  html = html.replace(/(<script type="application\/json" id="materia-country-options"[^>]*>)([\s\S]*?)(<\/script>)/, (_m, a, json, c) => {
    const rows = JSON.parse(json).map((r) => {
      const f = newFlag(r[0])
      return [r[0], r[1], r[2], r[3], f.startsWith("data:") ? "" : f]
    })
    return a + JSON.stringify(rows) + c
  })
  return html
}

async function measure(page, holder) {
  const geo = await holder.evaluate((h) => {
    const img = h.querySelector("img")
    const a = h.getBoundingClientRect()
    const b = img.getBoundingClientRect()
    return { hx: a.x + a.width / 2, hy: a.y + a.height / 2, hw: a.width, hh: a.height, ix: b.x + b.width / 2, iy: b.y + b.height / 2, iw: b.width, ih: b.height, src: img.currentSrc.slice(0, 60), nat: [img.naturalWidth, img.naturalHeight], fit: getComputedStyle(img).objectFit }
  })
  const buf = await holder.screenshot({ animations: "disabled" })
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, cx = W / 2, cy = H / 2
  const r = Math.min(W, H) / 2 - 1.5 // inside the antialiased edge
  let n = 0, covered = 0, sx = 0, sy = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy
    if (dx * dx + dy * dy > r * r) continue
    n++
    const i = (y * W + x) * 4
    const magenta = data[i] > 200 && data[i + 1] < 70 && data[i + 2] > 200
    if (!magenta) { covered++; sx += x + 0.5; sy += y + 0.5 }
  }
  const dpr = 2
  const ccx = covered ? sx / covered : NaN, ccy = covered ? sy / covered : NaN
  return {
    box: `${geo.hw}x${geo.hh}`,
    imgBox: `${geo.iw}x${geo.ih}`,
    boxOffsetPx: +Math.hypot(geo.ix - geo.hx, geo.iy - geo.hy).toFixed(2),
    drawnOffsetPx: +(Math.hypot(ccx - cx, ccy - cy) / dpr).toFixed(2),
    coverage: +((covered / n) * 100).toFixed(1),
    src: geo.src,
    fit: geo.fit,
  }
}

;(async () => {
  const browser = await chromium.launch()
  const results = {}
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const flagReqs = []
    page.on("request", (r) => { if (/\/flags\//.test(r.url())) flagReqs.push(r.url()) })
    if (mode === "after") {
      await page.route((u) => u.href === url, async (route) => {
        route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: rewrite(liveHtml) })
      })
      if (mode === "after") await page.route(/\/theme\.js(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(WT + "/theme-packages/materia/base/assets/theme.js") }))
      await page.route(/\/flags\/[A-Z]{2}\.svg/, (route) => {
        const f = path.join(WT, "public", new URL(route.request().url()).pathname)
        route.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "cache-control": "public, max-age=604800" }, body: fs.readFileSync(f) })
      })
    }
    await page.goto(url, { waitUntil: "load", timeout: 90000 })
    await page.waitForTimeout(1500)
    const form = page.locator("footer localization-form").filter({ has: page.locator('input[name="country_code"]') }).first()
    await form.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    const button = form.locator("button.button-localization").first()
    const loadsBeforeOpen = flagReqs.length
    await button.screenshot({ path: `${OUT}/${mode}-closed-${width}.png` })
    const closedFlag = await measure(page, button.locator(".localization-flags"))
    await page.addStyleTag({ content: ".localization-flags{background:#ff00ff !important}" })
    const closedFill = await measure(page, button.locator(".localization-flags"))
    await page.evaluate(() => document.querySelectorAll("style").forEach((s) => { if (s.textContent.includes("#ff00ff")) s.remove() }))
    await button.click()
    await page.waitForTimeout(900)
    const list = width < 1025 ? page.locator(".disclosure__list:visible, .materia-localization-sheet:visible").last() : form.locator(".disclosure__list")
    await page.waitForTimeout(400)
    const loadsAtOpen = flagReqs.length
    const bytesAtOpen = [...new Set(flagReqs)].reduce((n, u) => { try { return n + fs.statSync(path.join(WT, "public", new URL(u).pathname)).size } catch { return n } }, 0)
    // scroll the list to Romania, as the owner's screenshot
    const ro = page.locator('a[data-value="RO"]:visible').first()
    await ro.scrollIntoViewIfNeeded()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${mode}-open-${width}.png` })
    const rows = {}
    await page.addStyleTag({ content: ".localization-flags{background:#ff00ff !important}" })
    for (const cc of CODES) {
      const a = page.locator(`a[data-value="${cc}"]:visible`).first()
      await a.scrollIntoViewIfNeeded()
      await page.waitForFunction((c) => { const i = [...document.querySelectorAll(`a[data-value="${c}"] img`)].find((x) => x.offsetParent); return i && i.complete }, cc, { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(150)
      rows[cc] = await measure(page, a.locator(".localization-flags"))
    }
    // label alignment: flag centre vs label centre on the RO row and the button
    const align = await page.evaluate(() => {
      const out = {}
      const row = [...document.querySelectorAll('a[data-value="RO"]')].find((x) => x.offsetParent)
      const f = row.querySelector(".localization-flags").getBoundingClientRect()
      const l = row.querySelector(".loc-option__label").getBoundingClientRect()
      out.rowFlagVsLabel = +((f.y + f.height / 2) - (l.y + l.height / 2)).toFixed(2)
      return out
    })
    results[width] = { closed: { geometry: closedFlag, fill: closedFill }, rows, align, flagRequests: { beforeOpen: loadsBeforeOpen, afterOpen: loadsAtOpen, bytesAtOpen, afterScrolling: flagReqs.length, unique: new Set(flagReqs).size } }
    await ctx.close()
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/${mode}-measure.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 1))
})().catch((e) => { console.error(e); process.exit(1) })
