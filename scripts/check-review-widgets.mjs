/**
 * ===========================================================================
 *  THE REVIEW WIDGETS, MEASURED
 * ===========================================================================
 * scripts/render-review-widgets.tsx in headless Chromium at 1280x900 and
 * 390x844, with a store's own reviews (never sample ones on a live page):
 *
 *   EACH WIDGET   drawn as a live page draws it, at the page's width: it has
 *                 a height, nothing scrolls the page sideways, and its layout
 *                 is the one its settings ask for: the grid's columns, the
 *                 photo gallery's square tiles, the testimonials side by side
 *                 then stacked, the summary's score beside its bars then
 *                 above them, the carousel's row that scrolls, the marquee
 *                 moving and its copy hidden from screen readers, the trust
 *                 badge as a badge and as a bar.
 *   SETTINGS      the lowest rating shown, outline stars, a widget shown on
 *                 computers only (gone at 390, there at 1280), and no
 *                 "Sample reviews" line on a live page.
 *   THE GALLERY   Reviews › Widgets: two columns of previews on a computer,
 *                 one on a phone; a widget's screen with its preview at a
 *                 phone's width, a setting changing the preview, and Add to
 *                 website sending the editor address with the widget and
 *                 where it goes.
 *
 *   SHOTS=/some/dir node scripts/check-review-widgets.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".review-widgets-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push(u) { window.__pushed = u }, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
/* The bundler the editor ships with supplies node:crypto in the browser; this is the same hash's shape, for the compile cache's key. */
writeFileSync(join(dir, "crypto.js"), `export function createHash() { let s = ""; return { update(v) { s += v; return this }, digest() { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(16) + s.length.toString(16) } } }\n`)
writeFileSync(join(dir, "empty.js"), "export {}\n")
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-review-widgets.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:node:crypto=${join(dir, "crypto.js")}`, `--alias:server-only=${join(dir, "empty.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const sheet = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};/* Next supplies Buffer in the browser; the compiler measures a file's bytes with it. */window.Buffer={byteLength:function(s){return new TextEncoder().encode(String(s)).length}}</script><script src="/probe.js"></script></body></html>`
/* Its own file: the engine's source holds the text of a closing script tag, which would end an inline one early. */
const probe = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })

const svg = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="hsl(${hue} 35% 82%)"/><circle cx="200" cy="170" r="80" fill="hsl(${hue} 30% 55%)"/></svg>`
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(probe); return }
  const m = url.pathname.match(/^\/(photo-(\d)|product2?)\.svg$/)
  if (m) { res.writeHead(200, { "content-type": "image/svg+xml" }); res.end(svg(m[2] ? Number(m[2]) * 60 : 30)); return }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const page = await browser.newPage()
page.on("pageerror", (e) => console.log(`  page error: ${e.message}`))
page.on("console", (m) => { if (m.type() === "error") console.log(`  console: ${m.text()}`) })

async function open(query, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  await page.goto(`${base}/?${query}`, { waitUntil: "load" })
  try {
    await page.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 10000 })
  } catch {
    fail(`the probe page never finished drawing ${query}: ${await page.evaluate(() => document.getElementById("app")?.innerHTML.slice(0, 300) ?? "no #app")}`)
  }
  /* The pictures in view; a lazy one below the fold is never asked for, so it is not waited on past a moment. */
  await page.evaluate(() => Promise.race([Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))), new Promise((r) => setTimeout(r, 1500))]))
  await wait(120)
}
const section = (type, settings = {}, extra = "") => `view=section&type=${type}&settings=${encodeURIComponent(JSON.stringify(settings))}${extra}`
/* A section's page scrolls the document, so it is taken whole; Reviews › Widgets scrolls inside its pane, and is taken as the screen shows it. */
const shot = async (name, whole = true) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: whole }) }

/* What every widget measures the same way. */
const COMMON = `(() => {
  const s = document.querySelector("[data-section-id] .s")
  const box = s ? s.getBoundingClientRect() : null
  return {
    height: box ? Math.round(box.height) : 0,
    shown: !!s && getComputedStyle(s).display !== "none",
    overflow: document.documentElement.scrollWidth - innerWidth,
    sample: document.body.innerText.includes("Sample reviews"),
    stars: [...document.querySelectorAll(".rv-stars[aria-label]")].map((e) => e.getAttribute("aria-label")),
    drawn: s ? "" : document.getElementById("app").innerHTML.slice(0, 300),
  }
})()`
/** How many of these sit on the first row, and how wide each is. */
const ROW = (sel) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getBoundingClientRect().width > 0)
  if (!els.length) return { count: 0, perRow: 0, width: 0, height: 0 }
  const top = Math.round(els[0].getBoundingClientRect().top)
  const first = els.filter((e) => Math.abs(Math.round(e.getBoundingClientRect().top) - top) <= 2)
  const r = els[0].getBoundingClientRect()
  return { count: els.length, perRow: first.length, width: Math.round(r.width), height: Math.round(r.height) }
})()`

const WIDGETS = ["reviews_product", "reviews_badge", "reviews_summary", "reviews_grid", "reviews_carousel", "reviews_testimonials", "reviews_media", "reviews_marquee", "reviews_trust", "reviews_all"]

for (const [vw, vh] of [[1280, 900], [390, 844]]) {
  const desk = vw >= 1000
  console.log(`\nEvery widget as a live page draws it, at ${vw}`)
  for (const type of WIDGETS) {
    await open(section(type), vw, vh)
    const c = await page.evaluate(COMMON)
    expect(c.height > (type === "reviews_badge" || type === "reviews_trust" ? 16 : 120) && c.shown, `${type}: drawn, ${c.height}px tall`, c)
    expect(c.overflow <= 0, `${type}: nothing scrolls the page sideways`, `${c.overflow}px over`)
    expect(!c.sample, `${type}: no sample line on a live page`)
    await shot(`${type}-${vw}`)
  }

  await open(section("reviews_grid"), vw, vh)
  const grid = await page.evaluate(ROW(".s__in > .rg__list > .rw-card"))
  expect(grid.count === 6 && grid.perRow === (desk ? 3 : 1), `grid: 6 reviews, ${desk ? 3 : 1} to a row`, grid)
  await open(section("reviews_grid", { layout: "masonry", columns: { desktop: 2, tablet: 2, mobile: 1 } }), vw, vh)
  const masonry = await page.evaluate(`(() => { const cards = [...document.querySelectorAll(".rg__list--masonry .rw-card")]; const lefts = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))); return { columns: lefts.size, heights: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().height))).size } })()`)
  expect(masonry.columns === (desk ? 2 : 1), `grid at their own heights: ${desk ? 2 : 1} columns`, masonry)

  await open(section("reviews_media"), vw, vh)
  const media = await page.evaluate(ROW(".rm__tile"))
  const pic = await page.evaluate(`(() => { const p = document.querySelector(".rm__pic"); const r = p.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), img: document.querySelector(".rm__pic img").naturalWidth } })()`)
  expect(media.count === 4 && media.perRow === (desk ? 4 : 2), `photo reviews: the 4 reviews with photos, ${desk ? 4 : 2} to a row`, media)
  expect(Math.abs(pic.w - pic.h) <= 1 && pic.img > 0, "  each photo square and loaded", pic)

  await open(section("reviews_testimonials"), vw, vh)
  const quotes = await page.evaluate(ROW(".rt__item"))
  expect(quotes.count === 3 && quotes.perRow === (desk ? 3 : 1), `testimonials: 3 quotes, ${desk ? "side by side" : "stacked"}`, quotes)
  await open(section("reviews_testimonials", { layout: "slider" }), vw, vh)
  const slider = await page.evaluate(`(() => { const l = document.querySelector(".rt__list--slider"); return { scrolls: l.scrollWidth > l.clientWidth + 10, snap: getComputedStyle(l).scrollSnapType } })()`)
  expect(slider.scrolls && /x/.test(slider.snap), "  one at a time: a row that swipes, snapping", slider)

  await open(section("reviews_summary"), vw, vh)
  const sum = await page.evaluate(`(() => { const s = document.querySelector(".rs__score").getBoundingClientRect(); const b = document.querySelector(".rs__bars").getBoundingClientRect(); return { bars: document.querySelectorAll(".rs__bars li").length, beside: Math.abs(s.top + s.height / 2 - (b.top + b.height / 2)) < 30 && b.left > s.right, above: b.top >= s.bottom - 1, avg: document.querySelector(".rs__avg").textContent } })()`)
  expect(sum.bars === 5 && sum.avg === "4.8", `summary: this page's product, 4.8, and a bar for each of five ratings`, sum)
  expect(desk ? sum.beside : sum.above, `  ${desk ? "the bars beside the score" : "the bars under the score"}`, sum)

  await open(section("reviews_carousel", { source: "recent" }), vw, vh)
  const car = await page.evaluate(`(() => { const t = document.querySelector(".rc__track"); const c = document.querySelector(".rc__card").getBoundingClientRect(); return { scrolls: t.scrollWidth > t.clientWidth, perView: Math.round(t.clientWidth / c.width * 10) / 10 } })()`)
  expect(car.scrolls && (desk ? car.perView >= 2.9 : car.perView >= 1.1 && car.perView < 1.3), `carousel: a row that scrolls, ${desk ? "three" : "one and a bit"} in view`, car)

  await open(section("reviews_marquee"), vw, vh)
  const mq1 = await page.evaluate(`(() => { const t = document.querySelector(".mq__track"); return { x: new DOMMatrix(getComputedStyle(t).transform).m41, sets: document.querySelectorAll(".mq__set").length, hidden: document.querySelectorAll('.mq__set[aria-hidden="true"]').length } })()`)
  await wait(600)
  const mq2 = await page.evaluate(`new DOMMatrix(getComputedStyle(document.querySelector(".mq__track")).transform).m41`)
  expect(mq2 < mq1.x - 1, `marquee: moving left (${Math.round(mq1.x)} to ${Math.round(mq2)}px in 0.6s)`, { mq1, mq2 })
  expect(mq1.sets === 2 && mq1.hidden === 1, "  drawn twice for the loop, the copy hidden from screen readers", mq1)
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await open(section("reviews_marquee"), vw, vh)
  const still = await page.evaluate(`(() => { const t = document.querySelector(".mq__track"); return { anim: getComputedStyle(t).animationName, copy: getComputedStyle(document.querySelector('.mq__set[aria-hidden="true"]')).display } })()`)
  expect(still.anim === "none" && still.copy === "none", "  standing still for a visitor who asks for less motion", still)
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])

  await open(section("reviews_trust"), vw, vh)
  const badge = await page.evaluate(`(() => { const b = document.querySelector(".tb__box").getBoundingClientRect(); const i = document.querySelector(".tb__in").getBoundingClientRect(); return { w: Math.round(b.width), inner: Math.round(i.width), text: document.querySelector(".tb__box").innerText.replace(/\\s+/g, " ").trim() } })()`)
  expect(badge.w < badge.inner && /4\.4 out of 5 from 8 reviews/.test(badge.text), `trust badge: "${badge.text}", narrower than the page`, badge)
  await open(section("reviews_trust", { layout: "banner" }), vw, vh)
  const bar = await page.evaluate(`(() => { const b = document.querySelector(".tb__box").getBoundingClientRect(); const i = document.querySelector(".tb__in"); const cs = getComputedStyle(i); return { w: Math.round(b.width), inner: Math.round(i.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), text: document.querySelector(".tb__box").innerText.replace(/\\s+/g, " ").trim() } })()`)
  expect(Math.abs(bar.w - bar.inner) <= 1 && /^Rated 4\.4/.test(bar.text), "  as a bar: as wide as the page, Rated first", bar)

  await open(section("reviews_product"), vw, vh)
  const prod = await page.evaluate(`({ bars: document.querySelectorAll(".rv__bars li").length, cards: document.querySelectorAll(".rv-card").length, avg: document.querySelector(".rv__avg")?.textContent })`)
  expect(prod.bars === 5 && prod.cards === 6 && prod.avg === "4.8", "product reviews: the product's own 4.8, its bars and its 6 reviews", prod)

  console.log(`\nSettings, at ${vw}`)
  await open(section("reviews_grid", { min_rating: 5 }), vw, vh)
  const five = await page.evaluate(COMMON)
  expect(five.stars.length === 5 && five.stars.every((s) => s.startsWith("5 ")), "lowest rating 5: only the five star reviews", five.stars)
  await open(section("reviews_grid", { star_style: "outline", star_color: "#d97706" }), vw, vh)
  const outline = await page.evaluate(`(() => { const s = getComputedStyle(document.querySelector(".rv-stars")); const a = getComputedStyle(document.querySelector(".rv-stars"), "::after"); return { stroke: s.webkitTextStrokeWidth, fill: s.color, on: a.color } })()`)
  expect(outline.stroke === "1px" && outline.on === "rgb(217, 119, 6)", "outline stars in the colour chosen", outline)
  await open(section("reviews_grid", { show_on: "desktop" }), vw, vh)
  const onlyDesk = await page.evaluate(COMMON)
  expect(desk ? onlyDesk.shown && onlyDesk.height > 100 : !onlyDesk.shown, `computers only: ${desk ? "shown" : "gone"} at ${vw}`, onlyDesk)
  await open(section("reviews_grid", { show_on: "mobile" }), vw, vh)
  const onlyPhone = await page.evaluate(COMMON)
  expect(desk ? !onlyPhone.shown : onlyPhone.shown, `phones only: ${desk ? "gone" : "shown"} at ${vw}`, onlyPhone)
  await open(section("reviews_grid", { background: "#101828", text_color: "#f9fafb", card_background: "#1d2939", radius: 4, border_width: 0 }), vw, vh)
  const dark = await page.evaluate(`(() => { const s = getComputedStyle(document.querySelector(".rg")); const c = getComputedStyle(document.querySelector(".rw-card")); return { bg: s.backgroundColor, text: getComputedStyle(document.querySelector(".rw-card__body")).color, card: c.backgroundColor, radius: c.borderTopLeftRadius, border: c.borderTopWidth } })()`)
  expect(dark.bg === "rgb(16, 24, 40)" && dark.card === "rgb(29, 41, 57)" && dark.text === "rgb(249, 250, 251)" && dark.radius === "4px" && dark.border === "0px", "background, text, card, corners and border as set", dark)
}

console.log("\nReviews › Widgets")
for (const [vw, vh] of [[1280, 900], [390, 844]]) {
  const desk = vw >= 1000
  await open("view=gallery", vw, vh)
  await wait(400)
  const g = await page.evaluate(`(() => { const cards = [...document.querySelectorAll("[data-widget-card]")]; const lefts = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))); const previews = cards.map((c) => c.querySelector("[data-widget-preview]").getBoundingClientRect().height); const fit = cards.filter((c) => { const box = c.querySelector("[data-widget-preview]"); const drawn = box.querySelector("[data-keep-transform]"); return drawn.getBoundingClientRect().width <= box.clientWidth + 1 && c.getBoundingClientRect().right <= innerWidth }).length; return { cards: cards.length, columns: lefts.size, fit, empty: previews.filter((h) => h < 8).length, overflow: document.documentElement.scrollWidth - innerWidth, sample: !!document.querySelector("[data-widgets-sample]") } })()`)
  expect(g.cards === 10 && g.columns === (desk ? 2 : 1), `gallery at ${vw}: 10 widgets in ${desk ? 2 : 1} column${desk ? "s" : ""}`, g)
  expect(g.empty === 0, "  every preview has the widget drawn in it", g)
  expect(g.fit === 10, "  each drawn at a computer's layout and scaled down into its card, every card inside the screen, touch screen or not", g)
  expect(g.overflow <= 0 && !g.sample, "  nothing sideways, and no sample notice with real reviews", g)
  await shot(`gallery-${vw}`, false)
}
await open("view=gallery&sample=1", 1280, 900)
expect(await page.evaluate(`!!document.querySelector("[data-widgets-sample]")`), "with no reviews yet: the sample reviews are said to be samples")
await open("view=widget&type=reviews_grid", 1280, 900)
await wait(300)
const screen = await page.evaluate(`(() => { const p = document.querySelector("[data-widget-stage] [data-widget-preview]"); const inner = p.firstElementChild?.nextElementSibling || p.querySelector("div"); return { device: p.dataset.device, groups: document.querySelectorAll("[data-widget-group]").length, overflow: document.documentElement.scrollWidth - innerWidth } })()`)
expect(screen.device === "desktop" && screen.groups >= 6 && screen.overflow <= 0, "a widget's screen: its preview and its settings in groups", screen)
await shot("widget-1280", false)
/* A phone's width, from the toggle. */
await page.evaluate(`[...document.querySelectorAll("[data-widget-device] button")][1].click()`)
await wait(200)
const phoneView = await page.evaluate(`(() => { const p = document.querySelector("[data-widget-stage] [data-widget-preview]"); return { device: p.dataset.device, width: Math.round(p.getBoundingClientRect().width), cardsPerRow: (() => { const cards = [...p.querySelectorAll(".rw-card")]; const top = cards[0].getBoundingClientRect().top; return cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).length })() } })()`)
expect(phoneView.device === "mobile" && phoneView.width <= 390 && phoneView.cardsPerRow === 1, "Phone: the preview at a phone's width, one card to a row", phoneView)
/* A setting changes the preview. */
await page.evaluate(`[...document.querySelectorAll("[data-widget-device] button")][0].click()`)
await wait(150)
const before = await page.evaluate(`document.querySelectorAll("[data-widget-stage] .s__in > .rg__list > .rw-card").length`)
await page.evaluate(`(() => { const s = document.querySelector("#wc-min_rating"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(s, "5"); s.dispatchEvent(new Event("input", { bubbles: true })) })()`)
await wait(200)
const after = await page.evaluate(`document.querySelectorAll("[data-widget-stage] .s__in > .rg__list > .rw-card").length`)
expect(before === 6 && after === 5, `Lowest rating shown at 5: the preview goes from ${before} to ${after} reviews`, { before, after })
await page.evaluate(`document.querySelector("[data-widget-add]").click()`)
await wait(100)
const pushed = await page.evaluate("window.__pushed || ''")
const q = new URL(pushed, "http://x").searchParams
expect(pushed.startsWith("/website-builder/editor/inst-1?") && q.get("add") === "reviews_grid" && q.get("page") === "home" && q.get("at") === "bottom" && !!q.get("settings"), "Add to website: the editor with the widget, its page and place, and the settings changed", pushed)
await open("view=widget&type=reviews_grid", 390, 844)
await wait(300)
const phoneScreen = await page.evaluate(`({ overflow: document.documentElement.scrollWidth - innerWidth, device: document.querySelector("[data-widget-stage] [data-widget-preview]").dataset.device })`)
expect(phoneScreen.overflow <= 0 && phoneScreen.device === "mobile", "on a phone the widget's screen opens at a phone's width, nothing sideways", phoneScreen)
await shot("widget-390", false)

await browser.close()
server.close()
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
