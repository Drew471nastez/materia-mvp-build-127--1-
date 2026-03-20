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

    function clampScrollContainers() {
      // After the keyboard closes the browser re-layouts (padding-bottom is
      // restored on .library-scroll-content / body) which can increase
      // scrollHeight. If the container's scrollTop now exceeds the new max,
      // clamp it so no blank space is visible at the bottom.
      const clamp = (el: Element) => {
        const h = el as HTMLElement
        const max = h.scrollHeight - h.clientHeight
        if (h.scrollTop > max) h.scrollTop = Math.max(0, max)
      }

      // Clamp the library scroll container and any other overflow-y-auto mains
      document.querySelectorAll("main, .app-content-scroll").forEach(clamp)

      // Also clamp the window itself (for pages that scroll at document level)
      const maxWin = document.documentElement.scrollHeight - window.innerHeight
      if (window.scrollY > maxWin) {
        window.scrollTo({ top: Math.max(0, maxWin), behavior: "instant" as ScrollBehavior })
      }
    }

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
        // Expose the visual viewport height (visible area above the keyboard)
        // as a CSS variable so scroll containers can be clamped to exactly that
        // height, preventing them from extending into the blank area below the
        // keyboard and eliminating the rubber-band / blank-space effect.
        root.style.setProperty("--vvh", `${Math.round(vv.height)}px`)
        // Clamp scroll positions immediately after the CSS variable is set so
        // no blank space is visible at the bottom while the keyboard is open.
        // Two frames: first for the browser to apply the new height via CSS,
        // second to read the updated clientHeight and clamp safely.
        requestAnimationFrame(() => requestAnimationFrame(clampScrollContainers))
      } else {
        const wasOpen = root.classList.contains("keyboard-open")
        root.classList.remove("keyboard-open")
        root.style.removeProperty("--vvh")
        if (wasOpen) {
          // Wait two frames: first for the CSS class removal to trigger a
          // layout recalculation (padding-bottom restored), second to read
          // the updated scrollHeight and clamp safely.
          requestAnimationFrame(() => requestAnimationFrame(clampScrollContainers))
        }
      }
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)

    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
      root.classList.remove("keyboard-open")
      root.style.removeProperty("--vvh")
    }
  }, [])

  return null
}
