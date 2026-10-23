/**
 * ===========================================================================
 *  EVERY SLIDER SAYS WHAT ITS SCHEMA SAYS, AND THE CANVAS DRAWS IT
 * ===========================================================================
 * The owner, round 1023: "verify sliders still update accurately (values,
 * step, min/max, units) and smoothly" after the editor's load work.
 *
 * The real editor (scripts/canvas-probe-kit.mjs), the Storelib theme's hero
 * selected by a press on it. For each range field of the hero's schema
 * (lib/website-builder/section-schemas.ts), its slider in the sidebar:
 *
 *   BOUNDS     aria-valuemin and aria-valuemax are the field's min and max
 *   VALUE      the value shown (the thumb, and the box beside it with its
 *              unit) is the field's value
 *   KEYS       End takes it to max, Home to min, one Arrow Right one step
 *   CANVAS     the hero's padding in the canvas is the value, in px, after
 *              each (the top and bottom padding sliders)
 *
 * How smoothly a dragged value reaches the canvas is
 * scripts/check-editor-live.mjs.
 *
 *   npx tsx scripts/check-canvas-sliders.mjs
 *   EDITOR_BUNDLE=<file>
 */
import { openEditor, sleep } from "./canvas-probe-kit.mjs"
import { SECTION_SCHEMAS } from "../lib/website-builder/section-schemas.ts"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok) broken++
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const { page, js, close } = await openEditor({ kind: "storelib", bundle, css })
  try {
    console.log("\nSTORELIB THEME: the hero's sliders")
    const at = await js(() => { const el = document.querySelector("#wb-preview-root [data-section-type='hero_centered']"); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 30 } })
    await page.mouse.click(at.x, at.y)
    await sleep(1500)
    const fields = (SECTION_SCHEMAS.hero_centered.fields ?? []).filter((f) => f.type === "range")
    for (const f of fields) {
      const found = await js((label) => {
        const sliders = [...document.querySelectorAll("[data-slot='slider']")].filter((s) => !s.closest("#wb-preview-root") && s.getClientRects().length)
        for (const s of sliders) {
          /* Its own row: the widest ancestor that holds this slider and no other. */
          let row = s
          for (let p = s.parentElement; p && p.querySelectorAll("[data-slot='slider']").length === 1; p = p.parentElement) row = p
          if (!(row.textContent || "").includes(label)) continue
          const thumb = s.querySelector("[data-slot='slider-thumb'], [role='slider']")
          const box = row.querySelector("input[inputmode='numeric']")
          thumb.setAttribute("data-probe-thumb", label)
          return { min: Number(thumb.getAttribute("aria-valuemin")), max: Number(thumb.getAttribute("aria-valuemax")), now: Number(thumb.getAttribute("aria-valuenow")), box: box ? box.value : null }
        }
        return null
      }, f.label)
      if (!found) { expect(false, `${f.label}: a slider in the sidebar`); continue }
      expect(found.min === f.min && found.max === f.max, `${f.label}: min ${f.min} and max ${f.max}, as the schema says`, found)
      expect(found.box === `${found.now}${f.unit ?? ""}`, `${f.label}: the box beside it shows the value with its unit (${f.unit})`, found.box)
      const padding = /padding_(top|bottom)/.exec(f.id)?.[1]
      const canvasPx = () => js((side) => { const s = document.querySelector("#wb-preview-root [data-section-type='hero_centered'] .s"); return s ? parseFloat(getComputedStyle(s)[side === "top" ? "paddingTop" : "paddingBottom"]) : null }, padding)
      const press = async (key) => {
        await js((label) => document.querySelector(`[data-probe-thumb="${label}"]`).focus(), f.label)
        await page.keyboard.press(key)
        await sleep(450)
        return js((label) => { const t = document.querySelector(`[data-probe-thumb="${label}"]`); let row = t; for (let p = t.parentElement; p && p.querySelectorAll("[data-slot='slider']").length <= 1; p = p.parentElement) row = p; return { now: Number(t.getAttribute("aria-valuenow")), box: row?.querySelector("input")?.value ?? null } }, f.label)
      }
      const end = await press("End")
      expect(end.now === f.max && end.box === `${f.max}${f.unit ?? ""}`, `${f.label}: End takes it to ${f.max}`, end)
      if (padding) expect(Math.abs((await canvasPx()) - f.max) < 0.5, `${f.label}: the canvas draws ${f.max}px`, await canvasPx())
      const home = await press("Home")
      expect(home.now === f.min && home.box === `${f.min}${f.unit ?? ""}`, `${f.label}: Home takes it to ${f.min}`, home)
      if (padding) expect(Math.abs((await canvasPx()) - f.min) < 0.5, `${f.label}: the canvas draws ${f.min}px`, await canvasPx())
      const step = await press("ArrowRight")
      expect(step.now === f.min + f.step, `${f.label}: one Arrow Right is one step of ${f.step}`, step)
      if (padding) expect(Math.abs((await canvasPx()) - (f.min + f.step)) < 0.5, `${f.label}: the canvas draws ${f.min + f.step}px`, await canvasPx())
    }
  } finally {
    await close()
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
