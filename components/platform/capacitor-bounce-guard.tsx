"use client"

import { useEffect } from "react"

/**
 * CapacitorBounceGuard
 *
 * WKWebView (Capacitor iOS) ignores `overscroll-behavior: none` because the
 * scroll is backed by a native UIScrollView whose `bounces` property defaults
 * to `true`. CSS alone cannot disable it on iOS < 16 (and inconsistently on 16+).
 *
 * This component intercepts `touchmove` events and calls `e.preventDefault()`
 * when a scroll would go beyond its container's boundaries — blocking the native
 * UIScrollView from bouncing.
 *
 * Logic:
 * 1. Walk up from the touch target to find the first element with overflow
 *    auto/scroll. If found, prevent at THAT element's top/bottom boundary.
 *    This also stops scroll chaining (bounce propagating from nested scroll to doc).
 * 2. If no scrollable ancestor found, apply the check to the document itself.
 *
 * No-op on web browsers (checked via html.capacitor class, which is set
 * synchronously before first paint only in native Capacitor apps).
 *
 * Must be rendered in a Client Component; renders null to the DOM.
 */
export function CapacitorBounceGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return
    // Only activate inside the native Capacitor shell
    if (!document.documentElement.classList.contains("capacitor")) return

    let lastTouchY = 0

    function onTouchStart(e: TouchEvent) {
      lastTouchY = e.touches[0]?.clientY ?? 0
    }

    function onTouchMove(e: TouchEvent) {
      const touchY = e.touches[0]?.clientY ?? 0
      const deltaY = touchY - lastTouchY

      // Walk the DOM upward from the touch target to find a scrollable ancestor
      let el: Element | null = e.target as Element
      while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el)
        const oy = style.overflowY
        if (oy === "auto" || oy === "scroll") {
          // Nested scroll container — only prevent at its own boundaries
          // so scroll-chaining into the document (which rubber-bands) is blocked
          const htmlEl = el as HTMLElement
          const atTop = htmlEl.scrollTop <= 0
          const atBottom =
            htmlEl.scrollTop + htmlEl.clientHeight >= htmlEl.scrollHeight - 1
          if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) {
            e.preventDefault()
          }
          return
        }
        el = el.parentElement
      }

      // No scrollable ancestor — check document-level boundaries
      const scrollEl =
        (document.scrollingElement as HTMLElement) || document.documentElement
      const atTop = scrollEl.scrollTop <= 0
      const atBottom =
        scrollEl.scrollTop + window.innerHeight >= scrollEl.scrollHeight - 1
      if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) {
        e.preventDefault()
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true })
    // passive: false required so e.preventDefault() is allowed
    document.addEventListener("touchmove", onTouchMove, { passive: false })

    return () => {
      document.removeEventListener("touchstart", onTouchStart)
      document.removeEventListener("touchmove", onTouchMove)
    }
  }, [])

  return null
}
