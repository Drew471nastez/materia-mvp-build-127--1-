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
  /**
   * How far the content under the finger is scrolled. The caller sums every
   * scrollable ancestor between the finger and the sheet, so a list inside a
   * panel that is itself scrolled does not read as "at the top".
   */
  scrollTop: number
  /** False when the touch began somewhere that does not scroll at all. */
  hasScroller: boolean
}): DragIntent {
  const { deltaX, deltaY, scrollTop, hasScroller } = input

  if (Math.abs(deltaX) < DRAG_THRESHOLD_PX && Math.abs(deltaY) < DRAG_THRESHOLD_PX) {
    return "undecided"
  }

  // A sideways swipe belongs to whatever is underneath, a tab strip or a
  // carousel. The sheet does not compete for it.
  if (isHorizontal(deltaX, deltaY)) return "scroll"

  // Nothing to scroll: every vertical drag is the sheet's. The grab bar and
  // the tab row above the list are this case, at every stop.
  if (!hasScroller) return "sheet"

  /**
   * At the top and pulling DOWN is the one case where a scroller yields. The
   * content cannot go any further that way, so the gesture can only sensibly
   * mean the sheet. Positive deltaY is downward, matching clientY.
   */
  if (scrollTop <= 0 && deltaY > 0) return "sheet"

  /**
   * ===========================================================================
   *  AT HALF, THE LIST SCROLLS
   * ===========================================================================
   * This used to grow the sheet first: a push up on the list at the half stop
   * moved the sheet to full before a single row scrolled. That is one of the
   * two ways iOS does it, and it was the wrong one here. The Sections list is
   * read at half, with the canvas still in view above it, and a list you
   * cannot scroll until you have given up the canvas is a list you fight.
   *
   * So this is the other iOS sheet: a medium detent whose content scrolls
   * (UISheetPresentationController with
   * prefersScrollingExpandsWhenScrolledToEdge = false, Maps' place card).
   * Inside the content a push up scrolls it at every stop. The sheet moves
   * from the grab bar and the tabs, which do not scroll, from a pull down
   * with the list at its top, and from a scroll that runs out of list going
   * down (`handOffToSheet`). A tap on the grab bar steps half, full, half
   * (`tapTarget`), so full is one tap away and not a gesture to discover.
   */
  return "scroll"
}

function isHorizontal(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_BIAS
}

/**
 * ===========================================================================
 *  A SCROLL THAT RUNS OUT OF LIST BECOMES A DRAG
 * ===========================================================================
 * The decision in `dragIntent` is made once, and that is right for most of a
 * gesture. It is wrong for one: a finger scrolling a list back up (moving
 * DOWN the screen) that reaches the top of it and keeps going. The list has
 * nothing left to give, and a native sheet hands the rest of that same
 * gesture to itself so the sheet starts following the finger from exactly
 * there. Without this the finger slides on a list that no longer moves and
 * has to be lifted and put down again to move the sheet.
 *
 * Only downward, only at the top, and never for a gesture that was sideways
 * to begin with: a carousel that happens to sit at scrollTop 0 is not asking
 * for the sheet.
 */
export function handOffToSheet(input: {
  /** Summed over the scrollable ancestors under the finger. */
  scrollTop: number
  /** Movement since the previous event, positive downward. */
  stepY: number
  /** The gesture was decided as a sideways one. */
  horizontal: boolean
}): boolean {
  return !input.horizontal && input.scrollTop <= 0 && input.stepY > 0
}

/**
 * The way back from a hand-off. A scroll that ran out of list became a drag
 * of the sheet at `top` (where the sheet was when it took over); if the same
 * finger turns and goes back up past that point, the list takes the rest
 * again instead of the sheet leaving its place. `raw` is where the finger
 * would put the sheet. The sheet stops at `top` and the list takes the
 * overflow.
 */
export function expandCarry(raw: number, top: number): { sheetY: number; scrollBy: number } {
  if (raw >= top) return { sheetY: raw, scrollBy: 0 }
  return { sheetY: top, scrollBy: top - raw }
}

/**
 * ===========================================================================
 *  PAST THE TALLEST STOP, THE SHEET RESISTS INSTEAD OF STOPPING DEAD
 * ===========================================================================
 * The old drag computed a third of the overshoot and then clamped it away, so
 * the sheet hit the top stop like a wall while the finger kept going. A real
 * sheet gives: it follows at a falling rate and comes back when released.
 *
 * This is UIScrollView's curve. At the edge the sheet moves at 0.55 of the
 * finger, and however far the finger goes the sheet never passes `limit`.
 * The limit is small on purpose: the space the sheet leaves under itself is
 * filled by its own background (see the skirt in mobile-editor-sheet.tsx),
 * but a sheet that can be hauled half way up the screen reads as broken, not
 * springy.
 */
export const RUBBER_BAND_COEFFICIENT = 0.55
export const RUBBER_BAND_LIMIT_PX = 80

export function rubberBand(overshoot: number, limit: number = RUBBER_BAND_LIMIT_PX): number {
  if (overshoot <= 0 || limit <= 0) return 0
  return (1 - 1 / ((overshoot * RUBBER_BAND_COEFFICIENT) / limit + 1)) * limit
}

/**
 * How fast the sheet moves per pixel of finger at a given overshoot. The
 * release has to leave at the SHEET's speed, and past the edge that is a
 * fraction of the finger's.
 */
export function rubberBandSlope(overshoot: number, limit: number = RUBBER_BAND_LIMIT_PX): number {
  if (overshoot <= 0 || limit <= 0) return 1
  const k = (overshoot * RUBBER_BAND_COEFFICIENT) / limit + 1
  return RUBBER_BAND_COEFFICIENT / (k * k)
}

/**
 * Where the sheet is drawn for a finger that would put it at `raw`.
 *
 * ONE ANSWER FOR THE DRAG AND FOR THE RENDER. The old code rubber-banded one
 * number, clamped another, and drew whichever path it was in, so a re-render
 * mid-drag could put the sheet somewhere the drag never had.
 *
 * Only the top resists. Below the closed position there is nothing to reveal
 * but the canvas's own reserve, which ends where the peek begins: pulling the
 * peek down would open a strip of editor background between the two, the
 * same band this sheet's `--wb-sheet-peek` exists to prevent. So the bottom
 * stays a clamp.
 */
export function dragPosition(raw: number, top: number, bottom: number, limit: number = RUBBER_BAND_LIMIT_PX): number {
  if (raw < top) return top - rubberBand(top - raw, limit)
  if (raw > bottom) return bottom
  return raw
}

/** The sheet's own speed for a finger speed, where it was released. */
export function sheetVelocityAt(raw: number, top: number, fingerVelocity: number, limit: number = RUBBER_BAND_LIMIT_PX): number {
  return raw < top ? fingerVelocity * rubberBandSlope(top - raw, limit) : fingerVelocity
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
 *
 * `releasedAt` is the time the finger came UP. Browsers send no touchmove for
 * a finger that is holding still, so without it a quick drag, a half-second
 * pause and a lift reads as the quick drag: the last two samples are the fast
 * ones and nothing says time passed after them. With it, the pause is a
 * sample where the finger did not move, and the window sees it.
 *
 * Only once the gap is longer than a moving finger ever leaves between two
 * events. A lift a few milliseconds after the last move is the normal end of
 * a flick, and counting those milliseconds as stillness would shave the speed
 * the sheet is about to be handed.
 */
export const STILL_AFTER_MS = 40

export function releaseVelocity(samples: Sample[], releasedAt?: number): number {
  if (releasedAt !== undefined && samples.length > 0) {
    const tail = samples[samples.length - 1]
    if (releasedAt - tail.t > STILL_AFTER_MS) samples = [...samples, { y: tail.y, t: releasedAt }]
  }
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
/**
 * ===========================================================================
 *  THE TALLEST STOP COVERS THE BAR OR CLEARS IT, NEVER HALF OF IT
 * ===========================================================================
 * A 92% sheet on an 844px screen has its top edge at 68px. With a 59px
 * status bar the editor's bar runs to 107px and its buttons from 67px, so
 * the sheet's edge cut across the top pixel of every button: a violet line
 * of the Ask AI button showing at the sheet's corners, "purple things in the
 * corners". A fraction of the screen knows nothing about what is drawn
 * there, so the fraction is only where the edge WANTS to be:
 *
 *   at or above the status bar   the sheet covers the bar entirely, at the
 *                                status bar (a stop of 1: Ask Storelib)
 *   inside the bar               moved down to BAR_GAP_PX under the bar, so
 *                                the whole bar shows, dimmed, over a clear
 *                                gap (a 92% stop: Sections, Add section)
 *   below the bar                where it asked to be
 *
 * `barBottom` is the bottom edge of whatever the page marked
 * `data-sheet-clear`, measured by the sheet off the element itself, 0 where
 * nothing is marked. Only the TALLEST stop moves: the lower stops are
 * fractions of the screen measured from the bottom and do not change.
 */
export const BAR_GAP_PX = 8

export function clearOfBar(top: number, safeTop: number, barBottom: number): number {
  const floor = Math.max(0, safeTop)
  if (top <= floor) return floor
  if (barBottom > floor && top < barBottom + BAR_GAP_PX) return Math.round(barBottom + BAR_GAP_PX)
  return top
}

export function offsetsFor(input: {
  viewport: number
  detents: number[]
  peekHeight: number
  /**
   * The status bar. A stop of 1 is the whole screen BELOW it: a sheet's top
   * edge is never drawn under the clock, whatever fraction it asked for.
   */
  safeTop?: number
  /** The bottom of the page's own bar, see `clearOfBar`. */
  barBottom?: number
}): { height: number; offsets: number[] } {
  const stops = [...input.detents].sort((a, b) => a - b)
  const tallest = stops[stops.length - 1] ?? 0.92
  const viewport = Number.isFinite(input.viewport) ? Math.max(0, input.viewport) : 0
  const wanted = viewport - Math.round(viewport * tallest)
  /*
    Never below zero. The screen is measured in one effect and the bar in
    another, so for a commit the bar can be known on a screen that is not
    (0 tall), and on a window shorter than the bar the clearance is taller
    than the window. A negative height is not a smaller sheet, it is an
    invalid CSS length the browser drops, which leaves the last one standing.
  */
  const height = Math.max(0, viewport - clearOfBar(wanted, input.safeTop ?? 0, input.barBottom ?? 0))

  /**
   * SORTED, which is the whole correctness of the thing. A larger fraction is
   * a smaller offset, so mapping ascending fractions produces DESCENDING
   * offsets — [336, 0] — and with the peek appended, [336, 0, 664]. That array
   * is not monotonic, and the snap below moves by index assuming it is.
   */
  const list = stops
    .map((f) => Math.max(0, Math.round(height - viewport * f)))
    .sort((a, b) => a - b)

  return { height, offsets: [...list, Math.max(height - input.peekHeight, 0)] }
}

/**
 * ===========================================================================
 *  A KEYBOARD TAKES THE SHEET'S ROOM, SO THE SHEET TAKES IT BACK
 * ===========================================================================
 * The sheet pads itself by the keyboard's height so its content clears it.
 * That padding comes out of the sheet's OWN height, which is a fraction of
 * the screen, so a 60% sheet with a 336px keyboard up had 170px left for a
 * header, a form and two buttons. Growing by the keyboard's height keeps the
 * panel above it the size it was before the keyboard arrived.
 *
 * ---------------------------------------------------------------------------
 *  BUT NEVER UNDER THE STATUS BAR
 * ---------------------------------------------------------------------------
 * The growth used to be capped at the whole screen. A 92% sheet and a 388px
 * keyboard want 1164px of an 844px screen, so the cap was what decided, and
 * it put the sheet's top edge at y = 0: Ask Storelib's title under the clock,
 * on a real iPhone. `ceiling` is the most room the sheet may take instead:
 * the screen, less the clearance its tallest stop keeps at the top, less the
 * part of the page iOS has panned out of view above the keyboard (see
 * `visibleKeyboard`). The caller works it out; `keyboardCeiling` below.
 *
 * OFFSETS ARE DELIBERATELY NOT ADJUSTED. The sheet is anchored by `bottom: 0`
 * and moved by translateY, so a taller sheet at the same offset has its top
 * edge higher by exactly the growth, which is what the padding takes back.
 */
export function sheetHeightWithKeyboard(height: number, keyboardInset: number, ceiling: number): number {
  return Math.max(0, Math.min(ceiling, height + Math.max(0, keyboardInset)))
}

/**
 * The most room a sheet may take while a keyboard is up, in layout pixels,
 * measured up from the bottom of the fixed box. Its top edge may rise to
 * where a full sheet stands (KEYBOARD_REACH of the screen) or to its own
 * tallest stop if that is higher, never above the safe area, and it comes
 * down by however far iOS has panned the page. `height - keyboardInset` is
 * then the panel, and it always ends on the keyboard.
 *
 * So a 78% form sheet still grows for a keyboard (to 92%, where there is a
 * header's worth of screen above it), a 92% sheet keeps its top edge, and a
 * sheet whose tallest stop is the whole screen below the status bar keeps
 * that.
 */
export const KEYBOARD_REACH = 0.92

export function keyboardCeiling(input: {
  viewport: number
  /** The sheet's tallest stop, in pixels. */
  tallestHeight: number
  safeTop: number
  /** How far the visible area has been panned down the page. */
  visibleTop: number
  /** The page's own bar, which a keyboard does not let the sheet cut across either. */
  barBottom?: number
}): number {
  const reach = Math.round(input.viewport * (1 - KEYBOARD_REACH))
  const clearance = clearOfBar(
    Math.max(input.safeTop, Math.min(input.viewport - input.tallestHeight, reach)),
    input.safeTop,
    input.barBottom ?? 0,
  )
  return Math.max(0, input.viewport - clearance - Math.max(0, input.visibleTop))
}

/**
 * ===========================================================================
 *  WHAT THE KEYBOARD COVERS, AND HOW FAR iOS PANNED TO SHOW THE FIELD
 * ===========================================================================
 * iOS does not shrink the layout viewport for a keyboard. It shrinks the
 * visual one, and when the focused field would sit under the keys it PANS
 * the visual viewport down the page to show it: `offsetTop` goes up by as
 * much as it needed. A fixed sheet does not move with that pan, so the part
 * of it above `offsetTop` is off the top of the screen, and what the keyboard
 * covers at the bottom is only the fixed box's height, less the visible
 * height, less the pan.
 *
 * The old reading took that covered strip and nothing else. After a pan it
 * was small or zero, a zero fell through to the published ESTIMATE of a
 * keyboard (half the screen, for web views that report nothing), and the
 * sheet padded itself by a keyboard's height of empty white on top of a
 * keyboard that had been reported all along. That is the band between the
 * composer and the keyboard in the screenshot.
 *
 * So the estimate is only for a platform that reported nothing. When the
 * visual viewport is shorter than the fixed box by more than a toolbar, the
 * platform spoke, and the covered strip is the answer even when it is zero:
 * `reported` says so and the caller skips the floor. `top` is the pan, which
 * the sheet takes off its own height so its top edge follows the screen.
 *
 * `layoutHeight` is the FIXED BOX, read off a fixed element, not
 * `innerHeight`: some iOS versions shrink `innerHeight` with the keyboard
 * while fixed elements stay where they were (see keyboardInsetFrom in
 * lib/ui/keyboard-safe-sheet.ts), and then the keyboard reads as nothing.
 *
 * Pinch zoom also shrinks the visual viewport and is not a keyboard; with a
 * scale other than 1 there is no pan and nothing counts as reported.
 */
export const REPORTED_KEYBOARD_MIN_PX = 80

export function visibleKeyboard(input: {
  layoutHeight: number
  vvHeight: number
  vvTop: number
  scale?: number
}): { inset: number; top: number; reported: boolean; zoomed: boolean } {
  const { layoutHeight, vvHeight } = input
  const zoomed = Math.abs((input.scale ?? 1) - 1) > 0.01
  const shrunk = layoutHeight - vvHeight
  const covered = Math.max(0, Math.round(layoutHeight - vvHeight - Math.max(0, input.vvTop)))
  if (zoomed || shrunk <= REPORTED_KEYBOARD_MIN_PX) return { inset: covered, top: 0, reported: false, zoomed }
  const top = Math.max(0, Math.min(Math.round(input.vvTop), Math.round(shrunk)))
  return { inset: covered, top, reported: true, zoomed }
}

/**
 * ===========================================================================
 *  THE KEYBOARD THE SHEET MAKES ROOM FOR
 * ===========================================================================
 * What `visibleKeyboard` saw, and what ViewportVars published on <html>
 * (`--kb-inset`), come to one number here.
 *
 *   reported   the covered strip, zero included: the platform spoke.
 *   zoomed     nothing. A pinch shrinks the visual viewport by as much as a
 *              keyboard does, and a sheet that padded itself by it would
 *              leave half a screen of white under a list somebody was only
 *              looking at closely.
 *   otherwise  the published number, only when it is a keyboard's worth.
 *
 * The last line is the one that was wrong. When nothing is reported, what
 * is left between the fixed box and the visible area is a browser toolbar
 * drawn over the page (see `browserChromeGap` in mobile-editor-sheet.tsx),
 * never more than REPORTED_KEYBOARD_MIN_PX, and ViewportVars publishes that
 * same strip. Taken as a keyboard it grew the sheet, never measured the
 * toolbar as a toolbar, and with focus on any button inside the sheet sent
 * it to its tallest stop "for the keyboard". What is over that line when
 * nothing was reported is the half screen estimate for a web view that
 * reports nothing, or iOS shrinking `innerHeight` for a real keyboard.
 */
export function keyboardFor(
  seen: { inset: number; reported: boolean; zoomed: boolean },
  published: number,
): number {
  if (seen.reported) return Math.max(0, seen.inset)
  if (seen.zoomed) return 0
  return published > REPORTED_KEYBOARD_MIN_PX ? Math.round(published) : 0
}

/**
 * ===========================================================================
 *  WHAT COUNTS AS A FLICK
 * ===========================================================================
 * Both numbers were higher (0.4 px/ms over 8px) and "open to half, then
 * full" took a real throw. They are set from what a thumb does rather than
 * from a round number:
 *
 * SPEED, 0.25 px/ms (250 px/s). A thumb placing a sheet slows as it arrives,
 * and what is left at the lift is under 0.15 px/ms: 100px eased over most of
 * a second. The shortest deliberate flick, a 20 to 30px nudge in about 60ms,
 * leaves at 0.35 to 0.5. 0.25 sits between the two with room on both sides.
 * A finger held still first does not get through it at all: the release
 * speed counts the stillness (`releaseVelocity` with `releasedAt`).
 *
 * DISTANCE, more than 8px of finger from where it came DOWN. It used to be
 * 8px from where the sheet took the gesture, which is DRAG_THRESHOLD_PX
 * later, so a flick needed 14px and more: and the browser withholds the
 * first moves inside its own slop, so the sheet often took the gesture on
 * the last move of a short flick and measured 0px from there. Counted from
 * touchdown, 9px is enough, which is past the 6px that makes it a drag at
 * all and three times what a tap wanders.
 */
export const VELOCITY_THRESHOLD = 0.25
export const FLICK_MIN_DISTANCE = 8

/**
 * ===========================================================================
 *  A TAP ON THE GRAB BAR STEPS THE SHEET
 * ===========================================================================
 * Closed, it opens to half. At half, it goes to full. At full, back to half.
 * The same cycle the grabber of an iOS sheet has for VoiceOver, given to a
 * finger, so reaching full never needs a gesture somebody has to discover.
 *
 * A tap is a touch that stayed inside DRAG_THRESHOLD_PX and came up within
 * TAP_MAX_MS. Longer than that is a press somebody changed their mind about,
 * and it leaves the sheet where it is.
 *
 * `offsets` ascend (tallest stop first) and the last is closed. Returns the
 * index to go to; the one it is at when there is nowhere to step to, a
 * content-fit sheet already open.
 */
export const TAP_MAX_MS = 300

export function tapTarget(offsets: number[], current: number): number {
  const last = offsets.length - 1
  if (last < 0) return 0
  let at = 0
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < offsets.length; i++) {
    const distance = Math.abs(offsets[i] - current)
    if (distance < best) {
      best = distance
      at = i
    }
  }
  /* The lowest open stop: half on a sheet that has one, the only stop on one that does not. */
  const lowestOpen = Math.max(0, last - 1)
  if (at === last) return lowestOpen
  if (at === 0) return lowestOpen
  return 0
}

export function isTap(input: { distance: number; ms: number; cancelled?: boolean }): boolean {
  /*
    A touch the system took away (touchcancel: a notification pulled down, a
    call, the app switcher) or that a second finger turned into a pinch was
    not a tap, however short and still it was. Counted as one, it stepped
    the sheet to full under a finger that never let go of the glass.
  */
  if (input.cancelled) return false
  return input.distance < DRAG_THRESHOLD_PX && input.ms <= TAP_MAX_MS
}

/**
 * ===========================================================================
 *  THE MOUSE EVENTS A BROWSER MAKES UP AFTER A TAP ARE NOT A MOUSE
 * ===========================================================================
 * After a tap a browser sends mousedown, mouseup and click for the same
 * spot, and the grab bar's mousedown would take them for a mouse starting a
 * drag of its own. They are ignored; a real mouse never is.
 *
 * Where the browser says which is which (`sourceCapabilities.firesTouchEvents`,
 * Chromium) that answer is final. Elsewhere a mousedown is the copy of a
 * touch only if it comes soon after one AND where it was: the copies carry
 * the touch's own coordinates. Time alone swallowed a real click on a
 * laptop with a touchscreen for most of a second after any touch anywhere.
 */
export const TOUCH_MOUSE_GAP_MS = 800
export const TOUCH_MOUSE_SLOP_PX = 24

export function isCompatibilityMouse(input: {
  /** `sourceCapabilities.firesTouchEvents`, undefined where there is none. */
  firesTouchEvents?: boolean
  msSinceTouch: number
  distanceFromTouch: number
}): boolean {
  if (typeof input.firesTouchEvents === "boolean") return input.firesTouchEvents
  return input.msSinceTouch < TOUCH_MOUSE_GAP_MS && input.distanceFromTouch <= TOUCH_MOUSE_SLOP_PX
}

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
 *
 * ---------------------------------------------------------------------------
 *  A SNAP DOES NOT MOVE AT ITS AVERAGE SPEED, SO THE DURATION ALLOWS FOR IT
 * ---------------------------------------------------------------------------
 * This was `distance / speed`, which is the time the move takes at the
 * finger's speed ON AVERAGE. The snap's curve is not average: it left at
 * 0.72 / 0.32 = 2.25 times its mean speed, so a sheet released at 1 px/ms
 * left at 2.25 px/ms, a visible kick the instant the finger came up. The
 * duration is now stretched by that same 2.25, and the release curve in
 * `snapMotion` opens at 2.25 times its mean, so unclamped the first frames
 * move at exactly the finger's speed. `snapMotion` also covers the cases the
 * clamps get in the way of.
 */
export const MIN_SNAP_MS = 130
export const MAX_SNAP_MS = 460

/** The snap's curve, and the speed it leaves at as a multiple of its mean. */
export const SNAP_CURVE = [0.32, 0.72, 0, 1] as const
export const SNAP_CURVE_START_SLOPE = SNAP_CURVE[1] / SNAP_CURVE[0]

/**
 * A sheet let go with no speed still has to get where it is going, and this
 * is the speed its duration is worked out from. Chosen so a 300px move from
 * rest takes the full 460ms, and a 70px one takes about 200.
 */
export const REST_SPEED = 0.8

export function snapDuration(distance: number, velocity: number): number {
  const speed = Math.max(Math.abs(velocity), REST_SPEED)
  return Math.round(
    Math.max(MIN_SNAP_MS, Math.min(MAX_SNAP_MS, (SNAP_CURVE_START_SLOPE * Math.abs(distance)) / speed)),
  )
}

export interface SnapMotion {
  ms: number
  /** A CSS cubic-bezier, x1 y1 x2 y2. */
  curve: [number, number, number, number]
}

/**
 * ===========================================================================
 *  THE SHEET LEAVES THE FINGER AT THE FINGER'S SPEED, AND ONLY SLOWS
 * ===========================================================================
 * A cubic-bezier's opening speed is (distance / duration) times y1 / x1, the
 * slope of its first control point, so matching a release speed is a matter
 * of choosing the duration and that point together. Two things rule out
 * simply keeping the house curve and adjusting it:
 *
 * The house curve is not a deceleration. Its second control point sits at
 * x = 0, behind its first, and a curve shaped like that speeds UP after it
 * starts: its slope is 2.25 at the start and about 4.2 a third of the way
 * in. Handed a finger's speed at the start, it then pulls away from it at
 * nearly twice that. Measured in scripts/check-sheet-feel.mjs as a sheet that
 * left at the finger's speed and was moving 1.6 times faster two frames on.
 *
 * So a release uses the other standard shape: control points a third and two
 * thirds of the way along in time, which makes time run straight through the
 * curve, and the first one raised to the slope wanted. With the second at
 * full height the speed only ever falls from there to zero, for any opening
 * slope from 1.5 to 3. At 2 it is constant deceleration; at 3 it is the
 * cubic ease-out; unclamped it is 2.25, the same share of the move spent
 * arriving as the house curve's.
 *
 *   Clamped SHORT (a hard flick with little left to go) the slope wanted is
 *   over 3. The first point moves in towards the start at full height, which
 *   still only slows, and still never passes its end: a sheet that overshot
 *   its top stop would open a gap under itself.
 *
 *   Clamped LONG (a slow release, or none) the slope is under 1.5, and a
 *   curve that has to cover its distance in time from a slow start has to
 *   gather speed first. It does so from the finger's own speed, to zero for a
 *   finger that had stopped: a sheet that starts from rest, not one that
 *   lurches.
 *
 * A finger moving AWAY from the stop (a slow drag back that did not count as
 * a flick) is treated as stopped. Matching it would need the curve to run
 * backwards first, and a sheet that dips before it rises reads as a glitch.
 *
 * `velocity` is the sheet's own speed in px/ms, signed the same way as
 * `distance`, positive downward.
 */
const THIRD = 0.3333

export function snapMotion(distance: number, velocity: number): SnapMotion {
  const d = Math.abs(distance)
  const toward = d > 0 ? Math.max(0, velocity * Math.sign(distance)) : 0
  const ms = snapDuration(d, toward)
  if (d < 0.5) return { ms, curve: [...SNAP_CURVE] }

  /** The opening slope that makes the first frame move at `toward`. */
  const slope = (toward * ms) / d
  if (slope > 3) return { ms, curve: [round4(1 / slope), 1, THIRD * 2, 1] }
  return { ms, curve: [THIRD, round4(slope / 3), THIRD * 2, 1] }
}

/** How fast a snap leaves, in px/ms, given where it goes and how. */
export function snapStartSpeed(distance: number, motion: SnapMotion): number {
  const [x1, y1] = motion.curve
  if (motion.ms <= 0 || x1 <= 0) return Number.POSITIVE_INFINITY
  return (Math.abs(distance) / motion.ms) * (y1 / x1)
}

/**
 * The curve's slope (progress per unit of time, 1 being its mean) at `n`
 * evenly spaced moments. For the tests and the probe: a release that only
 * slows has a profile that never rises.
 */
export function curveSlopes(curve: readonly number[], n = 40): number[] {
  const [x1, y1, x2, y2] = curve
  const bez = (a: number, b: number, t: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t
  const d = (a: number, b: number, t: number) => 3 * a * (1 - t) * (1 - 3 * t) + 3 * b * (2 * t - 3 * t * t) + 3 * t * t
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    const x = i / n
    // Solve x(t) = x by bisection; x(t) is monotonic for 0 <= x1, x2 <= 1.
    let lo = 0
    let hi = 1
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (bez(x1, x2, mid) < x) lo = mid
      else hi = mid
    }
    const t = (lo + hi) / 2
    const dx = d(x1, x2, t)
    out.push(dx > 1e-9 ? d(y1, y2, t) / dx : Number.POSITIVE_INFINITY)
  }
  return out
}

export function curveCss(curve: readonly number[]): string {
  return `cubic-bezier(${curve.join(", ")})`
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * ===========================================================================
 *  A LIST LET GO MID-PUSH KEEPS GOING
 * ===========================================================================
 * When a hand-off turns back (see `expandCarry`) and the same finger carries
 * on into the list, it is moved by hand rather than by the browser, so on release
 * nothing carries it on. This is the coast a native scroll view would have
 * given it: speed falls by the same fraction every millisecond, which is
 * UIScrollView's normal deceleration.
 */
export const COAST_DECAY_PER_MS = 0.998
export const COAST_STOP_SPEED = 0.02

export function coastVelocity(v0: number, ms: number): number {
  return v0 * Math.pow(COAST_DECAY_PER_MS, ms)
}

/** Distance covered in `ms` from speed `v0`, the integral of the above. */
export function coastDistance(v0: number, ms: number): number {
  const k = Math.log(COAST_DECAY_PER_MS)
  return (v0 * (Math.pow(COAST_DECAY_PER_MS, ms) - 1)) / k
}
