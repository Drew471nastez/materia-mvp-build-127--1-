/**
 * ===========================================================================
 *  THE EDITOR'S SHEET IS READ AND PRESSED WITH A THUMB
 * ===========================================================================
 * Every control in it was drawn for the desktop sidebar: 9px labels in
 * capitals, 36px fields, 12px type, a 21px slider thumb, and an empty image
 * box with the aspect of a video — about 200px of dashed nothing in a sheet
 * that shows 500.
 *
 * Measured at 390x844 by scripts/check-sheet-controls.mjs:
 *
 *     text field    44px tall, 16px type
 *     number box    40px tall, 72px wide, 16px type
 *     label         14px
 *     slider        row 44px, track 6px, thumb 28px
 *     image box     56px, hint hidden
 *
 * 44 is the smallest thing a finger hits reliably, and 16 is the size under
 * which iOS zooms the page for a focused field and does not zoom back. Both
 * are why those two numbers and not others.
 *
 * This pins the rules; the probe measures what they produce.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const css = read("app/globals.css")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const sheet = read("components/website-builder/mobile-editor-sheet.tsx")

  /* The whole block, so "scoped to the sheet" can be checked rather than assumed. */
  const start = css.indexOf("THE EDITOR'S SHEET IS READ AND PRESSED WITH A THUMB")
  /**
   * To the end of the `@media` this lives in, found by counting brackets.
   *
   * It used to be "to the end of the file", which was true exactly as long as
   * nothing else was ever appended to globals.css. The first thing appended
   * after it — the panel move in the sheet — was then read as part of this
   * block and judged against rules written for a different thing.
   */
  const block = start < 0 ? "" : (() => {
    const rest = css.slice(start)
    const open = rest.indexOf("{")
    if (open < 0) return rest
    let depth = 0
    for (let i = open; i < rest.length; i++) {
      if (rest[i] === "{") depth++
      else if (rest[i] === "}") { depth--; if (depth === 0) return rest.slice(0, i + 1) }
    }
    return rest
  })()

  console.log("\nSized for a thumb, and only in the sheet")

  check("the block is there", block.length > 0)
  check(
    "it is behind the phone breakpoint",
    /@media \(max-width: 639px\)/.test(block),
    "the sidebar keeps the scale that is right for it",
  )
  check(
    "and every rule is scoped to the sheet",
    (block.match(/^\s{2}\[data-mobile-bottom-sheet\]/gm) ?? []).length >= 8 &&
      !/^\s{2}(input|label|select|textarea)\b/m.test(block),
    "an unscoped rule here reaches the canvas and the site being built",
  )
  check("anything typable is 44 and 16", /min-height: 44px;\s*\n\s*font-size: 16px;/.test(block))
  check("the slider's row is 44, not its track", /min-height: 44px;\s*\n\s*padding-block: 12px;/.test(block))
  check("the thumb is 28", /\[data-slot="slider-thumb"\] \{\s*\n\s*width: 28px;/.test(block))
  check(
    "the image box is a row with a floor, not a height",
    /min-height: 56px;\s*\n\s*flex: none;/.test(block),
    "a flex child with a height and min-height 0 shrinks to its content; the first version measured 36px",
  )
  check(
    "and the drag-and-drop hint is not shown to a thumb",
    /\.wb-dropzone > p \+ p \{[\s\S]{0,40}display: none;/.test(block),
    "the probe reads its computed display; this is only the rule that sets it",
  )
  check("the dropzone carries the class the rules need", /"wb-dropzone relative w-full rounded-lg border-2 border-dashed/.test(editor))

  console.log("\nAnd it answers a finger")

  check(
    "the sheet taps when it opens",
    /if \(open && !wasOpen\.current\) hapticTap\("light"\)/.test(sheet),
  )
  check(
    "on the way in only",
    /wasOpen\.current = open/.test(sheet) && !/hapticTap\("light"\)\s*\n\s*\}\s*\n\s*if \(!open\)/.test(sheet),
    "a sheet closing is the result of something already felt",
  )
  check(
    "a slider ticks once per step crossed, not once per frame",
    /if \(v !== lastHaptic\.current\) \{[\s\S]{0,120}hapticTap\("light"\)/.test(editor),
  )
  check(
    "through the one function that reaches the Taptic Engine",
    /import \{ hapticTap \} from "@\/lib\/native-bridge"/.test(sheet) &&
      /export function hapticTap/.test(read("lib/native-bridge.ts")),
  )

  console.log("\nAnd a gradient is edited, not typed")

  check(
    "a gradient setting opens the gradient editor",
    /kind === "text" && \/gradient\/i\.test/.test(editor) && /<GradientEditor/.test(editor),
    "there is no gradient kind in the schema, so every one of them arrived as a box of CSS",
  )
  check(
    "matched on the field's name, so an empty one gets it too",
    /String\(field\.id \?\? ""\) \+ " " \+ String\(field\.label \?\? ""\)/.test(editor),
    "matching on the value would give the box to the one case that needs the editor most",
  )
  check("and it is the editor the colour schemes already use", /from "@\/components\/website-builder\/editor\/gradient-editor"/.test(editor))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
