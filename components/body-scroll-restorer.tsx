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
 *
 * ===========================================================================
 *  THIS COMPONENT ONCE BROKE EVERY <Select> ON THE PLATFORM. READ THIS.
 * ===========================================================================
 *
 * Opening a Radix Select mounts its content through react-remove-scroll,
 * which puts `data-scroll-locked` on <html>. The attribute observer below
 * fired, `hasOpenOverlay()` only knew about dialogs and sheets, so it
 * concluded the lock was orphaned and ran `repair()` — which dispatches a
 * synthetic window `resize`. Radix Select closes itself on `resize`
 * (react-select's content registers `window.addEventListener("resize", close)`).
 *
 * So: click a select, it opens, and one microtask later this component
 * closed it. Every select, on every page, since the observer was added.
 * Dropdowns and popovers survived only because they reposition on resize
 * instead of closing, which is why the bug looked select-specific.
 *
 * Two rules keep it fixed:
 *
 *   1. `hasOpenOverlay()` must recognise EVERY layer that legitimately locks
 *      scroll — not just the two that were in the file when it was written.
 *      If you add an overlay primitive, add its marker to OVERLAY_SELECTOR.
 *   2. Nothing here may run while an overlay is open, and the synthetic
 *      resize only goes out when a lock was actually found and cleared.
 *      A `resize` that nobody asked for is not free: it closes selects,
 *      re-runs every resize listener in the app, and re-measures layout.
 */

/**
 * Every marker that means "a real overlay is mounted right now".
 *
 * `[data-radix-popper-content-wrapper]` is the generic one — Radix wraps all
 * popper-positioned content in it (select, dropdown, popover, context menu,
 * menubar, hover card, tooltip), so new primitives are covered without an
 * edit here. The explicit slots cover the layers that are NOT popper-based
 * (dialog, alert dialog, sheet) plus vaul drawers and cmdk dialogs.
 *
 * Content stays mounted through the close animation, so this also stops us
 * yanking the lock out mid-exit.
 */
const OVERLAY_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  '[data-slot="dialog-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="select-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="popover-content"]',
  "[data-vaul-drawer]",
  "[cmdk-dialog]",
  '[role="dialog"]',
  '[role="alertdialog"]',
].join(", ")

/**
 * Is the page stuck? Note the FIRST TWO CHECKS — they are the reason this
 * function exists at all now.
 *
 * `pointer-events: none` on the body is what Radix leaves behind when a modal
 * layer unmounts badly, and it is by far the worst of these: the page looks
 * completely normal and nothing responds to a click. `cleanScrollLocks` below
 * has always cleared it — but this predicate did not LOOK for it, so once
 * `repair()` was changed to return early unless something was stuck, a page in
 * that state was never repaired at all. Clicks went nowhere, permanently, and
 * the only way out was a reload.
 *
 * That is a regression this file caused, and it is the reason the early return
 * has to be paired with a predicate that knows about every lock the cleaner
 * can clear. If you add a line to `cleanScrollLocks`, add its detection here.
 */
function isScrollLocked(): boolean {
  const html = document.documentElement
  const body = document.body
  return (
    body.style.pointerEvents === "none" ||
    html.style.pointerEvents === "none" ||
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
  return !!document.querySelector(OVERLAY_SELECTOR)
}

/**
 * An overlay that is actually OPEN, as opposed to merely present in the DOM.
 *
 * Radix stamps `data-state="open"` on live content and `"closed"` on content
 * that is on its way out — or that leaked, which is the case that matters. A
 * leaked portal node makes `hasOpenOverlay()` true forever, and that alone
 * would be enough to keep a frozen page frozen.
 *
 * The popper wrapper carries no state of its own, so its child is checked too.
 */
function hasLiveOverlay(): boolean {
  return Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).some(
    (el) => el.getAttribute("data-state") === "open" || !!el.querySelector('[data-state="open"]'),
  )
}

/** The page is inert: it looks completely normal and nothing responds. */
function isInteractionBlocked(): boolean {
  return document.body.style.pointerEvents === "none" || document.documentElement.style.pointerEvents === "none"
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

  html.style.pointerEvents = ""
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

/**
 * Clears a stuck scroll lock — and does NOTHING when there is nothing stuck.
 *
 * The early return is the whole point. Before it, `repair()` ran on every
 * navigation and on six timers afterwards, each one dispatching a synthetic
 * resize into a page that was working fine. Now the resize only goes out
 * behind an actual lock we just removed.
 */
function repair() {
  /**
   * AN INERT PAGE IS ALWAYS A BUG, and it is repaired even when an overlay
   * node is still in the DOM — because a leaked one is exactly how the page
   * gets stuck. `hasLiveOverlay()` is the narrower question: is a layer really
   * open right now, in which case the background is inert ON PURPOSE and must
   * stay that way. Anything else — a closed layer, an orphaned portal, nothing
   * at all — and the clicks come back.
   */
  if (isInteractionBlocked() && !hasLiveOverlay()) {
    cleanScrollLocks()
    forceScrollRecalculation()
    return
  }

  if (!isScrollLocked() || hasOpenOverlay()) return
  cleanScrollLocks()
  forceScrollRecalculation()
}

export function BodyScrollRestorer() {
  const pathname = usePathname()

  useEffect(() => {
    // ── Immediate + timed cleanup on every navigation ──
    repair()
    const raf = requestAnimationFrame(repair)
    const timers = [50, 150, 300, 500, 1000].map((ms) =>
      setTimeout(repair, ms)
    )

    // ── MutationObserver: catch scroll locks re-applied AFTER cleanup ──
    // react-remove-scroll's teardown can fire after our timers, re-adding
    // data-scroll-locked to <html>. The observer catches that immediately.
    const attrObserver = new MutationObserver(() => {
      repair()
    })

    attrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "data-remove-scroll-bar"],
    })

    attrObserver.observe(document.body, {
      // `style` matters: `pointer-events: none` arrives as an inline style and
      // as nothing else, so without it the freeze goes unnoticed until the next
      // navigation.
      attributes: true,
      attributeFilter: ["data-scroll-locked", "data-remove-scroll-bar", "class", "style"],
    })

    // ── Child observer: catch portal unmount without proper cleanup ──
    // When a Radix dialog portal unmounts but react-remove-scroll doesn't
    // clean up, the attribute observer won't fire (no attribute change).
    // Watching childList on body catches the portal removal.
    const childObserver = new MutationObserver(() => {
      if (isScrollLocked() && !hasOpenOverlay()) {
        // Small delay to let react-remove-scroll finish its own teardown
        setTimeout(repair, 100)
      }
    })

    childObserver.observe(document.body, { childList: true })

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      attrObserver.disconnect()
      childObserver.disconnect()
    }
  }, [pathname])

  return null
}
