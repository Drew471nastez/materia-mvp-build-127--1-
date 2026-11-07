/**
 * ===========================================================================
 *  THE PANE SCROLLS WHILE A CARD IS HELD NEAR ITS EDGE (round AL)
 * ===========================================================================
 * The owner: "when I drag a block and I move it up, it should auto scroll me
 * up ... auto smooth up and auto smooth down". The rules for that speed, kept
 * apart from the gesture (components/onepage/link-reorder.ts) so they can be
 * tested without a browser.
 *
 *   A ZONE AT EACH EDGE. 72px, or less on a short pane (a fifth of it), so a
 *   card can still be dropped in the middle of a phone's list.
 *
 *   DEEPER IS FASTER, ON A CURVE. The speed grows with the square of how far
 *   into the zone the pointer is, up to MAX_SPEED px a second, and keeps
 *   that past the edge (a finger over the tab bar). The square is what makes
 *   it start slow: the first pixels into the zone barely move the list.
 *
 *   IT RAMPS UP. Entering the zone, the speed is eased in over RAMP_MS, so
 *   the list never lurches the frame the pointer crosses into it.
 *
 *   PER SECOND, NOT PER FRAME. A 120Hz screen scrolls as fast as a 60Hz one.
 */

export const EDGE_ZONE_PX = 72
export const MAX_SPEED = 1100
export const RAMP_MS = 260

/** The zone's depth for a pane `height` px tall. */
export function edgeZone(height: number): number {
  return Math.max(24, Math.min(EDGE_ZONE_PX, height / 5))
}

/**
 * The scroll speed in px a second (negative is up) for a pointer at `y`
 * in a pane whose visible part runs from `top` to `bottom`. `heldMs` is how
 * long the pointer has been inside a zone.
 */
export function edgeSpeed(y: number, top: number, bottom: number, heldMs: number): number {
  const zone = edgeZone(bottom - top)
  let depth = 0
  let sign = 0
  if (y < top + zone) {
    depth = (top + zone - y) / zone
    sign = -1
  } else if (y > bottom - zone) {
    depth = (y - (bottom - zone)) / zone
    sign = 1
  }
  if (!sign) return 0
  const d = Math.min(1, depth)
  const ramp = Math.min(1, Math.max(0, heldMs) / RAMP_MS)
  /* An ease-out on the ramp: quick to start once it has started, never a jump. */
  const eased = 1 - (1 - ramp) * (1 - ramp)
  return sign * MAX_SPEED * d * d * eased
}

/** How far to scroll this frame, given the frame's length in ms (a stalled frame counts as two at most). */
export function edgeStep(speed: number, dtMs: number): number {
  return (speed * Math.min(34, Math.max(0, dtMs))) / 1000
}
