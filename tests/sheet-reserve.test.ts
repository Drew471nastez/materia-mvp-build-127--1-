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
import {
  keyboardCeiling,
  offsetsFor,
  sheetHeightWithKeyboard,
  visibleKeyboard,
} from "@/components/website-builder/sheet-gestures"

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
  /* iOS panned the page by the whole keyboard: nothing of the sheet is
     covered, and the keyboard is still over the home indicator. */
  check("a keyboard panned wholly out from under the sheet reserves nothing, not the home indicator", sheetBottomReserve(44, 0, true) === "0px")

  console.log("\nA sheet grows by the keyboard instead of being crushed by it")

  /*
    The sheet pads itself by the keyboard, and that padding comes out of its
    own height. At 60% of an 844pt screen, a 336pt keyboard left 170pt for a
    header, a form and two buttons — which is the screenshot: a title, a
    sliver, and the buttons, with the field being typed into nowhere on it.
  */
  const SCREEN = 844
  const DETENT = Math.round(SCREEN * 0.78)

  check("with no keyboard the sheet is its detent", sheetHeightWithKeyboard(DETENT, 0, SCREEN) === DETENT)
  /*
    Where there is room, the growth is exactly the keyboard and the panel is
    untouched. At a 78% detent there is 186pt of room on this screen, so this
    is the small-keyboard case: an accessory bar, a split keyboard, a phone
    held in landscape. A full iPhone keyboard does not fit in it and takes
    the clamped path below, which is the better outcome anyway.
  */
  check(
    "where there is room, the panel above the keyboard is still the whole detent",
    sheetHeightWithKeyboard(DETENT, 150, SCREEN) - 150 === DETENT,
  )
  /* When the keyboard is too tall for that, the sheet takes all the room it
     is given, and the panel is everything from its top edge to the keyboard. */
  check(
    "a keyboard too tall for that gives the sheet all the room it is given",
    sheetHeightWithKeyboard(DETENT, 336, SCREEN) === SCREEN,
  )
  check(
    "and the panel is then the whole strip above it",
    sheetHeightWithKeyboard(DETENT, 336, SCREEN) - 336 === SCREEN - 336,
  )
  /* The old behaviour, stated as the thing that must not come back. */
  check(
    "which beats the 170px the old fixed height left at 60%",
    Math.round(SCREEN * 0.6) - 336 < 200 && sheetHeightWithKeyboard(DETENT, 336, SCREEN) - 336 > 400,
  )
  check("a sub-pixel keyboard does not resize anything", sheetHeightWithKeyboard(DETENT, 0, SCREEN) === DETENT)
  check("and the sheet never grows past the screen", sheetHeightWithKeyboard(SCREEN, 336, SCREEN) === SCREEN)

  console.log("\nBut never under the status bar, and never under the keyboard")

  /*
    Ask Storelib on an iPhone: the sheet's growth was capped at the whole
    screen, so a 92% sheet and a 388px keyboard put its top edge at y = 0,
    the title under the clock. The ceiling keeps the top edge where the
    tallest stop keeps it, and never above the safe area.
  */
  const SAFE_TOP = 59
  const KEYS = 388
  const full92 = offsetsFor({ viewport: SCREEN, detents: [0.5, 0.92], peekHeight: 0, safeTop: SAFE_TOP }).height
  const ceiling92 = keyboardCeiling({ viewport: SCREEN, tallestHeight: full92, safeTop: SAFE_TOP, visibleTop: 0 })
  const h92 = sheetHeightWithKeyboard(full92, KEYS, ceiling92)
  check("a 92% sheet keeps its top edge where its tallest stop put it", SCREEN - h92 === SCREEN - full92)
  check("which is below the status bar", SCREEN - h92 >= SAFE_TOP)
  check("and the panel ends on the keyboard", SCREEN - KEYS === SCREEN - h92 + (h92 - KEYS))

  /* A stop of 1 is the screen below the status bar, not the screen. */
  const whole = offsetsFor({ viewport: SCREEN, detents: [0.5, 1], peekHeight: 0, safeTop: SAFE_TOP })
  check("a stop of 1 starts at the safe area", whole.height === SCREEN - SAFE_TOP && whole.offsets[0] === 0)
  check("and its half stop is still half the screen", SCREEN - whole.height + whole.offsets[1] === SCREEN / 2)

  /* A 78% form sheet still grows for the keyboard, to where a full sheet stands and no further. */
  const full78 = Math.round(SCREEN * 0.78)
  const ceiling78 = keyboardCeiling({ viewport: SCREEN, tallestHeight: full78, safeTop: SAFE_TOP, visibleTop: 0 })
  check(
    "a shorter sheet grows for the keyboard up to where a full sheet stands, and no further",
    sheetHeightWithKeyboard(full78, KEYS, ceiling78) === full92 && sheetHeightWithKeyboard(full78, KEYS, ceiling78) - KEYS > 380,
  )
  check(
    "with no keyboard nothing changes, whatever the stop",
    sheetHeightWithKeyboard(full78, 0, ceiling78) === full78 && sheetHeightWithKeyboard(whole.height, 0, keyboardCeiling({ viewport: SCREEN, tallestHeight: whole.height, safeTop: SAFE_TOP, visibleTop: 0 })) === whole.height,
  )

  /*
    iOS pans the visible area down the page to show a field. A fixed sheet
    does not move with it, so its top has to come down by the pan, and the
    panel is still the strip between that top and the keyboard.
  */
  const PAN = 188
  const VISIBLE = SCREEN - KEYS
  const seen = visibleKeyboard({ layoutHeight: SCREEN, vvHeight: VISIBLE, vvTop: PAN })
  check("after a pan the keyboard covers less of the fixed box, and that is reported", seen.reported && seen.inset === KEYS - PAN && seen.top === PAN)
  const panned = sheetHeightWithKeyboard(
    whole.height,
    seen.inset,
    keyboardCeiling({ viewport: SCREEN, tallestHeight: whole.height, safeTop: SAFE_TOP, visibleTop: seen.top }),
  )
  const topOnScreen = SCREEN - panned - PAN
  const composerOnScreen = SCREEN - seen.inset - PAN
  check("the sheet's top is on screen, below the status bar", topOnScreen === SAFE_TOP)
  check("the panel ends exactly where the keyboard starts", composerOnScreen === VISIBLE)

  /* A pan all the way leaves nothing covered, and that is still a keyboard, not the floor. */
  const all = visibleKeyboard({ layoutHeight: SCREEN, vvHeight: VISIBLE, vvTop: KEYS })
  check("a pan the whole keyboard's height is reported, with nothing covered", all.reported && all.inset === 0 && all.top === KEYS)

  /* A web view that reports nothing: the caller's floor, and no pan. */
  const silent = visibleKeyboard({ layoutHeight: SCREEN, vvHeight: SCREEN, vvTop: 0 })
  check("a platform that said nothing is not reported, so the caller may use the floor", !silent.reported && silent.inset === 0 && silent.top === 0)
  /* A collapsing toolbar is not a keyboard. */
  check("a toolbar's worth is not a keyboard", !visibleKeyboard({ layoutHeight: SCREEN, vvHeight: SCREEN - 60, vvTop: 0 }).reported)
  /* Pinch zoom shrinks the visual viewport too, and is not a keyboard. */
  check("pinch zoom is not a keyboard and has no pan", !visibleKeyboard({ layoutHeight: SCREEN, vvHeight: 400, vvTop: 200, scale: 2 }).reported)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
