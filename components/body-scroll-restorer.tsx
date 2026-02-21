"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Nuclear scroll-lock cleanup for marketing pages.
 *
 * Problem: react-remove-scroll (used by Radix Dialog/Sheet) adds non-passive
 * wheel/touchmove event listeners to `document` that call `preventDefault()`,
 * blocking all mouse wheel and trackpad scrolling. If these listeners survive
 * a route change (e.g., /library → /explore), scrolling is permanently broken
 * — only dragging the scrollbar works.
 *
 * This component fixes it with two strategies:
 * 1. CSS/attribute cleanup: removes data-scroll-locked, injected styles, classes
 * 2. Event interception: adds a capture-phase wheel listener on `window` that
 *    calls `stopImmediatePropagation()` when no modal is open, preventing
 *    stale react-remove-scroll listeners from seeing wheel events
 */

function cleanScrollLocks() {
  const body = document.body
  const html = document.documentElement

  // 1. Remove Radix react-remove-scroll-bar attributes
  body.removeAttribute("data-scroll-locked")

  // 2. Remove scroll-blocking classes
  body.classList.remove("with-scroll-bars-hidden")
  body.classList.remove("modal-open")

  // Remove any block-interactivity-* classes from react-remove-scroll SideCar
  const classesToRemove: string[] = []
  body.classList.forEach((cls) => {
    if (cls.startsWith("block-interactivity-")) {
      classesToRemove.push(cls)
    }
  })
  classesToRemove.forEach((cls) => body.classList.remove(cls))

  // 3. Clear ALL inline styles that could block scrolling on body
  body.style.overflow = ""
  body.style.overflowX = ""
  body.style.overflowY = ""
  body.style.pointerEvents = ""
  body.style.position = ""
  body.style.width = ""
  body.style.top = ""
  body.style.left = ""
  body.style.right = ""
  body.style.bottom = ""
  body.style.paddingRight = ""
  body.style.marginRight = ""
  body.style.overscrollBehavior = ""
  body.style.touchAction = ""
  body.style.removeProperty("--scroll-y")
  body.style.removeProperty("--removed-body-scroll-bar-size")

  // 4. Clear html element inline styles
  html.style.overflow = ""
  html.style.overflowY = ""
  html.style.overscrollBehavior = ""

  // 5. Remove stale <style> elements injected by react-remove-scroll / react-style-singleton
  //    These contain `data-scroll-locked` or `block-interactivity` selectors
  const headStyles = document.querySelectorAll("style")
  headStyles.forEach((el) => {
    const content = el.textContent || ""
    if (
      content.includes("data-scroll-locked") ||
      content.includes("block-interactivity") ||
      content.includes("with-scroll-bars-hidden")
    ) {
      el.remove()
    }
  })
}

/**
 * Checks whether a scroll lock is intentionally active (a modal IS open).
 */
function isScrollLockActive() {
  return (
    document.body.hasAttribute("data-scroll-locked") ||
    document.body.classList.contains("modal-open")
  )
}

export function BodyScrollRestorer() {
  const pathname = usePathname()

  // Strategy 1: Clean up CSS/attributes/styles on every route change
  useEffect(() => {
    cleanScrollLocks()

    const raf = requestAnimationFrame(() => {
      cleanScrollLocks()
    })

    const timer = setTimeout(() => {
      cleanScrollLocks()
    }, 100)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [pathname])

  // Strategy 2: Intercept wheel events at the window level (capture phase)
  // to prevent stale react-remove-scroll listeners from blocking scroll.
  //
  // react-remove-scroll adds `document.addEventListener('wheel', shouldPrevent, {passive: false})`
  // which calls `preventDefault()` on wheel events. If the listener persists after navigation,
  // mouse wheel and trackpad scrolling break completely (scrollbar drag still works).
  //
  // By adding a capture-phase listener on `window`, we run BEFORE the stale document listener.
  // If no modal is intentionally open, we call `stopImmediatePropagation()` to prevent the
  // stale listener from seeing the event. The browser still scrolls because `preventDefault()`
  // was never called.
  //
  // NOTE: Only intercept `wheel` events (desktop mouse/trackpad). NOT `touchmove` —
  // that would break legitimate touch interactions (hero collage drag, etc.).
  useEffect(() => {
    const unblockWheel = (e: Event) => {
      if (!isScrollLockActive()) {
        e.stopImmediatePropagation()
      }
    }

    window.addEventListener("wheel", unblockWheel, { capture: true })

    return () => {
      window.removeEventListener("wheel", unblockWheel, { capture: true })
    }
  }, [pathname])

  return null
}
