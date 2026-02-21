"use client"

import { useEffect } from "react"

/**
 * Cleans up stale scroll locks left by Radix Dialog/Sheet (react-remove-scroll)
 * when navigating between route groups (e.g., /library → /explore).
 *
 * Radix sets `data-scroll-locked` on <body> and injects a <style> with
 * `body[data-scroll-locked] { overflow: hidden !important }`. If the dialog
 * unmounts during navigation before cleanup runs, these persist and block scroll.
 *
 * Mount this component in layouts that need scrolling restored on entry.
 */
export function BodyScrollRestorer() {
  useEffect(() => {
    // Remove Radix's scroll-lock attribute (body[data-scroll-locked] CSS blocks scrolling)
    document.body.removeAttribute("data-scroll-locked")

    // Remove scroll-bar-hiding class added by react-remove-scroll-bar
    document.body.classList.remove("with-scroll-bars-hidden")

    // Remove custom modal-open class (used in globals.css)
    document.body.classList.remove("modal-open")

    // Clear any inline styles that block scrolling
    document.body.style.overflow = ""
    document.body.style.pointerEvents = ""
    document.body.style.position = ""
    document.body.style.width = ""
    document.body.style.top = ""
    document.body.style.paddingRight = ""
    document.body.style.overscrollBehavior = ""
    document.documentElement.style.overscrollBehavior = ""
  }, [])

  return null
}
