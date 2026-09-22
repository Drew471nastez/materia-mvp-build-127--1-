"use client"

import { useLayoutEffect, useRef } from "react"

/**
 * ===========================================================================
 *  THE TAB STRIP CARRIES ITSELF TO THE TAB YOU TAPPED
 * ===========================================================================
 * The metric strip above each chart is four tabs in a row that scrolls
 * sideways on a phone and is a four column grid on a desktop. On a phone the
 * last of them is off the edge, so tapping along the row left the one you had
 * just chosen half out of sight, and the tabs past it stayed hidden until you
 * dragged the row yourself.
 *
 * So the strip moves when a tab is chosen: smoothly, in the direction you
 * moved, far enough to bring that tab fully into view AND to show the edge of
 * the next one along, which is what tells you there is more that way.
 *
 * ONLY AS FAR AS IT HAS TO. A tab already in view with its neighbour showing
 * moves the strip not at all. Scrolling on every tap regardless would be
 * movement that means nothing, and the thing being fixed is a row that told
 * you nothing about where you were in it.
 *
 * ONLY WHERE THERE IS SOMETHING TO REVEAL. The guard is the strip's own
 * measurements rather than a screen width: where the row fits, scrollWidth
 * and clientWidth are equal and this does nothing at all. That covers the
 * desktop grid without naming it, and it also covers a phone wide enough, or
 * a font small enough, that all four already fit.
 */

/** How much of the next tab to bring into view: enough to read as "more that way". */
const PEEK_PX = 40

export function useTabReveal<T extends HTMLElement>(active: string, order: readonly string[]) {
  const ref = useRef<T>(null)
  const previous = useRef(active)

  useLayoutEffect(() => {
    const from = previous.current
    if (from === active) return
    previous.current = active

    const strip = ref.current
    if (!strip) return
    /* Nothing hidden, nothing to reveal: the desktop grid lands here too. */
    if (strip.scrollWidth <= strip.clientWidth + 1) return

    const tab = strip.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`)
    if (!tab) return

    const was = order.indexOf(from)
    const now = order.indexOf(active)
    if (was < 0 || now < 0 || was === now) return

    /*
      offsetLeft is measured from the strip itself, which is `position:
      relative`, so it is already in the same coordinates as scrollLeft. Using
      bounding rectangles here would mean subtracting one scrolled box from
      another and carrying the sub-pixel error into the target.
    */
    const visibleLeft = strip.scrollLeft
    const visibleRight = visibleLeft + strip.clientWidth
    const tabLeft = tab.offsetLeft
    const tabRight = tabLeft + tab.offsetWidth

    let target = visibleLeft
    if (now > was) {
      /* Moving right: bring its right edge in, plus the next tab's edge. */
      const hidden = tabRight + PEEK_PX - visibleRight
      if (hidden > 0) target = visibleLeft + hidden
    } else {
      /* Moving left: the same, mirrored. */
      const hidden = visibleLeft - (tabLeft - PEEK_PX)
      if (hidden > 0) target = visibleLeft - hidden
    }

    target = Math.max(0, Math.min(target, strip.scrollWidth - strip.clientWidth))
    if (Math.abs(target - visibleLeft) < 1) return

    /*
      The browser's own smooth scroll, not a hand-rolled one. Animating
      scrollLeft frame by frame is main-thread work in the middle of a tap,
      and it fights a finger that starts dragging the row halfway through;
      the platform's own scroll yields to that the moment it happens.
    */
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    strip.scrollTo({ left: target, behavior: calm ? "auto" : "smooth" })
  }, [active, order])

  return ref
}
