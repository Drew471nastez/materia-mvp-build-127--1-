/**
 * ===========================================================================
 *  ROUND 43, MEASURED: THE PRODUCT SHEET, THE EMAIL SIGNUP, PRODUCT LAYOUTS
 * ===========================================================================
 * scripts/render-onepage-r43.tsx in headless Chromium at 390 (a phone, touch) and 1280, in a light and a dark
 * theme. It checks, and photographs:
 *
 *   SHEET      the pictures (count, thumbnails, the dots' capsule, the arrows step, a swipe moves the dots), a colour
 *              swatch takes the gallery to its picture, a value that cannot be bought is marked, the size guide
 *              slides open (a frame in between is between closed and open), the struck price and "Save 24%", the
 *              button with the price ("Check out · €45.00", €49.00 for XL), the personalization field, licences
 *              that ask "Choose an option", two columns on a computer, the page's colours and title face
 *   SIGNUP     all eight layouts inside the column with nothing spilling; Connect is one 52px pill with the
 *              creator's picture in its button; Bar opens its form; Letter's box is a line
 *   PRODUCTS   with no layout picked, a Grid theme pairs every product two to a row, in a group too; Rows makes
 *              every one a row
 *   LAYOUT     Design › Layout's Grid pairs plain links, Cards draws a link with a picture as a card, Compact
 *              closes the gaps
 *
 *   PROBE_CSS=source node scripts/check-onepage-r43.mjs
 *   SHOTS=/some/dir   (default: the system temp folder, onepage-r43-shots)
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || join((await import("node:os")).tmpdir(), "onepage-r43-shots")
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
let failed = 0
const expect = (ok, name, detail) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)?.slice(0, 400)}`}`)
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-r43.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const VIEWS = {
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1280: { width: 1280, height: 860, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
async function open(w, path) {
  const p = await browser.newPage()
  await p.setViewport(VIEWS[w])
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage${path}`, { waitUntil: "load" })
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  await sleep(700)
  p.errors = errors
  return p
}
const click = (p, sel) => p.evaluate((s) => { const el = (window.__R || document).querySelector(s) ?? document.querySelector(s); el?.click(); return !!el }, sel)

/* ── SHEET ─────────────────────────────────────────────────────────────── */
for (const theme of ["default", "midnight"]) {
  for (const w of [390, 1280]) {
    console.log(`\nThe product sheet, ${theme}, ${w}`)
    const p = await open(w, `?sheet&theme=${theme}`)
    await click(p, '[data-product-block][data-product-tap="sheet"]')
    await sleep(1100)
    /* A sheet seen once stays built (keepMounted): every read is inside the tee's own. */
    await p.evaluate(() => { window.__R = document.querySelector('[data-product-sheet="p-tee"]') })
    const g = await p.evaluate(() => {
      const gal = (window.__R || document).querySelector("[data-product-sheet-gallery]")
      const cap = (window.__R || document).querySelector("[data-product-sheet-dots] > div")
      return {
        count: Number(gal?.getAttribute("data-count") || 0),
        thumbs: (window.__R || document).querySelectorAll("[data-product-sheet-thumbs] button").length,
        capsule: cap ? getComputedStyle(cap).backgroundColor : null,
        dot: (() => { const d = (window.__R || document).querySelector("[data-product-sheet-dots] span"); return d ? Math.round(d.getBoundingClientRect().height) : 0 })(),
        arrows: !!(window.__R || document).querySelector("[data-product-sheet-next]"),
        columns: !!document.querySelector('[data-product-sheet="p-tee"][data-product-sheet-columns]'),
        width: Math.round(document.querySelector('[data-product-sheet="p-tee"]')?.getBoundingClientRect().width || 0),
        label: (window.__R || document).querySelector("[data-product-sheet-label]")?.textContent,
        was: (window.__R || document).querySelector("[data-product-sheet-was]")?.textContent,
        sale: (window.__R || document).querySelector("[data-product-sheet-sale]")?.textContent,
        swatches: [...(window.__R || document).querySelectorAll("[data-product-sheet-value][data-swatch]")].map((e) => `${e.getAttribute("data-product-sheet-value")}:${e.getAttribute("data-swatch")}`),
        pills: [...(window.__R || document).querySelectorAll('[data-product-sheet-option="Size"] [data-product-sheet-value]')].map((e) => e.getAttribute("data-product-sheet-value")),
        personal: !!(window.__R || document).querySelector('[data-personalization-field="f1name"]'),
        surface: getComputedStyle((window.__R || document).querySelector("[data-product-sheet-actions]")).backgroundColor,
        titleFont: getComputedStyle((window.__R || document).querySelector("h2 span") || document.body).fontFamily,
      }
    })
    expect(g.count === 5 && g.thumbs === 5, "five pictures (three of the product, two variants' own), five thumbnails", { count: g.count, thumbs: g.thumbs })
    expect(/(rgba\(0, 0, 0, 0\.35\)|oklab\(0 0 0 \/ 0\.35\))/.test(g.capsule ?? "") && g.dot >= 6, "the dots sit on a dark capsule, 6px", { capsule: g.capsule, dot: g.dot })
    expect(w === 1280 ? g.arrows && g.columns && g.width >= 900 : !g.arrows && !g.columns, w === 1280 ? "arrows, two columns, 920px window" : "no arrows on a phone, one column", { arrows: g.arrows, columns: g.columns, width: g.width })
    expect(g.label === "Check out · €45.00", "the button carries the price", g.label)
    expect(g.was === "€59.00" && g.sale === "Save 24%", "the struck price and the sale badge", { was: g.was, sale: g.sale })
    expect(g.swatches.join() === "Black:color,Sand:color,Ocean:photo" && g.pills.join() === "S,M,L,XL", "colours as swatches (Ocean its photo, as the seller set it), sizes as pills", { swatches: g.swatches, pills: g.pills })
    expect(g.personal, "the personalization field is asked")
    if (theme === "midnight") expect(!/255, 255, 255/.test(g.surface), "a dark page's sheet is dark", g.surface)
    if (w === 390 && theme === "default") await p.screenshot({ path: join(SHOTS, `sheet-${theme}-${w}.png`) })

    /* Steps: the next arrow on a computer, a swipe on a phone. */
    if (w === 1280) {
      await click(p, "[data-product-sheet-next]")
    } else {
      await p.evaluate(() => { const s = (window.__R || document).querySelector("[data-product-sheet-gallery] .snap-x"); s.scrollTo({ left: s.clientWidth, behavior: "auto" }) })
    }
    await sleep(700)
    const step = await p.evaluate(() => {
      const s = (window.__R || document).querySelector("[data-product-sheet-gallery] .snap-x")
      const dots = [...(window.__R || document).querySelectorAll("[data-product-sheet-dots] span")].map((d) => Math.round(d.getBoundingClientRect().width))
      return { at: Math.round(s.scrollLeft / s.clientWidth), dots, current: [...(window.__R || document).querySelectorAll("[data-product-sheet-thumbs] button")].findIndex((b) => b.getAttribute("aria-current") === "true") }
    })
    expect(step.at === 1 && step.dots[1] === 16 && step.current === 1, w === 1280 ? "Next goes to the second picture; its dot and thumbnail follow" : "a swipe goes to the second picture; its dot and thumbnail follow", step)

    /* Sand: its picture, and M crossed out (Sand / M is sold out). */
    await click(p, '[data-product-sheet-value="Sand"]')
    await sleep(800)
    const sand = await p.evaluate(() => {
      const s = (window.__R || document).querySelector("[data-product-sheet-gallery] .snap-x")
      return { at: Math.round(s.scrollLeft / s.clientWidth), mOut: (window.__R || document).querySelector('[data-product-sheet-option="Size"] [data-product-sheet-value="M"]')?.hasAttribute("data-unavailable") }
    })
    expect(sand.at === 3 && sand.mOut, "Sand shows Sand's picture, and M (sold out in Sand) is crossed out", sand)
    await click(p, '[data-product-sheet-value="XL"]')
    await sleep(200)
    expect((await p.evaluate(() => (window.__R || document).querySelector("[data-product-sheet-label]")?.textContent)) === "Check out · €49.00", "XL's own price on the button")

    /* The size guide slides open. */
    await click(p, "[data-product-sheet-size-guide]")
    const heights = []
    for (let i = 0; i < 6; i++) {
      heights.push(await p.evaluate(() => Math.round((window.__R || document).querySelector("[data-product-sheet-size-chart]").getBoundingClientRect().height)))
      await sleep(60)
    }
    await sleep(400)
    const full = await p.evaluate(() => Math.round((window.__R || document).querySelector("[data-product-sheet-size-chart]").getBoundingClientRect().height))
    expect(full > 150 && heights.some((h) => h > 0 && h < full), "the size guide slides open, frame by frame", { heights, full })
    if (w === 1280 && theme === "default") await p.screenshot({ path: join(SHOTS, `sheet-${theme}-${w}-size-guide.png`) })
    if (w === 390 && theme === "midnight") await p.screenshot({ path: join(SHOTS, `sheet-${theme}-${w}.png`) })
    expect(p.errors.length === 0, "no errors", p.errors)
    await p.close()

    /* Licences: none chosen, then the one picked. */
    const q = await open(w, `?sheet&theme=${theme}`)
    await click(q, '[data-product-block="row"]')
    await sleep(1000)
    await q.evaluate(() => { window.__R = document.querySelector('[data-product-sheet="p-pack"]') })
    const before = await q.evaluate(() => (window.__R || document).querySelector("[data-product-sheet-label]")?.textContent)
    await click(q, '[data-product-sheet-value="Commercial"]')
    await sleep(200)
    const after = await q.evaluate(() => ({ label: (window.__R || document).querySelector("[data-product-sheet-label]")?.textContent, price: (window.__R || document).querySelector("[data-product-sheet-price] span")?.textContent }))
    expect(before === "Choose an option" && after.label === "Buy now" && after.price === "€79.00", "two licences: the buyer picks, and the price follows", { before, after })
    await q.close()
  }
}

/* ── SIGNUP ────────────────────────────────────────────────────────────── */
for (const theme of ["default", "olive"]) {
  for (const w of [390, 1280]) {
    console.log(`\nThe email signup, ${theme}, ${w}`)
    const p = await open(w, `?signup&theme=${theme}`)
    const s = await p.evaluate(() => {
      const doc = document.documentElement
      const out = {}
      for (const el of document.querySelectorAll("[data-email-layout]")) {
        const r = el.getBoundingClientRect()
        out[el.getAttribute("data-email-layout")] = { w: Math.round(r.width), h: Math.round(r.height), spill: el.scrollWidth > el.clientWidth + 1 }
      }
      const pill = document.querySelector('[data-email-form="pill"]')
      const face = document.querySelector("[data-email-connect-face]")
      return { out, overflow: doc.scrollWidth > doc.clientWidth, pillH: pill ? Math.round(pill.getBoundingClientRect().height) : 0, faceW: face ? Math.round(face.getBoundingClientRect().width) : 0, connect: document.querySelector("[data-email-connect]")?.textContent, line: !!document.querySelector('[data-email-form="line"]'), barForm: Math.round(document.querySelector("[data-email-bar-form]").getBoundingClientRect().height) }
    })
    const ids = Object.keys(s.out)
    expect(ids.join() === "default,pro,cover,bold,minimal,connect,letter,bar", "all eight layouts drawn", ids)
    expect(!s.overflow && ids.every((k) => !s.out[k].spill), "nothing spills sideways", s.out)
    expect(s.pillH === 52 && s.faceW === 32 && s.connect === "Connect with", "Connect: a 52px pill, its button 'Connect with' and a 32px picture", { pillH: s.pillH, faceW: s.faceW, connect: s.connect })
    expect(s.line, "Letter: the box drawn as a line")
    expect(s.barForm === 0, "Bar: one slim row, the form folded", { row: s.out.bar?.h, form: s.barForm })
    await click(p, "[data-email-bar-open]")
    await sleep(500)
    const opened = await p.evaluate(() => ({ form: Math.round(document.querySelector("[data-email-bar-form]").getBoundingClientRect().height), focused: document.activeElement?.getAttribute("type") }))
    expect(opened.form >= 47 && opened.focused === "email", "Bar's button slides the form open and puts the cursor in it", opened)
    await p.screenshot({ path: join(SHOTS, `signup-${theme}-${w}.png`), fullPage: true })
    expect(p.errors.length === 0, "no errors", p.errors)
    await p.close()
  }
}

/* ── PRODUCTS UNDER A THEME'S PRODUCT LAYOUT ──────────────────────────── */
for (const theme of ["default", "astrid", "olive"]) {
  for (const w of [390, 1280]) {
    console.log(`\nProducts as a grid and as rows, ${theme}, ${w}`)
    for (const pl of ["grid", "rows"]) {
      const p = await open(w, `?products&plain&pl=${pl}&theme=${theme}`)
      const r = await p.evaluate(() => {
        const col = document.querySelector('[data-product-block]')?.closest("[data-product-pair]")?.parentElement?.getBoundingClientRect().width || 0
        return { col: Math.round(col), blocks: [...document.querySelectorAll("[data-product-block]")].map((e) => ({ kind: e.getAttribute("data-product-block"), w: Math.round(e.getBoundingClientRect().width), top: Math.round(e.getBoundingClientRect().top) })) }
      })
      if (pl === "grid") {
        const tiles = r.blocks.filter((b) => b.kind === "tile")
        const rows = new Map()
        for (const t of tiles) rows.set(t.top, (rows.get(t.top) || 0) + 1)
        /* Five on the page: two rows of two and one alone; two in the group: one row of two. */
        expect(tiles.length === 7 && [...rows.values()].filter((n) => n === 2).length === 3, "Grid: every product a tile, two to a row, in the group too", r.blocks)
      } else {
        expect(r.blocks.length === 7 && r.blocks.every((b) => b.kind === "row"), "Rows: every product a row", r.blocks.map((b) => b.kind))
      }
      if (w === 390 && theme === "default") await p.screenshot({ path: join(SHOTS, `products-${pl}-${w}.png`), fullPage: true })
      await p.close()
    }
  }
}

/* ── DESIGN › LAYOUT ON THE PAGE ───────────────────────────────────────── */
for (const w of [390, 1280]) {
  console.log(`\nDesign › Layout on the page, ${w}`)
  const read = async (bl) => {
    const p = await open(w, `?links&bl=${bl}`)
    const r = await p.evaluate(() =>
      Object.fromEntries(["Shop the prints", "Late night mix", "Studio tour", "Booking"].map((t) => {
        const a = [...document.querySelectorAll("a")].find((e) => e.textContent.includes(t))
        const b = a.getBoundingClientRect()
        return [t, { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top) }]
      })),
    )
    await p.close()
    return r
  }
  const list = await read("list")
  const grid = await read("grid")
  const cards = await read("cards")
  const compact = await read("compact")
  expect(grid["Shop the prints"].top === grid["Late night mix"].top && grid["Shop the prints"].w < list["Shop the prints"].w / 2 + 2, "Grid: two plain links side by side", { list: list["Shop the prints"], grid: grid["Shop the prints"] })
  expect(cards["Studio tour"].h > list["Studio tour"].h * 2, "Cards: a link with a picture becomes a card", { list: list["Studio tour"].h, cards: cards["Studio tour"].h })
  const gap = (r) => r["Late night mix"].top - r["Shop the prints"].top - r["Shop the prints"].h
  expect(gap(compact) < gap(list), "Compact: the gaps close", { list: gap(list), compact: gap(compact) })
}

await browser.close()
server.close()
console.log(`\n${passed} passed, ${failed} failed. Pictures in ${SHOTS}`)
process.exit(failed ? 1 : 0)
