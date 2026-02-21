"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Nuclear scroll-lock cleanup for marketing pages.
 *
 * When navigating between route groups (e.g., /library → /explore), various
 * scroll-locking mechanisms can leave artifacts that permanently block scrolling:
 *
 * 1. Radix Dialog's react-remove-scroll sets `data-scroll-locked` on <body>,
 *    injects <style> tags with `overflow: hidden !important`, adds
 *    `block-interactivity-*` classes, and registers wheel/touchmove event listeners
 * 2. Custom modal systems (explore page) use a `modal-open` class on <body>
 * 3. Various components set inline `overflow: hidden` on body
 *
 * This component aggressively cleans ALL of these on every route change.
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

export function BodyScrollRestorer() {
  const pathname = usePathname()

  useEffect(() => {
    // Run cleanup immediately
    cleanScrollLocks()

    // Run again after browser paint (catches delayed style applications)
    const raf = requestAnimationFrame(() => {
      cleanScrollLocks()
    })

    // Run once more after a short delay (catches async style changes)
    const timer = setTimeout(() => {
      cleanScrollLocks()
    }, 100)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [pathname])

  return null
}
