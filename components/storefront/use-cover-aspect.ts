"use client"

/**
 * ===========================================================================
 *  THE SHAPE OF THE BAND THE COVER IS ACTUALLY DRAWN INTO
 * ===========================================================================
 * The positioning frame in the editor was a flat 3:1, and the band on the
 * page is not: its height is fixed (128px on a phone, 192 or 256 above that)
 * and its width is the page's, so it comes out near 3:1 on a phone and past
 * 4:1 on a laptop. Two different shapes crop the same photograph differently,
 * which is why the cover a creator dragged into place in the drawer was not
 * the cover that appeared in the banner two inches to the left.
 *
 * So the number is MEASURED ONCE AND SHARED rather than written down twice.
 * The band marks itself with `data-cover-band`; this reads it. That is the
 * house rule for a number two parts of a layout both need, and it is what the
 * editor's black bands and collapsed sheets came from breaking.
 *
 * An `object-position` crop depends only on the ratio of the frame to the
 * image, never on its size, so a 400px-wide preview of the right shape shows
 * exactly what a 1400px band will.
 */
import * as React from "react"

/** What the frame falls back to: the band's shape on a phone. */
export const FALLBACK_COVER_ASPECT = 3

/**
 * Sane ends. A measurement outside this is a band that has not been laid out,
 * or one some future layout made a square, and neither should reshape the
 * editor into something unusable.
 */
const MIN = 1.5
/**
 * 12, not 8. The band is the page's full width over a fixed 256px, so an
 * ultrawide window really does reach past 10:1 — a cap of 8 would have been
 * the same bug as the flat 3:1, just further out. This only has to exclude a
 * measurement that cannot be a banner at all.
 */
const MAX = 12

/* A layout effect in the browser; on the server there is nothing to measure. */
const useBeforePaint = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

export function useCoverAspect(open: boolean): number {
  const [aspect, setAspect] = React.useState(FALLBACK_COVER_ASPECT)

  /*
    BEFORE PAINT, not after. As a passive effect the first frame of an open
    sheet drew the frame at the fallback 3:1 and the next one at the band's
    real shape (2:1 on a phone), so the cover jumped while the sheet was
    still sliding: one of the "glitching sometimes". A layout effect runs
    before that first frame is painted, and the sheet commits its content in
    the same render that opens it (components/ui/bottom-sheet).
  */
  useBeforePaint(() => {
    if (!open) return

    const measure = () => {
      const band = document.querySelector("[data-cover-band]")
      if (!band) return
      const rect = band.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const next = Math.min(MAX, Math.max(MIN, rect.width / rect.height))
      /* Rounded, so a sub-pixel reflow does not re-render the drawer. */
      setAspect(Math.round(next * 100) / 100)
    }

    measure()
    /*
      The band is as wide as the page, so its shape changes when the window
      does. ResizeObserver rather than a resize listener: inside the workspace
      the page is in a frame that the editor resizes without the window ever
      changing size.
    */
    const band = document.querySelector("[data-cover-band]")
    if (!band || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure)
      return () => window.removeEventListener("resize", measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(band)
    return () => observer.disconnect()
  }, [open])

  return aspect
}
