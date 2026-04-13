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
 * Also scrolls the focused input/textarea into view after the keyboard opens,
 * since the browser's native scroll-into-view doesn't work reliably inside
 * custom `overflow-y: auto` scroll containers (`.app-content-scroll`).
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

    /**
     * After the keyboard opens and the scroll container resizes (via CSS
     * `--vvh` / `--keyboard-inset-height`), scroll the focused input into
     * the visible area. Uses 3 RAFs: 1st for the CSS variable to be set,
     * 2nd for the browser to re-layout, 3rd to read final geometry and scroll.
     */
    function scrollFocusedInputIntoView() {
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null
        if (
          !active ||
          (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA" && !active.isContentEditable)
        ) return

        // Find the nearest scroll container (.app-content-scroll or any
        // overflow-y: auto/scroll ancestor)
        const scrollContainer = (
          active.closest(".app-content-scroll") ??
          active.closest(".library-scroll-content")
        ) as HTMLElement | null

        if (!scrollContainer) {
          // Fallback: use native scrollIntoView for document-level scroll
          active.scrollIntoView({ block: "center", behavior: "smooth" })
          return
        }

        const activeRect = active.getBoundingClientRect()
        const containerRect = scrollContainer.getBoundingClientRect()

        // Check if the input is fully visible within the container
        // Add 16px breathing room above and below
        const visibleTop = containerRect.top + 16
        const visibleBottom = containerRect.top + scrollContainer.clientHeight - 16

        if (activeRect.top < visibleTop || activeRect.bottom > visibleBottom) {
          // Scroll the element to the center of the visible area
          const targetScrollTop =
            scrollContainer.scrollTop +
            (activeRect.top - containerRect.top) -
            scrollContainer.clientHeight / 2 +
            activeRect.height / 2

          scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: "smooth",
          })
        }
      })))
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
        // After the container has resized, ensure the focused input is visible
        scrollFocusedInputIntoView()
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

    // Also listen for focus events on inputs — on some devices the keyboard
    // opens after the focus event, so we need a secondary trigger.
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null
      if (
        !target ||
        (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && !target.isContentEditable)
      ) return

      // Delay to allow keyboard to fully open and container to resize
      setTimeout(scrollFocusedInputIntoView, 350)
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)
    document.addEventListener("focusin", onFocusIn, { passive: true })

    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
      document.removeEventListener("focusin", onFocusIn)
      root.classList.remove("keyboard-open")
      root.style.removeProperty("--vvh")
    }
  }, [])

  return null
}
