/**
 * ===========================================================================
 *  A SCROLLER THAT HEALS ITSELF
 * ===========================================================================
 * "Come back from the code editor or project settings and the preview will
 * not scroll at all; the page has to be reloaded." That report has been
 * fixed four times, each time for a real cause: a scrim left over a bfcache
 * restore, a keyboard's scroll offset left on the webview, a bounce guard
 * cancelling every move, an inline lock a suspended layer never lifted.
 * Each fix was right and the report came back, which says two things: there
 * is at least one cause not yet named, and a canvas that depends on every
 * cause being named will freeze again.
 *
 * So the canvas stops depending on that. Two pieces:
 *
 *   `reviveScroller` puts a scroll container back into a known-good state:
 *   any inline lock gone, the scroll layer re-created, the position nudged
 *   off either end so iOS has no hand-off to make. Called whenever a layer
 *   that covered the canvas goes away.
 *
 *   `watchForStuckScroll` notices the failure itself. A finger that has
 *   moved a real distance over a scroller with room to scroll, and the
 *   scroller has not moved a pixel, is a scroller that has stopped
 *   responding — whatever the reason. It calls back once per gesture, and
 *   the caller revives. This is the piece that ends "reload the page": the
 *   next drag after a freeze is the one that fixes it.
 *
 * WHY RE-CREATE THE LAYER. WebKit backs `-webkit-overflow-scrolling: touch`
 * with a compositing layer, and a scroller whose ancestor animated `opacity`
 * or `transform` to and from zero — exactly what the canvas wrapper did while
 * the code pane covered it — can lose that layer and stop taking touch input
 * until something forces layout to rebuild it. Toggling `overflow-y` across
 * a frame is the smallest thing that does.
 *
 * Pure DOM, no React, so a test can drive it with a fake element and a fake
 * frame.
 */

export interface ScrollerLike {
  scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
  style: { overflowY: string; removeProperty(name: string): void; setProperty(name: string, value: string): void }
}

/** How far a finger has to travel, with nothing happening, before it counts. */
export const STUCK_DISTANCE_PX = 24

/**
 * Back to a known-good state. Idempotent, and safe to call on a scroller that
 * was fine: the toggle is invisible within a frame, and the nudge is the same
 * one every touchdown already does.
 */
export function reviveScroller(el: ScrollerLike, nextFrame: (cb: () => void) => void): void {
  // An inline lock belongs to something that did not clean up after itself.
  el.style.removeProperty("pointer-events")
  el.style.removeProperty("touch-action")
  el.style.removeProperty("position")

  const before = el.scrollTop
  // Re-create the scrolling layer: hidden for one frame, then back.
  el.style.overflowY = "hidden"
  nextFrame(() => {
    el.style.overflowY = "auto"
    // iOS drops touch scrolling on a scroller whose ancestor animated
    // opacity; re-declaring this is what asks WebKit for the layer again.
    el.style.setProperty("-webkit-overflow-scrolling", "touch")
    nudgeOffEnds(el, before)
  })
}

/**
 * One pixel in from either end. iOS hands a gesture to the parent when a
 * scroller is exactly at its top or bottom, and the parent here is
 * `overflow: hidden` on purpose, so the gesture goes nowhere and every touch
 * after it until the finger reverses is eaten.
 */
export function nudgeOffEnds(el: ScrollerLike, want: number = el.scrollTop): void {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 2) return
  let next = want
  if (next <= 0) next = 1
  else if (next >= max) next = max - 1
  if (next !== el.scrollTop) el.scrollTop = next
}

/**
 * The detector. Returns a function that removes the listeners.
 *
 * Passive listeners only: this never prevents anything, it only watches. The
 * scroller is read at the moment the gesture crosses the distance, not at
 * touchstart, because a scroller that is mid-momentum at touchdown is moving
 * for reasons that have nothing to do with this finger.
 */
export function watchForStuckScroll(
  el: ScrollerLike & {
    addEventListener(type: string, cb: (e: TouchEvent) => void, opts?: AddEventListenerOptions): void
    removeEventListener(type: string, cb: (e: TouchEvent) => void): void
  },
  onStuck: () => void,
): () => void {
  let startY = 0
  let startTop = 0
  let armed = false
  let fired = false

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) { armed = false; return }
    startY = e.touches[0].clientY
    startTop = el.scrollTop
    armed = true
    fired = false
  }
  const onMove = (e: TouchEvent) => {
    if (!armed || fired || e.touches.length !== 1) return
    const dy = e.touches[0].clientY - startY
    if (Math.abs(dy) < STUCK_DISTANCE_PX) return
    const room = el.scrollHeight - el.clientHeight
    if (room <= 2) return
    // A finger pulling down at the very top, or up at the very bottom, has
    // nowhere to take the scroller and is not evidence of anything.
    const pullingPastTop = dy > 0 && startTop <= 0
    const pullingPastBottom = dy < 0 && startTop >= room
    if (pullingPastTop || pullingPastBottom) return
    if (el.scrollTop === startTop) {
      fired = true
      onStuck()
    } else {
      // It moved, so it is fine; nothing more to learn from this gesture.
      armed = false
    }
  }
  const onEnd = () => { armed = false }

  el.addEventListener("touchstart", onStart, { passive: true })
  el.addEventListener("touchmove", onMove, { passive: true })
  el.addEventListener("touchend", onEnd, { passive: true })
  el.addEventListener("touchcancel", onEnd, { passive: true })
  return () => {
    el.removeEventListener("touchstart", onStart)
    el.removeEventListener("touchmove", onMove)
    el.removeEventListener("touchend", onEnd)
    el.removeEventListener("touchcancel", onEnd)
  }
}
