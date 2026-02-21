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

function forceScrollRecalculation() {
  const html = document.documentElement
  const body = document.body

  void html.scrollHeight
  void body.scrollHeight

  // Toggle overflow-y to force the browser to re-evaluate scroll containers
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
