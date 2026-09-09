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
 * How far a release carries, per unit of speed.
 *
 * This is a deceleration constant, the same idea UIScrollView uses: a finger
 * that lets go at 2 px/ms is going somewhere, and where it is going is a
 * function of how fast it was moving.
 *
 * 320, arrived at by working the real cases rather than picking a round
 * number. At 160 a hard thumb flick — around 2.6 px/ms — carried 416px, which
 * from the peek on an 800px screen still stopped at half: exactly the "throw
 * it and it does not go" the projection exists to fix. A scroll view's own
 * constant is nearer 500, but that is tuned for coasting through a long list;
 * a sheet with three stops wants to arrive, not to drift.
 */
export const PROJECTION_MS = 320

/**
 * WHERE THE SHEET WOULD COME TO REST, and the nearest stop to that.
 *
 * The first version was "nearest stop, then one further if it was a flick",
 * which is the standard cheap answer and feels like one. Two stops is all it
 * can express: a hard flick from the peek and a gentle one both move exactly
 * one detent, so throwing the sheet at the top of the screen stops it halfway
 * and you have to throw it again.
 *
 * Projecting the release instead — carry on from where the finger left at the
 * speed it left, decelerating — means the distance travelled is proportional
 * to the effort, which is what "it feels right" is made of. A hard flick from
 * the peek reaches full; a nudge settles back.
 */
export function snapTarget(input: {
  offsets: number[]
  current: number
  velocity: number
  totalDelta: number
}): number {
  const { offsets, current, velocity, totalDelta } = input

  /**
   * A slow release does not project at all. Without this a resting finger's
   * jitter — a pixel over four milliseconds reads as 0.25 px/ms — would carry
   * the sheet 40px and off its stop.
   */
  const carries = Math.abs(velocity) > VELOCITY_THRESHOLD && Math.abs(totalDelta) > FLICK_MIN_DISTANCE
  const projected = carries ? current + velocity * PROJECTION_MS : current

  let index = 0
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < offsets.length; i++) {
    const distance = Math.abs(offsets[i] - projected)
    if (distance < best) {
      best = distance
      index = i
    }
  }

  /**
   * A flick always moves at least one stop, even when the projection lands
   * back on the one it started at — a deliberate flick that changes nothing
   * reads as the sheet ignoring you.
   */
  if (carries) {
    let nearestToStart = 0
    let bestStart = Number.POSITIVE_INFINITY
    for (let i = 0; i < offsets.length; i++) {
      const distance = Math.abs(offsets[i] - current)
      if (distance < bestStart) {
        bestStart = distance
        nearestToStart = i
      }
    }
    if (index === nearestToStart) {
      index = velocity < 0 ? Math.max(0, index - 1) : Math.min(offsets.length - 1, index + 1)
    }
  }

  return index
}

/**
 * HOW LONG THE SNAP TAKES, from how far it has to go and how fast it was
 * already going.
 *
 * A fixed 360ms is the other half of why the old sheet felt heavy: closing
 * from the peek — 70 pixels — took exactly as long as opening from shut, and a
 * fast flick decelerated into a slow crawl the moment the finger lifted.
 *
 * Clamped at both ends: below ~120ms a move reads as a jump with no
 * connection to the gesture, and above ~460ms it reads as lag.
 */
export const MIN_SNAP_MS = 130
export const MAX_SNAP_MS = 460

export function snapDuration(distance: number, velocity: number): number {
  const speed = Math.max(Math.abs(velocity), 0.35)
  return Math.round(Math.max(MIN_SNAP_MS, Math.min(MAX_SNAP_MS, Math.abs(distance) / speed)))
}
