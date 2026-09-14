/**
 * ===========================================================================
 *  A BOTTOM SHEET RESERVES WHAT IS UNDER IT, ONCE
 * ===========================================================================
 * The creator page's editors are bottom sheets, and opening the keyboard
 * lifted Cancel and Save well clear of it with a band of empty sheet
 * underneath. The sheet was reserving the home indicator, the browser's
 * toolbar and the keyboard at the same time, when with a keyboard up the
 * keyboard is drawn over the other two.
 *
 * This tests the expression the component actually calls, rather than reading
 * the file for a string. It is not a device measurement, and it does not
 * claim to be one: iOS is not reproducible here, and what is checked is that
 * the arithmetic the sheet does is the arithmetic it should do.
 */
import { sheetBottomReserve } from "@/lib/website-builder/sheet-reserve"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}

function main() {
  console.log("\nA bottom sheet reserves what is under it, once")

  /* No keyboard: the home indicator and the browser's bar are what is there. */
  check(
    "with no keyboard it reserves the home indicator and the browser's bar",
    sheetBottomReserve(44, 0) === "calc(env(safe-area-inset-bottom, 0px) + 44px)",
  )
  check(
    "and on a browser with neither, nothing",
    sheetBottomReserve(0, 0) === "calc(env(safe-area-inset-bottom, 0px) + 0px)",
  )

  /*
    Keyboard up: the keyboard covers both of the others, so it is the whole
    reserve. The old expression returned the SUM, and that sum is the band of
    empty sheet that appeared under Cancel and Save.
  */
  check("with a keyboard up it reserves the keyboard", sheetBottomReserve(0, 336) === "336px")
  check(
    "and still only the keyboard when a toolbar was measured before it opened",
    sheetBottomReserve(44, 336) === "336px",
  )
  check(
    "which is 44px lower than the old sum would have put the buttons",
    sheetBottomReserve(44, 336) !== `calc(env(safe-area-inset-bottom, 0px) + ${44 + 336}px)`,
  )
  /* No env() while a keyboard is up: the home indicator is behind it. */
  check("and reserves no home indicator behind the keyboard", !sheetBottomReserve(44, 336).includes("safe-area"))

  /* A sub-pixel keyboard is a rounding artefact, not a keyboard. */
  check("a zero keyboard is not a keyboard", sheetBottomReserve(12, 0).includes("safe-area"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
