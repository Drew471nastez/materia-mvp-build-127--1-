"use client"

import { useLayoutEffect, useRef, type CSSProperties } from "react"

/**
 * ===========================================================================
 *  THE METRIC STRIP: IT FOLLOWS THE TAB YOU CHOSE, AND THE BROWSER SCROLLS IT
 * ===========================================================================
 * Four tabs above each chart, in a row that scrolls sideways on a phone and
 * is a four column grid on a desktop. Home and Analytics both use this.
 *
 * IT FOLLOWS. The fourth tab is off the edge, so choosing along the row
 * brings the chosen tab, and the edge of the next one, into view.
 *
 * AND NOTHING HERE TOUCHES THE SWIPE. For a few days this hook drove the row
 * by hand: a non passive touchmove that claimed any swipe within 52 degrees
 * of horizontal, wrote scrollLeft on the main thread every move and ran its
 * own flick. That was the lag ("200 fps smooth, not laggish"), and the wide
 * cone was the other complaint ("when I want to scroll up and down, ensure
 * this doesn't happen"): a thumb going down the page at 50 degrees moved the
 * tabs instead.
 *
 * The browser already does this properly. With both axes permitted it picks
 * the scroller from the direction of the first movement, and then scrolls it
 * on the compositor with the platform's own momentum. Measured with real
 * touches in headless Chromium (scripts/check-metric-tabs-gesture.mjs): 45
 * degrees and flatter scroll the row, 55 and steeper scroll the page, and
 * neither moves the other.
 *
 * What made sideways swipes "go to the page" before was not the browser. At
 * the top of Home the pull to refresh cancelled every move with any downward
 * drift, the strip's included; it now leaves a gesture that starts on a
 * sideways row and goes sideways alone (hooks/use-pull-to-refresh).
 */

/** How much of the next tab to bring into view: enough to read as "more that way". */
const PEEK_PX = 40

/**
 * The strip's own gesture rules, one object for both strips.
 *
 * BOTH AXES, NOT `pan-x`. `pan-x` does not mean "prefer horizontal": it
 * forbids vertical panning from here, so a thumb that lands on a tab could not
 * scroll the page at all (measured: 0px of page at every angle).
 *
 * `overscroll-behavior-x: contain` keeps a flick that reaches either end of
 * the row from being handed on sideways (on Android that is the back swipe).
 * The vertical axis is left alone, so a vertical swipe still reaches the page.
 *
 * No scroll snapping: a snap point pulls the row back after you let go, which
 * is a fight with the thumb, not a help.
 */
export const TAB_STRIP_STYLE: CSSProperties = {
  touchAction: "pan-x pan-y",
  overscrollBehaviorX: "contain",
}

/**
 * The attribute the strips carry so an ancestor gesture (the pull to refresh)
 * can tell that a touch began on a row that scrolls sideways.
 */
export const SCROLL_X_ATTR = "data-scroll-x"

export function useTabStrip<T extends HTMLElement>(active: string, order: readonly string[]) {
  const ref = useRef<T>(null)
  const previous = useRef(active)

  /* ── it follows the tab you chose ──────────────────────────────────────── */
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
      The browser's own smooth scroll, not a hand-rolled one. A finger landing
      on the row interrupts it for free, and it runs off the main thread.
    */
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    strip.scrollTo({ left: target, behavior: calm ? "auto" : "smooth" })
  }, [active, order])

  return ref
}
