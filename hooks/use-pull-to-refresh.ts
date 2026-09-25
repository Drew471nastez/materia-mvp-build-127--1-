"use client"

import { useState, useEffect, useRef, useCallback } from "react"

export type PullPhase = "idle" | "pulling" | "ready" | "refreshing"

interface Options {
  /** Distance in px that triggers refresh (default: 72) */
  threshold?: number
  /** Maximum visual pull travel (default: 96) */
  maxPull?: number
}

/**
 * Custom pull-to-refresh for iOS Capacitor WebView.
 *
 * Why we can't use CSS `overscroll-behavior: none` alone:
 *   WebKit only honours overscroll-behavior on the document scroll root.
 *   Child overflow-scroll elements on iOS still rubber-band natively.
 *   The only reliable fix is a non-passive touchmove listener that calls
 *   preventDefault() when the user is at scrollTop === 0 and pulling down.
 *
 * @param containerRef  ref pointing at the scrollable element
 * @param onRefresh     async callback; hook awaits it before returning to idle
 * @param options       threshold / maxPull tuning
 */
export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
  options: Options = {}
) {
  const { threshold = 60, maxPull = 90 } = options

  const [pullDistance, setPullDistance] = useState(0)
  const [phase, setPhase] = useState<PullPhase>("idle")

  // Mutable refs so touch handlers always see fresh values without stale closures
  const startYRef = useRef(0)
  const trackingRef = useRef(false)
  const phaseRef = useRef<PullPhase>("idle")
  const pullDistRef = useRef(0)

  // Keep refs in sync with state
  const updatePhase = useCallback((p: PullPhase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const updateDist = useCallback((d: number) => {
    pullDistRef.current = d
    setPullDistance(d)
  }, [])

  const triggerRefresh = useCallback(async () => {
    updatePhase("refreshing")
    updateDist(0)
    trackingRef.current = false
    try {
      await onRefresh()
    } finally {
      updatePhase("idle")
    }
  }, [onRefresh, updatePhase, updateDist])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      // Don't intercept if the touch started inside an overlay sheet.
      // Sheet overlays are children of the scroll container (required for iOS
      // position:fixed), so their touch events bubble up here — we must ignore them.
      if ((e.target as Element | null)?.closest("[data-dashboard-sheet]")) return

      // Only start tracking when at the very top and not already refreshing
      if (el.scrollTop === 0 && phaseRef.current === "idle") {
        startYRef.current = e.touches[0].clientY
        trackingRef.current = true
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return

      const dy = e.touches[0].clientY - startYRef.current

      if (dy <= 0) {
        // Scrolling up — stop intercepting
        trackingRef.current = false
        updateDist(0)
        updatePhase("idle")
        return
      }

      // Critical: prevent native rubber-band bounce on iOS
      e.preventDefault()

      // Apply resistance so it feels "heavier" the further you pull
      const dist = Math.min(dy * 0.45, maxPull)
      updateDist(dist)
      updatePhase(dist >= threshold ? "ready" : "pulling")
    }

    const onTouchEnd = () => {
      if (!trackingRef.current) return

      const dist = pullDistRef.current
      const ph = phaseRef.current

      if (ph === "ready" || dist >= threshold) {
        triggerRefresh()
      } else {
        updateDist(0)
        updatePhase("idle")
        trackingRef.current = false
      }
    }

    /*
      THE BLOCKING LISTENER ONLY WHILE THE PAGE IS AT THE TOP.

      touchmove MUST be non-passive to call preventDefault(), and a
      non-passive touchmove on the scroller tells the browser that any
      swipe on the page might be cancelled: every swipe then waits for the
      page's thread before it scrolls. A pull can only start at the top
      (onTouchStart), so anywhere below it the listener could never act and
      only made swipes wait. Measured on Home, the swipes below the chart
      were the ones that lagged (scripts/check-home-scroll.mjs).

      So it is added when the page reaches the top and taken off when it
      leaves, never mid pull. Everything a pull does is unchanged.

      WHAT TELLS IT WHERE THE TOP IS: an IntersectionObserver on a marker
      of no height at the top of the scroller. Not a scroll listener
      reading `scrollTop`: that read forces the browser to finish style and
      layout on the spot whenever anything has changed, in the middle of a
      scroll, and measured at 24ms of forced layout across three flicks.
      An observer costs nothing per scroll.
    */
    let blocking = false
    const setBlocking = (atTop: boolean) => {
      if (atTop && !blocking) {
        el.addEventListener("touchmove", onTouchMove, { passive: false })
        blocking = true
      } else if (!atTop && blocking && !trackingRef.current) {
        el.removeEventListener("touchmove", onTouchMove)
        blocking = false
      }
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    el.addEventListener("touchcancel", onTouchEnd, { passive: true })
    /* No observer (a very old engine): the listener stays on, as it always was. */
    const top = typeof IntersectionObserver === "function" ? document.createElement("div") : null
    let io: IntersectionObserver | null = null
    if (top) {
      top.setAttribute("aria-hidden", "true")
      top.style.cssText = "height:0;margin:0;padding:0;border:0;pointer-events:none;overflow:hidden"
      el.prepend(top)
      io = new IntersectionObserver(([entry]) => setBlocking(entry.isIntersecting), { root: el })
      io.observe(top)
    } else {
      setBlocking(true)
    }

    return () => {
      io?.disconnect()
      top?.remove()
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [containerRef, threshold, maxPull, triggerRefresh, updatePhase, updateDist])

  return { pullDistance, phase }
}
