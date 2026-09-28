"use client"

import { usePathname } from "next/navigation"
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { LIBRARY_TAB_EVENT } from "./library-tabs"

/**
 * ===========================================================================
 *  THE SCREEN UNDER THE LIBRARY'S PILLS, AND HOW IT CHANGES
 * ===========================================================================
 * "The same navigation feeling as /app settings." Settings changes its panel
 * with one short fade, opacity 0.2 to 1 over 200ms on its ease out
 * (app/globals.css .settings-panel), and holds the page's height for the
 * press so the row under the finger never jumps. The library's tabs are
 * routes, not panels, so the same two things are done here around whatever
 * the router puts in:
 *
 *   THE FADE. When the address changes after a pill was pressed, the new
 *   screen fades up from 0.2 in the frame it first paints (a layout effect,
 *   so it is never seen at full strength first). A screen that was not in
 *   the router's cache yet shows its skeleton at once instead of after the
 *   usual 200ms wait (data-library-nav below: the old screen goes straight
 *   to a skeleton of the new one's shape, never to an empty page), and the
 *   real one fades up over it when it lands.
 *
 *   THE HEIGHT. Part way down a long list, a press on a shorter tab would
 *   leave the page scrolled past its own end; the browser pulls it back and
 *   the pills jump under the finger. So before the change the screen is told
 *   to be at least as tall as the scroll needs, exactly as settings does it
 *   (components/app/settings-form-new.tsx handleTabChange).
 *
 * Only opacity moves, never a transform: a transform here would become the
 * containing block of every fixed thing inside (a sheet, the download tray).
 * On a first load, and with less motion asked for, nothing animates.
 */
export const PANEL_FADE_MS = 200
export const PANEL_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

export function LibraryPanel({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const releaseTimer = useRef<number | null>(null)

  const fade = () => {
    const el = ref.current
    if (!el || typeof el.animate !== "function") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.getAnimations?.().forEach((a) => a.cancel())
    el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: PANEL_FADE_MS, easing: PANEL_EASE })
  }

  const release = () => {
    const el = ref.current
    if (releaseTimer.current) window.clearTimeout(releaseTimer.current)
    releaseTimer.current = null
    el?.removeAttribute("data-library-nav")
  }

  /* The press: hold the height, and say a tab is on its way. */
  useEffect(() => {
    const onPress = () => {
      const el = ref.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      el.style.minHeight = `${Math.max(0, Math.ceil(window.scrollY + window.innerHeight - top))}px`
      el.setAttribute("data-library-nav", "tab")
      pressed.current = true
      if (releaseTimer.current) window.clearTimeout(releaseTimer.current)
      /* Never left on: a navigation that went nowhere lets the next load be itself. */
      releaseTimer.current = window.setTimeout(release, 8000)
    }
    window.addEventListener(LIBRARY_TAB_EVENT, onPress)
    return () => window.removeEventListener(LIBRARY_TAB_EVENT, onPress)
  }, [])

  /* The address changed: the new screen, or its skeleton, fades up in its first frame. */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (!pressed.current) {
      /* Arrived some other way (a product, the back button): the page is its own height again. */
      el.style.minHeight = ""
      release()
      return
    }
    pressed.current = false
    fade()
    if (!el.querySelector("[data-library-skeleton]")) release()
  }, [pathname])

  /* A skeleton that gives way to the real screen: that screen fades up too. */
  useEffect(() => {
    const el = ref.current
    if (!el || typeof MutationObserver === "undefined") return
    let had = !!el.querySelector("[data-library-skeleton]")
    const mo = new MutationObserver(() => {
      const has = !!el.querySelector("[data-library-skeleton]")
      if (had && !has && el.hasAttribute("data-library-nav")) {
        fade()
        release()
      }
      had = has
    })
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  useEffect(() => () => {
    if (releaseTimer.current) window.clearTimeout(releaseTimer.current)
  }, [])

  return (
    <div ref={ref} data-library-panel="">
      {children}
    </div>
  )
}
