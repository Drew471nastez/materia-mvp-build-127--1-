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
import { restoreTabScroll, tabScrollFor } from "@/lib/navigation/tab-scroll"
import { tabStorageGet, tabStorageSet } from "@/lib/nav/tab-session-persist"
import { pageScrollFor, rememberPageScroll } from "@/lib/native-resume"
import { isLayerBack } from "@/lib/nav/layer-back"

export const RETURN_SCROLL_KEY = "storelib:community-scroll"
/** How long after a Back the page that arrives counts as reached by it (a cold page can take a moment). */
export const BACK_WINDOW_MS = 4000
/** Places remembered per tab, the oldest dropped first. */
const KEPT = 40

let poppedAt = -Infinity
/* A layer closing (a post, the viewer) steps back too; the page under it never moved, so that is not a Back to restore (lib/nav/layer-back.ts). */
if (typeof window !== "undefined") window.addEventListener("popstate", () => void (isLayerBack() || (poppedAt = performance.now())))

function readAll(): Record<string, number> {
  try {
    const raw = tabStorageGet(RETURN_SCROLL_KEY)
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
    tabStorageSet(RETURN_SCROLL_KEY, JSON.stringify(all))
    rememberPageScroll(path, y)
  } catch {
    /* No storage: Back lands at the top, as before. */
  }
}

/** Where `path` was left, or null. */
export function returnScrollFor(path: string): number | null {
  const y = readAll()[path]
  return typeof y === "number" && Number.isFinite(y) && y > 0 ? y : null
}

/** The window, and /app's scroller when the page lives in one, back to the top. */
export function snapPageTop() {
  if (typeof window === "undefined") return
  const box = document.querySelector<HTMLElement>(".app-content-scroll")
  if (box && box.scrollTop !== 0) box.scrollTop = 0
  if (window.scrollY !== 0) window.scrollTo(0, 0)
}

/** Community, Learn, Calendar, Members, Leaderboards, About: the section itself, not a post or a lesson under it. */
export function isCommunitySectionRoot(pathname: string, slug: string): boolean {
  const base = `/community/${slug}`.replace(/\/+$/, "")
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  if (!base || path === base) return path === base && base.length > 0
  return ["/learn", "/classroom", "/events", "/members", "/leaderboard", "/about"].some((s) => path === `${base}${s}`)
}

/**
 * Landing on one of those sections puts the page at the top. A tap on
 * Community, Learn, Calendar, Members, Leaderboards or About is a new page,
 * and the frame stays mounted, so the window would otherwise stay where the
 * last section left it. Back and Forward still return to the saved place
 * (useReturnScroll). A reload keeps the browser's own place.
 */
export function useSectionTop(pathname: string, slug: string) {
  const seen = useRef(false)
  useLayoutEffect(() => {
    const first = !seen.current
    seen.current = true
    if (first) {
      /*
        A PAGE UNDER A SECTION (a post, a lesson) arriving fresh goes back where it was left. The sections themselves (the feed,
        Learn, Calendar...) land at their top (round 19, the owner: "when I land on the community feed it is not at the top,
        it is a bit down, and it glitches"): coming from the profile or reopening the app put the feed back part way down.
        Back still returns to the place it was left (useReturnScroll).
      */
      const saved = Math.max(tabScrollFor(pathname), returnScrollFor(pathname) ?? 0, pageScrollFor(pathname))
      if (saved > 0 && !isCommunitySectionRoot(pathname, slug)) return restoreTabScroll(saved, 50)
      if (performance.now() - poppedAt <= BACK_WINDOW_MS) return
      /* A reload or a document Back of THIS page keeps the browser's place. A client arrival from somewhere else does not: that scroll belonged to the page before. */
      try {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
        if (nav && (nav.type === "reload" || nav.type === "back_forward")) {
          const loaded = new URL(nav.name).pathname.replace(/\/+$/, "")
          const here = (pathname || "").replace(/\/+$/, "")
          if (loaded === here) return
        }
      } catch {
        /* A browser without the entry still starts at the top. */
      }
    }
    if (!isCommunitySectionRoot(pathname, slug)) return
    if (performance.now() - poppedAt <= BACK_WINDOW_MS) return
    snapPageTop()
    let frames = 0
    let id = 0
    let over = false
    const end = () => {
      if (over) return
      over = true
      cancelAnimationFrame(id)
      for (const t of inputs) window.removeEventListener(t, end, true)
    }
    const inputs = ["touchstart", "wheel", "keydown"] as const
    for (const t of inputs) window.addEventListener(t, end, { capture: true, passive: true })
    const watch = () => {
      if (over) return
      snapPageTop()
      if (++frames >= 12) return end()
      id = requestAnimationFrame(watch)
    }
    id = requestAnimationFrame(watch)
    return () => {
      end()
      for (const t of inputs) window.removeEventListener(t, end, true)
    }
  }, [pathname, slug])
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
