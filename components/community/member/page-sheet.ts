/**
 * ===========================================================================
 *  A SCREEN OVER THE COMMUNITY, AS iOS PRESENTS ONE: THE PAGE SHEET (round 16)
 * ===========================================================================
 * The owner, after round 15's push from the right: "I don't like how a post
 * opens right now. Come up with another thing, more smooth, more clean. A
 * mobile version, with another animation for phones for opening and closing
 * a post." And of the composer: "when I close it, it doesn't close smoothly."
 *
 * ONE MOTION FOR BOTH, iOS's page sheet. The new screen rises from the foot
 * on a spring; the community behind it eases back (a slight scale about the
 * middle of the screen, rounded corners, a soft dim) and stays exactly where
 * it was, never scrolled, never drawn again. Closing is the same motion in
 * reverse: the screen slides down and the community comes forward. A pull
 * down on an opened post is that same motion following the finger.
 *
 * WHY THIS AND NOT THE OTHERS. Round 14 grew the card into the post (two
 * copies of the post on screen for a few frames, then a snap); round 15
 * pushed the post in from the right and let a pull drop it downwards, so it
 * came in one way and left another. A sheet comes and goes along one line,
 * draws the post once, and never lands on the card, so there is nothing to
 * give way to. It is also how iOS shows a task over a list (Mail's compose,
 * Music's player), which is what the composer is, and the post now reads as
 * the same family.
 *
 * ONE NUMBER DRIVES EVERYTHING. `p` is how far the sheet is up: 0 at rest
 * below the screen, 1 when it covers it. Every part of the scene is LINEAR
 * in p (the sheet's offset, the community's scale and its shift, the dim,
 * the four dark bands round the receded community and its four corners), so
 * the same easing on every part keeps them in step to the pixel, a finger
 * can hold any p, and a release carries on from it. Only `translate`,
 * `scale` and `opacity` ever move, on the compositor.
 *
 * At rest the sheet covers the whole screen (round 19, the owner: "a full
 * screen page, like a Substack note"), so the community's recede is only
 * ever seen while the sheet moves; it is let go once the sheet has arrived
 * (nothing of it is visible then) and taken up again, invisibly, as a close
 * or a pull begins.
 *
 * Pure: no DOM, no React (page-sheet-stage.tsx does the drawing), so
 * tests/communities-post16.test.ts holds these numbers as written.
 */

/** The community behind, all the way back: iOS eases the screen behind a sheet to about this. */
export const RECEDE_SCALE = 0.94
/** The dim over it then (black at this alpha): soft, the community still reads through it. */
export const RECEDE_DIM = 0.18
/** Round its corners by this much once it has eased back. */
export const CORNER_PX = 12
/** The colour round the receded community, where the screen's edge shows: a near black, as iOS shows. */
export const SURROUND = "#101216"

/** Up: long enough for the spring to read as a spring, short enough to never wait for. */
export const OPEN_MS = 520
/** Down from rest (Back, Escape, the browser's Back, Cancel). */
export const CLOSE_MS = 380
/** Where `linear()` easing is missing (Safari before 17.2), iOS's own sheet curve. */
export const FALLBACK_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * THE SPRING. Critically damped (no bounce: a sheet that covers the screen
 * and overshot would open a gap at its foot), so the screen starts quick and
 * settles long, the way iOS's sheet does. `velocity` is where a finger left
 * it, in units of the whole move per second; it is capped at the spring's
 * own rate, past which a critically damped spring would overshoot.
 *
 * Returned as the move's share done at `n + 1` even steps of its time, from
 * 0 to exactly 1.
 */
export function springPoints(ms: number, velocity = 0, n = 32): number[] {
  /* Settled to within 0.2% at the end: (1 + z) e^-z = 0.002 at z of about 8.6. */
  const omega = 8.6 / Math.max(0.001, ms / 1000)
  const v0 = Math.max(0, Math.min(omega, velocity))
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = ((i / n) * ms) / 1000
    const x = 1 - (1 + (omega - v0) * t) * Math.exp(-omega * t)
    out.push(i === n ? 1 : Math.max(0, Math.min(1, x)))
  }
  return out
}

/** The spring as a CSS `linear()` easing. */
export function springEasing(ms: number, velocity = 0): string {
  return `linear(${springPoints(ms, velocity)
    .map((x) => Math.round(x * 10000) / 10000)
    .join(", ")})`
}

/** The screen's size, and where the community's own box is (its middle, in screen px, as laid out with no scale on it). */
export interface SheetScene {
  width: number
  height: number
  /** The middle of the community's box, in screen px (it is document tall: its middle is usually far below the screen). */
  boxCenterX: number
  boxCenterY: number
}

export interface SheetFrame {
  /** The sheet's offset down from where it rests. */
  sheetY: number
  /** The community: its scale, and the shift that makes the scale about the middle of the screen, not of its own box. */
  scale: number
  shiftX: number
  shiftY: number
  /** The dim's opacity (its colour carries RECEDE_DIM). */
  dim: number
  /** How far the dark bands reach in from the screen's sides and its top and foot. */
  bandX: number
  bandY: number
  /** The corners' opacity. */
  corners: number
}

/** Everything on screen at `p` (0 below the screen, 1 covering it). Linear in p, every part. */
export function sheetFrame(p: number, scene: SheetScene): SheetFrame {
  const q = Math.max(0, Math.min(1, p))
  const scale = 1 - q * (1 - RECEDE_SCALE)
  /* Scaled about its own middle c, then shifted by (o - c)(1 - s): the same as scaled about the screen's middle o. */
  const shiftX = (scene.width / 2 - scene.boxCenterX) * (1 - scale)
  const shiftY = (scene.height / 2 - scene.boxCenterY) * (1 - scale)
  return {
    sheetY: (1 - q) * scene.height,
    scale,
    shiftX,
    shiftY,
    dim: q,
    bandX: ((1 - scale) * scene.width) / 2,
    bandY: ((1 - scale) * scene.height) / 2,
    corners: q,
  }
}

/** How far up the sheet is when a finger has it `offset` px down from rest. */
export function progressFromOffset(offset: number, height: number): number {
  if (height <= 0) return 1
  return Math.max(0, Math.min(1, 1 - offset / height))
}

/** The rest of a close from `p`, at the finger's speed when one let it go (px per ms), inside a calm range. */
export function closeMsFrom(p: number, height: number, velocity = 0): number {
  const left = Math.max(0, p) * height
  if (velocity <= 0) return Math.round(Math.max(200, CLOSE_MS * Math.max(0.55, p)))
  return Math.round(Math.max(200, Math.min(CLOSE_MS, (left / velocity) * 2.2)))
}

/** A finger's speed (px per ms) as the spring's starting rate (the whole move per second). */
export function springVelocity(pxPerMs: number, height: number): number {
  if (height <= 0) return 0
  return Math.max(0, (pxPerMs * 1000) / height)
}
