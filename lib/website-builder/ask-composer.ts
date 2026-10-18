/**
 * ===========================================================================
 *  THE CHAT BOX MOVES TO ITS NEW HEIGHT
 * ===========================================================================
 * The box grows with what is typed, up to COMPOSER_MAX_PX, and shrinks back
 * to one line when a message goes. It used to snap: set to "auto", measured,
 * set to the new height, all in one frame, so sending a long message made the
 * composer drop by a hundred pixels at once while the message rose into the
 * thread. Now the new height is measured, the box is put back where it was,
 * and it eases there on the sheet's curve, as long as a message takes to
 * rise (`ask-in`, 280ms, is the thread's; the box is a little quicker so it
 * has settled first).
 *
 * Height on the box only: nothing else is laid out again along the way
 * except what sits under the box, which is what has to move. The first
 * measure, a change under a pixel, and reduced motion are the new height at
 * once.
 *
 * Browser only; components/website-builder/theme-chat.tsx calls it, and
 * scripts/check-ask-memory-send.mjs measures it frame by frame.
 */

/** The box grows with what is typed up to this, then scrolls. */
export const COMPOSER_MAX_PX = 160
/** How long the box takes to reach a new height. */
export const COMPOSER_EASE_MS = 180
/** The sheet's curve (app/globals.css, --ease-sheet). */
export const COMPOSER_CURVE = "cubic-bezier(0.32, 0.72, 0, 1)"

function lessMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

export function easeFieldHeight(field: HTMLTextAreaElement, max = COMPOSER_MAX_PX): void {
  const before = field.offsetHeight
  field.style.transition = "none"
  field.style.height = "auto"
  const target = Math.min(field.scrollHeight, max)
  if (!before || Math.abs(before - target) < 1 || lessMotion()) {
    field.style.height = `${target}px`
    field.style.transition = ""
    return
  }
  field.style.height = `${before}px`
  /* Read back, so the browser starts the transition from the height it was. */
  void field.offsetHeight
  field.style.transition = `height ${COMPOSER_EASE_MS}ms ${COMPOSER_CURVE}`
  field.style.height = `${target}px`
}
