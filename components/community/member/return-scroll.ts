"use client"

/**
 * ===========================================================================
 *  BACK TO THE COMMUNITY, WHERE YOU WERE
 * ===========================================================================
 * Round 12, ask 7: "community, then the creator's page, then back: back to
 * the community is smooth and restores scroll". A creator's page (or a
 * profile, a product) is outside the community, so going there takes the
 * community's frame down, and coming back builds it again with the window
 * at the top: the feed you were halfway down started over.
 *
 * So the frame notes how far down each of its pages is (per address, in
 * sessionStorage for the tab, written as the page scrolls, a frame at a
 * time), and when an address of the community is reached by Back or
 * Forward (a popstate, never a link or a tab, which land at the top as
 * they should) it is put back there: on the first frames, and again while
 * the page is still growing to that height (lib/navigation/tab-scroll.ts
 * restoreTabScroll, which lets go the moment a finger or a wheel moves).
 */
import { useEffect, useLayoutEffect, useRef } from "react"
import { restoreTabScroll } from "@/lib/navigation/tab-scroll"

export const RETURN_SCROLL_KEY = "storelib:community-scroll"
/** How long after a Back the page that arrives counts as reached by it (a cold page can take a moment). */
export const BACK_WINDOW_MS = 4000
/** Places remembered per tab, the oldest dropped first. */
const KEPT = 40

let poppedAt = -Infinity
if (typeof window !== "undefined") window.addEventListener("popstate", () => (poppedAt = performance.now()))

function readAll(): Record<string, number> {
  try {
    const raw = window.sessionStorage.getItem(RETURN_SCROLL_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return v && typeof v === "object" ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function write(path: string, y: number) {
  try {
    const all = readAll()
    delete all[path]
    all[path] = Math.max(0, Math.round(y))
    const keys = Object.keys(all)
    for (const k of keys.slice(0, Math.max(0, keys.length - KEPT))) delete all[k]
    window.sessionStorage.setItem(RETURN_SCROLL_KEY, JSON.stringify(all))
  } catch {
    /* No storage: Back lands at the top, as before. */
  }
}

/** Where `path` was left, or null. */
export function returnScrollFor(path: string): number | null {
  const y = readAll()[path]
  return typeof y === "number" && Number.isFinite(y) && y > 0 ? y : null
}

/** Notes the scroll of the community's pages, and puts a page reached by Back where it was left. */
export function useReturnScroll(pathname: string) {
  const pathRef = useRef(pathname)
  pathRef.current = pathname
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        write(pathRef.current, window.scrollY)
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  /* Before the page is painted: a Back lands where it was left, never at the top first. */
  useLayoutEffect(() => {
    if (performance.now() - poppedAt > BACK_WINDOW_MS) return
    poppedAt = -Infinity
    const y = returnScrollFor(pathname)
    if (y === null) return
    return restoreTabScroll(y, 60)
  }, [pathname])
}
