/**
 * ===========================================================================
 *  A SETTING THAT CAN BE DIFFERENT ON A PHONE
 * ===========================================================================
 * `"responsive": true` was a half-built feature. The validator accepted it,
 * seven shipped sections declared it, and the templates read
 * `settings.columns.desktop` — but the flag was dropped on the way to the
 * editor's schema, so the editor drew one control and the only way to give a
 * phone its own number was to open the file and type JSON.
 *
 * Nobody did, so every grid shipped with its desktop column count on a
 * phone. Measured in Chromium at 390px, that was a product card 93px wide.
 *
 * Fixing the defaults then found the second half of it: `fillResponsive` had
 * never been written for a default that is itself per breakpoint, and gave
 * back the whole object at every breakpoint. A template writing that into a
 * custom property produces `--cols-d: {"desktop":3,…}`, which resolves to
 * ONE track rather than to `none`, so the grid collapses to a single column
 * and looks like a section behaving beautifully on a phone.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fillResponsive, stripDefaults } from "@/lib/storelib-theme/resolve"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { controlFor } from "@/lib/storelib-theme/controls/registry"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const j = (x: unknown) => JSON.stringify(x)

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("A default may itself be per breakpoint")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const D = { desktop: 3, tablet: 2, mobile: 1 }
    /**
     * The one that was wrong, and the one that matters most: a section
     * nobody has touched. Every real page is in this state.
     */
    check("nothing saved gives each breakpoint its own default", j(fillResponsive(undefined, D)) === j(D))
    check("and never the whole object at every breakpoint", (() => {
      const r = fillResponsive(undefined, D) as unknown as Record<string, unknown>
      return typeof r.desktop === "number" && typeof r.tablet === "number" && typeof r.mobile === "number"
    })(), "this is what put `--cols-d: {\"desktop\":3,…}` into a stylesheet")

    check("a scalar default still fills every breakpoint", j(fillResponsive(undefined, 3)) === j({ desktop: 3, tablet: 3, mobile: 3 }))
    check("a partial default fills downwards too", j(fillResponsive(undefined, { desktop: 4 })) === j({ desktop: 4, tablet: 4, mobile: 4 }))
    check("and a gap in the middle", j(fillResponsive(undefined, { desktop: 4, mobile: 1 })) === j({ desktop: 4, tablet: 4, mobile: 1 }))

    section("What somebody sets still wins, and still carries down")
    check("a value set only on the desktop reaches the phone", j(fillResponsive({ desktop: 4 }, D)) === j({ desktop: 4, tablet: 4, mobile: 4 }))
    check("a value set only on the phone leaves the rest alone", j(fillResponsive({ mobile: 2 }, D)) === j({ desktop: 3, tablet: 2, mobile: 2 }))
    check("a scalar means the same everywhere", j(fillResponsive(5, D)) === j({ desktop: 5, tablet: 5, mobile: 5 }))
    check("zero is a value, not an absence", j(fillResponsive({ mobile: 0 }, D)) === j({ desktop: 3, tablet: 2, mobile: 0 }))
    check("and so is an empty string", j(fillResponsive({ mobile: "" }, { desktop: "left" })) === j({ desktop: "left", tablet: "left", mobile: "" }))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Saving drops what is only the default")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const defs = [{ id: "columns", type: "range", label: "Columns", responsive: true, default: { desktop: 3, tablet: 2, mobile: 1 } }] as never
    check("the default, written out in full, is not stored", j(stripDefaults(defs, { columns: { desktop: 3, tablet: 2, mobile: 1 } })) === "{}")
    check("a changed phone value is", j(stripDefaults(defs, { columns: { desktop: 3, tablet: 2, mobile: 2 } })) === j({ columns: { desktop: 3, tablet: 2, mobile: 2 } }))
    check("and three that agree collapse back to one number", j(stripDefaults(defs, { columns: { desktop: 2, tablet: 2, mobile: 2 } })) === j({ columns: 2 }))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every shipped grid gives a phone fewer columns than a desktop")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * The arithmetic half of scripts/check-columns.mjs, which lays the same
   * sections out in Chromium and measures the cards. This runs on every
   * push; that one needs a build and a browser.
   */
  {
    const grids = ["features_grid", "features_cards", "proof_testimonials", "product_grid", "product_featured", "media_gallery", "text_columns"]
    for (const type of grids) {
      const schema = SECTION_SCHEMAS[type]
      const f = (schema?.fields ?? []).find((x) => x.id === "columns")
      const filled = fillResponsive(undefined, f?.default) as { desktop: number; tablet: number; mobile: number }
      check(
        `${type}: ${filled.desktop} across, ${filled.tablet} on a tablet, ${filled.mobile} on a phone`,
        !!f && f.responsive === true && filled.mobile < filled.desktop && filled.mobile >= 1 && Number.isInteger(filled.mobile),
        f ? `responsive=${f.responsive} default=${j(f.default)}` : "no columns setting",
      )
    }
    /** Two presets pin a column count of their own and must do it in full. */
    check("a preset that sets its own columns sets all three", (() => {
      for (const type of grids) {
        for (const p of SECTION_SCHEMAS[type]?.presets ?? []) {
          const v = (p.settings as Record<string, unknown> | undefined)?.columns
          if (v === undefined) continue
          const r = fillResponsive(v, undefined) as { desktop: number; mobile: number }
          if (!(r.mobile < r.desktop)) return false
        }
      }
      return true
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("And the editor can set it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    const types = read("lib/website-builder/types.ts")
    const conv = read("lib/website-builder/storelib-schemas.ts")

    check("the flag survives the trip to the editor's schema", /responsive\?: boolean/.test(types) && /if \(s\.responsive\) f\.responsive = true/.test(conv))
    check("a responsive setting gets the breakpoint switch", /if \(field\.responsive && controlFor\(field\.type\)\?\.responsive\) \{/.test(editor))
    check("the registry decides which controls may be responsive, not the schema", /controlFor\(field\.type\)\?\.responsive/.test(editor))
    /**
     * The two ways this goes wrong on its own: recursing forever, and
     * changing hook order between a responsive field and an ordinary one.
     */
    check("it does not recurse into itself", /field=\{\{ \.\.\.field, responsive: false \}\}/.test(editor))
    check("and the early return is below every hook", (() => {
      const start = editor.indexOf("function FieldEditor({")
      const hook = editor.indexOf("const targets = useLinkTargets()", start)
      const ret = editor.indexOf("if (field.responsive && controlFor(field.type)?.responsive)", start)
      return hook > start && ret > hook
    })())
    check("the switch shows the value that would apply, not the default", /const parts = fillResponsive\(value, field\.default\)/.test(editor))
    check("three that agree are stored as one number", /const same = next\.desktop === next\.tablet && next\.tablet === next\.mobile/.test(editor))
    check("the screens are named for screens", /\{ id: "desktop", label: "Desktop" \}/.test(editor) && /\{ id: "mobile", label: "Phone" \}/.test(editor))

    /** Which controls can hold one value per breakpoint is the registry's call. */
    const responsiveControls = ["range", "number", "alignment"].filter((t) => controlFor(t)?.responsive)
    check("range, number and alignment are the responsive controls", responsiveControls.length === 3)
    check("and an image picker is not", controlFor("image_picker")?.responsive === false)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
