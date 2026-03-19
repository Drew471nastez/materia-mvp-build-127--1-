"use client"

import { useEffect } from "react"

/**
 * KeyboardGuard — globally tracks software keyboard open/close via the
 * VisualViewport API and adds/removes the `keyboard-open` class on <html>.
 *
 * On iOS Capacitor, opening the keyboard exposes body { padding-bottom } and
 * any scroll-container padding-bottom as whitespace (the safe-area-inset-bottom
 * value does not automatically drop to 0 in WKWebView the way it does in Safari).
 * The CSS rules keyed on `html.keyboard-open` zero out those paddings while
 * the keyboard is visible, eliminating the whitespace gap.
 *
 * Safe on all platforms — on desktop/browser visualViewport.height equals
 * window.innerHeight so kbHeight is always 0 and the class is never added.
 */
export function KeyboardGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return

    const vv = window.visualViewport
    const root = document.documentElement
    let lastInnerWidth = window.innerWidth

    function onViewportChange() {
      // Ignore orientation changes — they are not keyboard events
      const currentWidth = window.innerWidth
      if (currentWidth !== lastInnerWidth) {
        lastInnerWidth = currentWidth
        return
      }

      const kbHeight = Math.max(0, window.innerHeight - vv.offsetTop - vv.height)
      if (kbHeight > 0) {
        root.classList.add("keyboard-open")
      } else {
        root.classList.remove("keyboard-open")
      }
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)

    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
      root.classList.remove("keyboard-open")
    }
  }, [])

  return null
}
