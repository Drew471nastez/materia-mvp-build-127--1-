"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Fixes scroll after SPA navigation between route groups.
 *
 * Cleans up any scroll-blocking CSS artefacts (classes, inline styles,
 * attributes, injected <style> tags) left behind by previous routes.
 *
 * Uses a MutationObserver to catch scroll locks that get re-applied
 * AFTER initial cleanup (e.g., by react-remove-scroll during teardown).
 */

function isScrollLocked(): boolean {
  const html = document.documentElement
  const body = document.body
  return (
    html.hasAttribute("data-scroll-locked") ||
    body.hasAttribute("data-scroll-locked") ||
    body.classList.contains("modal-open") ||
    body.classList.contains("with-scroll-bars-hidden") ||
    html.style.overflow === "hidden" ||
    body.style.overflow === "hidden" ||
    body.style.position === "fixed"
  )
}

function hasOpenOverlay(): boolean {
  // Only treat overlays as active when they are actually open.
  // Some routes keep dialog/sheet content mounted while closed, which would
  // otherwise prevent cleanup from ever running.
  return !!document.querySelector(
    [
      '[data-slot="dialog-content"][data-state="open"]',
      '[data-slot="sheet-content"][data-state="open"]',
      '[role="dialog"][aria-modal="true"][data-state="open"]',
    ].join(", ")
  )
}

function cleanScrollLocks() {
  const body = document.body
  const html = document.documentElement

  // Remove data attributes from BOTH html and body.
  // react-remove-scroll adds data-scroll-locked to <html>, not <body>.
  html.removeAttribute("data-scroll-locked")
  body.removeAttribute("data-scroll-locked")

  // Also remove any other scroll-related data attributes
  html.removeAttribute("data-remove-scroll-bar")
  body.removeAttribute("data-remove-scroll-bar")

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
  html.style.overflowX = ""
  html.style.overflowY = ""
  html.style.overscrollBehavior = ""
  html.style.paddingRight = ""
  html.style.marginRight = ""

  // Remove injected <style> elements from react-remove-scroll / react-remove-scroll-bar
  document.querySelectorAll("style").forEach((el) => {
    const t = el.textContent || ""
    if (
      t.includes("data-scroll-locked") ||
      t.includes("block-interactivity") ||
      t.includes("with-scroll-bars-hidden") ||
      t.includes("data-remove-scroll-bar")
    ) {
      el.remove()
    }
  })
}

function forceScrollRecalculation() {
  // Force the browser to recalculate scroll containers by reading layout
  // properties and dispatching a synthetic resize event.
  // NOTE: Do NOT toggle overflow to hidden/visible — that temporarily blocks
  // scroll and can itself cause the scroll to stick in some browsers.
  void document.documentElement.scrollHeight
  void document.body.scrollHeight
  void document.documentElement.offsetHeight
  void document.body.offsetHeight

  window.dispatchEvent(new Event("resize"))
  window.scrollTo(0, window.scrollY)
}

function repair() {
  cleanScrollLocks()
  forceScrollRecalculation()
}

/**
 * Runs cleanup only when scroll IS locked AND no dialog/sheet is open.
 * Safe to call frequently — it's a no-op when scroll is fine.
 */
function guardedRepair() {
  if (isScrollLocked() && !hasOpenOverlay()) {
    repair()
  }
}

export function BodyScrollRestorer() {
  const pathname = usePathname()

  useEffect(() => {
    // ── Immediate + timed cleanup on every navigation ──
    repair()
    const raf = requestAnimationFrame(repair)
    const timers = [50, 150, 300, 500, 1000, 1500].map((ms) =>
      setTimeout(repair, ms)
    )

    // If the page wakes from bfcache/background with stale scroll lock,
    // re-run repair as soon as the user interacts.
    const handleUserIntent = () => guardedRepair()
    window.addEventListener("pageshow", handleUserIntent)
    window.addEventListener("focus", handleUserIntent)
    window.addEventListener("wheel", handleUserIntent, { passive: true })
    window.addEventListener("touchstart", handleUserIntent, { passive: true })

    // ── MutationObserver: catch scroll locks re-applied AFTER cleanup ──
    // react-remove-scroll's teardown can fire after our timers, re-adding
    // data-scroll-locked to <html>. The observer catches that immediately.
    const attrObserver = new MutationObserver(() => {
      guardedRepair()
    })

    attrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "data-remove-scroll-bar"],
    })

    attrObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "data-remove-scroll-bar", "class"],
    })

    // ── Child observer: catch portal unmount without proper cleanup ──
    // When a Radix dialog portal unmounts but react-remove-scroll doesn't
    // clean up, the attribute observer won't fire (no attribute change).
    // Watching childList on body catches the portal removal.
    const childObserver = new MutationObserver(() => {
      if (isScrollLocked() && !hasOpenOverlay()) {
        // Small delay to let react-remove-scroll finish its own teardown
        setTimeout(() => {
          if (isScrollLocked() && !hasOpenOverlay()) {
            repair()
          }
        }, 100)
      }
    })

    childObserver.observe(document.body, { childList: true })

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      attrObserver.disconnect()
      childObserver.disconnect()
      window.removeEventListener("pageshow", handleUserIntent)
      window.removeEventListener("focus", handleUserIntent)
      window.removeEventListener("wheel", handleUserIntent)
      window.removeEventListener("touchstart", handleUserIntent)
    }
  }, [pathname])

  return null
}
