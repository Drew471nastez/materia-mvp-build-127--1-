"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Fixes scroll after SPA navigation between route groups.
 *
 * ROOT CAUSE: When navigating from /library (which uses an internal scroll
 * container: <main overflow-y-auto> inside <div overflow-hidden h-[100dvh]>)
 * to /explore or / (which use body/html scrolling), mouse-wheel / trackpad
 * scrolling can break while scrollbar-drag still works.
 *
 * Two possible mechanisms:
 *   A) Browser compositor caches old scroll-container state and doesn't
 *      realise body/html are now scrollable.
 *   B) Stale event listeners (from react-remove-scroll or others) survive
 *      the route change and call preventDefault() on wheel events.
 *
 * STRATEGIES (defence-in-depth – every one is cheap, each covers a
 * different failure mode):
 *   1. Remove scroll-blocking CSS artefacts (classes, inline styles, attrs)
 *   2. Force browser to recalculate scroll containers (overflow toggle +
 *      forced reflow + synthetic resize + scrollTo)
 *   3. Neuter wheel-event preventDefault() from any stale listener by
 *      intercepting in capture phase AND overriding preventDefault on the
 *      event object itself
 */

// ---------------------------------------------------------------------------
// 1 – clean up scroll-blocking artefacts
// ---------------------------------------------------------------------------
function cleanScrollLocks() {
  const body = document.body
  const html = document.documentElement

  body.removeAttribute("data-scroll-locked")

  body.classList.remove("with-scroll-bars-hidden")
  body.classList.remove("modal-open")
  const toRemove: string[] = []
  body.classList.forEach((cls) => {
    if (cls.startsWith("block-interactivity-")) toRemove.push(cls)
  })
  toRemove.forEach((cls) => body.classList.remove(cls))

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

  html.style.overflow = ""
  html.style.overflowY = ""
  html.style.overscrollBehavior = ""

  document.querySelectorAll("style").forEach((el) => {
    const t = el.textContent || ""
    if (
      t.includes("data-scroll-locked") ||
      t.includes("block-interactivity") ||
      t.includes("with-scroll-bars-hidden")
    ) {
      el.remove()
    }
  })
}

// ---------------------------------------------------------------------------
// 2 – force scroll-container recalculation
// ---------------------------------------------------------------------------
function forceScrollRecalculation() {
  const html = document.documentElement
  const body = document.body

  // Read dimensions to force layout calculation
  void html.scrollHeight
  void body.scrollHeight

  // Toggle overflow-y on <html> to force re-evaluation.
  // CSS has `html { overflow-y: scroll }` – toggling forces the browser to
  // tear down and re-create the scroll container.
  html.style.overflowY = "hidden"
  void html.offsetHeight
  html.style.overflowY = ""
  void html.offsetHeight

  body.style.overflowY = "hidden"
  void body.offsetHeight
  body.style.overflowY = ""
  void body.offsetHeight

  // Synthetic resize forces full compositor recalculation
  window.dispatchEvent(new Event("resize"))

  // Force scroll position write to activate scroll machinery
  window.scrollTo(0, window.scrollY)

}

// ---------------------------------------------------------------------------
// combined repair pass
// ---------------------------------------------------------------------------
function repair() {
  cleanScrollLocks()
  forceScrollRecalculation()
}

// ---------------------------------------------------------------------------
// 3 – check if an intentional scroll lock is active
// ---------------------------------------------------------------------------
function isLocked() {
  return (
    document.body.hasAttribute("data-scroll-locked") ||
    document.body.classList.contains("modal-open")
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BodyScrollRestorer() {
  const pathname = usePathname()

  // --- Repair on every route change (with retries for lazy content) ---
  useEffect(() => {
    repair()
    const raf = requestAnimationFrame(repair)
    const t1 = setTimeout(repair, 50)
    const t2 = setTimeout(repair, 150)
    const t3 = setTimeout(repair, 400)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [pathname])

  // --- Intercept stale wheel listeners (belt + suspenders) ---
  //
  // Capture-phase listener on window fires BEFORE any listener on document.
  // We do two things:
  //   a) stopImmediatePropagation → stale listener never runs
  //   b) replace e.preventDefault with a no-op → even if (a) somehow fails
  //      and the stale listener runs, it cannot block scrolling
  useEffect(() => {
    const noop = () => {}

    const unblockWheel = (e: WheelEvent) => {
      // Don't interfere when a modal scroll-lock is intentionally active
      if (isLocked()) return

      // Override preventDefault so no downstream listener can block scrolling
      e.preventDefault = noop

      // Stop propagation so stale listeners never fire
      e.stopImmediatePropagation()
    }

    // Attach on window in capture phase (outermost, fires first)
    window.addEventListener("wheel", unblockWheel as EventListener, {
      capture: true,
      passive: true, // we never call the real preventDefault ourselves
    })
    // Also on document capture (backup)
    document.addEventListener("wheel", unblockWheel as EventListener, {
      capture: true,
      passive: true,
    })

    return () => {
      window.removeEventListener("wheel", unblockWheel as EventListener, {
        capture: true,
      })
      document.removeEventListener("wheel", unblockWheel as EventListener, {
        capture: true,
      })
    }
  }, [pathname])

  return null
}
