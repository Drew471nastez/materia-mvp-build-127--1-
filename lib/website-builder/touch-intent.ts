/**
 * ===========================================================================
 *  A FINGER ON A SLIDER IS NOT YET A DRAG
 * ===========================================================================
 * The owner, on the builder's phone sidebar: "when I scroll with my finger up
 * and down through the sections, it confuses the touch scroll and
 * accidentally touches the sliders ... it drags the sliders."
 *
 * Every slider row was `touch-action: none` and started its drag on the
 * touch down, so a swipe up the panel that began on a row moved that row's
 * value and did not scroll. Now a slider row is `touch-action: pan-y`: the
 * browser keeps the vertical scroll, and a touch only becomes a drag once it
 * has gone INTENT_SLOP_PX in a direction within INTENT_MAX_ANGLE_DEG of
 * horizontal. Anything steeper is the scroll's, and the control lets go.
 * A mouse is unchanged: it presses where it means to.
 *
 * A tap on the track still moves the thumb there, except in the moment after
 * the panel scrolled: a finger that lands to stop a scroll that is still
 * gliding is stopping the scroll, not choosing a value (iOS's own sliders do
 * not jump on a track tap at all).
 */

export const INTENT_SLOP_PX = 8
export const INTENT_MAX_ANGLE_DEG = 30
/** How long after a scroll a tap is still taken as stopping it. */
export const SCROLL_QUIET_MS = 350

export type TouchIntent = "pending" | "horizontal" | "vertical"

/** What a finger that has moved by (dx, dy) since it came down means. */
export function touchIntent(dx: number, dy: number, slop = INTENT_SLOP_PX, maxAngleDeg = INTENT_MAX_ANGLE_DEG): TouchIntent {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.hypot(ax, ay) < slop) return "pending"
  const angle = (Math.atan2(ay, ax) * 180) / Math.PI
  return angle <= maxAngleDeg ? "horizontal" : "vertical"
}

/** A pointer that waits for intent: a finger or a pen. A mouse presses where it means to. */
export function waitsForIntent(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen"
}

let lastScrollAt = -Infinity
let listening = false

/** Any scroll in the document, heard once for every control that asks. */
function listen() {
  if (listening || typeof document === "undefined") return
  listening = true
  document.addEventListener(
    "scroll",
    () => {
      lastScrollAt = performance.now()
    },
    { capture: true, passive: true },
  )
}

/** Something scrolled a moment ago: a tap now is a finger stopping it. */
export function scrolledRecently(now = typeof performance !== "undefined" ? performance.now() : 0, quietMs = SCROLL_QUIET_MS): boolean {
  listen()
  return now - lastScrollAt < quietMs
}

/** Start hearing scrolls before the first tap needs the answer. */
export function watchScrolls() {
  listen()
}
