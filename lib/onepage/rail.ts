/**
 * ===========================================================================
 *  A ROW THAT SLIDES SIDEWAYS, THE RULES (round 19)
 * ===========================================================================
 * The owner, from a recording of the live OnePage: swiping the product cards
 * "jumps between slides", the next card is sliced at a hard edge, the arrows
 * are blank white circles. Every row on a OnePage that slides sideways (a
 * group's carousel, a shelf, posts, an app block's carousel, reviews, the
 * picture slideshow) is an `.op-rail` (app/globals.css), and the page holds
 * one hook for all of them (components/onepage/rail). What it decides is here,
 * with no DOM, for tests/onepage-carousels-smooth.test.ts:
 *
 *   SOFT EDGES     a row is faded at a side only while there is more of it
 *                  that way (railEdges): a mask, so it suits any page behind
 *                  it, a picture or a video too, and never a hard cut.
 *   A TRACKPAD     two fingers on a pad send a wheel event a frame, and the
 *                  pad's own momentum keeps sending them for half a second
 *                  after the fingers lift. A mandatory snap answered each one:
 *                  it pulled the row back to a slide, the next event pushed
 *                  it on, and the row shook (measured: 32 moves back in one
 *                  gesture). The snap is off while the wheel turns; once it
 *                  stops, the row glides on to the slide it was heading for
 *                  (wheelRestingPoint), never back against its own travel
 *                  unless it barely moved.
 *   WHICH DOT      the slide the row rests nearest to, among the places it
 *                  can really stop (nearestStop).
 */

/** How close to an end, in CSS pixels, counts as at it (a row rests on fractions of a pixel). */
export const RAIL_END_SLACK_PX = 2

/** The quiet, in ms, after which a wheel gesture (and a trackpad's momentum) is over. */
export const WHEEL_IDLE_MS = 140

/** Less than this past the slide it started on, a wheel gesture goes back to that slide. */
export const WHEEL_INTENT_PX = 24

/** Whether there is more of the row to its start and to its end. */
export function railEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): { start: boolean; end: boolean } {
  const max = Math.max(0, scrollWidth - clientWidth)
  if (max <= RAIL_END_SLACK_PX) return { start: false, end: false }
  /* A row laid right to left scrolls to negative values. */
  const at = Math.abs(scrollLeft)
  return { start: at > RAIL_END_SLACK_PX, end: at < max - RAIL_END_SLACK_PX }
}

/** True when a wheel event is a sideways one (a trackpad's two fingers, shift and a wheel), not the page's scroll. */
export function isSidewaysWheel(dx: number, dy: number): boolean {
  return Math.abs(dx) > 0 && Math.abs(dx) >= Math.abs(dy)
}

/** The places a row can stop: its slides' starts, clamped to what it can scroll to, each once, in order. */
export function railStops(points: readonly number[], maxLeft: number): number[] {
  const clamp = (v: number) => Math.max(0, Math.min(v, maxLeft))
  return [...new Set(points.map((p) => Math.round(clamp(p))))].sort((a, b) => a - b)
}

/** The index of the stop nearest `left`. */
export function nearestStop(stops: readonly number[], left: number): number {
  let best = 0
  for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i] - left) < Math.abs(stops[best] - left)) best = i
  return best
}

/**
 * Where a row comes to rest after a wheel gesture that began at `startLeft` and stopped at `left`: the next stop in
 * the direction it travelled, so it never moves back against the hand; back to where it began only when it moved
 * less than WHEEL_INTENT_PX. A row without slides stays where the wheel left it.
 */
export function wheelRestingPoint(points: readonly number[], startLeft: number, left: number, maxLeft: number): number {
  const stops = railStops(points, maxLeft)
  if (stops.length === 0) return Math.max(0, Math.min(left, maxLeft))
  const travel = left - startLeft
  const from = stops[nearestStop(stops, startLeft)]
  if (Math.abs(travel) < WHEEL_INTENT_PX) return from
  /* Already on a stop (within a pixel): that is where it rests. */
  const here = stops.find((s) => Math.abs(s - left) <= 1)
  if (here !== undefined) return here
  if (travel > 0) return stops.find((s) => s > left) ?? stops[stops.length - 1]
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i] < left) return stops[i]
  return stops[0]
}

/**
 * A pagination dot's width and opacity for a row at `progress` slides along (fractions between): the dot of the
 * slide in view is long, its neighbours grow and shrink as the row passes, and the widths always add up to the same
 * total, so the row of dots never moves.
 */
export function dotLook(index: number, progress: number, min = 6, max = 18): { width: number; opacity: number } {
  const nearness = Math.max(0, 1 - Math.abs(progress - index))
  return { width: Math.round((min + (max - min) * nearness) * 100) / 100, opacity: Math.round((0.4 + 0.6 * nearness) * 100) / 100 }
}

/** How far along its stops a row is, as a fraction of a slide: 1.5 is halfway from the second to the third. */
export function railProgress(stops: readonly number[], left: number): number {
  if (stops.length < 2) return 0
  if (left <= stops[0]) return 0
  for (let i = 1; i < stops.length; i++) {
    if (left <= stops[i]) return i - 1 + (left - stops[i - 1]) / Math.max(1, stops[i] - stops[i - 1])
  }
  return stops.length - 1
}
