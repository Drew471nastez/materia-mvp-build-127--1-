/**
 * ===========================================================================
 *  THE PRODUCT PAGE, MEASURED AT A DESK AND ON A PHONE
 * ===========================================================================
 * Renders the main product section (scripts/render-product-page.tsx, the real
 * ProductSection with a fixture product whose main picture is stored again as
 * the gallery's first) at 1280 and 390, in every media layout, and the shop's
 * filters (scripts/render-catalog-filters.ts, the real theme engine), and
 * measures:
 *
 *   every picture drawn once            media items against distinct sources
 *   the media column's width            its share of the row, per setting
 *   the details kept in view            the info column's top after scrolling
 *   grid is two to a row                the first two pictures' tops
 *   the slideshow shows one at a time   the track's width against its items
 *   the phone swipes, with dots         the track scrolls sideways, a dot each
 *   a variant shows its picture         after choosing Sand
 *   a click opens it larger             the lightbox, and Escape closes it
 *   the buy buttons are tappable        their height
 *   the page never scrolls sideways     document scrollWidth
 *   the filters sit beside the grid     sidebar and grid rects at 1280
 *   and fold away on a phone            the panel hidden until Filter
 *
 * and writes a screenshot of each to SHOTS_DIR (or a temp folder).
 *
 *   PROBE_CSS=source node scripts/check-product-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-product-page-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-product-page.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
)

const css = await appCss(root)
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head>
<body><div id="root"></div><script src="probe.js"></script></body></html>`,
)

const shop = JSON.parse(execFileSync("npx", ["--no-install", "tsx", join(root, "scripts/render-catalog-filters.ts")], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }))
const shopPage = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style><style>${shop.css}</style></head><body><div id="root">${body}</div></body></html>`
writeFileSync(join(out, "shop.html"), shopPage(shop.html))
writeFileSync(join(out, "shop-filtered.html"), shopPage(shop.filtered))
writeFileSync(join(out, "shop-empty.html"), shopPage(shop.empty))

/* The fixture's pictures, served from a fake host: a portrait swatch of colour each. */
const COLORS = { one: "#2f3a2f", two: "#8a7f6a", three: "#b7a98b", four: "#4a5a6a", sand: "#d8c7a3" }
const svg = (name) => {
  const fill = COLORS[name] ?? `hsl(${(name.length * 53) % 360} 30% 60%)`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="${fill}"/><text x="40" y="90" font-size="64" fill="#fff" font-family="sans-serif">${name}</text></svg>`
}

const LAYOUTS = ["stacked", "stacked_2col", "slideshow", "carousel"]
const CASES = []
for (const width of [1280, 390]) {
  for (const layout of LAYOUTS) CASES.push({ width, query: `layout=${layout}&width=55`, name: `${layout}-55-${width}`, layout })
}
for (const w of [50, 60]) CASES.push({ width: 1280, query: `layout=stacked&width=${w}`, name: `stacked-${w}-1280`, layout: "stacked", share: w })
CASES.push({ width: 1280, query: "layout=stacked&width=55&sticky=0", name: "stacked-nosticky-1280", layout: "stacked", nosticky: true })
CASES.push({ width: 390, query: "layout=stacked&mobile=stacked", name: "stacked-phone-stacked-390", layout: "stacked", phoneStacked: true })
CASES.push({ width: 1280, query: "legacy=1&layout=stacked", name: "legacy-1280", layout: "stacked", legacy: true })
CASES.push({ width: 1280, query: "layout=stacked&physical=off", name: "physical-off-1280", layout: "stacked", physicalOff: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
const note = (c, m) => problems.push(`${c.name}: ${m}`)
const rows = []

for (const c of CASES) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|Failed to load resource|net::/.test(m.text())) errors.push(m.text())
  })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const m = r.url().match(/^https:\/\/img\.test\/([a-z0-9]+)\.svg/)
    if (m) r.respond({ status: 200, contentType: "image/svg+xml", body: svg(m[1]) })
    else r.continue()
  })
  await page.setViewport({ width: c.width, height: c.width > 800 ? 900 : 844, deviceScaleFactor: 1, isMobile: c.width < 800, hasTouch: c.width < 800 })
  await page.goto(`file://${join(out, "index.html")}?${c.query}`, { waitUntil: "load" })
  await page.waitForSelector("[data-product-section]", { timeout: 10_000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 400))

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const items = [...document.querySelectorAll("[data-media-item]")]
    const srcs = items.map((el) => el.querySelector("img")?.getAttribute("src") ?? "")
    const track = items[0]?.parentElement ?? null
    const mediaCol = document.querySelector("[data-product-media-column]")
    const info = document.querySelector("[data-product-info]")
    const row = mediaCol?.parentElement ?? null
    const r = (el) => (el ? el.getBoundingClientRect() : null)
    const buttons = [...document.querySelectorAll("[data-buy-buttons] button")].map((b) => Math.round(b.getBoundingClientRect().height))
    return {
      vw,
      scroll: document.documentElement.scrollWidth - vw,
      items: items.length,
      unique: new Set(srcs).size,
      firstSrc: srcs[0] ?? "",
      mediaW: Math.round(r(mediaCol)?.width ?? 0),
      rowW: Math.round(r(row)?.width ?? 0),
      gap: mediaCol && info ? Math.round(r(info).left - r(mediaCol).right) : 0,
      infoTop: Math.round(r(info)?.top ?? 0),
      mediaH: Math.round(r(mediaCol)?.height ?? 0),
      infoH: Math.round(r(info)?.height ?? 0),
      trackScroll: track ? track.scrollWidth - track.clientWidth : 0,
      trackW: Math.round(track?.clientWidth ?? 0),
      itemW: Math.round(r(items[0])?.width ?? 0),
      tops: items.slice(0, 2).map((el) => Math.round(el.getBoundingClientRect().top)),
      dots: document.querySelectorAll("[data-media-dots] button").length,
      dotsShown: !!document.querySelector("[data-media-dots]") && getComputedStyle(document.querySelector("[data-media-dots]")).display !== "none",
      thumbs: [...document.querySelectorAll("[data-media-thumbs] button")].filter((b) => b.getBoundingClientRect().width > 0).length,
      buttons,
      blocks: [...document.querySelectorAll("[data-product-info] > [data-block-type]")].filter((b) => b.getBoundingClientRect().height > 0).map((b) => b.getAttribute("data-block-type")),
      text: (document.body.textContent || "").replace(/\s+/g, " "),
    }
  })
  await page.screenshot({ path: join(shots, `${c.name}.png`), fullPage: false })

  if (errors.length) note(c, `errors: ${errors.join(" | ").slice(0, 300)}`)
  if (m.scroll > 0) note(c, `page scrolls sideways by ${m.scroll}px`)
  /* Five distinct pictures: four in the gallery (the first is the main one again) and the Sand variant's own. */
  if (m.items !== m.unique) note(c, `${m.items} pictures drawn for ${m.unique} distinct ones`)
  if (m.unique !== 5) note(c, `expected 5 distinct pictures, found ${m.unique}`)
  if (m.buttons.some((h) => h < 44)) note(c, `a buy button under 44px (${m.buttons.join(",")})`)
  if (!/Field overshirt/.test(m.text) || !/\$89/.test(m.text)) note(c, "the product's title or price is missing")

  let sticky = "-"
  let share = "-"
  if (c.width === 1280) {
    const want = c.share ?? 55
    /* The media column's share of the row less the gap, which is what the setting sizes. */
    const got = m.rowW ? (m.mediaW / m.rowW) * 100 : 0
    if (!c.legacy && Math.abs(got - want) > 1.5) note(c, `media column is ${got.toFixed(1)}% of the row, expected ${want}%`)
    share = +got.toFixed(1)
    if (c.layout === "stacked_2col" && m.tops[0] !== m.tops[1]) note(c, `grid is not two to a row (tops ${m.tops.join(",")})`)
    if (c.layout === "stacked" && m.tops[1] <= m.tops[0]) note(c, "stacked pictures are not one under the other")
    if (c.layout === "slideshow") {
      if (m.thumbs !== m.unique) note(c, `${m.thumbs} thumbnails for ${m.unique} pictures`)
      if (Math.abs(m.itemW - m.trackW) > 1) note(c, "a slide is not the track's full width")
    }
    if (c.layout === "carousel" && !(m.trackScroll > 0 && m.itemW < m.trackW)) note(c, "the carousel does not scroll with the next picture peeking")
    if (m.dotsShown) note(c, "phone dots are showing on a computer")

    /* Scroll the page: the details stay under the header while the pictures pass. */
    if (c.layout === "stacked" && !c.phoneStacked) {
      await page.evaluate(() => window.scrollTo(0, 700))
      await new Promise((r) => setTimeout(r, 150))
      const top = await page.evaluate(() => Math.round(document.querySelector("[data-product-info]").getBoundingClientRect().top))
      sticky = top
      if (!c.nosticky && m.mediaH > m.infoH + 200 && top !== 88) note(c, `the details column is at ${top}px after scrolling, expected 88 (under the 64px header)`)
      if (c.nosticky && top >= 0) note(c, `the details column stayed in view (${top}px) with sticky off`)
      await page.evaluate(() => window.scrollTo(0, 0))
    }

    /* A click opens the picture larger, Escape closes it. */
    if (c.layout === "stacked" && !c.legacy && !c.nosticky && !c.share) {
      await page.click("[data-media-item] img")
      await new Promise((r) => setTimeout(r, 150))
      const open = await page.evaluate(() => !!document.querySelector("[data-product-lightbox]"))
      await page.keyboard.press("Escape")
      await new Promise((r) => setTimeout(r, 100))
      const closed = await page.evaluate(() => !document.querySelector("[data-product-lightbox]"))
      if (!open || !closed) note(c, `lightbox open=${open} closed after Escape=${closed}`)
    }
  } else {
    if (c.phoneStacked) {
      if (m.trackScroll > 0) note(c, "the phone's stacked pictures scroll sideways")
      if (m.dots > 0 && m.dotsShown) note(c, "dots on stacked pictures")
    } else {
      if (!(m.trackScroll > 0)) note(c, "the phone's pictures do not swipe")
      if (Math.abs(m.itemW - m.trackW) > 1) note(c, `a picture is ${m.itemW}px in a ${m.trackW}px track on a phone`)
      if (!m.dotsShown || m.dots !== m.unique) note(c, `${m.dots} dots for ${m.unique} pictures (shown ${m.dotsShown})`)
    }
    if (m.thumbs > 0) note(c, "thumbnails showing on a phone")
    /* Inside the theme's side padding, and no narrower. */
    if (m.mediaW < m.vw - 80) note(c, `the media is ${m.mediaW}px wide on a ${m.vw}px phone`)
  }

  /* Choosing Sand shows the Sand picture. */
  let variantPic = "-"
  if (!c.legacy) {
    const sand = await page.$('[data-swatch="Sand"]')
    if (!sand) note(c, "no Sand swatch drawn for the Colour option")
    else {
      await sand.click()
      await new Promise((r) => setTimeout(r, 1600))
      variantPic = await page.evaluate(() => {
        const items = [...document.querySelectorAll("[data-media-item]")]
        const track = items[0]?.parentElement
        const sand = items.find((el) => /sand\.svg/.test(el.querySelector("img")?.getAttribute("src") ?? ""))
        if (!track || !sand) return "missing"
        const tr = track.getBoundingClientRect()
        const sr = sand.getBoundingClientRect()
        /* Shown: the first picture in a column, or the one the sliding track rests on. */
        const first = items[0] === sand
        /* Wholly inside the track: at its start, or (the carousel's last picture) as far as the track scrolls. */
        const inView = sr.left >= tr.left - 2 && sr.right <= tr.right + 2 && sr.top < window.innerHeight
        return first ? "first" : inView ? "in view" : `at ${Math.round(sr.left - tr.left)},${Math.round(sr.top)}`
      })
      if (variantPic !== "first" && variantPic !== "in view") note(c, `the Sand picture is not shown after choosing Sand (${variantPic})`)
    }
  }

  /* Add to cart: the chosen variant and quantity go into the cart, and it opens. */
  let cartLine = "-"
  if (c.width === 1280 && !c.legacy) {
    const add = await page.$("[data-add-to-cart]")
    const label = add ? await page.evaluate((b) => b.textContent, add) : ""
    if (c.physicalOff) {
      if (!/Not available right now/.test(label)) note(c, `with physical commerce off the button says "${label}"`)
    } else if (add) {
      await page.click('[data-quantity] button[aria-label="More"]')
      await add.click()
      await new Promise((r) => setTimeout(r, 150))
      const got = await page.evaluate(() => ({ lines: JSON.parse(document.querySelector("[data-cart-lines]")?.textContent || "[]"), open: document.querySelector("[data-cart-lines]")?.getAttribute("data-open"), label: document.querySelector("[data-add-to-cart]")?.textContent }))
      const l = got.lines[0]
      cartLine = l ? `${l.variantName} x${l.quantity} ${l.priceCents}c open=${got.open}` : "none"
      if (!l || l.variantId !== "v-sm" || l.quantity !== 2 || l.priceCents !== 8900 || got.open !== "1") note(c, `Add to cart put ${JSON.stringify(got.lines)} in the cart (open=${got.open})`)
      if (!/Added to cart/.test(got.label || "")) note(c, `the button says "${got.label}" after adding`)
    }
  }

  rows.push(`${c.name.padEnd(26)} pictures=${m.items}/${m.unique} media=${m.mediaW}px (${share}% of row) gap=${m.gap} sticky_top=${sticky} track_scroll=${m.trackScroll} dots=${m.dotsShown ? m.dots : 0} thumbs=${m.thumbs} buttons=${m.buttons.join("/")} sand=${variantPic} cart=${cartLine}${c.legacy ? ` blocks=${m.blocks.join(",")}` : ""}`)
  if (c.legacy && !(m.blocks.includes("title") && m.blocks.includes("buy_buttons") && m.blocks.includes("share"))) note(c, `an old section does not draw its blocks (${m.blocks.join(",")})`)
  await page.close()
}

/* The shop's filters. */
for (const width of [1280, 390]) {
  for (const file of ["shop", "shop-filtered", "shop-empty"]) {
    const name = `${file}-${width}`
    const c = { name }
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const m = r.url().match(/^https:\/\/img\.test\/([a-z0-9]+)\.svg/)
      if (m) r.respond({ status: 200, contentType: "image/svg+xml", body: svg(m[1]) })
      else r.continue()
    })
    await page.setViewport({ width, height: width > 800 ? 900 : 844, deviceScaleFactor: 1, isMobile: width < 800, hasTouch: width < 800 })
    await page.goto(`file://${join(out, `${file}.html`)}`, { waitUntil: "load" })
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null
      const panel = document.querySelector(".cat__panel")
      return {
        scroll: document.documentElement.scrollWidth - window.innerWidth,
        panel: r(".cat__panel"),
        panelShown: panel ? getComputedStyle(panel).display !== "none" : false,
        results: r(".cat__results"),
        bar: r(".cat__bar"),
        cards: document.querySelectorAll(".cat__results .card").length,
        groups: [...document.querySelectorAll(".cat__legend")].map((l) => l.textContent),
        count: document.querySelector(".cat__count")?.textContent ?? "",
        chips: document.querySelectorAll(".cat__chip").length,
        empty: document.querySelector(".cat__empty")?.textContent?.trim() ?? "",
        open: !!document.querySelector(".cat__open") && getComputedStyle(document.querySelector(".cat__open")).display !== "none",
        sw: document.querySelectorAll(".cat__sw").length,
      }
    })
    if (m.scroll > 0) note(c, `page scrolls sideways by ${m.scroll}px`)
    if (width === 1280 && file !== "shop-empty") {
      if (!m.panelShown || !m.results || !m.panel || m.panel.right > m.results.left) note(c, "the filters are not a sidebar beside the grid")
      if (m.open) note(c, "the phone's Filter button shows on a computer")
    }
    if (width === 390 && file !== "shop-empty") {
      if (m.panelShown) note(c, "the filter panel is open before Filter is pressed")
      if (!m.open) note(c, "no Filter button on a phone")
      await page.click(".cat__open")
      const shown = await page.evaluate(() => getComputedStyle(document.querySelector(".cat__panel")).display !== "none")
      if (!shown) note(c, "Filter does not open the panel")
    }
    if (file === "shop" && !(m.groups.includes("Price") && m.groups.includes("Product type") && m.groups.includes("Colour") && m.groups.includes("Availability"))) note(c, `filter groups: ${m.groups.join(",")}`)
    if (file === "shop-filtered" && m.chips < 2) note(c, "no chips for the filters that are on")
    if (file === "shop-empty" && !/No products match/.test(m.empty)) note(c, "no empty state")
    await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
    rows.push(`${name.padEnd(26)} sidebar=${m.panel ? Math.round(m.panel.width) : 0}px shown=${m.panelShown} grid=${m.results ? Math.round(m.results.width) : 0}px cards=${m.cards} groups=${m.groups.length} swatches=${m.sw} chips=${m.chips} count="${m.count}"${m.empty ? ` empty="${m.empty}"` : ""}`)
    await page.close()
  }
}

await browser.close()
console.log(rows.join("\n"))
console.log(`\nscreenshots: ${shots}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nall clear")
