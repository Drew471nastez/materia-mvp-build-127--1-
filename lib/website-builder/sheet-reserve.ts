/**
 * ===========================================================================
 *  WHAT IS UNDER A SHEET THAT SITS ON THE BOTTOM OF THE SCREEN
 * ===========================================================================
 * A bottom sheet is `fixed bottom-0`, so its last row — Cancel and Save —
 * ends up under whatever the browser or the device has put there. The sheet
 * pads itself by that much so the buttons stay reachable.
 *
 * There are three candidates and they were being added together:
 *
 *   the home indicator      env(safe-area-inset-bottom)
 *   the browser's toolbar   chromeGap
 *   the keyboard            keyboardInset
 *
 * WITH A KEYBOARD UP THERE IS ONLY ONE. The keyboard is drawn over the home
 * indicator and over the toolbar — iOS hides the toolbar entirely while
 * typing — so reserving all three reserves the same strip up to three times.
 * What a creator sees is Cancel and Save lifted well clear of the keyboard
 * with a band of empty sheet underneath them, which is what the strip of
 * white in the report was.
 *
 * This is the same mistake the file's own comment describes between
 * `chromeGap` and `keyboardInset`, and it was fixed there by freezing the
 * gap. Freezing was the right call for the gap's OTHER job — it feeds the
 * sheet's geometry, and a gap that moved with the keyboard would resize every
 * detent on focus — but a frozen value is still a value, and it was still
 * being added.
 *
 * `keyboardUp` is for a keyboard that covers NOTHING of the sheet: iOS can
 * pan the page down by the whole keyboard to show a field, and then the
 * bottom of the fixed box is the top of the keys. The keyboard is still over
 * the home indicator, so the indicator is still not reserved: 0 is.
 *
 * Returns a CSS length for `padding-bottom`.
 */
export function sheetBottomReserve(chromeGap: number, keyboardInset: number, keyboardUp = false): string {
  if (keyboardInset > 0 || keyboardUp) return `${Math.max(0, keyboardInset)}px`
  return `calc(env(safe-area-inset-bottom, 0px) + ${chromeGap}px)`
}
