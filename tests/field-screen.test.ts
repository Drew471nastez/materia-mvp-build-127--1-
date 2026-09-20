/**
 * ===========================================================================
 *  A PICKER INSIDE A BOTTOM SHEET MUST NOT BE IN THE SHEET'S FLOW
 * ===========================================================================
 * FieldPopover opens in flow, which is right in a sidebar: the settings below
 * move down, nothing has to be measured against the viewport, and it cannot
 * be clipped. In the editor's phone sheet it is the bug. The sheet measures
 * its own content to choose a detent, so a panel opening inside it changes
 * the number the sheet is reading.
 *
 * Measured, at 390x844, with scripts/check-field-screen.mjs:
 *
 *     in flow     sheet content 68px -> 427px on open, and the list,
 *                 the search box and the address box all unreachable
 *     a screen    sheet content 68px -> 68px, a 466px sheet of its own
 *                 portalled to the body, every control topmost at its
 *                 own centre
 *
 * This pins the shape of that; the probe measures the result.
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
  const popover = read("components/website-builder/field-popover.tsx")
  const css = read("app/globals.css")

  console.log("\nOn a phone the panel is a screen")

  check(
    "the phone breakpoint is the editor's own",
    /const PHONE_MAX_WIDTH = 639/.test(popover) &&
      /window\.innerWidth < 640/.test(read("app/website-builder/editor/[installId]/page.tsx")),
    "two different breakpoints would leave a width where the sheet is on and the screen is not",
  )
  check(
    "it is the editor's own sheet, not one that looks like it",
    /<MobileEditorSheet open=\{open\} onOpenChange=\{onOpenChange\} layer="raised"/.test(popover),
    "a hand-drawn panel has no slide, no grabber and a header of its own invention",
  )
  check(
    "on the layer that sheet keeps for one opened from another",
    /layer="raised"/.test(popover) && /zIndex: layer === "raised" \? 80 : 50/.test(read("components/website-builder/mobile-editor-sheet.tsx")),
  )
  check(
    "and the in-flow panel does not also open there",
    /\{open && !phone && \(/.test(popover),
  )

  console.log("\nAnd it reads as a screen, with a way back")

  /* The editor's own panel header: an arrow, a name, a hairline under it.
     The same row that sits at the top of Header Settings. */
  check("there is a back control", /aria-label="Back"/.test(popover) && /<ArrowLeft className="h-4 w-4" \/>/.test(popover))
  check("and a title beside it, not centred over it", /<span className="text-sm font-semibold">\{title \?\? "Choose"\}<\/span>/.test(popover))
  check(
    "both pickers name their own screen",
    /title="Link"/.test(read("components/website-builder/link-picker.tsx")) &&
      /title="Icon"/.test(read("components/website-builder/icon-picker.tsx")),
  )
  check(
    "the header matches the one the editor's panels use",
    /flex shrink-0 items-center gap-2 border-b border-border px-4 py-3/.test(popover) &&
      /px-4 py-3 border-b border-border flex items-center gap-2 shrink-0/.test(read("app/website-builder/editor/[installId]/page.tsx")),
    "two spellings of the same row is how two panels stop looking like one product",
  )
  check(
    "the rows take the sheet's scale rather than the sidebar's",
    /\.wb-field-screen \[data-sheet-scroll\] button/.test(css) && /font-size: 15px/.test(css),
  )

  check(
    "the list fills the screen instead of keeping its sidebar cap",
    /\.wb-field-screen > \[data-sheet-scroll\]/.test(css) && /max-height: none/.test(css),
  )
  check(
    "and it is still capped in the sidebar",
    /max-h-\[240px\]/.test(read("components/website-builder/link-picker.tsx")),
    "on a desktop the settings under the field have to stay in view",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
