#!/usr/bin/env node
/**
 * ===========================================================================
 *  PRODUCT CARDS AND PRODUCT PAGES, UNIVERSAL (r66), MEASURED IN CHROMIUM
 * ===========================================================================
 *   node scripts/check-cards-r66.mjs [out dir]
 *
 * Real stores: Materia templates drawn by the compat engine's answer() from
 * this checkout (scripts/check-cards-r66-sites.ts), on a local port, as a
 * live store is drawn. Run it in an r66-base checkout too for the "before".
 *
 *   cards     an admin-built creator site's home (liam-bailey.storelib.com:
 *             a Products listing, the header and footer around it) with 1,
 *             2, 3 and 8 products at 2 and 3 per row, at 1280 and 1920:
 *             each card's width and height (a poster 0.7 wide, as Liam's)
 *   gallery   the product page's main picture at 390x844, 1280x720 and
 *             1920x969 (a browser window's inside): its height against the
 *             window's, and whether its bottom is on screen
 *   hover     every card's picture, badge, heart and button, and the
 *             gallery's picture, before and after the pointer rests on it,
 *             for each of Materia's hover effects: how far anything moved
 *             (its box) and whether a picture is transformed or swapped
 *   wishlist  hearts on the home page's cards and the product page, with
 *             the header's wishlist icon off and on
 *   logo      the Northpaper footer logo given as an uploaded picture (its
 *             size unknown, so 1600 by 1600 in the theme), header and
 *             footer: drawn shape against the file's (error 0 wanted)
 *
 * Screenshots at deviceScaleFactor 2 in the out dir. Prints JSON.
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
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "cards-r66-")))
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(path.join(root, ".wb-probe"), { recursive: true })
const work = fs.mkdtempSync(path.join(root, ".wb-probe", "cards66-"))
const esbuild = path.join(root, "node_modules/.bin/esbuild")
const helper = path.join(root, "scripts/check-cards-r66-sites.ts")
execFileSync(esbuild, [helper, "--bundle", "--platform=node", "--format=esm", `--alias:@=${root}`, "--packages=external", "--loader:.css=empty", "--log-level=error", `--outfile=${path.join(work, "sites.mjs")}`], { cwd: root })
const { startSite } = await import(path.join(work, "sites.mjs"))

/* Product pictures: a poster 0.7 wide (Liam's covers), a square, a 16:9. */
const pics = path.join(work, "pics")
fs.mkdirSync(pics)
async function picture(file, w, h, a, b) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w / 2}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.3}" fill="#e4572e"/><rect x="${w * 0.12}" y="${h * 0.78}" width="${w * 0.76}" height="${h * 0.07}" fill="#f3efe0"/></svg>`
  fs.writeFileSync(path.join(pics, file), await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer())
}
await picture("poster.jpg", 1400, 2000, "#2a0d0d", "#0b0b0b")
await picture("poster2.jpg", 1400, 2000, "#1d2433", "#0b0b0b")
await picture("square.jpg", 1600, 1600, "#9cc9e8", "#e8d3a6")
await picture("wide.jpg", 1920, 1080, "#f2a65a", "#5b3f8c")

const browser = await chromium.launch()
const result = { cards: [], gallery: [], hover: [], wishlist: [], logo: [] }
const r1 = (n) => Math.round(n * 10) / 10

async function open(base, pathname, vw, vh, shot) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: shot ? 2 : 1 })
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort())
  const page = await ctx.newPage()
  await page.goto(base + pathname, { waitUntil: "load" })
  await page.waitForTimeout(900)
  return { ctx, page }
}

/* ---- cards ---- */
for (const count of [1, 2, 3, 8]) {
  for (const perRow of [2, 3]) {
    const site = await startSite({ template: "creator", products: count, images: ["poster.jpg", "poster2.jpg"], productsDir: pics, perRow, wishlistIcon: false })
    for (const [vw, vh] of [[1280, 720], [1920, 969]]) {
      const shot = (count === 2 && perRow === 2) || (count === 8 && perRow === 3)
      const { ctx, page } = await open(site.base, "/", vw, vh, shot)
      const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".pl-grid > .product-item")].map((c) => c.getBoundingClientRect())
        const pic = [...document.querySelectorAll(".pl-grid > .product-item .product-item__media--ratio")].map((c) => c.getBoundingClientRect())
        const row = document.querySelector(".pl-grid")?.getBoundingClientRect()
        return { n: cards.length, w: Math.max(0, ...cards.map((r) => r.width)), h: Math.max(0, ...cards.map((r) => r.height)), picH: Math.max(0, ...pic.map((r) => r.height)), row: row ? row.width : 0, left: cards[0] ? cards[0].left - (row?.left ?? 0) : 0 }
      })
      result.cards.push({ products: count, perRow, viewport: `${vw}x${vh}`, cards: m.n, cardW: r1(m.w), cardH: r1(m.h), pictureH: r1(m.picH), rowW: r1(m.row), firstCardFromRowStart: r1(m.left), cardHvsWindow: r1(m.h / vh) })
      if (shot) {
        await page.evaluate(() => document.querySelector(".pl-grid")?.scrollIntoView({ block: "center" }))
        await page.waitForTimeout(400)
        await page.screenshot({ path: path.join(OUT, `cards-${count}x${perRow}-${vw}.png`) })
      }
      await ctx.close()
    }
    site.close()
  }
}

/* ---- gallery ---- */
for (const [template, img] of [["creator", "poster.jpg"], ["default", "square.jpg"], ["notionpage", "wide.jpg"], ["posters", "poster.jpg"], ["clothing", "poster.jpg"], ["outerwear", "poster.jpg"]]) {
  const site = await startSite({ template, products: 3, images: [img, img === "wide.jpg" ? "square.jpg" : "poster2.jpg"], productsDir: pics })
  for (const [vw, vh] of [[390, 844], [1280, 720], [1920, 969]]) {
    const { ctx, page } = await open(site.base, "/products/programme-1", vw, vh, vw !== 1280)
    const m = await page.evaluate(() => {
      const f = [...document.querySelectorAll("media-gallery .media-gallery__image")].find((e) => e.getBoundingClientRect().width > 60)
      if (!f) return null
      const r = f.getBoundingClientRect()
      const col = f.closest(".product-detail__media")?.getBoundingClientRect()
      return { w: r.width, h: r.height, top: r.top + scrollY, bottom: r.bottom + scrollY, col: col ? col.width : 0, layout: f.closest("media-gallery")?.querySelector("slide-with-thumbs")?.className ?? "grid" }
    })
    if (m) result.gallery.push({ template, viewport: `${vw}x${vh}`, pictureW: r1(m.w), pictureH: r1(m.h), columnW: r1(m.col), hVsWindow: r1(m.h / vh), bottomOnScreen: m.bottom <= vh + 0.5, top: r1(m.top) })
    if (vw !== 1280) await page.screenshot({ path: path.join(OUT, `product-${template}-${vw}.png`) })
    await ctx.close()
  }
  site.close()
}

/* ---- hover ---- */
const EFFECTS = ["hover_zoom", "hover_zoom_out", "hover_pan", "hover_tilt", "hover_lift", "hover_slide", "hover_reveal", "hover_fade", "hover_blur"]
{
  const site = await startSite({ template: "creator", products: 3, images: ["poster.jpg", "square.jpg"], productsDir: pics, perRow: 3, wishlistIcon: true })
  for (const effect of EFFECTS) {
    const { ctx, page } = await open(site.base, "/", 1280, 900, false)
    await page.evaluate((effect) => {
      for (const el of document.querySelectorAll("[class*='hover_']")) {
        const keep = [...el.classList].filter((c) => !/^hover_[a-z_]+$/.test(c) || c === "hover_effect")
        if (keep.length !== el.classList.length) el.className = [...keep, effect].join(" ")
      }
      document.querySelector(".pl-grid")?.scrollIntoView({ block: "center" })
    }, effect)
    await page.mouse.move(2, 2)
    await page.waitForTimeout(500)
    const snap = () => page.evaluate(() => {
      const card = document.querySelector(".pl-grid > .product-item")
      const out = []
      for (const el of [card, ...card.querySelectorAll("*")]) {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (!r.width || cs.visibility === "hidden") continue
        out.push({ tag: el.tagName + "." + String(el.className).split(" ")[0], x: r.left, y: r.top, w: r.width, h: r.height, t: cs.transform, o: cs.opacity, img: el.tagName === "IMG" ? (el.currentSrc || el.src).split("/").pop() : null })
      }
      return out
    })
    const before = await snap()
    const box = await page.evaluate(() => { const r = document.querySelector(".pl-grid > .product-item .product-item__media--ratio").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await page.mouse.move(box.x, box.y, { steps: 4 })
    await page.waitForTimeout(1300)
    const after = await snap()
    let moved = 0
    let worst = null
    let transformed = 0
    const seen = new Set()
    for (let i = 0; i < Math.min(before.length, after.length); i++) {
      const a = before[i], b = after[i]
      if (a.tag !== b.tag) continue
      const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h))
      if (d > 0.5) { moved++; if (!worst || d > worst.d) worst = { el: a.tag, d: r1(d) } }
      if (b.img && b.t !== "none" && b.t !== a.t) transformed++
      if (b.img && Number(b.o) > 0.5) seen.add(b.img)
    }
    const shownBefore = new Set(before.filter((x) => x.img && Number(x.o) > 0.5).map((x) => x.img))
    const swapped = [...seen].some((s) => !shownBefore.has(s))
    result.hover.push({ effect, movedBoxes: moved, worst, picturesTransformed: transformed, pictureSwapped: swapped })
    await ctx.close()
  }
  /* The product page's main picture under the pointer. */
  const { ctx, page } = await open(site.base, "/products/programme-1", 1280, 900, false)
  const frame = await page.evaluate(() => { const f = [...document.querySelectorAll("media-gallery .media-gallery__image")].find((e) => e.getBoundingClientRect().width > 60); const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: [r.left, r.top, r.width, r.height] } })
  await page.mouse.move(frame.x, frame.y, { steps: 4 })
  await page.waitForTimeout(900)
  const g = await page.evaluate(() => {
    const f = [...document.querySelectorAll("media-gallery .media-gallery__image")].find((e) => e.getBoundingClientRect().width > 60)
    const r = f.getBoundingClientRect()
    const img = f.querySelector("img")
    const pane = [...document.querySelectorAll(".drift-zoom-pane")].some((p) => p.getBoundingClientRect().width > 0 && getComputedStyle(p).display !== "none")
    return { r: [r.left, r.top, r.width, r.height], t: img ? getComputedStyle(img).transform : "none", pane }
  })
  result.hover.push({ effect: "product page picture", movedBoxes: g.r.some((v, i) => Math.abs(v - frame.r[i]) > 0.5) ? 1 : 0, picturesTransformed: g.t !== "none" ? 1 : 0, magnifierShown: g.pane })
  await ctx.close()
  site.close()
}

/* ---- wishlist ---- */
for (const icon of [false, true]) {
  const site = await startSite({ template: "creator", products: 3, images: ["poster.jpg"], productsDir: pics, perRow: 3, wishlistIcon: icon })
  for (const pathname of ["/", "/products/programme-1"]) {
    const { ctx, page } = await open(site.base, pathname, 1280, 900, false)
    const m = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" }
      const inMarkup = document.querySelectorAll("main button-wishlist, main .product-item__button-wishlist").length
      const shown = [...document.querySelectorAll("main button-wishlist, main .product-item__button-wishlist, main [data-wishlist-button]")].filter(vis).length
      const header = [...document.querySelectorAll(".header__wishlist, header a[href*='wishlist']")].filter(vis).length
      return { inMarkup, shown, header, html: document.documentElement.getAttribute("data-sl-wishlist") }
    })
    result.wishlist.push({ headerIcon: icon, page: pathname, headerIconsShown: m.header, heartsInMarkup: m.inMarkup, heartsShown: m.shown, htmlMark: m.html })
    await ctx.close()
  }
  site.close()
}

/* ---- logo ---- */
{
  const site = await startSite({ template: "notionpage", products: 3, images: ["square.jpg"], productsDir: pics, footerLogo: "/__product/notionpage-logo.webp" })
  for (const [vw, vh] of [[390, 844], [1280, 800], [1920, 969]]) {
    const { ctx, page } = await open(site.base, "/", vw, vh, true)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(700)
    const m = await page.evaluate(() => [...document.querySelectorAll("header img, footer img, .store-info-content img, [class*=logo] img")]
      .filter((i, k, all) => all.indexOf(i) === k && i.naturalWidth && i.getBoundingClientRect().width > 20 && !/flag/.test(i.closest("[class]")?.className ?? ""))
      .map((i) => {
        const r = i.getBoundingClientRect()
        const cs = getComputedStyle(i)
        let dw = r.width, dh = r.height
        if (cs.objectFit === "contain" || cs.objectFit === "scale-down") { const s = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight); dw = i.naturalWidth * s; dh = i.naturalHeight * s }
        return { where: i.closest("footer, .footer, [id*=footer]") ? "footer" : "header", box: `${Math.round(r.width)}x${Math.round(r.height)}`, file: `${i.naturalWidth}x${i.naturalHeight}`, error: Math.round(Math.abs(dw / dh / (i.naturalWidth / i.naturalHeight) - 1) * 1000) / 1000 }
      }))
    result.logo.push({ viewport: `${vw}x${vh}`, logos: m })
    const foot = await page.$(".store-info-content")
    if (foot) { await foot.scrollIntoViewIfNeeded(); await foot.screenshot({ path: path.join(OUT, `logo-footer-${vw}.png`) }) }
    await ctx.close()
  }
  site.close()
}

await browser.close()
fs.rmSync(work, { recursive: true, force: true })
console.log(JSON.stringify(result, null, 1))
