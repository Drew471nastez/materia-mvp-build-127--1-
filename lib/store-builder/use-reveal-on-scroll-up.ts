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

export interface RevealState {
  /** Whether the bar belongs on screen right now. */
  visible: boolean
  /**
   * False for the first moments after mount, while the page settles where it
   * is being restored to. A caller must not attach its transition until this
   * is true, or the bar animates into its opening position.
   */
  ready: boolean
}

/**
 * ===========================================================================
 *  AND IT DOES NOT ANIMATE INTO ITS OPENING POSITION
 * ===========================================================================
 * `visible` started as `true` unconditionally, which is right for a page
 * opened at the top and wrong for every page RESTORED by the back button.
 *
 * Coming back, the browser puts the scroll where it was — 700px down, say —
 * and this component mounts fresh with `visible: true`. So the bar paints
 * across the top of a page that is scrolled half way down, the first scroll
 * evaluation decides it should be hidden, and it slides up and off over
 * 300ms. Filmed on production going back from a product page, that is a
 * black newsletter bar over the top of the grid for a third of a second, on
 * every single return:
 *
 *      76ms   the bar, full width, over the grid
 *     152ms   sliding up
 *     273ms   nearly gone
 *     371ms   gone
 *
 * That is the flash in the header. It is not the platform header at all.
 *
 * TWO CHANGES, AND BOTH ARE NEEDED. Reading the scroll position in the
 * initialiser fixes the common case. It is not enough on its own, because
 * scroll restoration does not have a guaranteed order against mount — if the
 * component mounts first it still reads 0, still starts visible, and still
 * slides. So the caller is also told not to attach its transition until the
 * position has settled, and the bar simply IS wherever it belongs on the
 * first frame.
 */
const SETTLE_MS = 180

export function useRevealOnScrollUp(enabled = true): RevealState {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true
    return Math.max(window.scrollY, 0) < TOP_ZONE
  })
  const [ready, setReady] = useState(false)
  const last = useRef(0)

  /* Nothing may animate until the page has stopped being put back. */
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), SETTLE_MS)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setVisible(true)
      return
    }
    /*
      Re-read on mount as well as in the initialiser. If restoration landed
      after the first render this is the correction, and it happens before
      `ready`, so it is a placement rather than a movement.
    */
    setVisible(Math.max(window.scrollY, 0) < TOP_ZONE)
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

  return { visible, ready }
}
