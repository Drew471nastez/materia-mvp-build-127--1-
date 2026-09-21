/**
 * ===========================================================================
 *  A BOTTOM SHEET SITS ON THE KEYBOARD, NOT UNDER IT
 * ===========================================================================
 * Reported from the one-page editor: open a sheet to type a social link and
 * the keyboard covers the field, so you cannot see what you are writing.
 *
 * Every sheet in the editor was written the same way, and the way is wrong on
 * a phone:
 *
 *     position: fixed, bottom: 0, maxHeight: "75vh"
 *
 * A fixed element is laid out against the LAYOUT viewport. On iOS the
 * keyboard does not shrink that — it shrinks the VISUAL viewport, the part
 * you can see. So `bottom: 0` is the bottom of a screen the keyboard is
 * sitting on top of, and `75vh` is 75% of a height that never changed. The
 * sheet keeps its full size, in its original place, with its lower half
 * behind the keys.
 *
 * `--kb-inset` and `--vv-h` are published on <html> by ViewportVars, which is
 * mounted once in the root layout, so they are available to every sheet in
 * the app without anything being wired up.
 *
 *   --kb-inset   what is hidden below the visible area, in the same
 *                coordinates a fixed element is positioned in
 *   --vv-h       the height of what is actually on screen
 *
 * WHY A HELPER RATHER THAN A CLASS. These sheets set `bottom` and `maxHeight`
 * as INLINE styles, and an inline style beats a class silently — a
 * `.sheet-above-keyboard` rule would look correct in the stylesheet and do
 * nothing in the page. Spreading an object is the one form that cannot lose
 * that argument. tests/keyboard-safe-sheet.test.ts fails the build if a fixed
 * bottom sheet appears without it.
 */

/**
 * Geometry for a sheet pinned to the bottom of the screen.
 *
 * @param maxFraction How much of the visible screen the sheet may take, as
 *   the fraction the call site used to express in `vh`. It is applied to the
 *   VISIBLE height rather than the layout height, so with no keyboard it is
 *   the same number it always was, and with a keyboard up it is a fraction of
 *   the room that is left.
 */
export function sheetAboveKeyboard(maxFraction: number): {
  bottom: string
  maxHeight: string
} {
  return {
    bottom: "var(--kb-inset, 0px)",
    maxHeight: `calc(var(--vv-h, 100dvh) * ${maxFraction})`,
  }
}

/**
 * The same thing for a sheet that wants an explicit pixel allowance rather
 * than a fraction — "as tall as the room, less this much".
 */
export function sheetAboveKeyboardInset(gapPx: number): {
  bottom: string
  maxHeight: string
} {
  return {
    bottom: "var(--kb-inset, 0px)",
    maxHeight: `calc(var(--vv-h, 100dvh) - ${gapPx}px)`,
  }
}

/**
 * For a box that is pinned at BOTH ends — the one-page editor's panel, fixed
 * from the header down to the bottom of the screen — which needs its bottom
 * edge lifted onto the keyboard and nothing said about its height, because
 * its height is whatever is left between the two.
 *
 * Why it matters for a panel and not only a sheet: the fields typed directly
 * in the panel (a title, a bio, a link's label) sit in a scroller that fills
 * the box. Left at `bottom: 0` the scroller keeps its full height under the
 * keyboard, and KeyboardGuard, which centres a focused field in its
 * scroller, centres it in a box whose lower half is behind the keys.
 */
export function bottomAboveKeyboard(): { bottom: string } {
  return { bottom: "var(--kb-inset, 0px)" }
}

/**
 * The number `--kb-inset` carries, as a function so it can be tested rather
 * than trusted.
 *
 * `innerHeight` is the LAYOUT viewport, which a fixed element is positioned
 * against and which iOS does not shrink for the keyboard. The visual viewport
 * is what you can see: `vvTop` is how far it has been scrolled down inside
 * the layout one, `vvHeight` how tall it is. What is left underneath is the
 * keyboard.
 *
 * Self-correcting on a platform that resizes the web view instead (a
 * WKWebView with keyboard resizing on): innerHeight shrinks with it, and this
 * comes out at 0, which is right — there is nothing left to compensate for.
 */
export function keyboardInset(innerHeight: number, vvTop: number, vvHeight: number): number {
  return Math.max(0, Math.round(innerHeight - vvTop - vvHeight))
}
