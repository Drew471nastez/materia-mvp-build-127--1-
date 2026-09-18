"use client"

import { useRef } from "react"

/**
 * ===========================================================================
 *  AN ENTRANCE ANIMATION THAT DOES NOT PLAY ON THE WAY IN
 * ===========================================================================
 * `animate-in fade-in-0` is the right thing when a grid's CONTENTS change
 * underneath the visitor: they pick a category, change the sort, go to page
 * two, and the new set fades up instead of snapping. React is told to do that
 * by changing the element's `key`, which remounts it, which replays the
 * animation. All correct.
 *
 * The problem is that a mount is a mount. Arriving on the page is one, and so
 * is coming BACK to it — and on the way back the grid is full of the products
 * the visitor was already looking at, so it fades them in from nothing all
 * over again.
 *
 * Filmed on production going back from a product page to /explore, the whole
 * frame at 60fps:
 *
 *      54ms   mean 194.4   65.6% white   the listing, as it was
 *      73ms   mean 227.2   90.3% white   the grid at opacity 0
 *     142ms   mean 212.0   66.8% white   coming back
 *     244ms   mean 198.0   62.3% white   still coming back
 *     327ms   mean 194.7   61.8% white   settled
 *
 * A quarter of a second of a near-white page on every single return. The same
 * signature, 88.9% and 89.0% white, is in the screen recording that reported
 * it, so this is the flash rather than a flash.
 *
 * ---------------------------------------------------------------------------
 * The distinction that fixes it is between a CHANGE and an ARRIVAL. The token
 * is whatever the caller already uses as the element's key — the filters, the
 * sort, the page number. On the first render it is compared against itself, so
 * nothing animates; from then on any different token means the visitor changed
 * something while looking at it, and the entrance plays as designed.
 *
 * A ref rather than state on purpose: this has to be right on the FIRST
 * painted frame, and state would settle a render later, which is the late
 * fade it exists to prevent.
 */
export function useEntranceOnChange(token: string, classes: string): string {
  const first = useRef(token)
  return token === first.current ? "" : classes
}
