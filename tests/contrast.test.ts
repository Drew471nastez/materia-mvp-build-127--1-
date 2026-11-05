/**
 * ===========================================================================
 *  READABLE, AND MEASURED RATHER THAN EYEBALLED
 * ===========================================================================
 * A colour scheme is seventeen values somebody can set to anything. The pair
 * that stops being readable is the one nobody notices, because it looked
 * fine on the screen it was picked on.
 *
 * Three of the five schemes Storelib ships failed this when the arithmetic
 * was first pointed at them: muted text at 3.4, 2.5 and 4.0 to 1 against
 * their own backgrounds, where 4.5 is where small text stops being hard
 * work. That is not a theoretical finding, it is every caption and subtitle
 * on a site using those schemes.
 */
import { DEFAULT_COLOR_SCHEMES, themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import { READ_PAIRS, contrastRatio, parseColor, sayRatio, schemeContrast } from "@/lib/storelib-theme/contrast"
import { ColorsPanel, SectionDesignPanel } from "@/components/website-builder/editor/design-panels"
import { ColorPickerPanel } from "@/components/website-builder/editor/color-chip"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/*
  The scheme dropdown in design-panels.tsx styles its entrance with styled-jsx
  (`<style jsx>`). Next's own types teach TypeScript that attribute; the push
  runner compiles without them, so it is said here, as styled-jsx says it.
*/
declare module "react" {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean
    global?: boolean
  }
}

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol
const ratio = (fg: string, bg: string) => contrastRatio(parseColor(fg)!, parseColor(bg)!)

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The arithmetic, against numbers that are not in dispute")
  // ═══════════════════════════════════════════════════════════════════════
  check("black on white is 21 to 1", near(ratio("#000000", "#ffffff"), 21))
  check("white on white is 1 to 1", near(ratio("#ffffff", "#ffffff"), 1))
  check("and it does not care which way round", near(ratio("#ffffff", "#000000"), 21))
  // The WCAG worked example everybody checks an implementation against.
  check("#777 on white is 4.48, just under AA", near(ratio("#777777", "#ffffff"), 4.48, 0.02))
  check("#767676 on white is 4.54, just over", near(ratio("#767676", "#ffffff"), 4.54, 0.02))
  check("mid grey on black and on white differ", !near(ratio("#808080", "#000000"), ratio("#808080", "#ffffff"), 1))

  section("Every spelling of a colour")
  check("#abc is #aabbcc", near(ratio("#abc", "#fff"), ratio("#aabbcc", "#ffffff")))
  check("rgb() reads the same as hex", near(ratio("rgb(119, 119, 119)", "#ffffff"), ratio("#777777", "#ffffff")))
  check("percentages too", near(ratio("rgb(100%, 100%, 100%)", "#000000"), 21))
  /**
   * Half-transparent text is not the colour it was written as. Compositing
   * it first is the difference between a pass and a fail on exactly the
   * kind of muted text this is meant to catch.
   */
  check("transparent text is composited onto what is behind it", (() => {
    const half = ratio("rgba(0, 0, 0, 0.5)", "#ffffff")
    return half > 1.5 && half < 21 && !near(half, 21, 1)
  })(), "black at 50% over white is mid grey, not black")
  check("what is not a colour reads as not a colour", parseColor("transparent") === null && parseColor("") === null && parseColor("garbage") === null && parseColor(undefined) === null && parseColor("var(--x)") === null)

  // ═══════════════════════════════════════════════════════════════════════
  section("It refuses to guess")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * A false all-clear is worse than no answer, because somebody acts on it.
   * Text over a gradient has no one colour behind it, so the answer is that
   * there is no answer.
   */
  {
    const base = DEFAULT_COLOR_SCHEMES.white
    const grad = schemeContrast({ ...base, gradient: "linear-gradient(#000, #fff)" })
    check("a gradient over the background makes those pairs unmeasurable", grad.unknown.some((p) => p.bg === "background") && grad.failing.every((f) => f.bg !== "background"))
    const clear = schemeContrast({ ...base, primary_button_background: "transparent" })
    check("and so does a colour there is none of", clear.unknown.some((p) => p.bg === "primary_button_background"))
    /**
     * With one exception, because it is not really unknown: a secondary
     * button is transparent on purpose and sits on the section background.
     */
    check("a transparent secondary button is measured against the background", (() => {
      const r = schemeContrast({ ...base, secondary_button_background: "transparent", secondary_button_text: "#eeeeee" })
      return r.failing.some((f) => f.fg === "secondary_button_text") && !r.unknown.some((p) => p.fg === "secondary_button_text")
    })())
    check("an empty scheme finds nothing rather than throwing", schemeContrast(null).failing.length === 0 && schemeContrast({}).failing.length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("It fires on colours built to fail")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const bad = schemeContrast({ ...DEFAULT_COLOR_SCHEMES.white, text: "#cccccc", background: "#ffffff" })
    check("light grey body text on white is caught", bad.failing.some((f) => f.fg === "text" && f.ratio < 2))
    const worst = schemeContrast({
      ...DEFAULT_COLOR_SCHEMES.white,
      text: "#f5f5f5", text_muted: "#f0f0f0", heading: "#fafafa", link: "#eeeeee",
      primary_button_text: "#ffffff", primary_button_background: "#fefefe",
      secondary_button_text: "#ffffff", secondary_button_background: "#ffffff",
      input_text: "#ffffff", input_background: "#ffffff",
    })
    check("a scheme of whites on white fails every pair it reads", worst.failing.length === READ_PAIRS.length, `${worst.failing.length} of ${READ_PAIRS.length}`)
    check("and the worst one is reported first", (() => {
      for (let i = 1; i < worst.failing.length; i++) {
        const a = worst.failing[i - 1], b = worst.failing[i]
        if (a.ratio / a.need > b.ratio / b.need + 0.001) return false
      }
      return true
    })())
    check("a heading is held to 3, not 4.5, because a heading is large", (() => {
      const r = schemeContrast({ ...DEFAULT_COLOR_SCHEMES.white, heading: "#949494", background: "#ffffff" })
      const got = ratio("#949494", "#ffffff")
      return got > 3 && got < 4.5 && !r.failing.some((f) => f.fg === "heading")
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every scheme Storelib ships is readable")
  // ═══════════════════════════════════════════════════════════════════════
  for (const [key, scheme] of Object.entries(DEFAULT_COLOR_SCHEMES)) {
    const r = schemeContrast(scheme)
    check(
      `${scheme.name} (${key})`,
      r.failing.length === 0,
      r.failing.map((f) => `${f.label}: ${sayRatio(f.ratio)}, needs ${f.need} to 1`).join("; "),
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("And the editor shows none of it")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * The ratio rows under a scheme (Text 6.7:1, Headings 21.0:1 ...) and the
   * "Hard to read" list were more than somebody choosing a colour needs.
   * The owner asked for both gone, and the colour picker's ratio line with
   * them. The arithmetic above stays, because it is what keeps every scheme
   * Storelib ships readable; the person editing sees no number and no warning.
   *
   * Rendered, not only read: the Colors panel is drawn with a scheme built
   * to fail (light grey text on white), which is exactly when the old panel
   * spoke, and the markup is searched for anything it used to say.
   */
  {
    const said = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    const RATIO = /\d+(?:\.\d+)?\s*(?::|to)\s*1\b/i
    const WORDS = /hard to read|not measured|large text only|it needs|contrast/i
    const failing = { color_schemes: { white: { text: "#dddddd", text_muted: "#eeeeee", link: "#e0e0e0" } } } as unknown as ThemeSettingsValues
    const drawn = themeColorSchemes(failing as unknown as Record<string, unknown>).white
    check("the scheme drawn really is one the old panel warned about", schemeContrast(drawn).failing.length >= 2)
    const colors = renderToStaticMarkup(
      createElement(ColorsPanel, { theme: failing, updateSetting: () => {}, onRemapSections: () => {}, initialActive: "white" }),
    )
    check("the Colors panel draws the scheme it is editing",
      /Default for new sections/.test(colors) && colors.includes(`value="${drawn.name}"`), said(colors).slice(0, 200))
    check("with no ratio in it", !RATIO.test(said(colors)), said(colors).match(RATIO)?.[0])
    check("and no warning", !WORDS.test(said(colors)), said(colors).match(WORDS)?.[0])
    const section = renderToStaticMarkup(
      createElement(SectionDesignPanel, {
        section: { id: "s1", type: "text_rich", name: "Text", settings: { color_scheme: "white" }, blocks: [] },
        schema: { fields: [{ id: "color_scheme", type: "color_scheme", label: "Color scheme" }] },
        theme: failing,
        onUpdateSetting: () => {},
      } as unknown as Parameters<typeof SectionDesignPanel>[0]),
    )
    check("a section's colour scheme says nothing about contrast either",
      /Color scheme/.test(section) && !RATIO.test(said(section)) && !WORDS.test(said(section)), said(section).slice(0, 200))
    const picker = renderToStaticMarkup(createElement(ColorPickerPanel, { value: "#dddddd", onChange: () => {}, existing: [] }))
    check("nor does the colour picker", picker.length > 0 && !RATIO.test(said(picker)) && !WORDS.test(said(picker)), said(picker).slice(0, 200))

    const panel = readFileSync(join(process.cwd(), "components/website-builder/editor/design-panels.tsx"), "utf8")
    const chip = readFileSync(join(process.cwd(), "components/website-builder/editor/color-chip.tsx"), "utf8")
    const editor = readFileSync(join(process.cwd(), "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
    const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    check("the design panels do not measure a scheme at all",
      !/storelib-theme\/contrast/.test(panel) && !/schemeContrast|sayRatio|contrastRatio/.test(code(panel)))
    check("nothing in the sidebar's code says it", [panel, chip, editor].every((t) => !/Hard to read|to 1 it needs|data-contrast/.test(code(t))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
