/**
 * ===========================================================================
 *  A PICTURE THAT IS NOT THERE, BEFORE AND AFTER, MEASURED (round 39)
 * ===========================================================================
 * The owner's screenshot: a product row in a mini cart, a broken image icon
 * and "Black Sleeves" spilling out of the thumbnail. This serves pictures
 * that fail (404, bytes that are not a picture, src="", no src at all) to:
 *
 *   1. an imported theme's cart drawer and product grid (the markup a
 *      Dawn style theme writes), with the head lib/storelib-theme/compat/
 *      theme.ts renderDocument now gives every imported theme's page
 *   2. Storelib's own mini cart, checkout lines and empty boxes, drawn by the
 *      real components (scripts/render-missing-image.tsx)
 *
 * and measures, at 1440 and 390 wide, with the fix and without it:
 *
 *   - every failed or empty picture is marked and draws (naturalWidth > 0),
 *     so neither a broken icon nor its alt text can show
 *   - a working picture is left exactly as it was
 *   - Storelib's own thumbnails keep their box to the pixel, and the theme's
 *     take the square their width and height say
 *   - a picture that later gets a working address is a photo again; one
 *     added later without an address turns grey too
 *   - on Storelib's dark buyer pages the grey is the dark one
 *
 *   node scripts/check-missing-image.mjs
 *   SHOTS=<dir>   where the pictures go (default: the system temp dir)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SHOTS = process.env.SHOTS || join(tmpdir(), "missing-image-shots")
mkdirSync(SHOTS, { recursive: true })

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${!ok && detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  if (!ok) failures++
}

/* ── the real components and the real head ── */
/* Inside the checkout, so the bundle finds react and react-dom where the app does. */
const dir = join(root, ".missing-image-probe")
mkdirSync(dir, { recursive: true })
const out = join(dir, "render.mjs")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-missing-image.tsx"), "--bundle", "--jsx=automatic", "--platform=node", "--format=esm", "--log-level=error", `--outfile=${out}`, `--alias:@=${root}`, '--define:process.env.NODE_ENV="production"', "--packages=external"], { stdio: ["ignore", "ignore", "inherit"] })
const rendered = JSON.parse(execFileSync(process.execPath, [out], { encoding: "utf8", cwd: root }))
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)

/* ── what the theme writes (both pages), and Storelib's rows as they were drawn before ── */
const THEME_CSS = `
  .drawer{max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px;font:14px/1.4 system-ui,sans-serif;color:#121212}
  .cart-items{width:100%;border-collapse:collapse}
  .cart-item td{padding:12px 0;vertical-align:top;border-bottom:1px solid #eee}
  .cart-item__media{width:10rem}
  .cart-item__image{height:auto;max-width:6.4rem}
  .cart-item__name{display:block;font-weight:600;text-decoration:none;color:inherit}
  .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;max-width:900px;margin:24px auto;font:14px system-ui,sans-serif}
  @media (max-width:600px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 16px}}
  .card__media{position:relative;aspect-ratio:1;overflow:hidden;background:#fff;border:1px solid #eee;border-radius:8px}
  .card__media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .card__media img.second{opacity:0}
  .card__title{margin-top:8px;font-weight:600}
  h2{font:600 13px system-ui,sans-serif;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;max-width:900px;margin:28px auto 10px;padding:0 16px}
`
const row = (src, alt, i) => `<tr class="cart-item"><td class="cart-item__media"><img class="cart-item__image" data-probe="theme-${i}" ${src === null ? "" : `src="${src}"`} alt="${alt}" loading="lazy" width="150" height="150"></td><td><a class="cart-item__name" data-title="theme-${i}" href="#">${alt}</a><div>$48.00</div></td></tr>`
const card = (img, title, i) => `<div><div class="card__media">${img}</div><div class="card__title" data-title="card-${i}">${title}</div></div>`
const THEME = `
  <h2>Imported theme: cart drawer</h2>
  <div class="drawer"><table class="cart-items">
    ${row("/broken/black-sleeves.jpg", "Black Sleeves", 0)}
    ${row("", "Linen Shirt Long Sleeve Natural", 1)}
    ${row(null, "Wool Cap", 2)}
    ${row("/ok/cap.png", "Canvas Tote", 3)}
  </table></div>
  <h2>Imported theme: product grid</h2>
  <div class="grid">
    ${card(`<img data-probe="card-0" src="/broken/a.jpg" srcset="/broken/a-400.jpg 400w, /broken/a-800.jpg 800w" sizes="25vw" alt="Black Sleeves">`, "Black Sleeves", 0)}
    ${card(`<picture><source srcset="/broken/b.webp" type="image/webp"><img data-probe="card-1" src="/broken/b.jpg" alt="Field Jacket"></picture>`, "Field Jacket", 1)}
    ${card(`<img data-probe="card-2" src="/corrupt/c.jpg" alt="Not a picture">`, "Corrupt file", 2)}
    ${card(`<img data-probe="card-3" src="/ok/cap.png" alt="Canvas Tote"><img class="second" data-probe="card-3b" src="/broken/second.jpg" alt="">`, "Working, broken hover image", 3)}
  </div>`
/* Storelib's rows as they were: a bare <img> that fails, an empty tinted box, the Package glyph. */
const STORELIB_BEFORE = `<div class="mx-auto max-w-[420px] rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
  <div class="flex items-start gap-3 border-b border-black/10 py-4" data-row="mini-cart"><a href="#" class="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-lg" style="background:#ececec" data-thumb=""><img src="/broken/black-sleeves.jpg" alt="Black Sleeves" class="h-full w-full object-cover" loading="lazy"></a><div class="min-w-0 flex-1" data-title=""><a href="#" class="block text-[14px] font-medium leading-snug">Black Sleeves</a><p class="mt-0.5 text-[12px] opacity-60">Black / M</p><p class="mt-2 text-[14px] tabular-nums">$48.00</p></div></div>
  <div class="flex items-start gap-3 border-b border-black/10 py-4" data-row="mini-cart"><a href="#" class="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-lg" style="background:#ececec" data-thumb=""></a><div class="min-w-0 flex-1" data-title=""><a href="#" class="block text-[14px] font-medium leading-snug">Linen Shirt</a><p class="mt-0.5 text-[12px] opacity-60">Black / M</p><p class="mt-2 text-[14px] tabular-nums">$48.00</p></div></div>
  <div class="flex items-start gap-3.5 py-2" data-row="checkout"><div class="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]" data-thumb=""><img src="/broken/black-sleeves.jpg" alt="" class="h-full w-full object-cover"></div><div class="min-w-0 flex-1" data-title=""><p class="text-[14px] font-medium text-[#1a1a2e]">Black Sleeves</p><p class="text-[13px] text-[#6b7280]">Qty 1</p></div></div>
  <div class="flex items-start gap-3.5 py-2" data-row="checkout"><div class="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]" data-thumb=""><span class="flex h-full items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4c7cd" stroke-width="1.5"><path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></span></div><div class="min-w-0 flex-1" data-title=""><p class="text-[14px] font-medium text-[#1a1a2e]">Gift card</p><p class="text-[13px] text-[#6b7280]">Qty 1</p></div></div>
  <div class="flex gap-3 py-3" data-row="box"><div class="h-24 w-24 overflow-hidden rounded-xl" data-thumb=""></div><div class="h-24 w-40 overflow-hidden rounded-xl" data-thumb=""></div></div>
</div>`

const page = (after) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>${THEME_CSS} body{background:#f8f9fa;margin:0;padding:8px 0 40px}</style>${after ? rendered.head : ""}</head><body>
<h2>Storelib: mini cart and checkout lines</h2>
<div style="padding:0 16px">${after ? rendered.storelib : STORELIB_BEFORE}</div>
${THEME}
</body></html>`

/* A 2x2 PNG, the one working picture. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDNzRfDwAAAABJRU5ErkJggg==", "base64")
const server = createServer((req, res) => {
  const url = req.url || "/"
  if (url.startsWith("/broken/")) return res.writeHead(404, { "content-type": "text/html" }).end("<h1>Not found</h1>")
  if (url.startsWith("/corrupt/")) return res.writeHead(200, { "content-type": "image/jpeg" }).end("this is not a jpeg")
  if (url.startsWith("/ok/")) return res.writeHead(200, { "content-type": "image/png" }).end(PNG)
  const after = url.startsWith("/after")
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(after))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })

const measure = (p) =>
  p.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }
    }
    const imgs = [...document.querySelectorAll("img")].map((i) => ({ probe: i.getAttribute("data-probe"), src: (i.getAttribute("src") || "").slice(0, 40), marked: i.hasAttribute("data-sl-missing"), drawn: i.complete && i.naturalWidth > 0, rect: r(i), bg: getComputedStyle(i).backgroundColor }))
    const thumbs = [...document.querySelectorAll("[data-thumb]")].map((t) => r(t))
    const titles = [...document.querySelectorAll("[data-title]")].map((t) => r(t))
    const boxes = [...document.querySelectorAll("[data-missing-image]")].map((b) => ({ rect: r(b), bg: getComputedStyle(b).backgroundColor, icon: r(b.querySelector("svg")) }))
    return { imgs, thumbs, titles, boxes, scrollW: document.documentElement.scrollWidth, w: innerWidth }
  })

const results = {}
for (const width of [1440, 390]) {
  for (const mode of ["before", "after"]) {
    const p = await browser.newPage()
    await p.setViewport({ width, height: 900, deviceScaleFactor: width < 600 ? 2 : 1 })
    await p.goto(`${base}/${mode}`, { waitUntil: "networkidle0" })
    /* Lazy pictures below the fold load as they come near: scroll through once. */
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 30))
      }
      scrollTo(0, 0)
    })
    await new Promise((r) => setTimeout(r, 300))
    results[`${mode}-${width}`] = await measure(p)
    await p.screenshot({ path: join(SHOTS, `missing-image-${mode}-${width}.png`), fullPage: true })
    if (mode === "after") {
      /* A later working address, a later failure, a picture added without one, and the dark buyer pages. */
      const later = await p.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        const marked = document.querySelector('img[data-probe="theme-0"]')
        marked.setAttribute("src", "/ok/cap.png")
        const working = document.querySelector('img[data-probe="theme-3"]')
        working.setAttribute("src", "/broken/now-gone.jpg")
        const tr = document.createElement("tr")
        tr.innerHTML = '<td><img data-probe="late" alt="Added later" width="150" height="150" class="cart-item__image"></td><td>Added later</td>'
        document.querySelector(".cart-items").appendChild(tr)
        await wait(400)
        document.documentElement.setAttribute("data-sl-dark", "")
        const dark = getComputedStyle(document.querySelector("img[data-sl-missing]")).backgroundColor
        document.documentElement.removeAttribute("data-sl-dark")
        const late = document.querySelector('img[data-probe="late"]')
        return {
          fixedAgain: !marked.hasAttribute("data-sl-missing") && marked.naturalWidth > 0,
          failedLater: working.hasAttribute("data-sl-missing") && working.naturalWidth > 0,
          lateMarked: late.hasAttribute("data-sl-missing") && late.naturalWidth > 0,
          dark,
        }
      })
      results[`later-${width}`] = later
    }
    await p.close()
  }
}
await browser.close()
server.close()

for (const width of [1440, 390]) {
  const b = results[`before-${width}`]
  const a = results[`after-${width}`]
  console.log(`\n${width} wide`)
  const failing = (i) => i.probe !== "card-3" && i.probe !== "card-3b" && i.probe !== "theme-3"
  const storelibImgsBefore = b.imgs.filter((i) => !i.probe)
  check("before: Storelib's failed thumbnails draw nothing (the broken icon and alt text)", storelibImgsBefore.length > 0 && storelibImgsBefore.every((i) => !i.drawn), storelibImgsBefore)
  check("before: the theme's failed pictures draw nothing", b.imgs.filter((i) => i.probe && failing(i)).every((i) => !i.drawn))
  const themeAfter = a.imgs.filter((i) => i.probe && failing(i))
  check("after: every failed or empty theme picture is marked and draws the camera", themeAfter.length === 6 && themeAfter.every((i) => i.marked && i.drawn), themeAfter.filter((i) => !(i.marked && i.drawn)))
  check("  the hover picture failed too, and is still hidden until hovered", (() => { const h = a.imgs.find((i) => i.probe === "card-3b"); return h?.marked && h.drawn })())
  const ok = a.imgs.filter((i) => i.probe === "card-3" || i.probe === "theme-3")
  check("after: a working picture is untouched", ok.length === 2 && ok.every((i) => !i.marked && i.drawn && i.src === "/ok/cap.png"), ok)
  check("after: the grey is #f3f4f6", themeAfter.every((i) => i.bg === "rgb(243, 244, 246)"), themeAfter.map((i) => i.bg))
  const thumbs = a.imgs.filter((i) => /^theme-[012]$/.test(i.probe || ""))
  check("after: the theme's cart thumbnails take the square their width and height say (6.4rem)", thumbs.every((i) => Math.abs(i.rect.w - 102.4) < 0.6 && Math.abs(i.rect.h - 102.4) < 0.6), thumbs.map((i) => i.rect))
  const cards = a.imgs.filter((i) => /^card-[012]$/.test(i.probe || ""))
  check("after: a card's picture fills its square", cards.every((i) => i.rect.w > 60 && Math.abs(i.rect.w - i.rect.h) < 0.6), cards.map((i) => i.rect))
  const storelibAfter = a.imgs.filter((i) => !i.probe)
  check("after: no Storelib thumbnail is left failing (broken ones became the box)", storelibAfter.every((i) => i.drawn), storelibAfter)
  check("after: Storelib's boxes: the two missing, the two failed and two empty ones, all grey", a.boxes.length + storelibAfter.length >= 6 && a.boxes.every((x) => x.bg === "rgb(243, 244, 246)"), a.boxes)
  check("  every Storelib thumbnail keeps its box to the pixel", JSON.stringify(a.thumbs) === JSON.stringify(b.thumbs), { before: b.thumbs, after: a.thumbs })
  check("  and the text beside it does not move", JSON.stringify(a.titles.slice(0, 4)) === JSON.stringify(b.titles.slice(0, 4)), { before: b.titles.slice(0, 4), after: a.titles.slice(0, 4) })
  check("  the camera is a third of the box, 18 to 56px", a.boxes.every((x) => x.icon.w >= 18 && x.icon.w <= 56 && Math.abs(x.icon.w - Math.min(56, Math.max(18, x.rect.w * 0.34))) < 1.5), a.boxes.map((x) => [x.rect.w, x.icon.w]))
  check("  no sideways scroll", a.scrollW <= a.w, [a.scrollW, a.w])
  const later = results[`later-${width}`]
  check("a failed picture given a working address is a photo again", later.fixedAgain)
  check("a working picture that fails later turns grey", later.failedLater)
  check("a picture added later without an address turns grey", later.lateMarked)
  check("on Storelib's dark buyer pages the grey is the dark one", later.dark === "rgb(38, 40, 44)", later.dark)
}
console.log(`\nshots: ${SHOTS}/missing-image-{before,after}-{1440,390}.png`)
console.log(failures ? `\n${failures} failed` : "\nall passed")
process.exit(failures ? 1 : 0)
