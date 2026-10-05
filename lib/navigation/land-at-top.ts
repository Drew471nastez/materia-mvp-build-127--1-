"use client"

/**
 * ===========================================================================
 *  A PAGE OPENED FROM A LIST LANDS AT ITS TOP
 * ===========================================================================
 * "From Explore to a product page: the product page always lands at the TOP
 * (phones especially): no restored mid scroll." Next's router scrolls a new
 * page to its top once, as it commits. Anything that moves the window after
 * that commit undoes it, and two things did:
 *
 *   EXPLORE'S OWN RESTORE, STILL RUNNING. Back on Explore it tries for a few
 *   dozen frames to stand at the saved place while the list grows. A card
 *   pressed in those frames opened the product and the loop went on
 *   scrolling the product to Explore's place (fixed at the cause in
 *   lib/explore/use-explore-scroll.ts: it stops when the address changes).
 *   A GLIDE THAT OUTLIVES THE PAGE. A flick on a phone keeps the page
 *   gliding after the finger lifts; a card pressed as it slows starts the
 *   navigation, and in WebKit the glide can carry on into the new page.
 *
 * So a page that should open at its top says so with `useLandAtTop()`: on a
 * forward arrival (a push, not Back or Forward, not a reload, not an
 * address with a #) it is put at 0 before its first paint, and for
 * LAND_GUARD_MS from its first frame anything that moves it again without the person
 * touching the screen, the wheel or the keyboard is put back to 0. The first
 * touch ends the watch, so it never fights a real scroll.
 *
 * WHICH ARRIVALS. A Back or Forward is the browser's and the router's to put
 * back where it was, so a popstate since the last push means "leave it". The
 * patch on pushState is how a push is told apart: the router pushes the new
 * address before the page's layout effects run.
 */

import { useLayoutEffect } from "react"

/** How long after the page's first frame a stray scroll is still put back: a phone's glide can run on for most of a second. */
export const LAND_GUARD_MS = 1000

/** True between a popstate and the next push: the page arriving is a Back or a Forward. */
let traversal = false

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    traversal = true
  })
  const { pushState } = history
  history.pushState = function (...args: Parameters<History["pushState"]>) {
    traversal = false
    return pushState.apply(this, args)
  }
}

/** For tests: whether the page now arriving came by Back or Forward. */
export function arrivedByTraversal(): boolean {
  return traversal
}

function documentLoadRestores(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    return nav?.type === "reload" || nav?.type === "back_forward"
  } catch {
    return false
  }
}

let mounts = 0

/**
 * Put the page at its top on a forward arrival, and keep it there until the
 * person moves it or LAND_GUARD_MS has passed. Returns nothing; call it once
 * in a component that mounts with the page.
 */
export function useLandAtTop(): void {
  useLayoutEffect(() => {
    const first = mounts++ === 0
    if (window.location.hash) return
    if (traversal) return
    /* The document itself was loaded by a reload or Back: the browser puts it where it was. */
    if (first && documentLoadRestores()) return

    if (window.scrollY !== 0) window.scrollTo(0, 0)

    let frame = 0
    let over = false
    /* Counted from the first frame, not the mount: on a slow phone the first frame can come long after it. */
    let until = Infinity
    const inputs = ["touchstart", "wheel", "keydown", "pointerdown"] as const
    const end = () => {
      if (over) return
      over = true
      cancelAnimationFrame(frame)
      for (const t of inputs) window.removeEventListener(t, end, true)
    }
    const watch = () => {
      if (over) return
      if (until === Infinity) until = performance.now() + LAND_GUARD_MS
      if (performance.now() > until) return end()
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      frame = requestAnimationFrame(watch)
    }
    for (const t of inputs) window.addEventListener(t, end, { capture: true, passive: true })
    frame = requestAnimationFrame(watch)
    return end
  }, [])
}
