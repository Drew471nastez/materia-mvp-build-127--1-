/**
 * ===========================================================================
 *  SCROLLING THE PAGE FROM A SURFACE THAT OWNS ITS OWN TOUCHES
 * ===========================================================================
 * The two trend charts are `touch-action: none`, because they have to be:
 * the browser latches touch-action at touchstart and keeps it for the whole
 * gesture, so a chart that says `pan-y` when a finger lands has already
 * promised the browser it may take that gesture away as a scroll — and it
 * does, mid-hold, which is what made a hold-then-slide need a lift and a
 * second tap. See the comment on the container in dashboard-client.
 *
 * The cost of owning the gesture is that a thumb dragged down the chart no
 * longer scrolls the page, because nothing else is going to do it. So this
 * does it: one-to-one while the finger is down, then a short decaying fling
 * so a flick does not stop dead.
 *
 * It is a hand-rolled scroll and it is not pretending to be a native one —
 * there is no rubber band at the ends and no scrollbar flash. It covers the
 * 200px band the chart occupies, and every other part of the page still
 * scrolls the way the browser scrolls it.
 */

/** The nearest ancestor that actually has somewhere to scroll, or null for the page. */
export function findScroller(from: Element | null): HTMLElement | null {
  for (let n = from?.parentElement ?? null; n; n = n.parentElement) {
    const overflowY = getComputedStyle(n).overflowY
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1) return n
  }
  return null
}

/** Positive is down the page, matching a finger moving up. */
export function scrollByPx(scroller: HTMLElement | null, dy: number): void {
  if (!dy) return
  if (scroller) scroller.scrollTop += dy
  else window.scrollBy(0, dy)
}

/**
 * Carries a flick on after the finger leaves, decaying to a stop.
 *
 * `velocity` is pixels per millisecond, in the same direction scrollByPx
 * takes. Returns the way to stop it, which the next touch must call or two
 * gestures end up fighting over the same scroller.
 */
export function fling(scroller: HTMLElement | null, velocity: number): () => void {
  /* Below this a flick is indistinguishable from letting go, and carrying it
     on reads as the page sliding by itself. */
  if (Math.abs(velocity) < 0.08) return () => {}
  let v = velocity
  let last = performance.now()
  let raf = requestAnimationFrame(function step(now: number) {
    /* Clamped, so a frame lost to a slow render does not jump the page. */
    const dt = Math.min(32, now - last)
    last = now
    scrollByPx(scroller, v * dt)
    v *= Math.pow(0.995, dt)
    if (Math.abs(v) > 0.02) raf = requestAnimationFrame(step)
  })
  return () => cancelAnimationFrame(raf)
}

/** The "nothing is flying" stopper, so the ref always holds a callable. */
export const noFling = (): void => {}
