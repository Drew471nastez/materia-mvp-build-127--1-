/**
 * ===========================================================================
 *  A SECTION DRAGGED IN THE SIDEBAR MOVES ON THE CANVAS, AND STAYS MOVED
 * ===========================================================================
 * The owner: dragging sections (and blocks) in the sidebar reorders the
 * sidebar, but the canvas does not move until a reload.
 *
 * The real editor (scripts/canvas-probe-kit.mjs), with real input, on both
 * canvases (an imported theme drawn by the compat canvas and its frame, and
 * Storelib's own), with a mouse and with a finger:
 *
 *   DRAG     the second body section's grip pressed, carried two rows down
 *            and let go. The canvas's sections in the page (DOM order) and
 *            on screen (top of each box, transforms counted) at 150ms,
 *            600ms, 1.5s and 5s after the drop, against the sidebar's order
 *            and the order saved. The frame must not be loaded again (a mark
 *            left in its window survives) and no section may still wear a
 *            transform once it has settled.
 *   MENU     Move up from the row's menu: the same, by the menu.
 *
 *   npx tsx scripts/check-section-drag-canvas.mjs
 *   THEME=storelib|imported   one theme only
 *   LIVE=1                    the owner's real Materia theme (scripts/materia-live-fixture.mjs)
 *   CPU=<n>                   the CPU slowed n times, as a phone
 *   STORE=1                   the owner's store over the imported fixture (SCENARIO=consent,...)
 *   TOUCH=0|1                 the mouse only, or the finger only
 *   EDITOR_REACT=package      bundled with package.json's React instead of Next's
 *   EDITOR_BUNDLE=<file>      reuse a bundle (one from another commit, to compare)
 *   BUDGET=0                  report without failing
 */
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 500)})`}`)
  if (!ok && BUDGET) broken++
}

async function run({ kind, bundle, css, compat, touch }) {
  const { page, front, js, close, errors } = await openEditor({ kind, bundle, css, compat, touch, cpu: Number(process.env.CPU ?? 1), ...(touch ? { width: Number(process.env.TOUCH_W ?? 1024), height: Number(process.env.TOUCH_H ?? 768) } : {}) })
  try {
    console.log(`\n${kind === "imported" ? "IMPORTED THEME (Materia fixture)" : "STORELIB THEME"}, ${touch ? "FINGER" : "MOUSE"}`)
    /* The canvas: the page's sections in the document, and in the order they are seen (their boxes' tops). */
    const canvas = async () => {
      if (kind === "imported") {
        const f = await front()
        return f.evaluate(() => {
          const secs = [...document.querySelectorAll(".shopify-section")].filter((s) => !s.parentElement.closest(".shopify-section") && !/shopify-section-group-/.test(s.className))
          const dom = secs.map((s) => s.id.replace(/^shopify-section-/, ""))
          const seen = secs.map((s) => ({ id: s.id.replace(/^shopify-section-/, ""), top: s.getBoundingClientRect().top })).sort((a, b) => a.top - b.top).map((x) => x.id)
          const moved = secs.filter((s) => s.style.transform && !/translate3d\(0(px)?, 0(px)?, 0(px)?\)/.test(s.style.transform)).length
          return { dom, seen, moved, mark: !!window.__dragProbeMark }
        })
      }
      return js(() => {
        const secs = [...document.querySelectorAll("#wb-preview-root [data-section-box]")].filter((s) => !/^(header|footer)/.test(s.getAttribute("data-section-type") || ""))
        const id = (s) => (s.id || "").replace(/^wb-section-/, "") || s.getAttribute("data-section-type")
        const dom = secs.map(id)
        const seen = secs.map((s) => ({ id: id(s), top: s.getBoundingClientRect().top })).sort((a, b) => a.top - b.top).map((x) => x.id)
        const moved = secs.filter((s) => s.style.transform && !/translate3d\(0(px)?, 0(px)?, 0(px)?\)/.test(s.style.transform)).length
        return { dom, seen, moved, mark: !!document.getElementById("wb-preview-root")?.__dragProbeMark }
      })
    }
    const markFrame = async () => {
      if (kind === "imported") await (await front()).evaluate(() => { window.__dragProbeMark = 1 })
      else await js(() => { document.getElementById("wb-preview-root").__dragProbeMark = 1 })
    }
    /* The sidebar's page rows, in order (their wrap ids), and the grips. */
    const sidebar = () => js(() => [...document.querySelectorAll("[data-reorder-row] [data-section-row-wrap], [data-reorder-row][data-section-row-wrap]")].map((r) => r.getAttribute("data-section-row-wrap")))
    const saved = () => js(() => {
      const s = (window.probeSaves ?? []).filter((x) => /\/sections$/.test(x.url) && Array.isArray(x.body?.sections)).pop()
      const list = s?.body?.sections ?? null
      return list ? list.map((x) => x.id) : null
    })
    const before = await sidebar()
    const c0 = await canvas()
    console.log(`  sidebar ${JSON.stringify(before)}`)
    console.log(`  canvas  ${JSON.stringify(c0.dom)}`)
    expect(before.length >= 4, "the page has four sections or more to drag between", before.length)

    /* ── DRAG ── */
    await markFrame()
    /* A phone (TOUCH_W under 768): the list is in the sheet, taken to its half stop by a tap on its grab bar. */
    const phone = touch && Number(process.env.TOUCH_W ?? 1024) < 768
    if (phone) {
      const h = await js(() => { const s = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].map((n) => ({ n, r: n.getBoundingClientRect() })).filter((x) => x.r.top < innerHeight - 1).sort((a, b) => a.r.top - b.r.top)[0]; if (!s) return null; const r = s.n.firstElementChild.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      if (h) { await page.touchscreen.tap(h.x, h.y); await sleep(900) }
    }
    /* The second row's grip, brought into the sidebar's view first. */
    const from = await js(() => { const g = document.querySelectorAll("[data-reorder-row] [aria-label$=' to reorder']")[1]; g.scrollIntoView({ block: "center" }); for (let n = g.parentElement; n; n = n.parentElement) { if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) { const a = n.getBoundingClientRect(), b = g.getBoundingClientRect(); n.scrollTop += b.top - (a.top + Math.min(a.height, innerHeight - a.top) / 2); break } } const r = g.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, h: g.closest("[data-reorder-row]").getBoundingClientRect().height, hit: !!hit && (hit === g || g.contains(hit)) } })
    await sleep(200)
    expect(from.hit, "the grip is under the pointer", from)
    const dy = from.h * 2 + 4
    /* The canvas while the finger is still down (round BC: it shows where the section would go). */
    let mid = null
    if (touch) {
      await page.touchscreen.touchStart(from.x, from.y)
      for (let i = 1; i <= 12; i++) { await page.touchscreen.touchMove(from.x, from.y + (dy * i) / 12); await sleep(16) }
      await sleep(400)
      mid = await canvas()
      await page.touchscreen.touchEnd()
    } else {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) { await page.mouse.move(from.x, from.y + (dy * i) / 12); await sleep(16) }
      await sleep(400)
      mid = await canvas()
      await page.mouse.up()
    }
    const at = []
    let t0 = Date.now()
    for (const ms of [150, 600, 1500, 5000]) {
      await sleep(Math.max(0, ms - (Date.now() - t0)))
      at.push({ ms, ...(await canvas()) })
    }
    const after = await sidebar()
    const want = after.filter((id) => c0.dom.includes(id))
    console.log(`  sidebar after ${JSON.stringify(after)}`)
    for (const a of at) console.log(`    ${String(a.ms).padStart(5)}ms  dom ${JSON.stringify(a.dom)}  seen ${JSON.stringify(a.seen)}  transformed ${a.moved}  same frame ${a.mark}`)
    console.log(`    held   seen ${JSON.stringify(mid.seen)}  transformed ${mid.moved}`)
    expect(after.join() !== before.join(), "the sidebar's order changed", after)
    expect(mid.seen.join() === want.join(), "while held, the canvas shows where the section would go", mid.seen)
    const last = at[at.length - 1]
    expect(at[0].seen.join() === want.join(), "150ms after the drop the canvas SHOWS the new order", at[0].seen)
    expect(last.dom.join() === want.join(), "the canvas's sections are in the new order in the page", last.dom)
    expect(last.seen.join() === want.join(), "and seen in it", last.seen)
    expect(last.moved === 0, "no section is left held by a transform", last.moved)
    expect(at.every((a) => a.mark), "the canvas was not loaded again", at.map((a) => a.mark))
    /* The flash: a sample in which the seen order went back to the old one after showing the new. */
    const back = at.findIndex((a, i) => i > 0 && at[i - 1].seen.join() === want.join() && a.seen.join() !== want.join())
    expect(back < 0, "the canvas never goes back to the old order on the way", back)
    await sleep(1500)
    const s = await saved()
    expect(s && s.filter((id) => want.includes(id)).join() === want.join(), "the order saved is the one shown", s)

    /* ── MENU: Move up on the row now third, from its menu ── */
    if (!touch) {
      await markFrame()
      const target = after[2]
      await js((id) => document.querySelector(`[data-section-more="${CSS.escape(id)}"]`)?.click(), target)
      await sleep(300)
      const clicked = await js(() => { const b = [...document.querySelectorAll("[role='menuitem']")].find((x) => /Move up/.test(x.textContent || "")); b?.click(); return !!b })
      expect(clicked, "the row's menu has Move up")
      await sleep(2500)
      const c = await canvas()
      const side = await sidebar()
      const want2 = side.filter((id) => c0.dom.includes(id))
      console.log(`  menu: sidebar ${JSON.stringify(side)}  canvas ${JSON.stringify(c.dom)} seen ${JSON.stringify(c.seen)}`)
      expect(side.join() !== after.join(), "Move up changed the sidebar", side)
      expect(c.dom.join() === want2.join() && c.seen.join() === want2.join(), "and the canvas, in place", c.dom)
      expect(c.mark, "without loading the canvas again")
    }
    /* ── BLOCKS: the first block of a section with blocks, dragged one row down in the sidebar's tree ── */
    {
      /* The first page section the sidebar can open whose canvas box holds two blocks or more. */
      const withBlocks = kind === "imported"
        ? await (await front()).evaluate(() => [...document.querySelectorAll(".shopify-section")].filter((x) => x.querySelectorAll("[data-block-id]").length >= 2).map((x) => x.id.replace(/^shopify-section-/, "")))
        : await js(() => [...document.querySelectorAll("#wb-preview-root [data-section-box]")].filter((x) => x.querySelectorAll("[data-block-id]").length >= 2).map((x) => x.getAttribute("data-section-key")))
      const owner = await js((ids) => ids.find((id) => document.querySelector(`[data-reorder-row] [data-section-expand="${CSS.escape(id)}"]`)) ?? null, withBlocks)
      const blocksIn = async () => kind === "imported"
        ? (await front()).evaluate((id) => [...(document.getElementById(`shopify-section-${id}`)?.querySelectorAll("[data-block-id]") ?? [])].map((b) => ({ id: b.getAttribute("data-block-id"), top: b.getBoundingClientRect().top })), owner)
        : js((id) => [...(document.getElementById(`wb-section-${id}`)?.querySelectorAll("[data-block-id]") ?? [])].map((b) => ({ id: b.getAttribute("data-block-id"), top: b.getBoundingClientRect().top })), owner)
      await js((id) => { const t = document.querySelector(`[data-section-expand="${CSS.escape(id)}"]`); if (t && t.getAttribute("aria-label")?.startsWith("Show")) t.click() }, owner)
      await sleep(500)
      const tree = () => js((id) => [...(document.querySelector(`[data-section-blocks="${CSS.escape(id)}"]`)?.querySelectorAll("[data-tree-block]") ?? [])].map((r) => r.getAttribute("data-tree-block")), owner)
      const t0b = await tree()
      const b0 = await blocksIn()
      await markFrame()
      const g = await js((id) => { const all = [...(document.querySelector(`[data-section-blocks="${CSS.escape(id)}"]`)?.querySelectorAll("[data-tree-block] [aria-label^='Drag to reorder']") ?? [])]; const g = all[0]; if (g) { g.scrollIntoView({ block: "center" }); for (let n = g.parentElement; n; n = n.parentElement) { if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) { const a = n.getBoundingClientRect(), b = g.getBoundingClientRect(); n.scrollTop += b.top - (a.top + Math.min(a.height, innerHeight - a.top) / 2); break } } } return all.map((x) => { const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: x.closest("[data-tree-block]").getBoundingClientRect().height } }) }, owner)
      if (g.length < 2) expect(false, "the section's blocks are in the sidebar's tree", { owner, rows: g.length })
      else {
        const p = g[0]
        const d = p.h * 1 + 4
        if (touch) {
          await page.touchscreen.touchStart(p.x, p.y)
          for (let i = 1; i <= 10; i++) { await page.touchscreen.touchMove(p.x, p.y + (d * i) / 10); await sleep(16) }
          await sleep(120)
          await page.touchscreen.touchEnd()
        } else {
          await page.mouse.move(p.x, p.y)
          await page.mouse.down()
          for (let i = 1; i <= 10; i++) { await page.mouse.move(p.x, p.y + (d * i) / 10); await sleep(16) }
          await sleep(120)
          await page.mouse.up()
        }
        await sleep(kind === "imported" ? 2500 : 1200)
        const t1b = await tree()
        const b1 = await blocksIn()
        const shownIds = b1.map((b) => b.id)
        const want3 = t1b.filter((k) => shownIds.includes(k))
        const seen3 = b1.slice().sort((a, b) => a.top - b.top).map((b) => b.id)
        console.log(`  blocks of ${owner}: tree ${JSON.stringify(t0b)} -> ${JSON.stringify(t1b)}  canvas ${JSON.stringify(b0.map((b) => b.id))} -> ${JSON.stringify(shownIds)}`)
        expect(t1b.join() !== t0b.join(), "the block moved in the sidebar", t1b)
        expect(want3.length >= 2 && shownIds.filter((k) => want3.includes(k)).join() === want3.join() && seen3.filter((k) => want3.includes(k)).join() === want3.join(), "and on the canvas", { want3, shownIds, seen3 })
        const c = await canvas()
        expect(c.mark, "without loading the canvas again")
      }
    }
    /* ── TWICE: a second drag straight after the first, before the canvas has taken the first in ── */
    if (!touch) {
      const dragRow = async (n, slots) => {
        const p = await js((n) => { const g = document.querySelectorAll("[data-reorder-row] [aria-label$=' to reorder']")[n]; g.scrollIntoView({ block: "center" }); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: g.closest("[data-reorder-row]").getBoundingClientRect().height } }, n)
        const d = p.h * slots + Math.sign(slots) * 4
        await page.mouse.move(p.x, p.y)
        await page.mouse.down()
        for (let i = 1; i <= 8; i++) { await page.mouse.move(p.x, p.y + (d * i) / 8); await sleep(16) }
        await sleep(60)
        await page.mouse.up()
      }
      /* The block tree folded again, so the rows are the sections'. */
      await js(() => document.querySelectorAll("[data-section-expand]").forEach((t) => { if (t.getAttribute("aria-label")?.startsWith("Hide")) t.click() }))
      await sleep(400)
      await markFrame()
      const s0 = await sidebar()
      await dragRow(1, 1)
      await dragRow(3, -2)
      const trace = []
      const t1 = Date.now()
      while (Date.now() - t1 < 6000) { trace.push({ ms: Date.now() - t1, ...(await canvas()) }); await sleep(150) }
      const s1 = await sidebar()
      const want4 = s1.filter((id) => c0.dom.includes(id))
      const end = trace[trace.length - 1]
      const firstRight = trace.findIndex((x) => x.seen.join() === want4.join())
      const leftAgain = firstRight < 0 ? -1 : trace.findIndex((x, i) => i > firstRight && x.seen.join() !== want4.join())
      console.log(`  twice: sidebar ${JSON.stringify(s0)} -> ${JSON.stringify(s1)}`)
      console.log(`         canvas right from ${firstRight < 0 ? "never" : `${trace[firstRight].ms}ms`}, ${leftAgain < 0 ? "stayed right" : `wrong again at ${trace[leftAgain].ms}ms ${JSON.stringify(trace[leftAgain].seen)}`}`)
      expect(s1.join() !== s0.join(), "two drags changed the sidebar", s1)
      expect(end.dom.join() === want4.join() && end.seen.join() === want4.join(), "the canvas has both, in place", { dom: end.dom, seen: end.seen })
      expect(end.moved === 0, "nothing left held by a transform", end.moved)
      expect(leftAgain < 0, "once right, the canvas stays right", leftAgain < 0 ? null : trace[leftAgain])
      expect(end.mark, "without loading the canvas again")
    }
    expect(errors.length === 0, "no page errors", errors)
  } finally {
    await close()
  }
}

/* The React the app runs (Next's vendored canary), unless asked otherwise: EDITOR_REACT=package. */
process.env.EDITOR_REACT ??= "next"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const kinds = process.env.THEME ? [process.env.THEME] : ["imported", "storelib"]
const touches = process.env.TOUCH === "1" ? [true] : process.env.TOUCH === "0" ? [false] : [false, true]
/* STORE=1: the owner's store laid over the fixture (scripts/materia-store-kit.mjs), SCENARIO its first paint. */
/* LIVE=1: the owner's real Materia theme as its store serves it (scripts/materia-live-fixture.mjs), 26 sections and its own theme.js. */
const compat = !kinds.includes("imported") ? null
  : process.env.LIVE === "1" ? await (await import("./materia-live-fixture.mjs")).materiaLiveTheme()
  : await importedTheme({ store: process.env.STORE === "1", scenario: process.env.SCENARIO ?? "" })
for (const kind of kinds) for (const touch of touches) await run({ kind, bundle, css, compat, touch })
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
