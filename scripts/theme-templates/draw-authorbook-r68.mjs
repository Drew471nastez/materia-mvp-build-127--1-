/**
 * ===========================================================================
 *  ROUND 68: THE EBOOK TEMPLATE'S COVER, BOOK, LOGO AND EDITION PICTURES
 * ===========================================================================
 * Say It Plainly, a copywriting handbook by Hanna Reyes (a sample author).
 * Everything here is drawn as HTML and photographed in Chromium: the cover is
 * type on paper (Manrope, SIL Open Font License), the book is that cover on a
 * CSS 3D box with a spine, a hinge, page edges and a shadow, the devices are
 * plain frames around the same cover. No generated pictures.
 *
 *   node scripts/theme-templates/draw-authorbook-r68.mjs
 *
 * Writes theme-packages/materia/templates/authorbook/assets/authorbook-{logo,
 * book}.webp and scripts/theme-templates/products/authorbook/authorbook-{cover,
 * ebook,ed-ebook,ed-audio,ed-complete,audiobook}.webp. Credits:
 * theme-packages/materia/templates/CREDITS.md (Ebook).
 */
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const sharp = require("sharp")

const ROOT = process.cwd()
const ASSETS = join(ROOT, "theme-packages/materia/templates/authorbook/assets")
const PRODUCTS = join(ROOT, "scripts/theme-templates/products/authorbook")
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=block" rel="stylesheet">`
const PAPER = "#f4f1ea"
const INK = "#16140f"
const RED = "#d23a2c"

/* ── The cover, 1200 by 1800 ─────────────────────────────────────────── */
const COVER = `
<div class="cv">
  <div class="cv__top">The copywriting handbook</div>
  <div class="cv__title">
    <span class="l1" data-fit>Say it</span>
    <span class="l2" data-fit>plainly<i>.</i></span>
  </div>
  <p class="cv__sub">How to write websites, product pages and emails people <span class="u">read to the end<svg viewBox="0 0 300 24" preserveAspectRatio="none"><path d="M4 15C70 8 170 6 296 11M30 20c80-4 170-5 250-2" fill="none" stroke="${RED}" stroke-width="5.5" stroke-linecap="round"/></svg></span></p>
  <div class="cv__ba"><s>Innovative solutions for modern teams</s><b>Payroll for teams of 5 to 50, done in ten minutes</b></div>
  <div class="cv__foot">
    <div class="cv__name">Hanna Reyes</div>
    <div class="cv__note">12 chapters and 60 copy templates</div>
  </div>
</div>`
const COVER_CSS = `
.cv { position: relative; width: 1200px; height: 1800px; box-sizing: border-box; padding: 104px 96px 96px; background: ${PAPER}; color: ${INK}; font-family: Manrope; display: flex; flex-direction: column; overflow: hidden; }
.cv__top { font-weight: 700; font-size: 30px; letter-spacing: .2em; text-transform: uppercase; padding-bottom: 30px; border-bottom: 4px solid ${INK}; }
.cv__title { margin-top: 84px; font-weight: 800; text-transform: uppercase; line-height: .84; letter-spacing: -.035em; }
.cv__title span { display: block; width: max-content; white-space: nowrap; }
.cv__title .l1 { font-size: 318px; }
.cv__title .l2 { font-size: 222px; margin-top: 26px; }
.cv__title i { font-style: normal; color: ${RED}; }
.cv__sub { margin: 96px 0 0; max-width: 960px; font-weight: 600; font-size: 60px; line-height: 1.22; letter-spacing: -.015em; }
.cv__sub .u { position: relative; white-space: nowrap; }
.cv__sub svg { position: absolute; left: -2%; right: -2%; width: 104%; bottom: -26px; height: 30px; }
.cv__ba { margin-top: auto; margin-bottom: 92px; display: grid; gap: 14px; font-size: 36px; line-height: 1.25; letter-spacing: -.01em; }
.cv__ba s { color: #8f897e; font-weight: 500; text-decoration-color: ${RED}; text-decoration-thickness: 4px; }
.cv__ba b { font-weight: 800; }
.cv__foot { padding-top: 34px; border-top: 4px solid ${INK}; display: flex; justify-content: space-between; align-items: flex-end; gap: 40px; }
.cv__name { font-weight: 800; font-size: 70px; letter-spacing: .06em; text-transform: uppercase; line-height: 1; }
.cv__note { font-weight: 600; font-size: 28px; letter-spacing: .02em; color: #57524a; text-align: right; max-width: 330px; line-height: 1.3; }
`

/* ── The book: the cover on a 3D box ─────────────────────────────────── */
function bookHtml({ width = 520, tilt = 26, shadow = "dark", coverUrl }) {
  const h = width * 1.5
  const t = Math.round(width * 0.085)
  return `
<div class="scene" style="--w:${width}px;--h:${h}px;--t:${t}px;--tilt:${tilt}deg">
  <div class="floor floor--${shadow}"></div>
  <div class="book">
    <div class="face front"><img src="${coverUrl}"><div class="hinge"></div><div class="sheen"></div></div>
    <div class="face spine"><span>Say it plainly<i>.</i></span><b>Hanna Reyes</b></div>
    <div class="face pages"></div>
    <div class="face top"></div>
  </div>
</div>`
}
const BOOK_CSS = `
.scene { position: relative; width: var(--w); height: var(--h); perspective: 2400px; perspective-origin: 30% 40%; }
.book { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateY(var(--tilt)) rotateX(-2deg); }
.face { position: absolute; backface-visibility: hidden; }
.front { inset: 0; transform: translateZ(calc(var(--t) / 2)); overflow: hidden; border-radius: 0 3px 3px 0; }
.front img { display: block; width: 100%; height: 100%; }
.hinge { position: absolute; top: 0; bottom: 0; left: 2.2%; width: 1.6%; background: linear-gradient(90deg, rgba(0,0,0,.10), rgba(255,255,255,.35) 45%, rgba(0,0,0,.06)); }
.sheen { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(255,255,255,.0) 0%, rgba(255,255,255,.16) 18%, rgba(255,255,255,0) 40%, rgba(0,0,0,.05) 100%); }
.spine { top: 0; left: 0; width: var(--t); height: var(--h); transform-origin: left center; transform: translateZ(calc(var(--t) / 2)) rotateY(-90deg); background: linear-gradient(90deg, #d9d3c6, #ece7dc 30%, #e2dccf 70%, #c9c2b3); display: flex; align-items: center; justify-content: space-between; flex-direction: column; padding: 34px 0; box-sizing: border-box; }
.spine span, .spine b { writing-mode: vertical-rl; font-family: Manrope; color: ${INK}; white-space: nowrap; }
.spine span { font-weight: 800; text-transform: uppercase; font-size: calc(var(--t) * .5); letter-spacing: -.01em; }
.spine span i { font-style: normal; color: ${RED}; }
.spine b { font-weight: 700; text-transform: uppercase; font-size: calc(var(--t) * .3); letter-spacing: .12em; }
.pages { top: 0; right: 0; width: var(--t); height: var(--h); transform-origin: right center; transform: translateZ(calc(var(--t) / 2)) rotateY(90deg); background: repeating-linear-gradient(90deg, #f7f5ef 0 2px, #e4dfd4 2px 3px); }
.top { left: 0; top: 0; width: var(--w); height: var(--t); transform-origin: top center; transform: translateZ(calc(var(--t) / 2)) rotateX(-90deg); background: repeating-linear-gradient(0deg, #f7f5ef 0 2px, #e4dfd4 2px 3px); }
.floor { position: absolute; left: 4%; right: -14%; bottom: -3%; height: 7%; border-radius: 50%; filter: blur(18px); transform: skewX(-24deg); }
.floor--dark { background: rgba(0,0,0,.75); }
.floor--light { background: rgba(40,30,20,.38); }
`

/* ── Devices ─────────────────────────────────────────────────────────── */
const TABLET = (coverUrl, w = 420) => `<div class="tab" style="width:${w}px"><img src="${coverUrl}"></div>`
const PHONE = (coverUrl, w = 250) => `<div class="ph" style="width:${w}px"><div class="ph__in"><img class="ph__cv" src="${coverUrl}"><div class="ph__t">Say It Plainly</div><div class="ph__s">Chapter 2. Write the headline last</div><div class="ph__bar"><i></i></div><div class="ph__c"><span>&#9664;&#9664;</span><b></b><span>&#9654;&#9654;</span></div></div></div>`
const CARD = (n, title, lines) => `<div class="card"><div class="card__n">${n}</div><div class="card__b"><div class="card__k">Copy template</div><div class="card__t">${title}</div>${lines.map((l) => `<div class="card__l"><span>${l[0]}</span><em>${l[1]}</em></div>`).join("")}</div></div>`
const DEVICE_CSS = `
.tab { box-sizing: border-box; padding: 18px; background: #17171a; border-radius: 30px; box-shadow: 0 40px 70px -30px rgba(30,20,10,.55), 0 0 0 2px #2c2c30 inset; }
.tab img { display: block; width: 100%; border-radius: 12px; }
.ph { box-sizing: border-box; padding: 12px; background: #17171a; border-radius: 40px; box-shadow: 0 40px 60px -28px rgba(30,20,10,.6); }
.ph__in { background: #fbfaf7; border-radius: 30px; padding: 46px 22px 30px; font-family: Manrope; color: ${INK}; }
.ph__cv { display: block; width: 72%; margin: 0 auto 22px; box-shadow: 0 14px 24px -12px rgba(0,0,0,.45); }
.ph__t { font-weight: 800; font-size: 19px; }
.ph__s { font-weight: 500; font-size: 13px; color: #6b665d; margin-top: 4px; }
.ph__bar { height: 4px; background: #e4dfd4; border-radius: 2px; margin: 20px 0 16px; }
.ph__bar i { display: block; width: 38%; height: 100%; background: ${INK}; border-radius: 2px; }
.ph__c { display: flex; align-items: center; justify-content: space-between; padding: 0 18px; font-size: 13px; color: ${INK}; }
.ph__c b { width: 52px; height: 52px; border-radius: 50%; background: ${RED}; position: relative; }
.ph__c b::after { content: ""; position: absolute; left: 21px; top: 16px; border-left: 15px solid #fff; border-top: 10px solid transparent; border-bottom: 10px solid transparent; }
.card { width: 260px; height: 360px; background: #fff; box-shadow: 0 30px 50px -26px rgba(30,20,10,.5); font-family: Manrope; color: ${INK}; overflow: hidden; }
.card__n { background: ${INK}; color: ${PAPER}; font-weight: 800; font-size: 64px; letter-spacing: -.04em; padding: 18px 20px 10px; line-height: 1; }
.card__b { padding: 18px 20px; }
.card__k { font-weight: 700; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: ${RED}; }
.card__t { font-weight: 800; font-size: 19px; margin: 6px 0 14px; line-height: 1.15; }
.card__l { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px solid #ece8df; padding: 7px 0; font-size: 10.5px; line-height: 1.3; }
.card__l span { color: #9a948a; text-decoration: line-through; text-decoration-color: ${RED}; }
.card__l em { font-style: normal; font-weight: 700; }
`

/* ── Logo: a speech mark that ends in a full stop, and the name ───────── */
const LOGO = (color) => `
<div id="l" style="display:inline-flex;align-items:center;gap:22px;padding:6px;font-family:Manrope">
  <svg width="104" height="104" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M10 6h44a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H26L13 59v-11h-3a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6Z" fill="${color}"/>
    <circle cx="43" cy="33" r="7.5" fill="${RED}"/>
  </svg>
  <span style="font-weight:800;font-size:96px;line-height:1;letter-spacing:-.045em;color:${color};white-space:nowrap">Say It Plainly</span>
</div>`

async function main() {
  const browser = await chromium.launch()
  const shot = async (html, css, selector, { width = 1400, height = 1800, scale = 1 } = {}) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
    await page.setContent(`<html><head>${FONTS}<style>html,body{margin:0;background:transparent}${css}</style></head><body>${html}</body></html>`)
    await page.evaluate(() => document.fonts.ready)
    /* Each title line is set to the cover's full measure (a justified stack). */
    await page.evaluate(() => { for (const el of document.querySelectorAll('[data-fit]')) { const box = el.closest('.cv').clientWidth - 192; const size = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = `${(size * box) / el.getBoundingClientRect().width}px` } })
    await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))))
    await page.waitForTimeout(300)
    if (!(await page.evaluate(() => document.fonts.check("800 40px Manrope")))) throw new Error("Manrope did not load")
    const png = await page.locator(selector).screenshot({ omitBackground: true })
    await page.close()
    return png
  }

  /* cover */
  const cover = await shot(COVER, COVER_CSS, ".cv")
  const coverUrl = `data:image/png;base64,${cover.toString("base64")}`
  await sharp(cover).resize(800, 1200).webp({ quality: 90 }).toFile(join(PRODUCTS, "authorbook-cover.webp"))

  /* the hero's book, transparent, 900 by 1120 */
  const hero = await shot(`<div id="s" style="width:900px;height:1120px;display:flex;align-items:center;justify-content:center">${bookHtml({ width: 560, tilt: 24, shadow: "dark", coverUrl })}</div>`, COVER_CSS + BOOK_CSS, "#s", { width: 900, height: 1120 })
  await sharp(hero).webp({ quality: 90, alphaQuality: 100 }).toFile(join(ASSETS, "authorbook-book.webp"))

  /* product pictures on paper, 900 by 1125 */
  const ground = (inner) => `<div id="s" style="width:900px;height:1125px;background:radial-gradient(120% 90% at 50% 35%, #f1ede4, #e3ddd0);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">${inner}</div>`
  const product = async (name, inner) => {
    const png = await shot(ground(inner), COVER_CSS + BOOK_CSS + DEVICE_CSS, "#s", { width: 900, height: 1125 })
    await sharp(png).webp({ quality: 88 }).toFile(join(PRODUCTS, name))
  }
  await product("authorbook-ebook.webp", bookHtml({ width: 520, tilt: 24, shadow: "light", coverUrl }))
  await product("authorbook-ed-ebook.webp", `<div style="display:flex;align-items:flex-end;gap:0">${TABLET(coverUrl, 480)}<div style="margin-left:-70px;margin-bottom:-30px">${PHONE(coverUrl, 220)}</div></div>`)
  await product("authorbook-ed-audio.webp", `<div style="display:flex;align-items:center;gap:40px"><div style="transform:translateY(30px)">${bookHtml({ width: 330, tilt: 22, shadow: "light", coverUrl })}</div>${PHONE(coverUrl, 270)}</div>`)
  await product("authorbook-ed-complete.webp", `<div style="position:relative;width:820px;height:900px">
    <div style="position:absolute;right:20px;top:60px;transform:rotate(6deg)">${CARD("42", "An email people open", [["Quick question", "Your order ships Tuesday"], ["Newsletter #12", "Three new mugs, one sold out"], ["Don't miss this", "Last day for free delivery"]])}</div>
    <div style="position:absolute;right:150px;top:30px;transform:rotate(-4deg)">${CARD("01", "The plain headline", [["Your journey to better coffee", "Coffee roasted on Tuesday"], ["Solutions for teams", "Payroll for 5 to 50 people"], ["Quality you can trust", "Chairs made to order"]])}</div>
    <div style="position:absolute;left:30px;bottom:50px">${bookHtml({ width: 360, tilt: 24, shadow: "light", coverUrl })}</div>
    <div style="position:absolute;right:40px;bottom:20px">${PHONE(coverUrl, 230)}</div></div>`)
  await product("authorbook-audiobook.webp", `<div style="zoom:1.6">${PHONE(coverUrl, 290)}</div>`)

  /* logo, paper on the dark header */
  const logo = await shot(LOGO(PAPER), "", "#l", { width: 1200, height: 300 })
  await sharp(logo).trim({ threshold: 1 }).extend({ top: 4, bottom: 4, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(join(ASSETS, "authorbook-logo.webp"))

  await browser.close()
  for (const f of [join(ASSETS, "authorbook-book.webp"), join(ASSETS, "authorbook-logo.webp"), join(PRODUCTS, "authorbook-cover.webp")]) {
    const m = await sharp(f).metadata()
    console.log(f.replace(ROOT + "/", ""), m.width, m.height)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
