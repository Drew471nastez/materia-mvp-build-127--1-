/**
 * ===========================================================================
 *  A SLIDESHOW DRAGGED WITH A MOUSE, THE RULES
 * ===========================================================================
 * The owner, round 42: "on desktop, dragging with the mouse must move slides
 * in real time, smooth like touch swipe". A finger already moves the row
 * (it is a native scroller, see PublicImageCarousel); a mouse did not move
 * the image slideshow at all, and in the group carousel it wrote scrollLeft
 * against a mandatory snap, which pulled the row back on every move.
 *
 * The hook is components/onepage/drag-scroll.ts. What it decides is here,
 * with no DOM, for tests/onepage-r42.test.ts:
 *
 *   DRAG OR CLICK   a press that travels less than DRAG_START_PX is a click
 *                   and is left alone (a linked picture opens); past it, it
 *                   is a drag and the click that follows is swallowed.
 *   WHERE IT RESTS  on release, the slide nearest to where the row would
 *                   coast to at the pointer's speed (a flick goes on to the
 *                   next slide, a slow drag settles on the nearest one),
 *                   never more than one slide past the one it started on.
 */

/** Travel, in CSS pixels, before a press becomes a drag. */
export const DRAG_START_PX = 6

/** How far the row coasts for each px/ms of speed at release. */
export const COAST_MS = 160

/** True once a press has travelled far enough sideways to be a drag. */
export function isDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) >= DRAG_START_PX && Math.abs(dx) >= Math.abs(dy)
}

/**
 * The scrollLeft to come to rest at: the snap point nearest the coasting
 * position, at most one slide either side of the slide the drag began on.
 * `velocity` is the row's own speed in px/ms (positive = scrollLeft growing).
 */
export function restingPoint(points: number[], startLeft: number, left: number, velocity: number, maxLeft: number): number {
  /* Round AP: a row without slides coasts on at the pointer's speed, as a finger's fling does. */
  if (points.length === 0) return Math.max(0, Math.min(left + velocity * COAST_MS, maxLeft))
  const clamp = (v: number) => Math.max(0, Math.min(v, maxLeft))
  const stops = [...new Set(points.map(clamp))].sort((a, b) => a - b)
  const nearestIndex = (v: number) => stops.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(stops[best] - v) ? i : best), 0)
  const from = nearestIndex(startLeft)
  const projected = clamp(left + velocity * COAST_MS)
  const to = Math.max(from - 1, Math.min(from + 1, nearestIndex(projected)))
  return stops[to]
}
