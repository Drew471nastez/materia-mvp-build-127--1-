/**
 * ===========================================================================
 *  "I CANNOT SELECT ANYTHING" WAS THE KEYBOARD, AND THE SHEET'S MIDDLE STOP
 * ===========================================================================
 * Reported three times, and the panel was opening correctly every time. Two
 * things were in front of it.
 *
 * THE KEYBOARD. Both pickers autofocus their search box, which is right at a
 * keyboard and wrong at a thumb: in a bottom sheet the keyboard comes up over
 * the list that has just opened below the field, so the only thing left on
 * screen is the field you already had.
 *
 * AND THE DETENT. The sheet opens at its middle stop, which is right for a
 * list of settings you scroll. Measured at 390x844 with the link field
 * scrolled to the centre of the panel, the sheet ran 379..1075 in a 757px
 * window and every row of the list sat past 834 — below the bottom of the
 * screen, with nothing to tap.
 *
 *     before   focused input:"Search pages and pro", rows 834..960
 *     after    focused body, rows 516..642, each topmost at its own centre
 *
 * scripts/check-field-panel.mjs is where those numbers come from.
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
  const sheet = read("components/website-builder/mobile-editor-sheet.tsx")
  const link = read("components/website-builder/link-picker.tsx")
  const icon = read("components/website-builder/icon-picker.tsx")

  console.log("\nNothing takes the keyboard at a thumb")

  check(
    "the phone breakpoint is the editor's own",
    /const PHONE_MAX_WIDTH = 639/.test(popover) &&
      /const PHONE_QUERY = "\(max-width: 639px\)"/.test(read("components/website-builder/editor/section-library.tsx")),
    "two different breakpoints leave a width where the sheet is on and this is not",
  )
  check(
    "both pickers ask before they focus",
    /if \(!phone && !focused\) \{[\s\S]{0,120}inputRef\.current\?\.focus\(\{ preventScroll: true \}\)/.test(link) &&
      /if \(!phone\) setOpen\(true\)/.test(link) &&
      !/autoFocus/.test(link) &&
      /autoFocus=\{!phone\}/.test(icon),
    "an autofocus in a bottom sheet raises the keyboard over the list it just opened",
  )
  check(
    "and both read it from the one place",
    /usePhoneLayout\(\)/.test(link) && /usePhoneLayout\(\)/.test(icon) && /export function usePhoneLayout/.test(popover),
  )

  console.log("\nAnd the sheet gives the panel room")

  check(
    "a control can ask the sheet for its full height",
    /export function useSheetExpand/.test(sheet) &&
      /const lifted = expanders\.length > 0 \|\| keyboardHere/.test(sheet) &&
      /openFull \|\| lifted \? offsets\[0\]/.test(sheet),
  )
  check(
    "the picker asks while it is open and gives it back when it closes",
    /if \(open\) sheet\.expand\(expandId\)/.test(popover) && /return \(\) => sheet\.release\(expandId\)/.test(popover),
  )
  check(
    "ids rather than a flag, so two fields mid-transition cannot undo each other",
    /expand: \(id\) => setExpanders/.test(sheet) && /release: \(id\) => setExpanders/.test(sheet),
  )
  /**
   * The rule that cost an afternoon: an updater runs in the RENDER phase, so
   * a `setState` or a timer inside one is a state update during render and
   * React 19 abandons the tree — the sheet drew as an empty strip with none
   * of the panel in it.
   */
  const updaters: string[] = sheet.match(/setExpanders\(\(list\) => [^)]*\)/g) ?? []
  check("the expand updaters are pure", updaters.length === 2, updaters.join(" | "))
  check(
    "and nothing sets state inside one",
    updaters.every((u) => !/set[A-Z]/.test(u.replace("setExpanders", ""))),
    "a state update inside an updater is an update during render",
  )
  check(
    "a sheet that closes owes nobody a height",
    /if \(!open\) \{\s*\n\s*setExpanders\(\[\]\)/.test(sheet),
    "it forgets where it was dragged to on the same line now, which is the same rule",
  )
  check(
    "and the panel scrolls itself into view, in its own scroller only",
    /el\?\.closest\("\[data-sheet-scroll\], \[data-wb-sidebar-scroll\]"\)/.test(popover) &&
      /scroller\.scrollBy\(\{ top: delta, behavior: "smooth" \}\)/.test(popover) &&
      !/scrollIntoView\(/.test(popover.replace(/\/\*[\s\S]*?\*\//g, "")),
  )

  console.log("\nAnd the sheet is still a sheet")

  const surface = sheet.slice(sheet.indexOf("data-mobile-bottom-sheet="), sheet.indexOf("data-mobile-bottom-sheet=") + 1400)
  check("its surface is still fixed", /"fixed left-0 right-0 bottom-0/.test(surface))
  check(
    "and nothing else sets a position on it",
    !/"relative",/.test(surface) && !/"absolute",/.test(surface),
    "cn is tailwind-merge: a second position utility wins and the sheet stops being a sheet",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
