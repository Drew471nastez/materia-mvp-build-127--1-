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
  const { page, front, js, close, errors } = await openEditor({ kind, bundle, css, compat, touch, ...(touch ? { width: 1024, height: 768 } : {}) })
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
      const s = (window.probeSaves ?? []).filter((x) => /\/sections/.test(x.url)).pop()
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
    const grips = await js(() => [...document.querySelectorAll("[data-reorder-row] [aria-label$=' to reorder']")].map((g) => { g.scrollIntoView({ block: "nearest" }); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }))
    const rows = await js(() => [...document.querySelectorAll("[data-reorder-row]")].map((r) => r.getBoundingClientRect().height))
    const from = grips[1]
    const dy = rows[1] * 2 + 4
    if (touch) {
      await page.touchscreen.touchStart(from.x, from.y)
      for (let i = 1; i <= 12; i++) { await page.touchscreen.touchMove(from.x, from.y + (dy * i) / 12); await sleep(16) }
      await sleep(120)
      await page.touchscreen.touchEnd()
    } else {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) { await page.mouse.move(from.x, from.y + (dy * i) / 12); await sleep(16) }
      await sleep(120)
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
    expect(after.join() !== before.join(), "the sidebar's order changed", after)
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
const compat = kinds.includes("imported") ? await importedTheme() : null
for (const kind of kinds) for (const touch of touches) await run({ kind, bundle, css, compat, touch })
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
