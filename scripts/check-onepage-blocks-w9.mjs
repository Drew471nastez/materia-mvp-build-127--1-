/**
 * ===========================================================================
 *  ROUND W9 (opblocks): LAYOUTS, THEMES ON EVERY BLOCK AND SHEET, THE ROW'S BIN
 * ===========================================================================
 * scripts/render-onepage-blocks-w9.tsx draws a realistic page (links, a link with
 * an icon and one with a picture, a featured card, product callouts and tiles, a
 * heading, text, social icons, a newsletter, a FAQ, a countdown, a promo code,
 * testimonials, a contact form, a picture) with a theme picked as Design › Themes
 * picks it, and a Design › Layout › Blocks choice over it. In headless Chromium:
 *
 *   layouts   every layout at 390 and 1280 on the published page: List one column,
 *             Grid plain links two to a row, Cards every plain link a taller card,
 *             Compact shorter rows, Mixed tiles a row, a pair, a row (the featured
 *             card a full row); every layout draws differently from every other.
 *   themes    every theme in the Themes panel: every word on every block in the
 *             theme's own faces; the Contact sheet in the page's sheet palette and
 *             body face (not white and Inter).
 *   delete    the row's bin asks, Delete folds the row in 200ms or less and the row
 *             under it glides up with no jump at the end.
 *
 *   node scripts/check-onepage-blocks-w9.mjs           (ONLY=layouts,themes,delete)
 *   SHOTS=<dir> also saves a screenshot of each layout and theme.
 */
import { existsSync, mkdirSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const ONLY = (process.env.ONLY || "layouts,themes,delete").split(",")
const SHOTS = process.env.SHOTS || ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-blocks-w9.tsx" })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(path, width) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: 900 })
  page.on("pageerror", (e) => { failed++; console.log(`  FAIL page error: ${e.message}`) })
  await page.goto(`${base}${path}`)
  await sleep(1200)
  return page
}

/* The boxes of the links, read in the page. */
const BOXES = () => {
  const out = {}
  for (const id of ["l1", "l2", "l3", "l4", "l5", "l6", "l7"]) {
    const el = [...document.querySelectorAll(`[data-op-block="${id}"]`)].find((e) => e.getClientRects().length > 0)
    if (!el) continue
    const r = el.getBoundingClientRect()
    const btn = el.querySelector(".op-btn, .op-card")
    out[id] = { l: Math.round(r.left), t: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round((btn || el).getBoundingClientRect().height) }
  }
  const list = document.querySelector("[data-block-layout]")
  out.width = list ? Math.round(list.getBoundingClientRect().width) : 0
  return out
}

if (ONLY.includes("layouts")) {
  for (const width of [390, 1280]) {
    console.log(`\nLayouts at ${width}`)
    const seen = {}
    for (const layout of ["list", "grid", "cards", "compact", "masonry"]) {
      const page = await open(`/app/onepage?live&t=default&l=${layout}`, width)
      const b = await page.evaluate(BOXES)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/layout-${layout}-${width}.png`, fullPage: true })
      await page.close()
      const full = (id) => b[id] && b[id].w >= b.width - 2
      const half = (id) => b[id] && b[id].w < b.width * 0.6
      seen[layout] = b
      if (layout === "list") check(`List: every link a full row`, ["l1", "l2", "l3", "l4", "l6", "l7"].every(full), b)
      if (layout === "grid") check(`Grid: plain links two to a row`, half("l1") && half("l2") && b.l1.t === b.l2.t && half("l3") && b.l3.t === b.l4.t && full("l5"), b)
      if (layout === "cards") check(`Cards: a plain link is a taller card, a link with a picture the featured card`, b.l1.h >= 76 && b.l1.h > seen.list.l1.h + 12 && b.l3.h > 120, b)
      if (layout === "compact") check(`Compact: shorter rows, closer together`, b.l1.h < seen.list.l1.h && b.l2.t - b.l1.t < seen.list.l2.t - seen.list.l1.t, b)
      if (layout === "masonry") check(`Mixed tiles: a row, a pair, a row; the featured card a full row; the last two a pair`, full("l1") && half("l2") && half("l3") && b.l2.t === b.l3.t && full("l4") && full("l5") && half("l6") && b.l6.t === b.l7.t, b)
    }
    const sig = (b) => ["l1", "l2", "l3", "l4"].map((id) => `${b[id].w}x${b[id].h}@${b[id].t - b.l1.t}`).join(",")
    const sigs = Object.fromEntries(Object.entries(seen).map(([k, b]) => [k, sig(b)]))
    check("every layout draws differently from every other", new Set(Object.values(sigs)).size === 5, sigs)
  }
}

if (ONLY.includes("themes")) {
  console.log("\nEvery theme on every block, and on the Contact sheet")
  const first = await open(`/app/onepage?live`, 390)
  const ids = await first.evaluate(() => globalThis.__themeIds || [])
  await first.close()
  check("the Themes panel's whole list", ids.length >= 30, ids.length)
  for (const id of ids) {
    const page = await open(`/app/onepage?live&t=${encodeURIComponent(id)}`, 390)
    const r = await page.evaluate(() => {
      const th = globalThis.__probeTheme
      const fam = (s) => (s || "").split(",")[0].replace(/['"]/g, "").trim().toLowerCase()
      const body = fam(th.font_family), title = fam(th.title_font) || body
      const off = []
      for (const blk of document.querySelectorAll("[data-op-block]")) {
        if (!blk.getClientRects().length) continue
        for (const el of blk.querySelectorAll("*")) {
          if (!el.getClientRects().length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
          const f = fam(getComputedStyle(el).fontFamily)
          if (f !== body && f !== title && !/mono|courier/.test(f)) off.push(`${blk.getAttribute("data-op-block")}:${f}:${el.textContent.trim().slice(0, 16)}`)
        }
      }
      const root = getComputedStyle(document.documentElement)
      return { off: off.slice(0, 4), body, surface: root.getPropertyValue("--opk-surface").trim(), font: root.getPropertyValue("--opk-font").trim() }
    })
    check(`${id}: every word on every block in the theme's faces`, r.off.length === 0, r.off)
    const contact = await page.evaluateHandle(() => [...document.querySelectorAll("[data-op-block='cf1'] button, [data-op-block='cf1'] a")].find((e) => e.getClientRects().length > 0))
    if (contact && contact.asElement()) {
      await contact.asElement().click()
      await sleep(700)
      const s = await page.evaluate(() => {
        const sheet = document.querySelector("[data-block-sheet-grip]")?.parentElement
        if (!sheet) return null
        const cs = getComputedStyle(sheet)
        const hex = (c) => { const m = c.match(/\d+/g); return m ? "#" + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : c }
        return { bg: hex(cs.backgroundColor), font: cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim().toLowerCase() }
      })
      check(`${id}: the Contact sheet in the page's sheet colour and face`, !!s && s.bg === r.surface && s.font === r.body, { sheet: s, want: { bg: r.surface, font: r.body } })
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/sheet-contact-${id}.png` })
    } else check(`${id}: the Contact block is drawn`, false)
    if (SHOTS) {
      await page.keyboard.press("Escape")
      await sleep(400)
      await page.screenshot({ path: `${SHOTS}/theme-${id}.png`, fullPage: true })
    }
    await page.close()
  }
}

if (ONLY.includes("delete")) {
  for (const width of [390, 1280]) {
    console.log(`\nThe row's bin at ${width}`)
    const page = await open(`/app/onepage#links`, width)
    await sleep(1300)
    const rows = await page.evaluate(() => [...document.querySelectorAll("[data-block-id]")].map((row) => {
      const bin = row.querySelector(":scope [data-row-tools] [data-block-row-delete], :scope [data-row-tools] [data-row-slot='delete']")
      const toggle = row.querySelector(":scope [data-row-tools] [role='switch']")
      return { id: row.getAttribute("data-block-id"), bin: !!row.querySelector("[data-row-tools] [data-block-row-delete]"), slot: !!bin, toggleX: toggle ? Math.round(toggle.getBoundingClientRect().left) : null }
    }))
    const blockRows = rows.filter((r) => r.id !== "hdr")
    check("every block row has its bin, the header its room", blockRows.every((r) => r.bin) && rows.every((r) => r.slot), rows)
    check("every switch in one column", new Set(rows.map((r) => r.toggleX)).size === 1, rows.map((r) => r.toggleX))
    const hit = await page.evaluate(() => {
      const b = document.querySelector('[data-block-id="l2"] [data-block-row-delete]')
      const r = b.getBoundingClientRect(), before = getComputedStyle(b, "::before")
      return { w: r.width, h: r.height, reach: r.height - 2 * Number.parseFloat(before.top) }
    })
    check(`the bin's press reaches 44px tall`, hit.reach >= 44, hit)
    await page.click('[data-block-id="l2"] [data-block-row-delete]')
    await sleep(400)
    check("it asks first (Cancel, Archive, Delete) under the row", await page.evaluate(() => !!document.querySelector('[data-block-id="l2"] [data-block-remove-question] [data-block-delete]')))
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/delete-question-${width}.png` })
    await page.evaluate(() => {
      window.__tops = []
      const t0 = performance.now()
      const tick = () => {
        const next = document.querySelector('[data-block-id="l3"]')
        window.__tops.push([performance.now() - t0, next.getBoundingClientRect().top])
        if (performance.now() - t0 < 700) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const startTop = await page.evaluate(() => document.querySelector('[data-block-id="l3"]').getBoundingClientRect().top)
    await page.click('[data-block-id="l2"] [data-block-remove-question] [data-block-delete]')
    await sleep(900)
    const tops = await page.evaluate(() => window.__tops)
    const endTop = tops[tops.length - 1][1]
    const moving = tops.filter(([, y], i) => i > 0 && Math.abs(y - tops[i - 1][1]) > 0.5)
    const span = moving.length ? moving[moving.length - 1][0] - moving[0][0] : 0
    const biggest = Math.max(...tops.slice(1).map(([, y], i) => Math.abs(y - tops[i][1])))
    const totalMove = startTop - endTop
    check("the block is gone", await page.evaluate(() => !document.querySelector('[data-block-id="l2"]')))
    check("the row under it glides up over several frames, in 200ms or less", moving.length >= 4 && span <= 220, { frames: moving.length, span: Math.round(span) })
    check("no frame jumps more than half the way", biggest < totalMove / 2, { biggest, totalMove })
    check("nothing jumps after the fold", Math.abs(moving.length ? moving[moving.length - 1][1] - endTop : 0) <= 1 && tops.slice(-6).every(([, y]) => Math.abs(y - endTop) <= 0.5))
    await page.close()
  }
}

await browser.close()
server.close()
if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
