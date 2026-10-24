/**
 * ===========================================================================
 *  THE SIDEBAR'S LIST: BACK WHERE IT WAS LEFT, AND A LIVE DRAG (round BC)
 * ===========================================================================
 * "I scroll the sidebar, click a section, it opens the section settings.
 * When I go back, the sidebar jumps to the top or bottom." And: "when I'm
 * dragging a section in the sidebar, I should see in real time how it moves
 * in the canvas."
 *
 * The real editor (scripts/editor-probe-harness.mjs), driven with real mouse
 * and touch input, at a computer's width and a phone's:
 *
 *   scroll the list, open a row, Back      the list is where it was, the row
 *                                          on screen with the soft highlight,
 *                                          which fades
 *   a block on the canvas, Back, Back      its section's settings, then the
 *                                          list with the section scrolled in
 *                                          and highlighted
 *   drag a row down three places           the canvas shows the new order
 *                                          while the finger is still down,
 *                                          the drop keeps it, one undo step
 *                                          puts it back; Escape mid-drag
 *                                          leaves the page as it was
 *   the header                             its menu's Delete greyed, saying
 *                                          it can be hidden
 *   Publish                                a press on the canvas (an imported
 *                                          theme's frame too), on a grip that
 *                                          stops its own press, and Escape
 *                                          (inside the frame too) close it
 *
 * SHOTS=<dir> saves screenshots; DEBUG=1 prints what was under each tap.
 *   node scripts/check-sidebar-return.mjs
 *   COMPAT=<file>   an imported theme instead ({ settings, pages, sources,
 *                   files }, as scripts/check-compat-editor.ts builds it)
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BODY = ["hero_centered", "features_grid", "text_image", "text_rich", "proof_testimonials", "faq_accordion", "cta_simple", "promo_newsletter"]
const PAGE = ["header", ...Array.from({ length: 30 }, (_, i) => BODY[i % BODY.length]), "footer"]

/* Live, so Publish opens its panel (render-editor-probe.tsx PROBE_LIVE). */
let head = `<script>window.PROBE_LIVE=true;window.PROBE_PAGES=${JSON.stringify({ home: PAGE })}</script>`
if (process.env.COMPAT) {
  const compat = JSON.parse(readFileSync(process.env.COMPAT, "utf8"))
  const home = compat.pages.home
  const body = home.filter((s) => !/header|footer|announcement/.test(s.type))
  const pad = Array.from({ length: 30 }, (_, i) => ({ ...body[i % body.length], id: `${body[i % body.length].id}-${i}` }))
  compat.pages.home = [...home.filter((s) => /header|announcement/.test(s.type)), ...pad, ...home.filter((s) => /footer/.test(s.type))]
  head = `<script>window.PROBE_LIVE=true;window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")}</script>`
}

const harness = await import("./editor-probe-harness.mjs")
const out = mkdtempSync(join(tmpdir(), "sidebar-return-"))
writeFileSync(join(out, "editor-probe.js"), readFileSync(harness.bundle))
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${harness.css}</style>${head}</head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`)

let failed = 0
const check = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) failed++
}

/** In the page: the list's scroller, a row's box, the canvas's order as it is seen. */
const TOOLS = `
window.__sb = {
  list: function () { var r = document.querySelector("[data-sections-list]"); return r ? r.closest("[data-sheet-scroll]") : null },
  box: function (sel) { var el = document.querySelector(sel); if (!el) return null; var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, w: r.width, h: r.height } },
  shown: function (el) { var s = window.__sb.list(); if (!s || !el) return false; var b = s.getBoundingClientRect(), r = el.getBoundingClientRect(); return r.top >= Math.max(b.top, 0) - 1 && r.bottom <= Math.min(b.bottom, innerHeight) + 1 },
  /* Native canvas: the page's sections top to bottom as they are SEEN (transforms count), and whether any is still moved. */
  seen: function () {
    var root = document.getElementById("wb-preview-root")
    var all = Array.from(root.querySelectorAll("[id^='wb-section-']"))
    var ids = window.__sb.rowOrder()
    all = all.filter(function (e) { return ids.indexOf(e.id.slice(11)) >= 0 })
    var dom = all.map(function (e) { return e.id.slice(11) })
    var seen = all.slice().sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top }).map(function (e) { return e.id.slice(11) })
    return { dom: dom, seen: seen, transformed: all.filter(function (e) { return !!e.style.transform }).length, lifted: !!root.querySelector("[data-wb-order-lifted]") }
  },
  rowOrder: function () { return Array.from(document.querySelectorAll("[data-section-drag-list] > [data-section-row-wrap]")).map(function (e) { return e.getAttribute("data-section-row-wrap") }) },
}
`
/* The same reading inside an imported theme's frame. */
const FRAME_SEEN = (ids) => {
  const all = [...document.querySelectorAll(".shopify-section[data-section-id]")].filter((e) => ids.includes(e.getAttribute("data-section-id")))
  const dom = all.map((e) => e.getAttribute("data-section-id"))
  const seen = all.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((e) => e.getAttribute("data-section-id"))
  return { dom, seen, transformed: all.filter((e) => !!e.style.transform).length, lifted: !!document.querySelector("[data-sl-order-lifted]") }
}

async function run(width, height, phone) {
  console.log(`\n${width}x${height}${process.env.COMPAT ? " (imported theme)" : ""}`)
  const browser = await puppeteer.launch({ executablePath: harness.CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files", "--force-device-scale-factor=1"] })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
    await page.goto(`file://${join(out, "index.html")}`)
    await page.waitForSelector("[data-section-row]", { timeout: 60000 })
    await sleep(process.env.COMPAT ? 6000 : 2500)
    await page.evaluate(TOOLS)
    const frame = () => page.frames().find((f) => f !== page.mainFrame() && f.url() === "about:srcdoc") ?? null
    const tapAt = async (x, y) => { if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y) }
    const tap = async (sel) => {
      const b = await page.evaluate((s) => window.__sb.box(s), sel)
      if (!b) return false
      await tapAt(b.x, b.y)
      return true
    }
    const openSheet = async () => {
      if (!phone) return
      await page.evaluate(() => { const t = Array.from(document.querySelectorAll("button")).find((b) => /^Sections$/.test((b.textContent || "").trim())); t?.click() })
      await sleep(900)
    }
    await openSheet()
    /* The sheet raised by its handle, as a thumb does, keeping the panel it shows. */
    const raiseSheet = async () => {
      if (!phone) return
      const top = await page.evaluate(() => { const sh = Array.from(document.querySelectorAll("[data-mobile-bottom-sheet]")).find((x) => x.getBoundingClientRect().top < innerHeight - 10 && x.querySelector("[data-wb-sidebar-scroll]")); return sh ? sh.getBoundingClientRect().top : null })
      if (top !== null) await page.touchscreen.tap(width / 2, top + 10)
      await sleep(900)
    }

    /* ── 1. A row, Back ── */
    const listBox = await page.evaluate(() => { const s = window.__sb.list(); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 120), max: s.scrollHeight - s.clientHeight } })
    if (phone) await page.evaluate((m) => { window.__sb.list().scrollTop = Math.round(m * 0.45) }, listBox.max)
    else { await page.mouse.move(listBox.x, listBox.y); await page.mouse.wheel({ deltaY: Math.round(listBox.max * 0.45) }) }
    await sleep(500)
    const before = await page.evaluate(() => window.__sb.list().scrollTop)
    const id = await page.evaluate(() => {
      const s = window.__sb.list(); const box = s.getBoundingClientRect()
      const row = Array.from(s.querySelectorAll("[data-section-drag-list] [data-section-row]")).find((r) => { const b = r.getBoundingClientRect(); return b.top > box.top + box.height * 0.3 && b.bottom < Math.min(box.bottom, innerHeight) - 10 })
      return row?.getAttribute("data-section-row")
    })
    await tap(`[data-section-row="${id}"] [class*="truncate"]`)
    await sleep(1200)
    check(await page.evaluate(() => !!document.querySelector("[data-wb-section-panel]")), "a row opens its section")
    await tap("[data-panel-back] button")
    await sleep(150)
    const back = await page.evaluate((id) => {
      const s = window.__sb.list(); const r = s.querySelector(`[data-section-row="${id}"]`)
      return { top: s.scrollTop, onScreen: window.__sb.shown(r), flash: r.hasAttribute("data-row-flash") }
    }, id)
    await sleep(900)
    const later = await page.evaluate(() => window.__sb.list().scrollTop)
    check(Math.abs(back.top - before) <= 2 && Math.abs(later - before) <= 2, "Back: the list is where it was", { before, back: back.top, later })
    check(back.onScreen, "Back: the row is on screen")
    check(back.flash, "Back: the row wears the soft highlight")
    await sleep(1500)
    check(await page.evaluate((id) => !document.querySelector(`[data-section-row="${id}"][data-row-flash]`), id), "the highlight fades away")

    /* ── 2. A block on the canvas, Back, Back: the list scrolled to its section ── */
    await page.evaluate(() => { window.__sb.list().scrollTop = 0 })
    await sleep(300)
    const ids = await page.evaluate(() => window.__sb.rowOrder())
    /* A section near the foot of the page with a block to press, so the block's own panel is reached too. */
    const far = process.env.COMPAT
      ? await frame().evaluate((ids) => ids.slice().reverse().slice(2).find((id) => document.querySelector(`#shopify-section-${id} [data-block-id]`)) ?? ids[ids.length - 4], ids)
      : await page.evaluate((ids) => ids.slice().reverse().slice(2).find((id) => document.querySelector(`#wb-section-${id} [data-block-id]`)) ?? ids[ids.length - 4], ids)
    let hitBlock = null
    if (!process.env.COMPAT) {
      hitBlock = await page.evaluate((sid) => {
        const sec = document.getElementById(`wb-section-${sid}`)
        const root = document.getElementById("wb-preview-root")
        sec.scrollIntoView({ block: innerWidth < 768 ? "start" : "center", behavior: "instant" })
        const b = sec.querySelector("[data-block-id]")
        const r = (b || sec).getBoundingClientRect(), rr = root.getBoundingClientRect()
        return { x: r.left + Math.min(r.width / 2, 40), y: Math.max(rr.top + 10, Math.min(r.top + Math.min(r.height / 2, 20), rr.bottom - 10)), block: b ? b.getAttribute("data-block-id") : null }
      }, far)
    } else {
      const f = frame()
      const fb = await page.evaluate(() => { const r = document.querySelector("[data-compat-canvas] iframe").getBoundingClientRect(); return { x: r.left, y: r.top } })
      await f.evaluate((sid) => {
        const sec = document.getElementById(`shopify-section-${sid}`)
        const b = sec.querySelector("[data-block-id]") || sec
        scrollTo({ top: b.getBoundingClientRect().top + scrollY - innerHeight / 4, behavior: "instant" })
      }, far)
      await sleep(400)
      const inner = await f.evaluate((sid) => {
        const sec = document.getElementById(`shopify-section-${sid}`)
        const b = sec.querySelector("[data-block-id]")
        const r = (b || sec).getBoundingClientRect()
        return { x: r.left + Math.min(r.width / 2, 40), y: r.top + Math.min(r.height / 2, 20), block: b ? b.getAttribute("data-block-id") : null }
      }, far)
      await sleep(400)
      hitBlock = { x: fb.x + inner.x, y: fb.y + inner.y, block: inner.block }
    }
    await sleep(500)
    if (phone) {
      /* The sheet down to its peek (a tap on its scrim), so the canvas takes the tap. */
      await page.touchscreen.tap(width / 2, 120)
      await sleep(700)
    }
    if (process.env.DEBUG) console.log("  tap", hitBlock, await page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + String(e.className).slice(0, 80) + " #" + (e.closest("[id]")?.id ?? "") : null }, hitBlock.x, hitBlock.y))
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/canvas-tap-${width}.png` })
    await tapAt(hitBlock.x, hitBlock.y)
    await sleep(1400)
    const opened = await page.evaluate(() => ({ block: document.querySelector("[data-wb-block-panel]")?.getAttribute("data-wb-block-panel") ?? null, section: document.querySelector("[data-wb-section-panel]")?.getAttribute("data-wb-section-panel") ?? null }))
    check(opened.section === far, "a press on the canvas opens that section (or its block)", opened)
    await raiseSheet()
    if (opened.block) {
      await tap("[data-panel-back] button")
      await sleep(500)
      check(await page.evaluate(() => !!document.querySelector("[data-wb-section-panel]") && !document.querySelector("[data-wb-block-panel]")), "Back from the block: its section's settings")
    }
    await tap("[data-panel-back] button")
    await sleep(150)
    const back2 = await page.evaluate((far, block) => {
      const s = window.__sb.list(); const r = s.querySelector(`[data-section-row="${far}"]`)
      const b = block ? s.querySelector(`[data-section-blocks="${far}"] [data-tree-block="${block}"] > [role="button"]`) : null
      return { top: s.scrollTop, onScreen: window.__sb.shown(b || r), flash: r.hasAttribute("data-row-flash"), blockFlash: b ? b.hasAttribute("data-row-flash") : null }
    }, far, opened.block)
    check(back2.onScreen, "Back to the list: the section opened from the canvas is scrolled into view", back2)
    check(back2.flash, "and its row is highlighted")
    if (opened.block) check(back2.blockFlash === true, "and the block's row under it too")
    await sleep(1800)

    /* ── 3. Drag a row down three places: the canvas follows, the drop keeps it, undo puts it back ── */
    await page.evaluate(() => { window.__sb.list().scrollTop = 0 })
    await sleep(300)
    const order0 = await page.evaluate(() => window.__sb.rowOrder())
    const moving = order0[1]
    const grip = await page.evaluate((id) => window.__sb.box(`[data-section-row="${id}"] [aria-label^="Drag"]`), moving)
    const rowH = await page.evaluate((id) => document.querySelector(`[data-section-row-wrap="${id}"]`).getBoundingClientRect().height, moving)
    const seenNow = async () => (process.env.COMPAT ? frame().evaluate(FRAME_SEEN, order0) : page.evaluate(() => window.__sb.seen()))
    const drag = async (rows, finish) => {
      /* The row near the top of what shows of the list (on a phone, the sheet's lower part is below the screen). */
      await page.evaluate((id) => { const s = window.__sb.list(); const r = document.querySelector(`[data-section-row="${id}"]`).getBoundingClientRect(); const b = s.getBoundingClientRect(); s.scrollTop += r.top - (Math.max(b.top, 0) + 40) }, moving)
      await sleep(300)
      const g = await page.evaluate((id) => window.__sb.box(`[data-section-row="${id}"] [aria-label^="Drag"]`), moving)
      if (phone) await page.touchscreen.touchStart(g.x, g.y)
      else { await page.mouse.move(g.x, g.y); await page.mouse.down() }
      for (let k = 1; k <= 12; k++) {
        const y = g.y + (rowH * rows * k) / 12
        if (phone) await page.touchscreen.touchMove(g.x, y)
        else await page.mouse.move(g.x, y)
        await sleep(30)
      }
      await sleep(450)
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/drag-${width}-${finish}.png` })
      if (process.env.DEBUG) console.log("  grip", g, await page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + String(e.className).slice(0, 60) : null }, g.x, g.y))
      const mid = await seenNow()
      if (finish === "drop") { if (phone) await page.touchscreen.touchEnd(); else await page.mouse.up() }
      else { await page.keyboard.press("Escape"); if (phone) await page.touchscreen.touchEnd(); else await page.mouse.up() }
      return mid
    }
    const mid = await drag(3, "drop")
    await sleep(process.env.COMPAT ? 3500 : 1500)
    const after = await seenNow()
    const rowsAfter = await page.evaluate(() => window.__sb.rowOrder())
    const want = rowsAfter
    check(rowsAfter.indexOf(moving) >= 3, "the drop keeps the new order in the list", rowsAfter.slice(0, 6))
    check(JSON.stringify(mid.seen) === JSON.stringify(want) && JSON.stringify(mid.dom) === JSON.stringify(order0), "while dragging, the canvas showed that order (nothing redrawn: the page's own order untouched until the drop)", { seen: mid.seen.slice(0, 6), dom: mid.dom.slice(0, 6) })
    check(mid.lifted, "the section being moved is marked on the canvas")
    check(JSON.stringify(after.dom) === JSON.stringify(want) && JSON.stringify(after.seen) === JSON.stringify(want) && after.transformed === 0 && !after.lifted, "and on the canvas, with every slide let go", { dom: after.dom.slice(0, 6), transformed: after.transformed })
    if (!phone) {
      await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control")
      await sleep(process.env.COMPAT ? 3500 : 1200)
      check(JSON.stringify(await page.evaluate(() => window.__sb.rowOrder())) === JSON.stringify(order0), "one undo puts it back")
    }
    /* Escape mid drag: nothing changes. */
    const startOrder = await page.evaluate(() => window.__sb.rowOrder())
    await drag(2.2, "escape")
    await sleep(800)
    const esc = await seenNow()
    check(JSON.stringify(await page.evaluate(() => window.__sb.rowOrder())) === JSON.stringify(startOrder) && esc.transformed === 0 && JSON.stringify(esc.seen) === JSON.stringify(esc.dom), "Escape mid drag: the list and the canvas are as they were", { transformed: esc.transformed })

    /* ── 4. The page's own sections: no Delete ── */
    {
      const hdr = await page.evaluate(() => { window.__sb.list().scrollTop = 0; return Array.from(document.querySelectorAll("[data-section-group='header'] [data-section-row]")).find((r) => /header/i.test(r.getAttribute("data-section-row")))?.getAttribute("data-section-row") })
      await sleep(300)
      const hb = await page.evaluate((id) => window.__sb.box(`[data-section-row="${id}"]`), hdr)
      if (phone) { await page.touchscreen.touchStart(hb.x, hb.y); await sleep(700); await page.touchscreen.touchEnd() }
      else await page.mouse.click(hb.x, hb.y, { button: "right" })
      await sleep(500)
      const del = await page.evaluate(() => { const d = document.querySelector("[data-action-item='delete']"); return d ? { disabled: d.hasAttribute("data-disabled") || d.getAttribute("aria-disabled") === "true" || d.disabled === true || !!d.querySelector("[disabled]"), text: d.textContent } : null })
      check(!!del && del.disabled && /part of the page/.test(del.text), "the header's menu: Delete greyed, saying it can be hidden", del)
      await page.keyboard.press("Escape")
      await sleep(400)
      /* A phone's action sheet closes from its scrim. */
      if (phone && (await page.evaluate(() => !!document.querySelector("[data-action-item='delete']")))) { await page.touchscreen.tap(width / 2, 100); await sleep(600) }
    }
    /* ── 5. Publish: a press away and Escape close it ── */
    {
      const open = () => page.evaluate(() => (innerWidth < 768
        ? Array.from(document.querySelectorAll("[data-mobile-bottom-sheet]")).some((x) => /^Publish/.test(x.textContent || "") && x.getBoundingClientRect().top < innerHeight - 40)
        : document.querySelector('[role=dialog][aria-label="Publish"][data-state="open"]') !== null))
      const press = async () => {
        const b = await page.evaluate(() => { const x = Array.from(document.querySelectorAll("button")).find((y) => /^Publish$/.test((y.textContent || "").trim())); const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
        /* The Sections sheet raised over the bar's edge: its scrim takes the first tap, as it would a thumb's. */
        if (!(await page.evaluate((x, y) => !!document.elementFromPoint(x, y)?.closest("button"), b.x, b.y))) { await tapAt(width / 2, 100); await sleep(700) }
        await tapAt(b.x, b.y)
        await sleep(1200)
      }
      await page.keyboard.press("Escape")
      await sleep(300)
      await press()
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/publish-${width}.png` })
      const shown = await open()
      check(shown, "Publish opens its panel")
      /* Away: the canvas (an imported theme's page is a frame of its own). */
      const away = await page.evaluate(() => { const el = document.querySelector("[data-compat-canvas] iframe") || document.getElementById("wb-preview-root"); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 90 } })
      await tapAt(away.x, away.y)
      await sleep(600)
      check(shown && !(await open()), "a press on the canvas closes it")
      await press()
      if (!(await open())) check(false, "Publish opens its panel again")
      await page.keyboard.press("Escape")
      await sleep(600)
      check(shown && !(await open()), "Escape closes it")
      if (!phone) {
        /* A press on a control that stops its own press (a row's grip): heard all the same. The canvas press above opened a section: back to the list first. */
        if (await tap("[data-panel-back] button")) await sleep(500)
        await press()
        const g = await page.evaluate(() => { const el = Array.from(document.querySelectorAll("[data-section-drag-list] [aria-label^='Drag']")).find((x) => { const r = x.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 20 }); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
        if (process.env.DEBUG) console.log("  grip for publish", g, await page.evaluate(() => ({ list: !!document.querySelector("[data-sections-list]"), grips: document.querySelectorAll("[data-section-drag-list] [aria-label^='Drag']").length, panel: document.querySelector("[data-wb-section-panel]")?.getAttribute("data-wb-section-panel"), tops: Array.from(document.querySelectorAll("[data-section-drag-list] [aria-label^='Drag']")).slice(0, 3).map((x) => Math.round(x.getBoundingClientRect().top)) })))
        await page.mouse.click(g.x, g.y)
        await sleep(600)
        check(!(await open()), "a press on a sidebar grip closes it too (the grip stops its press)")
      }
      if (process.env.COMPAT && !phone) {
        await press()
        await frame().evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
        await sleep(600)
        check(!(await open()), "Escape with the keyboard in the theme's page closes it too")
      }
    }
    console.log("  page errors:", errors.slice(0, 3))
  } finally {
    await browser.close()
  }
}

await run(1280, 860, false)
await run(390, 844, true)
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1) }
console.log("\nall good")
