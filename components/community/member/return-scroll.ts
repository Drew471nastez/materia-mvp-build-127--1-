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
/*
  A layer closing (a post, the viewer) steps back too; the page under it never moved, so that is not a Back to restore
  (lib/nav/layer-back.ts). Nor is it an arrival: the address it steps back to is the page that was under the layer all along,
  and useSectionTop below must leave it where it is (see A LAYER CLOSING IS NOT AN ARRIVAL).
*/
let layerBack: { path: string; at: number } | null = null
const bare = (path: string) => (path || "").split(/[?#]/)[0].replace(/\/+$/, "")
if (typeof window !== "undefined")
  window.addEventListener("popstate", () => {
    if (isLayerBack()) layerBack = { path: bare(window.location.pathname), at: performance.now() }
    else poppedAt = performance.now()
  })

/** Whether `pathname` is the page a layer (a post opened over it, the viewer) has just closed back onto. */
export function closedLayerOnto(pathname: string): boolean {
  return !!layerBack && layerBack.path === bare(pathname) && performance.now() - layerBack.at <= BACK_WINDOW_MS
}

/* The page a Back last landed on, and when: useReturnScroll uses up `poppedAt` before the frame watches the page swap in. */
let backLanding: { path: string; at: number } | null = null

/** Whether the page arriving now was reached by Back or Forward a moment ago: it is put back as it was, with no landing. */
export function arrivedByBack(withinMs = 1500): boolean {
  if (typeof performance === "undefined" || typeof window === "undefined") return false
  if (performance.now() - poppedAt < withinMs) return true
  return !!backLanding && backLanding.path === window.location.pathname && performance.now() - backLanding.at < withinMs
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   BACK LANDS ON THE SAME POST, NOT THE SAME NUMBER (round 24)
  ═══════════════════════════════════════════════════════════════════════════
  The window's scroll alone was put back, on the first frame, while the feed
  under it was still settling (cards are drawn at an estimated height until
  they are on screen, content-visibility): the posts moved 38px under a
  page that had arrived where it was left. The post at the top of the
  screen is noted with the scroll, and for the frames the feed takes to
  settle it is kept exactly where it was, until a finger or a wheel moves.
*/
const ANCHOR_KEY = "storelib:community-anchor"
type Anchor = { id: string; top: number }

function anchorNow(): Anchor | null {
  if (typeof document === "undefined") return null
  const y = Math.min(window.innerHeight - 1, Math.max(0, (document.querySelector("[data-community-top]")?.getBoundingClientRect().bottom ?? 0) + 24))
  const hit = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(y))?.closest<HTMLElement>("[data-post]")
  const id = hit?.getAttribute("data-post")
  return hit && id ? { id, top: Math.round(hit.getBoundingClientRect().top) } : null
}

function writeAnchor(path: string, a: Anchor | null) {
  try {
    const raw = tabStorageGet(ANCHOR_KEY)
    const all = (raw ? (JSON.parse(raw) as Record<string, Anchor>) : {}) ?? {}
    delete all[path]
    if (a) all[path] = a
    const keys = Object.keys(all)
    for (const k of keys.slice(0, Math.max(0, keys.length - KEPT))) delete all[k]
    tabStorageSet(ANCHOR_KEY, JSON.stringify(all))
  } catch {
    /* No storage: the scroll alone is put back. */
  }
}

function anchorFor(path: string): Anchor | null {
  try {
    const raw = tabStorageGet(ANCHOR_KEY)
    const a = raw ? (JSON.parse(raw) as Record<string, Anchor>)[path] : null
    return a && typeof a.id === "string" && Number.isFinite(a.top) ? a : null
  } catch {
    return null
  }
}

/** For `frames` frames, keep the noted post where it was on screen (at `y` while it is not drawn yet), unless the person moves the page. */
function holdAnchor(a: Anchor, y: number, frames = 30): () => void {
  let n = 0
  let id = 0
  let over = false
  const stop = () => {
    over = true
  }
  window.addEventListener("touchstart", stop, { once: true, passive: true })
  window.addEventListener("wheel", stop, { once: true, passive: true })
  const step = () => {
    if (over) return
    const el = document.querySelector<HTMLElement>(`[data-post="${CSS.escape(a.id)}"]`)
    if (el) {
      const d = el.getBoundingClientRect().top - a.top
      if (Math.abs(d) > 1) window.scrollTo(0, Math.max(0, window.scrollY + d))
    } else if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y)
    if (++n < frames) id = requestAnimationFrame(step)
  }
  step()
  return () => {
    over = true
    cancelAnimationFrame(id)
    window.removeEventListener("touchstart", stop)
    window.removeEventListener("wheel", stop)
  }
}

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
    /*
      A LAYER CLOSING IS NOT AN ARRIVAL. A post opened over the feed puts its own address up and the router hears it; closing the
      post steps back to the feed's address, which read here as landing on the feed from somewhere else, and the feed was
      snapped to its top under the post as it went back into its card: the member lost their place in the feed on every close
      (scripts/check-community-morph.mjs: scrolled 389px down before the open, 0 after the close, the post shrinking onto
      where its card had been and the card then 389px lower).
    */
    if (closedLayerOnto(pathname)) return
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
  /*
    NOTED WHEN THE SCROLL RESTS, NOT ON EVERY FRAME (round 24). Each frame of a scroll wrote the place to session storage, and in
    the app to local storage twice more: three synchronous reads, parses and writes of a forty-entry list per frame on
    WKWebView, in the middle of the scroll. Now it is noted 150ms after the scroll rests, and at once when the place is about
    to matter: a finger landing (a tap that leaves), Back, the tab going to the background, the frame going away.
  */
  useEffect(() => {
    let timer = 0
    const flush = () => {
      window.clearTimeout(timer)
      timer = 0
      write(pathRef.current, window.scrollY)
      writeAnchor(pathRef.current, window.scrollY > 0 ? anchorNow() : null)
    }
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, 150)
    }
    const soon = () => {
      if (timer) flush()
    }
    const onHide = () => {
      if (document.visibilityState === "hidden") soon()
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pointerdown", soon, { capture: true, passive: true })
    window.addEventListener("popstate", soon, { capture: true })
    window.addEventListener("pagehide", soon)
    document.addEventListener("visibilitychange", onHide)
    return () => {
      soon()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointerdown", soon, { capture: true })
      window.removeEventListener("popstate", soon, { capture: true })
      window.removeEventListener("pagehide", soon)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [])
  /* Before the page is painted: a Back lands where it was left, never at the top first. */
  useLayoutEffect(() => {
    if (performance.now() - poppedAt > BACK_WINDOW_MS) return
    poppedAt = -Infinity
    backLanding = { path: (pathname || "").split(/[?#]/)[0], at: performance.now() }
    const y = returnScrollFor(pathname)
    if (y === null) return
    const anchor = anchorFor(pathname)
    /* With a post noted, it leads: the number is only where to start, and where to stay while the post is not drawn yet. */
    if (anchor) return holdAnchor(anchor, y)
    return restoreTabScroll(y, 60)
  }, [pathname])
}
