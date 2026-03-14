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
    let lastTouchX = 0

    function onTouchStart(e: TouchEvent) {
      lastTouchY = e.touches[0]?.clientY ?? 0
      lastTouchX = e.touches[0]?.clientX ?? 0
    }

    function onTouchMove(e: TouchEvent) {
      const touchY = e.touches[0]?.clientY ?? 0
      const touchX = e.touches[0]?.clientX ?? 0
      const deltaY = touchY - lastTouchY
      const deltaX = touchX - lastTouchX

      // Never interfere with mobile sheet portals — they handle their own
      // drag-to-dismiss gesture. Calling preventDefault here would block the
      // sheet's handle-bar from being dragged down to close.
      const target = e.target as Element | null
      if (
        target?.closest("[data-mobile-bottom-sheet]") ||
        target?.closest("[data-mobile-top-sheet]")
      ) {
        return
      }

      // Only intercept primarily vertical gestures — horizontal swipes (e.g.
      // KPI metric tab carousels, analytics tables) must scroll freely without
      // interference. Allow a small bias so diagonal gestures that are mostly
      // vertical are still caught.
      if (Math.abs(deltaX) > Math.abs(deltaY) * 0.5 && Math.abs(deltaX) > 4) {
        return
      }

      // Walk the DOM upward from the touch target to find a scrollable ancestor
      let el: Element | null = e.target as Element
      while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el)
        const oy = style.overflowY
        const ox = style.overflowX
        // If element scrolls horizontally, let the browser handle it
        if (ox === "auto" || ox === "scroll") {
          const htmlEl = el as HTMLElement
          const canScrollX = htmlEl.scrollWidth > htmlEl.clientWidth + 1
          if (canScrollX) return
        }
        if (oy === "auto" || oy === "scroll") {
          const htmlEl = el as HTMLElement
          // Skip elements that have overflow-y:auto computed (often due to CSS spec
          // forcing auto when overflow-x:hidden is set) but aren't actually scrollable.
          // Without this check, e.g. the settings form root div (overflow-x:hidden →
          // implicit overflow-y:auto, scrollHeight==clientHeight) would block ALL scroll.
          const canScrollY = htmlEl.scrollHeight > htmlEl.clientHeight + 1
          if (!canScrollY) {
            el = el.parentElement
            continue
          }
          // Nested scroll container — only prevent at its own boundaries
          // so scroll-chaining into the document (which rubber-bands) is blocked
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

      // No scrollable ancestor — check document-level boundaries.
      // Use documentElement as the reliable scroll root (works in Capacitor
      // WKWebView where html has overflow-y: auto on mobile).
      const scrollEl =
        (document.scrollingElement as HTMLElement) || document.documentElement
      const scrollTop = Math.max(
        scrollEl.scrollTop,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      )
      const scrollHeight = Math.max(
        scrollEl.scrollHeight,
        document.documentElement.scrollHeight,
      )
      const atTop = scrollTop <= 0
      const atBottom = scrollTop + window.innerHeight >= scrollHeight - 1
      // Only prevent if page is actually taller than the viewport (has something to scroll)
      const isScrollable = scrollHeight > window.innerHeight + 1
      if (isScrollable) {
        if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) {
          e.preventDefault()
        }
      } else {
        // Page fits on screen — prevent rubber-band in both directions
        if (deltaY !== 0) e.preventDefault()
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
