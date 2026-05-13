"use client"

import { useEffect, useRef } from "react"

/**
 * RotationGuard — full-screen overlay that covers the screen during device
 * rotation to prevent visual artifacts on iOS (WKWebView) and Android (WebView).
 *
 * Problem: When the user rotates from landscape to portrait (or vice-versa):
 *   1. The CSS @media (orientation: landscape) body::before overlay disappears
 *      the instant the media query switches — before the page has re-laid-out.
 *   2. A brief gap exists where the old layout is still painted, the WKWebView
 *      native background (#f2f2f2) can bleed through, or the html background
 *      (#000000) is visible as a "black bar" above the fixed header.
 *   3. On iOS, the VisualViewport scroll offset may be non-zero after rotation,
 *      leaving a persistent gap until the JS scroll-reset in AppLayoutWrapper
 *      runs (800 ms cooldown).
 *
 * Solution: Place a fixed full-screen div (z-index 999997, below the landscape
 * CSS overlay at z-index 999998) that:
 *   - Becomes visible as soon as `orientationchange` fires — before any CSS
 *     media query or JS layout runs.
 *   - Also responds to VisualViewport resize with a width change (confirms the
 *     rotation dimensions are now available) to reset the timer precisely.
 *   - Auto-hides after 900 ms (enough for WKWebView rotation animation + one
 *     AppLayoutWrapper tryResetOffset cycle) with a 1200 ms safety timeout.
 *   - Uses a CSS class so globals.css can match the overlay colour to each
 *     page's background — hiding the overlay causes zero colour contrast jump.
 *
 * Only activates in Capacitor native apps (html.capacitor present).
 */
export function RotationGuard() {
  const overlayRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) return

    const overlay = overlayRef.current
    if (!overlay) return

    /** Show the overlay and auto-hide after `ms` milliseconds. Calling again
     *  before the timer fires resets the timer (keeps the overlay visible). */
    function showFor(ms: number) {
      if (!overlay) return
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      overlay.style.display = "block"
      timerRef.current = setTimeout(() => {
        if (overlay) overlay.style.display = "none"
        timerRef.current = null
      }, ms)
    }

    // `orientationchange` fires as the OS begins the rotation animation —
    // before CSS media queries update and before vv.resize fires. Showing
    // the overlay here guarantees zero-gap coverage from frame 0.
    function onOrientationChange() {
      showFor(2000) // safety timeout; vv.resize resets this to 1600 ms
    }

    window.addEventListener("orientationchange", onOrientationChange)
    try {
      // Modern API (Chrome/Android; not available on older iOS Safari)
      window.screen?.orientation?.addEventListener("change", onOrientationChange)
    } catch {}

    // VisualViewport resize fires after the rotation animation completes and
    // new dimensions are available. Detect rotation via width change (keyboard
    // open/close never changes window.innerWidth). Reset the timer so the
    // overlay hides 900 ms after layout is fully available.
    const vv = window.visualViewport
    let lastWidth = window.innerWidth

    function onViewportResize() {
      const w = window.innerWidth
      if (w !== lastWidth) {
        lastWidth = w
        showFor(1600) // resets the 2000 ms safety timer to a tighter window;
                      // must exceed AppLayoutWrapper's cooldown (500 ms) +
                      // max tryResetOffset duration (8 retries × 100 ms = 800 ms)
                      // to guarantee the overlay outlasts the scroll-offset reset.
      }
    }

    if (vv) {
      vv.addEventListener("resize", onViewportResize)
    }

    return () => {
      window.removeEventListener("orientationchange", onOrientationChange)
      try {
        window.screen?.orientation?.removeEventListener("change", onOrientationChange)
      } catch {}
      if (vv) vv.removeEventListener("resize", onViewportResize)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      ref={overlayRef}
      className="rotation-guard-overlay"
      aria-hidden="true"
    />
  )
}
