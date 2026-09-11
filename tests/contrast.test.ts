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
import { DEFAULT_COLOR_SCHEMES } from "@/lib/storelib-theme/color-schemes"
import { READ_PAIRS, contrastRatio, parseColor, sayRatio, schemeContrast } from "@/lib/storelib-theme/contrast"
import { readFileSync } from "node:fs"
import { join } from "node:path"

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
  section("And the editor says so where the colours are chosen")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const panel = readFileSync(join(process.cwd(), "components/website-builder/editor/design-panels.tsx"), "utf8")
    check("the Colors panel measures the scheme it is editing", /const contrast = schemeContrast\(current\)/.test(panel))
    check("and names the pair and the number, not a grade", /\{f\.label\} is \{sayRatio\(f\.ratio\)\}/.test(panel))
    /**
     * A note, not a block. Somebody may have a reason, and a scheme the
     * editor refuses to save is worse than one it has an opinion about.
     */
    check("it does not refuse to save", !/disabled=\{contrast/.test(panel) && !/contrast\.failing\.length > 0 \|\|/.test(panel))
    check("it says nothing when there is nothing to say", /contrast\.failing\.length > 0 && \(/.test(panel))
    check("and admits when a gradient makes it unmeasurable", /A gradient sits over the background/.test(panel))
    check("no em dashes in what it says", !/—/.test(panel.slice(panel.indexOf("const contrast = schemeContrast"), panel.indexOf("const contrast = schemeContrast") + 2000).replace(/\/\*[\s\S]*?\*\//g, "")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
