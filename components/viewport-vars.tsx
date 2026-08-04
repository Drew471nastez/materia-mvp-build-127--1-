"use client"

import { useEffect } from "react"

/**
 * Publishes the VISIBLE viewport — the one the keyboard leaves you — on <html>.
 *
 *   --vv-h    height of what is actually on screen
 *   --vv-top  how far the layout viewport has been scrolled out from under it
 *   data-keyboard="open" when something is eating a serious share of the screen
 *
 * This lived inside the conversation, which was the bug rather than the design.
 * A route with a loading boundary paints its skeleton first and the real screen
 * second, and only the second one had the effect — so the skeleton sized itself
 * from the fallback (`100dvh`) and the real thread from visualViewport, and any
 * difference between those two numbers was a jump at the exact moment of the
 * handover. On a phone with a keyboard open, or a browser with a collapsing
 * toolbar, that difference is not small.
 *
 * Published once, from the root, it is the same number for both. The skeleton
 * and the screen that replaces it are then the same box to the pixel, which is
 * the whole trick to a swap you cannot see.
 *
 * Costs one listener for the life of the tab and writes only when a value
 * actually changes, so nothing downstream is invalidated by a scroll that
 * happened to fire.
 */
export function ViewportVars() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    let lastH = -1
    let lastTop = -1
    let lastKb: boolean | null = null

    const apply = () => {
      const h = Math.round(vv?.height ?? window.innerHeight)
      const top = Math.round(vv?.offsetTop ?? 0)
      if (h !== lastH) {
        lastH = h
        root.style.setProperty("--vv-h", `${h}px`)
      }
      if (top !== lastTop) {
        lastTop = top
        root.style.setProperty("--vv-top", `${top}px`)
      }
      // Loose on purpose: a browser toolbar collapsing is sixty-odd pixels, a
      // keyboard is never less than about a quarter of the screen. Nothing in
      // between should be mistaken for one.
      const kb = window.innerHeight - h > window.innerHeight * 0.2
      if (kb !== lastKb) {
        lastKb = kb
        if (kb) root.dataset.keyboard = "open"
        else delete root.dataset.keyboard
      }
    }

    apply()
    vv?.addEventListener("resize", apply)
    // Not optional on iOS: the page can be scrolled underneath an open keyboard,
    // and without following offsetTop a pinned column drifts off the top.
    vv?.addEventListener("scroll", apply)
    window.addEventListener("resize", apply)
    window.addEventListener("orientationchange", apply)
    return () => {
      vv?.removeEventListener("resize", apply)
      vv?.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
      window.removeEventListener("orientationchange", apply)
      root.style.removeProperty("--vv-h")
      root.style.removeProperty("--vv-top")
      delete root.dataset.keyboard
    }
  }, [])

  return null
}
