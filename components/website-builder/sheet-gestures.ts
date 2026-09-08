/**
 * ===========================================================================
 *  THE ARITHMETIC OF A BOTTOM SHEET
 * ===========================================================================
 * Pure, no DOM, no React — so the test drives THIS rather than a copy of it.
 *
 * The detent maths used to live inside the component and the suite kept a
 * mirror of it, with a comment admitting as much. A mirror passes while the
 * original changes; the only thing it really pins is itself. All of it moved
 * here, and the component imports what the test imports.
 */

/** Below this, a touch is a tap. Above it, a person meant to move something. */
export const DRAG_THRESHOLD_PX = 6

/**
 * A gesture is horizontal when it is clearly more sideways than up-and-down.
 * 1.2 rather than 1.0 because a thumb travelling up a phone drifts sideways,
 * and a sheet that refuses to open because the arc was not vertical enough is
 * infuriating in a way nobody can describe.
 */
export const HORIZONTAL_BIAS = 1.2

export type DragIntent = "sheet" | "scroll" | "undecided"

/**
 * WHAT THIS TOUCH IS FOR.
 *
 * The whole difficulty of a bottom sheet: the same downward drag means "close
 * the sheet" when the content is already at its top, and "scroll up through
 * the content" when it is not. Getting it wrong gives you either a sheet you
 * cannot close or a list you cannot read.
 *
 * Before this, only a 28px handle at the top could drag at all. Everything
 * else did nothing — which is what "the dragging is not accurate" is: not an
 * imprecise drag, an absent one over 99% of the sheet.
 *
 * Decided ONCE per gesture by the caller, on the first movement that clears
 * the threshold. Re-deciding mid-drag is how a sheet snatches itself away from
 * a finger halfway down a list.
 */
export function dragIntent(input: {
  deltaX: number
  deltaY: number
  /** Scroll position of the nearest scrollable ancestor under the finger. */
  scrollTop: number
  /** False when the touch began somewhere that does not scroll at all. */
  hasScroller: boolean
}): DragIntent {
  const { deltaX, deltaY, scrollTop, hasScroller } = input

  if (Math.abs(deltaX) < DRAG_THRESHOLD_PX && Math.abs(deltaY) < DRAG_THRESHOLD_PX) {
    return "undecided"
  }

  // A sideways swipe belongs to whatever is underneath — a tab strip, a
  // carousel. The sheet does not compete for it.
  if (Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_BIAS) return "scroll"

  // Nothing to scroll: every vertical drag is the sheet's.
  if (!hasScroller) return "sheet"

  /**
   * At the top and pulling DOWN is the one case where a scroller yields. The
   * content cannot go any further that way, so the gesture can only sensibly
   * mean the sheet. Positive deltaY is downward, matching clientY.
   */
  if (scrollTop <= 0 && deltaY > 0) return "sheet"

  return "scroll"
}

export interface Sample {
  y: number
  t: number
}

/** How far back to look for the release speed. */
export const VELOCITY_WINDOW_MS = 100

/**
 * SPEED AT THE MOMENT OF RELEASE, not the average of the whole gesture.
 *
 * The old calculation was `(lastY - startY) / (lastTime - startTime)` — the
 * mean over the entire drag. Pull a sheet slowly halfway down over two
 * seconds and then flick, and that reads as slow: the flick is averaged away
 * by everything before it, and the sheet settles where it was instead of
 * carrying on. It is the difference between a sheet that feels like it has
 * weight and one that feels like it is being dragged through syrup.
 *
 * Pixels per millisecond, positive downwards.
 */
export function releaseVelocity(samples: Sample[]): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]

  // The oldest sample still inside the window; failing that, the one before
  // last, so a very fast gesture with only two samples still has a speed.
  let first = samples[samples.length - 2]
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break
    first = samples[i]
  }

  const elapsed = last.t - first.t
  if (elapsed <= 0) return 0
  return (last.y - first.y) / elapsed
}

/** Where the stops are, in translateY, ascending. The last one is closed. */
export function offsetsFor(input: {
  viewport: number
  detents: number[]
  peekHeight: number
}): { height: number; offsets: number[] } {
  const stops = [...input.detents].sort((a, b) => a - b)
  const tallest = stops[stops.length - 1] ?? 0.92
  const height = Math.round(input.viewport * tallest)

  /**
   * SORTED, which is the whole correctness of the thing. A larger fraction is
   * a smaller offset, so mapping ascending fractions produces DESCENDING
   * offsets — [336, 0] — and with the peek appended, [336, 0, 664]. That array
   * is not monotonic, and the snap below moves by index assuming it is.
   */
  const list = stops
    .map((f) => Math.max(0, Math.round(height - input.viewport * f)))
    .sort((a, b) => a - b)

  return { height, offsets: [...list, Math.max(height - input.peekHeight, 0)] }
}

export const VELOCITY_THRESHOLD = 0.4
export const FLICK_MIN_DISTANCE = 8

/**
 * Nearest stop, then one further if it was a flick.
 *
 * Nearest alone makes a fast short flick feel ignored — the finger has barely
 * moved, so the nearest stop is the one it started at. Carrying it one further
 * in the direction of the flick is what makes a sheet feel like it has weight.
 */
export function snapTarget(input: {
  offsets: number[]
  current: number
  velocity: number
  totalDelta: number
}): number {
  const { offsets, current, velocity, totalDelta } = input

  let index = 0
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < offsets.length; i++) {
    const distance = Math.abs(offsets[i] - current)
    if (distance < best) {
      best = distance
      index = i
    }
  }

  if (Math.abs(velocity) > VELOCITY_THRESHOLD && Math.abs(totalDelta) > FLICK_MIN_DISTANCE) {
    index = velocity < 0 ? Math.max(0, index - 1) : Math.min(offsets.length - 1, index + 1)
  }

  return index
}
