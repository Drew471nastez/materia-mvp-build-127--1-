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
    "it is a portal to the body, not a child of the sheet",
    /createPortal\(/.test(popover) && /document\.body,/.test(popover),
    "a child of the sheet is content the sheet measures, which is the whole bug",
  )
  check(
    "and the in-flow panel does not also open there",
    /\{open && !phone && \(/.test(popover),
  )
  check(
    "it clears the editor sheet's own layers",
    /z-\[100\]/.test(popover) && /zIndex: layer === "raised" \? 80 : 50/.test(read("components/website-builder/mobile-editor-sheet.tsx")),
    "the sheet draws its surface at 80 when raised",
  )

  console.log("\nAnd it reads as a screen, with a way back")

  check("there is a back control", /aria-label="Back"/.test(popover))
  check("and a title over it", /\{title \?\? "Choose"\}/.test(popover))
  check(
    "both pickers name their own screen",
    /title="Link"/.test(read("components/website-builder/link-picker.tsx")) &&
      /title="Icon"/.test(read("components/website-builder/icon-picker.tsx")),
  )
  check(
    "pressing the backdrop closes it",
    /aria-label="Close"[\s\S]{0,120}onOpenChange\(false\)/.test(popover),
  )
  check(
    "a press inside it is not mistaken for a press outside",
    /closest\?\.\("\[data-field-screen\]"\)/.test(popover),
    "the portal is not inside the popover's root, so the outside-press rule would close it on every tap",
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
