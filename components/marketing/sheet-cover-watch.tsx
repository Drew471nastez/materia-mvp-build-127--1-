"use client"

/*
  A HELD BLOCK STOPS WHEN THE NEXT SHEET HAS COVERED IT (landing round 4).

  A held block (ScrollRevealPanel hold, ScrollRevealBackdrop) stays on screen,
  sticky, while the sheet after it rises over it. To the page it is still "on
  screen", so every loop inside it (the checkout scene's orbit, the AI
  terminal) went on running and painting under the sheet that hid it: about
  fifty animations behind the audience section, measured, and the slowest
  stretch of the page to scroll.

  One IntersectionObserver watches the top of each sheet that follows a held
  block. Once that sheet's top has passed under the header (the top 8% of the
  screen), the held block is marked data-sheet-covered: its contents stop
  animating and are not painted (scroll-reveal-panel.tsx). Scrolling back
  takes the mark off before the block shows again. No scroll listener, no
  layout read.
*/
import { useEffect } from "react"

export function SheetCoverWatch() {
  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return
    const pairs = new Map<Element, HTMLElement>()
    for (const held of document.querySelectorAll<HTMLElement>("[data-sheet-hold]")) {
      const next = held.nextElementSibling
      if (next && next.matches("[data-sheet],[data-sheet-hold]")) pairs.set(next, held)
    }
    if (!pairs.size) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const held = pairs.get(e.target)
          if (!held) continue
          /* Covered: the sheet's box reaches into the top band and its top is above it (not a sheet still far below). */
          const covered = e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.height ?? window.innerHeight) * 0.08
          held.toggleAttribute("data-sheet-covered", covered)
        }
      },
      { rootMargin: "0px 0px -92% 0px" },
    )
    for (const next of pairs.keys()) io.observe(next)
    return () => {
      io.disconnect()
      for (const held of pairs.values()) held.removeAttribute("data-sheet-covered")
    }
  }, [])
  return null
}
