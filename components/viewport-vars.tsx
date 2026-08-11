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
    let settleTimer = 0

    /**
     * ===================================================================
     *  THE KEYBOARD CLOSING IS ONE STEP, NOT A MOVEMENT
     * ===================================================================
     * iOS animates the keyboard down over about a quarter of a second and
     * then reports the new viewport ONCE, at the end. So everything sized
     * from `--vv-h` — the conversation shell, its composer, the messages
     * above it — is correct, then correct at a different size, with nothing
     * in between. That single step is the bump: the layout is never wrong,
     * it just arrives in one frame.
     *
     * There is nothing to interpolate here, because the intermediate sizes
     * were never reported. What can be done is let CSS carry the change:
     * a class is put on <html> for the length of the settle, and the shell
     * transitions its geometry only while it is there.
     *
     * ONLY FOR A JUMP. A collapsing browser toolbar is sixty-odd pixels and
     * a page scrolled under an open keyboard moves `offsetTop` continuously
     * — transitioning those would make the screen lag a finger that is
     * actively dragging it, which is a worse fault than the one being
     * fixed. 80px is comfortably above a toolbar and far below a keyboard.
     */
    const settle = () => {
      root.classList.add("vv-settling")
      /* Read forced BEFORE the variable changes. A transition only runs if
         the transition property was already in effect at the previous style
         resolution — set both in the same frame and the browser has nothing
         to interpolate from, so the value snaps and the class does nothing.
         One reflow per keyboard toggle, not per scroll event. */
      void root.offsetHeight
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => root.classList.remove("vv-settling"), 340)
    }

    const apply = () => {
      const h = Math.round(vv?.height ?? window.innerHeight)
      const top = Math.round(vv?.offsetTop ?? 0)
      if (h !== lastH) {
        if (lastH >= 0 && Math.abs(h - lastH) > 80) settle()
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
      window.clearTimeout(settleTimer)
      root.classList.remove("vv-settling")
      root.style.removeProperty("--vv-h")
      root.style.removeProperty("--vv-top")
      delete root.dataset.keyboard
    }
  }, [])

  return null
}
