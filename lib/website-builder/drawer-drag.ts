/**
 * ===========================================================================
 *  WHERE A DRAWER GOES WHEN THE FINGER LIFTS
 * ===========================================================================
 * The judgement in a dragged panel is not in the dragging, it is in the
 * release: does it close or spring back, and how long does it take. Both
 * answers are arithmetic, so they live here where the suite can put numbers
 * into them, rather than inside a touch handler where the only way to check
 * them is to hold a phone.
 *
 * The numbers match the builder's bottom sheet, because two layers in one
 * product that do not move alike is something you feel before you can name
 * it.
 */

/** The longest a drawer takes to settle, and the curve it settles on. */
export const DRAWER_MS = 360
export const DRAWER_EASING = "cubic-bezier(0.32, 0.72, 0, 1)"

/** Past this much of its own width, a release closes it. */
export const CLOSE_FRACTION = 1 / 3
/** Or this fast leftward, however far it got. Pixels per millisecond. */
export const FLICK_VELOCITY = -0.45
/** Below this, a release is a release rather than a throw, and is timed as one. */
const SLOWEST = 0.55
/** Faster than a cut. Under this, movement stops reading as movement. */
const QUICKEST_MS = 140

export interface DrawerRelease {
  /** Where it ends up: the drawer's own negative width, or zero. */
  target: number
  closing: boolean
  /** How long to take getting there. */
  ms: number
}

/**
 * `offset` is where the drawer is now, zero when open and negative as it is
 * pulled off the left edge. `velocity` is the last speed of the finger in
 * pixels per millisecond, negative leftward.
 */
export function drawerRelease({
  offset,
  width,
  velocity,
}: {
  offset: number
  width: number
  velocity: number
}): DrawerRelease {
  const w = Math.max(1, width)
  const at = Math.max(-w, Math.min(0, offset))
  /**
   * Distance alone ignores a fast short push, which is exactly how a drawer
   * ends up feeling stuck: the finger says go and the panel argues.
   */
  const closing = at < -w * CLOSE_FRACTION || velocity < FLICK_VELOCITY
  const target = closing ? -w : 0
  /**
   * Timed by what is left to travel and how fast it was already going. A
   * fixed duration makes a flick crawl and a nudge drag on.
   */
  const speed = Math.max(Math.abs(velocity), SLOWEST)
  const ms = Math.max(QUICKEST_MS, Math.min(DRAWER_MS, Math.round(Math.abs(target - at) / speed)))
  return { target, closing, ms }
}
