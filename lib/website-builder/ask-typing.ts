/**
 * ===========================================================================
 *  WORDS THAT TYPE THEMSELVES IN, WHILE SOMEBODY SPEAKS
 * ===========================================================================
 * "The text should appear, typing, in the input in real time while I record,
 * with smooth typing." A recogniser hands its words over in bursts: nothing
 * for half a second, then "make the hero", then "make the hero taller". Put
 * straight into the box, the text jumps by whole phrases, and when the
 * recogniser changes its mind ("make the hero" becoming "make it here") the
 * end of the line flickers to something else.
 *
 * So the box is moved towards what was heard a few characters a frame:
 *
 *   MORE WAS HEARD         the next characters are typed in, faster the
 *                          further behind the box is, so a long burst lands
 *                          in about a sixth of a second and never lags
 *   THE WORDS WERE REVISED the box is cut back to what the two agree on in
 *                          one frame, then the new ending types in
 *
 * One step per animation frame; the caller stops calling once the two match.
 * Pure, so tests/ask-dock.test.ts can play a whole recording through it.
 */

/** Frames a burst of any length takes to type in, at most. */
export const CATCH_UP_FRAMES = 10
/** Characters per frame, at most: a quick reader's pace at 60 frames a second. */
export const MAX_CHARS_PER_FRAME = 14

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
  return i
}

/** What the box shows on the next frame, typing from `shown` towards `target`. */
export function typeToward(shown: string, target: string): string {
  if (shown === target) return shown
  const shared = commonPrefix(shown, target)
  /* Revised: back to what they agree on, at once. Never cut into the middle of a word that stays. */
  if (shared < shown.length) return target.slice(0, shared)
  const behind = target.length - shown.length
  const step = Math.max(1, Math.min(MAX_CHARS_PER_FRAME, Math.ceil(behind / CATCH_UP_FRAMES)))
  return target.slice(0, shown.length + step)
}

/** The box's text for what was heard, after whatever was typed before the microphone. */
export function withSpoken(base: string, heard: string): string {
  const before = base.replace(/\s+$/, "")
  const words = heard.replace(/\s+/g, " ").trim()
  if (!before) return words
  if (!words) return before
  return `${before} ${words}`
}
