"use client"

import { useEffect, useState } from "react"

/**
 * ===========================================================================
 *  CHROME THAT GETS OUT OF THE WAY GOING DOWN AND IS BACK BEFORE YOU ASK
 * ===========================================================================
 *
 * Returns `true` while a sticky bar should be hidden. Scrolling down hides it;
 * scrolling up — at all — brings it back; being anywhere near the top always
 * shows it.
 *
 * The behaviour is the easy part. Everything below is about the three ways this
 * pattern is normally shipped broken:
 *
 * ---------------------------------------------------------------------------
 * 1. IT FLICKERS, because the state flips on every pixel
 * ---------------------------------------------------------------------------
 * A naïve version compares this scroll position with the last one and flips
 * whenever the sign changes. That fires on a one-pixel jitter — a trackpad
 * settling, a rubber-band easing back, the browser correcting itself after an
 * image loads — so the bar snaps in and out while nobody is scrolling at all.
 *
 * `THRESHOLD` is the dead band: nothing happens until the page has moved a
 * dozen pixels in one direction since the last DECISION, not since the last
 * event. Measuring from the decision is what makes it a hysteresis rather than
 * a delay — a slow drift of five pixels a frame in one direction still
 * accumulates and still fires, while five pixels back and forth never does.
 *
 * ---------------------------------------------------------------------------
 * 2. IT COSTS A FRAME, because the handler does work
 * ---------------------------------------------------------------------------
 * A scroll listener runs on the main thread on every frame of every flick, on
 * a page that is scrolling a grid of photographs. This one reads `scrollY` and
 * returns; the comparison happens once per animation frame at most, and the
 * state is only ever SET when the answer changes, so React re-renders twice a
 * page rather than sixty times a second.
 *
 * `{ passive: true }` on top of that, so the browser never has to wait to find
 * out whether the handler will cancel the scroll. Without it a listener on
 * `window` opts the whole page out of the fast path.
 *
 * ---------------------------------------------------------------------------
 * 3. IT HIDES WHEN THERE IS NOWHERE TO SCROLL
 * ---------------------------------------------------------------------------
 * Two cases, both of which look like a bug and are:
 *
 *   · Near the top the bar must always be visible, whatever the direction —
 *     otherwise a short flick down at the very top of a page hides chrome that
 *     has not been scrolled past yet. `REVEAL_ABOVE` is that floor.
 *
 *   · Overscroll at the bottom on iOS reports scroll positions past the end of
 *     the document, then reports them coming back — which reads as "scrolled
 *     up" and pops the bar out during a bounce nobody asked anything of.
 *     Clamping the reading to the real maximum removes it.
 */

/** How far the page must move in one direction before the answer changes. */
const THRESHOLD = 12

/** Above this the bar is always shown, whatever the direction. */
const REVEAL_ABOVE = 24

export function useHideOnScrollDown(enabled = true): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setHidden(false)
      return
    }

    let last = window.scrollY
    let frame = 0

    const read = () => {
      frame = 0
      // Clamped, so an iOS overscroll past the end of the document does not
      // read as a scroll back up when it springs.
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const y = Math.min(Math.max(0, window.scrollY), max)

      if (y <= REVEAL_ABOVE) {
        last = y
        setHidden(false)
        return
      }

      const delta = y - last
      if (Math.abs(delta) < THRESHOLD) return

      // From the last DECISION, not the last event — see the note above.
      last = y
      setHidden(delta > 0)
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(read)
    }

    // Once on mount: a page restored mid-scroll should not start by claiming it
    // is at the top.
    read()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled])

  return hidden
}
