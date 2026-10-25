/**
 * ===========================================================================
 *  THE TOOLBAR OVER A SELECTED BLOCK, AND ADD SECTION BETWEEN TWO SECTIONS
 * ===========================================================================
 * The owner, round 1023:
 *
 *   "The floating toolbar over a selected BLOCK (a price block inside a
 *   product information section): Move up and Move down move the whole
 *   section instead of the block." Duplicate, Hide and Delete the same.
 *
 *   "Imported themes are missing the hover + Add section between sections
 *   in the canvas, which Storelib themes have."
 *
 * The real editor (scripts/canvas-probe-kit.mjs), with real input:
 *
 *   BLOCK      a block selected by a press on it in the canvas, then each
 *              button of the toolbar over it: the order of the blocks in its
 *              section, and of the sections on the page, before and after
 *   STEP       a static block is never moved, nor stepped over out of place
 *   ADD        (imported) the pointer brought to the line between two
 *              sections: the strip's line and button, their opacity 60ms in
 *              and 260ms in (it grows in, it does not appear), and a press
 *              opens Add section; the section chosen lands between the two
 *   SCROLL     a wheel over the toolbar scrolls the canvas
 *
 * Round 1023, before and after:
 *
 *                                          before                    after
 *   block selected, Move down              moved the section          the block, one place,
 *                                          (faq_accordion past        sections unchanged
 *                                          promo_newsletter)
 *   Duplicate                              copied the section         the block (4 of 3)
 *   Hide, Show                             the section                the block, kept selected
 *   imported: Move down on a product card  disabled (the section's    p2 after p3, sections
 *                                          last place)                unchanged
 *   wheel over the toolbar                 nothing                    300px
 *   imported: + Add section at a line      none                       there in 260ms, 38% at
 *                                                                     60ms, on the line, no
 *                                                                     height; lands between
 *
 *   npx tsx scripts/check-canvas-toolbar.mjs
 *   THEME=storelib|imported   one theme only
 *   EDITOR_BUNDLE=<file>      reuse a bundle (one from another commit, to compare)
 *   BUDGET=0                  report without failing
 */
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok && BUDGET) broken++
}

async function run({ kind, bundle, css, compat }) {
  const { page, front, js, close, errors } = await openEditor({ kind, bundle, css, compat })
  try {
    console.log(`\n${kind === "imported" ? "IMPORTED THEME (Materia fixture)" : "STORELIB THEME"}`)
    const order = async () => kind === "imported"
      ? (await front()).evaluate(() => {
          const secs = [...document.querySelectorAll(".shopify-section")].filter((s) => !s.parentElement.closest(".shopify-section")).map((s) => s.id.replace(/^shopify-section-/, ""))
          const blocks = [...document.querySelectorAll(".pg [data-block-id]")].map((b) => b.getAttribute("data-block-id"))
          return { secs, blocks }
        })
      : js(() => {
          const secs = [...document.querySelectorAll("#wb-preview-root [data-section-box]")].map((s) => s.getAttribute("data-section-type") || s.id)
          const blocks = [...document.querySelectorAll("#wb-preview-root [data-section-type='faq_accordion'] [data-block-id]")].map((b) => b.getAttribute("data-block-id"))
          return { secs, blocks }
        })
    const settle = () => sleep(kind === "imported" ? 1600 : 700)
    /* A press on the second block of the section. */
    const pressBlock = async (n) => {
      if (kind === "imported") {
        const f = await front()
        const at = await f.evaluate((n) => { const b = document.querySelectorAll(".pg [data-block-id]")[n]; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 } }, n)
        await sleep(300)
        const box = await (await page.$("[data-compat-frame='front']")).boundingBox()
        await page.mouse.click(box.x + at.x, box.y + at.y)
      } else {
        const at = await js((n) => { const b = document.querySelectorAll("#wb-preview-root [data-section-type='faq_accordion'] [data-block-id]")[n]; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 12 } }, n)
        await sleep(300)
        await page.mouse.click(at.x, at.y)
      }
      await sleep(900)
    }
    const toolbar = async () => js(() => {
      const t = document.querySelector(".wb-section-toolbar")
      if (!t) return null
      return { target: t.getAttribute("data-toolbar-target"), buttons: [...t.querySelectorAll("button")].map((b) => `${b.getAttribute("aria-label")}${b.disabled ? "(off)" : ""}`) }
    })
    const press = async (label) => {
      const at = await js((label) => { const b = document.querySelector(`.wb-section-toolbar button[aria-label="${label}"]`); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, label)
      if (!at) return false
      await page.mouse.click(at.x, at.y)
      await settle()
      return true
    }

    /* ── Item 2: the toolbar over a selected block ── */
    const before = await order()
    await pressBlock(1)
    const tb = await toolbar()
    expect(tb?.target === "block", "a block selected: the toolbar acts on the block", tb)
    const picked = before.blocks[1]
    await press("Move down")
    const down = await order()
    expect(down.blocks.indexOf(picked) === 2 && down.blocks.length === before.blocks.length, "Move down moves the block one place down in its section", { before: before.blocks, after: down.blocks })
    expect(JSON.stringify(down.secs) === JSON.stringify(before.secs), "Move down leaves the sections where they were", { before: before.secs, after: down.secs })
    await press("Move up")
    const up = await order()
    expect(JSON.stringify(up.blocks) === JSON.stringify(before.blocks), "Move up puts it back", { after: up.blocks })
    expect(JSON.stringify(up.secs) === JSON.stringify(before.secs), "Move up leaves the sections where they were")
    await press("Duplicate")
    const dup = await order()
    expect(dup.blocks.length === before.blocks.length + 1 && JSON.stringify(dup.secs) === JSON.stringify(before.secs), "Duplicate copies the block, not the section", { blocks: dup.blocks.length, secs: dup.secs.length })
    /* The copy is selected: deleting it leaves what was there. */
    await press("Delete")
    const del = await order()
    expect(del.blocks.length === before.blocks.length && JSON.stringify(del.secs) === JSON.stringify(before.secs), "Delete takes the block away, not the section", { blocks: del.blocks.length, secs: del.secs.length })
    /* Deleting took the selection with it: the same block again. */
    await pressBlock(1)
    const tb2 = await toolbar()
    if (tb2?.target === "block" && tb2.buttons.some((b) => /^Hide/.test(b))) {
      await press("Hide")
      const hid = await order()
      expect(hid.blocks.length === before.blocks.length - 1 && JSON.stringify(hid.secs) === JSON.stringify(before.secs), "Hide hides the block, not the section", { blocks: hid.blocks.length, secs: hid.secs.length })
      const tb3 = await toolbar()
      expect(tb3?.target === "block" && tb3.buttons.includes("Show"), "the hidden block stays selected, with Show", tb3)
      await press("Show")
      const shown = await order()
      expect(shown.blocks.length === before.blocks.length, "Show brings it back", shown.blocks.length)
    } else console.log("  note  Hide is not offered for this section's blocks (as its block menu in the sidebar)", JSON.stringify(tb2))
    /* A wheel over the toolbar scrolls the canvas. */
    const tbBox = await js(() => { const t = document.querySelector(".wb-section-toolbar"); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 } })
    if (tbBox) {
      const y0 = kind === "imported" ? await (await front()).evaluate(() => scrollY) : await js(() => document.getElementById("wb-preview-root").scrollTop)
      await page.mouse.move(tbBox.x, tbBox.y)
      /* Up when the page is near its foot (the product grid is the last section). */
      await page.mouse.wheel({ deltaY: y0 > 600 ? -300 : 300 })
      await sleep(600)
      const y1 = kind === "imported" ? await (await front()).evaluate(() => scrollY) : await js(() => document.getElementById("wb-preview-root").scrollTop)
      expect(Math.abs(y1 - y0) >= 100, "a wheel over the toolbar scrolls the canvas", { from: Math.round(y0), to: Math.round(y1) })
    }

    /* ── Item 3: + Add section between two sections ── */
    await page.keyboard.press("Escape")
    await sleep(500)
    if (kind === "imported") {
      const f = await front()
      const gap = await f.evaluate(() => {
        scrollTo(0, 0)
        const main = [...document.querySelectorAll("main .shopify-section")]
        const a = main[0], b = main[1]
        b.scrollIntoView({ block: "center" })
        const r = b.getBoundingClientRect()
        return { x: r.left + r.width * 0.3, y: r.top, before: b.id.replace(/^shopify-section-/, ""), after: a.id.replace(/^shopify-section-/, "") }
      })
      await sleep(500)
      const box = await (await page.$("[data-compat-frame='front']")).boundingBox()
      await page.mouse.move(box.x + gap.x, box.y + gap.y - 40)
      await sleep(200)
      await page.mouse.move(box.x + gap.x, box.y + gap.y + 2)
      await sleep(60)
      const early = await f.evaluate(() => { const a = (document.querySelector("[data-sl-box=layer]")?.shadowRoot ?? document).querySelector("[data-sl-add]"); return a ? { shown: a.style.display, b: getComputedStyle(a.querySelector("b")).opacity, i: getComputedStyle(a.querySelector("i")).opacity } : null })
      await sleep(260)
      const late = await f.evaluate(() => { const a = (document.querySelector("[data-sl-box=layer]")?.shadowRoot ?? document).querySelector("[data-sl-add]"); if (!a) return null; const r = a.getBoundingClientRect(); return { shown: a.style.display, on: a.hasAttribute("data-on"), b: getComputedStyle(a.querySelector("b")).opacity, i: getComputedStyle(a.querySelector("i")).opacity, top: Math.round(r.top + r.height / 2), height: r.height, label: a.getAttribute("aria-label") } })
      expect(!!late && late.shown === "flex" && late.on && Number(late.b) > 0.99, "the pointer at the line between two sections: + Add section is there", late)
      expect(!!early && Number(early.b) > 0.05 && Number(early.b) < 0.95, "it grows in (60ms in: part way), as the Storelib canvas's strip", early)
      expect(late && Math.abs(late.top - gap.y) <= 2, "it stands on the line between the two sections", { strip: late?.top, line: Math.round(gap.y) })
      const sameFlow = await f.evaluate(() => [...document.querySelectorAll("main .shopify-section")][1].getBoundingClientRect().top)
      expect(Math.abs(sameFlow - gap.y) < 1, "the page lays out as it did: no height added", { before: Math.round(gap.y), after: Math.round(sameFlow) })
      await page.mouse.move(box.x + gap.x, box.y + gap.y - 60)
      await sleep(320)
      const gone = await f.evaluate(() => { const a = (document.querySelector("[data-sl-box=layer]")?.shadowRoot ?? document).querySelector("[data-sl-add]"); return a ? a.style.display : "none" })
      expect(gone === "none", "the pointer away: it goes", gone)
      await page.mouse.move(box.x + gap.x, box.y + gap.y + 1)
      await sleep(320)
      await page.mouse.click(box.x + gap.x + 0, box.y + gap.y + 1)
      await sleep(900)
      const lib = await js(() => document.querySelector("[data-section-library-layer]")?.getAttribute("data-state"))
      expect(lib === "open", "a press opens Add section", lib)
      if (lib === "open") {
        const card = await js(() => { const c = [...document.querySelectorAll("[data-library-card]")].find((x) => x.getClientRects().length); if (!c) return null; c.click(); return c.getAttribute("data-library-card") })
        await sleep(2500)
        const after = await (await front()).evaluate(() => [...document.querySelectorAll("main .shopify-section")].map((s) => s.id.replace(/^shopify-section-/, "")))
        const at = after.indexOf(gap.before)
        expect(!!card && after.length === 5 && after[at - 2] === gap.after && at === 2, "the section chosen lands between the two", { card, after, between: [gap.after, gap.before] })
      }
      /* With the inspector off there is nothing to add: the canvas is the website. */
      await js(() => document.querySelector("[aria-label='Disable section inspector']")?.click())
      await sleep(600)
      await page.mouse.move(box.x + gap.x, box.y + gap.y - 50)
      await sleep(100)
      await page.mouse.move(box.x + gap.x, box.y + gap.y + 1)
      await sleep(320)
      const off = await (await front()).evaluate(() => { const a = (document.querySelector("[data-sl-box=layer]")?.shadowRoot ?? document).querySelector("[data-sl-add]"); return a ? a.style.display : "none" })
      expect(off === "none", "inspector off: no strip", off)
      await js(() => document.querySelector("[aria-label='Enable section inspector']")?.click())
    }
    if (errors.length) console.log(`  note  page errors ${JSON.stringify(errors.slice(0, 3))}`)
  } finally {
    await close()
  }
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const kinds = process.env.THEME ? [process.env.THEME] : ["storelib", "imported"]
  const compat = kinds.includes("imported") ? await importedTheme() : null
  for (const kind of kinds) await run({ kind, bundle, css, compat })
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
