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
      if (phaseRef.current !== "idle") return
      // Always track from the start; whether we ENGAGE the pull is decided per
      // frame in touchmove (only while genuinely at the top). This fixes the case
      // where the gesture begins slightly scrolled and then reaches the top.
      startYRef.current = e.touches[0].clientY
      trackingRef.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return

      // `<= 0` (not `=== 0`): iOS can rest at a sub-pixel or negative offset.
      const atTop = el.scrollTop <= 0
      const dy = e.touches[0].clientY - startYRef.current

      if (!atTop || dy <= 0) {
        // Not at the top, or not pulling down → let native scroll run and keep the
        // baseline fresh so a pull engages the instant we DO reach the top.
        if (pullDistRef.current !== 0) {
          updateDist(0)
          updatePhase("idle")
        }
        startYRef.current = e.touches[0].clientY
        return
      }

      // At the top and pulling down → drive the refresh gesture.
      e.preventDefault() // prevent native rubber-band bounce on iOS
      const dist = Math.min(dy * 0.5, maxPull)
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

    // touchmove MUST be non-passive to call preventDefault()
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    el.addEventListener("touchcancel", onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [containerRef, threshold, maxPull, triggerRefresh, updatePhase, updateDist])

  return { pullDistance, phase }
}
