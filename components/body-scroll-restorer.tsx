"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Fixes scroll after SPA navigation between route groups.
 *
 * Cleans up any scroll-blocking CSS artefacts (classes, inline styles,
 * attributes, injected <style> tags) left behind by previous routes,
 * and forces the browser to recalculate scroll containers via an
 * overflow toggle + forced reflow + synthetic resize event.
 */

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

export function BodyScrollRestorer() {
  const pathname = usePathname()

  useEffect(() => {
    repair()
    const raf = requestAnimationFrame(repair)
    const t1 = setTimeout(repair, 100)
    const t2 = setTimeout(repair, 400)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [pathname])

  return null
}
