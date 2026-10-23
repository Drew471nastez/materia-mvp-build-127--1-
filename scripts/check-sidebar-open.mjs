/**
 * ===========================================================================
 *  A BLOCK'S SETTINGS OPEN AT THEIR TOP (round 1023, part 2)
 * ===========================================================================
 * The owner: "clicking a block in the sidebar to open its settings
 * auto-scrolls the sidebar to the BOTTOM of that block's settings".
 *
 * The real editor (scripts/editor-probe-harness.mjs's bundle), in a window
 * short enough (1440x620) that a block's settings are taller than the
 * sidebar, on a Storelib theme and on the imported Materia store. Each
 * step is a real click in the sidebar; after it, measured on the scroller
 * that holds what opened:
 *
 *   TOP       its scrollTop: 0 is the settings opened at their top
 *   FIRST     the first field of the settings inside the scroller's box
 *
 * Steps: a section opened from the list; a block opened from its section
 * (and its settings scrolled down by hand, as somebody reading them would);
 * Back, and the next block opened; the same for a nested block where the
 * theme has one.
 *
 * Round 1023 part 2, main's bundle and this round's (scrollTop of the panel
 * that opened, of how far it can scroll):
 *
 *                                          before        after
 *   Storelib: Accordion FAQ opened         0             0
 *   Storelib: its first block              24 of 24      0 of 24
 *   Storelib: the next, after reading      24 of 24      0 of 24
 *   Materia: Slideshow opened              0             0
 *   Materia: slide 1                       393 of 393    0 of 393
 *   Materia: slide 2, after reading        339 of 339    0 of 339
 *
 *   npx tsx scripts/check-sidebar-open.mjs
 *   THEME=storelib|imported   one theme only
 *   EDITOR_BUNDLE=<file>      reuse a bundle (one from another commit, to compare)
 *   BUDGET=0                  report without failing
 */
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

async function run(kind, bundle, css, compat) {
  const { page, js, close } = await openEditor({ kind, bundle, css, compat, width: 1440, height: 620 })
  const rows = []
  try {
    console.log(`\n${kind === "imported" ? "IMPORTED THEME (the Materia store)" : "STORELIB THEME"}`)
    const click = (re, scope) => js((src, scope) => {
      const re = new RegExp(src, "i")
      const root = (scope && document.querySelector(scope)) || document
      for (const b of root.querySelectorAll("button, [role=button], [role=tab]")) {
        if (b.closest("#wb-preview-root")) continue
        const t = ((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).replace(/\s+/g, " ").trim()
        if (re.test(t) && b.getClientRects().length) { b.click(); return t.slice(0, 50) }
      }
      return null
    }, re.source, scope ?? "")
    /* The scroller of what is open in the sidebar, and where it stands. */
    const measure = (label) => js((label) => {
      const panel = document.querySelector("[data-wb-block-panel]") || document.querySelector("[data-wb-section-panel]")
      if (!panel) return { label, panel: null }
      const sc = panel.querySelector("[data-wb-block-scroll]") || panel.querySelector("[data-sheet-scroll]") || panel.closest("[data-wb-sidebar-scroll]")
      const outer = document.querySelector("[data-wb-sidebar-scroll]")
      const box = sc.getBoundingClientRect()
      const first = [...sc.querySelectorAll("[data-setting-field], [data-block-field], input:not([type=hidden]):not([type=file]), textarea, [role=switch], [data-slot=slider]")].find((x) => x.getBoundingClientRect().height > 4)
      const fr = first ? first.getBoundingClientRect() : null
      return { label, block: panel.getAttribute("data-wb-block-panel"), top: Math.round(sc.scrollTop), room: sc.scrollHeight - sc.clientHeight, outer: outer ? Math.round(outer.scrollTop) : null, firstInView: !!fr && fr.top >= box.top - 1 && fr.top < box.bottom, firstWhat: first ? `${first.tagName}.${String(first.className).slice(0, 40)} ${Math.round(fr.top)} in ${Math.round(box.top)}..${Math.round(box.bottom)}` : "none" }
    }, label)
    const note = (m) => {
      rows.push(m)
      console.log(`    ${m.label.padEnd(56)} ${m.panel === null ? "(nothing open)" : `scrollTop ${String(m.top).padStart(4)} of ${m.room}  outer ${m.outer}  first field in view ${m.firstInView ? "yes" : "NO"}${process.env.DEBUG ? ` ${m.firstWhat}` : ""}`}`)
    }
    /* A real press on the nth element matching a selector in the sidebar. */
    const press = async (selector, nth = 0) => {
      const at = await js((sel, nth) => {
        const el = [...document.querySelectorAll(sel)].filter((x) => !x.closest("#wb-preview-root") && x.getClientRects().length)[nth]
        if (!el) return null
        el.scrollIntoView({ block: "nearest" })
        const r = el.getBoundingClientRect()
        return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2 }
      }, selector, nth)
      if (!at) return false
      await page.mouse.click(at.x, at.y)
      await sleep(900)
      return true
    }
    const back = () => press("[data-wb-sidebar-panel] button[aria-label='Back']")
    const toList = async () => { for (let i = 0; i < 3 && (await js(() => !!document.querySelector("[data-wb-section-panel]"))); i++) await back() }
    await click(/^Sections$/)
    await sleep(500)
    const section = kind === "imported" ? /^Slideshow/ : /^Accordion FAQ|^FAQ/
    const sectionRow = await js((src) => {
      const re = new RegExp(src, "i")
      const r = [...document.querySelectorAll("[data-section-row]")].find((x) => re.test(x.getAttribute("aria-label") || ""))
      return r ? r.getAttribute("data-section-row") : null
    }, section.source)
    if (!sectionRow) { console.log("    (the section's row was not found)"); return rows }
    /* A section, opened from its row in the list. */
    await press(`[data-section-row="${sectionRow}"]`)
    note(await measure("a section opened from the list"))
    await toList()
    /* Its blocks, shown under it, and the first opened. */
    /* Selecting a section shows its blocks already; pressed only when they are not shown. */
    const expanded = (await js((id) => document.querySelector(`[data-section-expand="${CSS.escape(id)}"]`)?.getAttribute("aria-expanded") === "true", sectionRow)) || (await press(`[data-section-expand="${sectionRow}"]`))
    if (process.env.DEBUG) console.log("    dbg expand", expanded, await js(() => !!document.querySelector("[data-wb-section-panel]")))
    const blockKeys = await js((id) => [...document.querySelectorAll(`[data-section-row-wrap="${CSS.escape(id)}"] [data-tree-block], [data-tree-block]`)].map((r) => r.getAttribute("data-tree-block")), sectionRow)
    if (!blockKeys.length) { console.log("    (no blocks)"); return rows }
    const openBlock = (key) => press(`[data-tree-block="${key}"] > [role=button]`)
    await openBlock(blockKeys[0])
    note(await measure(`block ${blockKeys[0]} opened from the tree`))
    /* Read down to the foot, as somebody would, then back to the list and the next block. */
    await js(() => { const sc = document.querySelector("[data-wb-block-scroll]") || document.querySelector("[data-wb-block-panel] [data-sheet-scroll]"); if (sc) sc.scrollTop = sc.scrollHeight })
    await sleep(300)
    if (blockKeys[1]) {
      await toList()
      if (!(await js((k) => !!document.querySelector(`[data-tree-block="${k}"]`), blockKeys[1]))) await press(`[data-section-expand="${sectionRow}"]`)
      if (process.env.DEBUG) console.log("    dbg second", await js((k) => !!document.querySelector(`[data-tree-block="${k}"]`), blockKeys[1]))
      await openBlock(blockKeys[1])
      note(await measure(`block ${blockKeys[1]} opened after the last was read to its foot`))
    }
    /* A nested block: a block that holds blocks, opened in the tree, and its first child opened. Where the page has one. */
    await toList()
    const keysNow = () => js(() => [...document.querySelectorAll("[data-tree-block]")].map((r) => r.getAttribute("data-tree-block")))
    const parentKey = await js(() => document.querySelector("[data-tree-block] [data-tree-toggle]")?.closest("[data-tree-block]")?.getAttribute("data-tree-block") ?? null)
    if (parentKey) {
      const before = await keysNow()
      await press(`[data-tree-block="${parentKey}"] [data-tree-toggle]`)
      const child = (await keysNow()).find((k) => !before.includes(k))
      if (child) {
        await openBlock(child)
        note(await measure(`nested block ${child} opened from the tree`))
      }
    }
  } finally {
    await close()
  }
  return rows
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const kinds = process.env.THEME ? [process.env.THEME] : ["storelib", "imported"]
  const compat = kinds.includes("imported") ? await importedTheme({ store: true }) : null
  const all = {}
  for (const k of kinds) all[k] = await run(k, bundle, css, compat)
  console.log("\nBUDGETS")
  for (const [k, rows] of Object.entries(all)) {
    expect(rows.length >= 2, `${k}: a section and a block were opened`, rows.map((r) => r.label))
    /* A section's panel starts with what the section holds; a block's with its first field. */
    for (const r of rows) expect(r.panel !== null && r.top === 0 && (r.firstInView || /^a section/.test(r.label)), `${k}: ${r.label} opens at its top`, { top: r.top, room: r.room, first: r.firstInView })
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
