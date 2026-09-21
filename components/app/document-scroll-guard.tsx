"use client"

import { useEffect } from "react"

/**
 * ===========================================================================
 *  THE DOCUMENT IS NEVER SCROLLED ON /app
 * ===========================================================================
 * "The announcement bar underlaps the header. It's an entire page problem,
 * desktop and mobile."
 *
 * Every /app page scrolls inside a container; the document itself is
 * `overflow: hidden` and the header is `position: fixed` on top of it. That
 * arrangement holds only as long as nothing scrolls the document — and
 * `overflow: hidden` does not stop anything from scrolling it, it stops YOU
 * from scrolling it. `scrollIntoView` scrolls every ancestor, hidden or not.
 * Focusing an input does. And on iOS an overscroll at the top of an inner
 * container can chain into the document and leave it there, with nothing a
 * finger can do to bring it back. The result is the whole page sitting
 * twenty-odd pixels up underneath the fixed header, on every page, for as
 * long as the app stays open.
 *
 * So the rule is made true rather than assumed: when the document moves, it
 * is put back, on the next frame, from a passive listener. Nothing on /app
 * legitimately scrolls the document — the keyboard and rotation code in
 * app-layout-wrapper already exists only to put it back to zero — so there is
 * nothing here to conflict with.
 *
 * Mounted by AppLayoutWrapper, and by scripts/render-dashboard-nav.tsx so the
 * probe can scroll the document on purpose and watch it return.
 */
export function DocumentScrollGuard() {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    const settle = () => {
      frame = 0
      if (window.scrollY > 0 || root.scrollTop > 0 || document.body.scrollTop > 0) {
        root.scrollTop = 0
        document.body.scrollTop = 0
        window.scrollTo(0, 0)
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(settle)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    settle()
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
