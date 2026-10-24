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
  /** Reading it forces layout, which is how the toggle below lands without a frame. */
  readonly offsetHeight?: number
  style: { overflowY: string; removeProperty(name: string): void; setProperty(name: string, value: string): void }
}

/** How far a finger has to travel, with nothing happening, before it counts. */
export const STUCK_DISTANCE_PX = 24

/**
 * Back to a known-good state. Idempotent, and safe to call on a scroller that
 * was fine.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEVER ACROSS A FRAME. THIS IS THE ONE THAT WAS FREEZING IT.
 * ═══════════════════════════════════════════════════════════════════════════
 * This used to set `overflow-y: hidden` and put `auto` back in a
 * `requestAnimationFrame`. A frame is not a promise. It does not come while
 * the tab is hidden, while the app is in the background, or during the
 * moment a screen is being torn down — and one of the places this is called
 * from is `visibilitychange`, which fires as the page goes HIDDEN. So the
 * scroller was set to hidden and the frame that would have restored it never
 * ran, and the person came back to a canvas that could not be scrolled by
 * hand at all, until a reload. A script could still scroll it, which is why
 * the harness that drives the real editor read every step as fine: the one
 * measurement that told the truth was `overflow=hidden` after the settings
 * screen closed.
 *
 * So the layer is re-created synchronously: hidden, a forced layout, auto —
 * three statements in one task, with nothing for a missed frame to leave
 * half done. `nextFrame` is kept for the nudge, which is cosmetic and can
 * wait; the overflow never waits for anything.
 */
export function reviveScroller(el: ScrollerLike, nextFrame: (cb: () => void) => void): void {
  // An inline lock belongs to something that did not clean up after itself.
  el.style.removeProperty("pointer-events")
  el.style.removeProperty("touch-action")
  el.style.removeProperty("position")

  const before = el.scrollTop
  // Re-create the scrolling layer in one breath. The read in the middle is
  // what makes the browser apply the first write before seeing the second.
  el.style.overflowY = "hidden"
  void el.offsetHeight
  el.style.overflowY = "auto"
  // iOS drops touch scrolling on a scroller whose ancestor animated opacity;
  // re-declaring this is what asks WebKit for the layer again.
  el.style.setProperty("-webkit-overflow-scrolling", "touch")
  nextFrame(() => {
    // Belt to the braces above: whatever else happened in between, the
    // scroller is not left hidden.
    if (el.style.overflowY === "hidden") el.style.overflowY = "auto"
    nudgeOffEnds(el, before)
  })
}

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

/**
 * ===========================================================================
 *  A CLIPPED ANCESTOR THAT WAS SCROLLED IS AN OFFSET NOBODY CAN UNDO
 * ===========================================================================
 * `overflow: hidden` stops a finger, not a script. `scrollIntoView` and a
 * focus that lifts a field above the keyboard walk EVERY scrollable ancestor,
 * clipped ones included, and leave each one wherever it had to go. The canvas
 * card then sits some pixels up inside its wrapper, with nothing a person can
 * do to bring it back, because the wrapper takes no touch. Put every clipped
 * ancestor back to zero; a scroller that is meant to scroll is left alone.
 */
export interface ClippedLike {
  scrollTop: number
  scrollLeft: number
  parentElement: ClippedLike | null
  tagName?: string
  id?: string
}

export function resetClippedAncestors(
  el: ClippedLike,
  overflowOf: (node: ClippedLike) => { overflowX: string; overflowY: string },
): string[] {
  const reset: string[] = []
  let node = el.parentElement
  while (node) {
    if (node.scrollTop !== 0 || node.scrollLeft !== 0) {
      const o = overflowOf(node)
      const clipped = (v: string) => v === "hidden" || v === "clip"
      if ((node.scrollTop !== 0 && clipped(o.overflowY)) || (node.scrollLeft !== 0 && clipped(o.overflowX))) {
        reset.push(`${(node.tagName ?? "node").toLowerCase()}${node.id ? `#${node.id}` : ""}@${node.scrollTop},${node.scrollLeft}`)
        if (clipped(o.overflowY)) node.scrollTop = 0
        if (clipped(o.overflowX)) node.scrollLeft = 0
      }
    }
    node = node.parentElement
  }
  return reset
}

/**
 * Bring `target` to the top of `scroller`, and move NOTHING ELSE.
 * `scrollIntoView` is the obvious call and the wrong one here: it scrolls
 * every ancestor it needs to, the clipped wrapper and the window included,
 * which on iOS is how the canvas ends up displaced (see above). One
 * container, scrolled by hand, cannot reach past itself.
 */
export function scrollWithin(
  scroller: { scrollTop: number; getBoundingClientRect(): { top: number }; scrollTo?: (opts: { top: number; behavior: "smooth" | "auto" }) => void },
  target: { getBoundingClientRect(): { top: number } },
  behavior: "smooth" | "auto" = "smooth",
): number {
  const top = Math.max(0, Math.round(target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop))
  if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior })
  else scroller.scrollTop = top
  return top
}

/**
 * ===========================================================================
 *  ONLY WHEN NONE OF IT CAN BE SEEN
 * ===========================================================================
 * A section picked from the layer list, added, duplicated or written by Ask
 * AI used to be brought to the top of the canvas every time, which moved a
 * page that was already showing it: the section the person was looking at
 * slid up out of their eye line to become the thing at the top. Now the
 * canvas moves only when not a single pixel of the section is on screen,
 * because that is the one case where staying put leaves the person looking
 * at nothing they asked for.
 *
 * Returns where it scrolled to, or null when it left the canvas alone.
 */
export function revealWithin(
  scroller: { scrollTop: number; getBoundingClientRect(): { top: number; bottom: number }; scrollTo?: (opts: { top: number; behavior: "smooth" | "auto" }) => void },
  target: { getBoundingClientRect(): { top: number; bottom: number } },
  behavior: "smooth" | "auto" = "smooth",
): number | null {
  const box = scroller.getBoundingClientRect()
  const r = target.getBoundingClientRect()
  const seen = r.bottom > box.top + 1 && r.top < box.bottom - 1
  if (seen) return null
  return scrollWithin(scroller, target, behavior)
}

/**
 * ===========================================================================
 *  SELECTING A SECTION CANNOT MOVE THE CANVAS. NOT BY A PIXEL.
 * ===========================================================================
 * A tap that selects has no business scrolling anything, and yet it kept
 * being reported doing exactly that, worst on a section near the bottom. Each
 * cause found so far was real and is fixed at its source: a link that
 * navigated, a form that submitted, a control that took focus and was
 * scrolled into view. Rather than wait for the next one, this closes the
 * whole class: for a moment after the tap the scroll position is held where
 * the finger left it, and anything that moves it is put back.
 *
 * What it is NOT: it never touches overflow, never re-creates a scrolling
 * layer, never runs during a gesture. A finger on the glass releases it
 * immediately, so it can never fight a person or a native scroll.
 *
 * Pure: the frame scheduler, the clock and "is the person touching" are all
 * passed in, so a test drives the whole thing without a browser.
 */
export function pinScroll(
  el: { scrollTop: number },
  durationMs: number,
  schedule: (cb: () => void) => void,
  now: () => number,
  released: () => boolean,
): void {
  const top = el.scrollTop
  const start = now()
  const tick = () => {
    // The moment a finger is down this is somebody scrolling on purpose.
    if (released()) return
    if (el.scrollTop !== top) el.scrollTop = top
    if (now() - start < durationMs) schedule(tick)
  }
  schedule(tick)
}

/** Long enough to cover a tap's own settling, short enough to never be felt. */
export const PIN_AFTER_SELECT_MS = 500

/**
 * ===========================================================================
 *  AND THE SAME HOLD WHILE A PAGE IS OPENING
 * ===========================================================================
 * Following a link in the footer had the canvas move a little and then change
 * page. The move is not the page change: opening one starts by putting the
 * sidebar back to the page list, which on a phone is a sheet of a different
 * height, which is a different height for the canvas — and a canvas that
 * changes height while somebody is at the bottom of it is a canvas the
 * browser has to clamp. That is the nudge. The page itself arrives a moment
 * later, from the network, and resets the scroll to the top.
 *
 * It is the same disturbance the pin above already exists for, on the path
 * that never had one. So the same hold: the canvas does not move while the
 * page is being fetched, and the only movement anybody sees is the one
 * deliberate jump to the top when the new page is on screen.
 *
 * LONGER, because this one waits for the network rather than for a tap to
 * settle, and it is RELEASED EARLY rather than run to its end: the effect
 * that puts the new page at the top clears the flag first, so the pin stops
 * on the same frame the page arrives. This number is only the ceiling for a
 * fetch that never comes back, and at that point a lapsed pin is what the
 * canvas had before any of this.
 */
export const PIN_WHILE_OPENING_MS = 2000

/*
  ROUND AH: GLIDE TO IT. A section the person just made (added, pasted,
  duplicated, or written by the AI) is brought smoothly to near the top of the
  canvas, even when part of it already shows, because that section is the
  thing they are about to look at. Picking a section to select it still moves
  nothing (revealWithin above). An imported theme's canvas is a frame: the
  same request goes to it as REVEAL_EVENT (components/website-builder/compat/
  compat-canvas.tsx), and the frame scrolls itself past its sticky header.
*/
export const REVEAL_EVENT = "storelib:reveal-section"

export function glideWithin(
  scroller: { scrollTop: number; getBoundingClientRect(): { top: number }; scrollTo?: (opts: { top: number; behavior: "smooth" | "auto" }) => void },
  target: { getBoundingClientRect(): { top: number } },
  margin = 16,
  behavior: "smooth" | "auto" = "smooth",
): number | null {
  const top = Math.max(0, Math.round(target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - margin))
  if (Math.abs(top - scroller.scrollTop) < 4) return null
  if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior })
  else scroller.scrollTop = top
  return top
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   A STOREFRONT DRAWER'S HOLD ON THE CANVAS, WITH NO DRAWER (round 1023)
  ═══════════════════════════════════════════════════════════════════════════
  A site drawer over a Storelib canvas (the menu, the cart, search) holds
  the canvas still while it is open: overflow hidden and touch-action none
  on #wb-preview-root, and the attribute that says so
  (components/website-builder/drawer-frame.ts, useDrawerFrame). Every hold is
  counted and the last drawer to close lets go, so in the probes it is
  always let go (scripts/check-canvas-freeze.mjs). This is the guard for
  the case nobody has named: a hold on the canvas that no drawer is
  counted for is somebody's leftover, and is taken off on the next wheel
  or touch that finds the canvas not moving. Only the drawer's own three
  marks; anything else on the element is not this guard's to judge.
*/
export const DRAWER_HOLD_ATTRIBUTE = "data-site-drawer-open"

export interface HeldLike {
  style: { overflow: string; touchAction: string }
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
}

/** Lets go of a drawer's hold that no drawer holds. Returns whether there was one. */
export function releaseStrayDrawerHold(el: HeldLike, holders: number): boolean {
  if (holders > 0) return false
  const marked = el.hasAttribute(DRAWER_HOLD_ATTRIBUTE)
  if (!marked && el.style.overflow !== "hidden") return false
  el.style.overflow = ""
  if (el.style.touchAction === "none") el.style.touchAction = ""
  el.removeAttribute(DRAWER_HOLD_ATTRIBUTE)
  return true
}
