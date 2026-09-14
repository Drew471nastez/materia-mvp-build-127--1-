"use client"

/**
 * ===========================================================================
 *  A TOP BAR THAT GETS OUT OF THE WAY AND COMES BACK
 * ===========================================================================
 * Scrolling down hides it; scrolling up brings it back; near the top of the
 * page it is always there. That is the behaviour every sticky bar on a phone
 * has, and Storelib had it in exactly one place — the subscribe bar, written
 * inline — while the product page's creator bar was pinned and simply never
 * moved.
 *
 * One hook, so the two agree. It is lifted verbatim from the bar that had it,
 * including the three things that make it usable rather than twitchy:
 *
 *   ONE READ PER FRAME. The first version of this called setState on every
 *   scroll event, which is a React render per scroll frame even when the
 *   answer has not changed.
 *
 *   A DIRECTION HAS TO MEAN IT. Under six pixels is the jitter of a touch
 *   scroll or a trackpad's momentum, not a decision.
 *
 *   AND STATE IS ONLY SET WHEN THE ANSWER CHANGES.
 */

import { useEffect, useRef, useState } from "react"

/** Ignore movement smaller than this: it is jitter, not a direction. */
const DELTA = 6
/** Always visible this near the top, whichever way the last movement went. */
const TOP_ZONE = 50

export function useRevealOnScrollUp(enabled = true): boolean {
  const [visible, setVisible] = useState(true)
  const last = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setVisible(true)
      return
    }
    let ticking = false

    const evaluate = () => {
      ticking = false
      const y = Math.max(window.scrollY, 0)
      const moved = y - last.current

      if (y < TOP_ZONE) {
        setVisible((v) => (v ? v : true))
        last.current = y
        return
      }
      if (Math.abs(moved) < DELTA) return

      const next = moved < 0
      setVisible((v) => (v === next ? v : next))
      last.current = y
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(evaluate)
    }

    last.current = Math.max(window.scrollY, 0)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [enabled])

  return visible
}
