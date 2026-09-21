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
 * ===========================================================================
 *  WHEN THE PLATFORM WILL NOT SAY WHERE THE KEYBOARD IS
 * ===========================================================================
 * Everything above assumes the browser reports the keyboard through
 * `visualViewport`. Mobile Safari does. Android resizes the window, which
 * comes to the same thing. A WKWebView without the Capacitor keyboard plugin
 * does NEITHER: the keys are drawn over the web view by the system and the
 * page is told nothing at all. `visualViewport.height` stays the full height,
 * `innerHeight` stays the full height, and `--kb-inset` stays 0.
 *
 * That is what the second report was. The sheets were already reading
 * `--kb-inset`, the build carrying that fix was live for nineteen minutes
 * before the screenshot was taken, and the sheet was still behind the keys —
 * because the number it was reading was zero.
 *
 * The plugin is not the answer here. It is a native dependency: a Podfile
 * change and an App Store release, and this app's web layer ships to a phone
 * the moment Vercel deploys. So the fix has to live in the web layer, and in
 * the web layer there is genuinely no way to measure a keyboard the browser
 * refuses to mention.
 *
 * WHAT CAN BE DONE is to stop needing the measurement. A keyboard covers the
 * bottom of the screen and never more than about half of it, so a sheet lifted
 * by half the screen is above any of them. Measured off the reported
 * screenshot, an iPhone 16 Pro at 402x874pt:
 *
 *     keyboard with its accessory bar   389pt of 874   44.5%
 *     the sheet's top edge              at 531pt       60.8%   behind it
 *
 * and against the heights of the standard portrait keyboards:
 *
 *     iPhone SE          667pt screen   260 + 44 accessory   45.6%
 *     iPhone 15 / 16     874pt screen   345 + 44             44.5%
 *     iPhone Pro Max     956pt screen   346 + 44             40.8%
 *
 * 50% clears every one of them, and clears a third-party keyboard, which is
 * the tallest thing that can appear. The cost is a gap between the sheet and
 * the keys of about 5% of the screen on the device measured above. That is
 * the right way round: a gap is something you can see past, and a field under
 * the keys is not.
 *
 * IT IS A FLOOR, NOT A REPLACEMENT. It is published only while a text field
 * is focused, only after a deadline that a platform which does report has
 * long since beaten, and the moment a real measurement arrives it is dropped
 * and the real one is used. On every platform that answers, nothing about
 * this is ever reached.
 */
export const KEYBOARD_FLOOR_FRACTION = 0.5

/** How long to wait for the platform to report before assuming it will not. */
export const KEYBOARD_ESTIMATE_DELAY_MS = 450

/** The floor, in pixels, for a screen of this height. */
export function estimatedKeyboardInset(innerHeight: number): number {
  return Math.round(innerHeight * KEYBOARD_FLOOR_FRACTION)
}

/**
 * Whether a focused field needs the floor.
 *
 * The hard part is that `--kb-inset` of 0 means two opposite things. It means
 * "the platform hides the keyboard from us", which needs the floor, and it
 * means "the platform resized the web view, so there is nothing left to
 * compensate for", which must NOT get the floor or the sheet leaps half a
 * screen for no reason. `innerHeight` tells them apart: a platform that
 * resized shrank it, a platform that overlays did not.
 *
 * The rest keeps it off the surfaces where a focused field means no keyboard
 * at all: a desktop browser, and a tablet or a phone with a hardware keyboard
 * attached, which is the one case this gets wrong and costs a gap under a
 * sheet rather than a hidden field.
 */
export function needsKeyboardEstimate(state: {
  measuredInset: number
  innerHeightAtFocus: number
  innerHeightNow: number
  coarsePointer: boolean
  viewportWidth: number
}): boolean {
  if (state.measuredInset > 0) return false
  if (!state.coarsePointer) return false
  /* The width the sheets themselves switch to their phone layout at. */
  if (state.viewportWidth >= 768) return false
  /* A browser toolbar collapsing is sixty-odd pixels; a keyboard that
     resized the web view is never less than a quarter of the screen. */
  if (state.innerHeightNow < state.innerHeightAtFocus - 80) return false
  return true
}

/**
 * ===========================================================================
 *  ONE NUMBER, AND THE SIX PLACES THAT WERE WORKING IT OUT SEPARATELY
 * ===========================================================================
 * `innerHeight - visualViewport.offsetTop - visualViewport.height` was written
 * out by hand in six components: this app's shell, the keyboard guard, the
 * buyer's settings, the product form's sheet, the code screen's bar, and the
 * website builder's sheet. Each of them is correct, and on the phone that was
 * reported every one of them is zero, because that is the platform saying
 * nothing. Giving the floor to one of them would have fixed one sheet.
 *
 * So the floor is published once, by ViewportVars, and every one of those
 * places asks for it the same way: keep your own measurement when the
 * platform gave you one, and take the published number when it did not. The
 * behaviour on a platform that reports is unchanged, to the pixel.
 *
 * ViewportVars also dispatches a `resize` on visualViewport when the floor
 * appears or goes, because all six were already listening for one, and a
 * number nobody is told about is no better than no number.
 */
export const KEYBOARD_CHANGE_EVENT = "storelib:keyboard"

/** What ViewportVars last published, in pixels. Zero when there is no keyboard. */
export function readPublishedKeyboardInset(): number {
  if (typeof document === "undefined") return 0
  /* An inline style on <html>, so this is a read and not a style recalculation. */
  const n = Number.parseFloat(document.documentElement.style.getPropertyValue("--kb-inset"))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * The keyboard height a surface should act on.
 *
 * @param measured What this surface worked out from visualViewport itself.
 *   Sub-pixel values are a rounding artefact on every resize, and moving a bar
 *   by half a pixel is a twitch, so anything under 1px counts as no keyboard.
 */
export function keyboardInsetOrFloor(measured: number): number {
  return measured > 1 ? Math.round(measured) : readPublishedKeyboardInset()
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
