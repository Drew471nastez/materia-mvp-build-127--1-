"use client"

/**
 * ===========================================================================
 *  EACH TAB KEEPS ITS OWN PLACE
 * ===========================================================================
 * A phone's own tab bar never moves a tab's list: go to Library, come back
 * to Home, and Home is where you left it. The buyer's tab bar pushed, and a
 * push lands at the top, so every switch threw away how far down Explore or
 * the library somebody was.
 *
 * So the bar notes the scroll of the page it leaves, keyed by that page's
 * address, and the page it goes to is put back where it was noted, or at the
 * top when it never was. Explore puts itself back (lib/explore/
 * use-explore-scroll.ts, before its first paint), so for Explore this only
 * writes Explore's own two keys and lets it do it; every other tab is put
 * back here, once the address has changed and the page is tall enough.
 *
 * Kept for the tab in sessionStorage, like Explore's.
 */

import { tabStorageGet, tabStorageSet } from "@/lib/nav/tab-session-persist"

const KEY = "storelib:tab-scroll"
/* Explore's own keys (lib/explore/use-explore-scroll.ts): it restores itself when these say so. */
const EXPLORE_Y = "explore-scroll-position"
const EXPLORE_PENDING = "explore-scroll-restore-pending"

function isExplore(path: string): boolean {
  return path === "/explore" || path.startsWith("/explore/")
}

function pathOnly(href: string): string {
  return href.split(/[?#]/)[0] || "/"
}

function readAll(): Record<string, number> {
  try {
    const raw = tabStorageGet(KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return v && typeof v === "object" ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** The page being left, and how far down it is. */
export function noteTabScroll(path: string, y: number = typeof window === "undefined" ? 0 : window.scrollY): void {
  const at = pathOnly(path)
  const all = readAll()
  all[at] = Math.max(0, Math.round(y))
  try {
    tabStorageSet(KEY, JSON.stringify(all))
    if (isExplore(at)) sessionStorage.setItem(EXPLORE_Y, String(all[at]))
  } catch {
    /* no storage: the tab opens at the top, as it did */
  }
}

/** Where a tab was left, or 0. */
export function tabScrollFor(href: string): number {
  const y = readAll()[pathOnly(href)]
  return typeof y === "number" && Number.isFinite(y) && y > 0 ? y : 0
}

/**
 * Called just before the push to `href`. Explore is told to put itself
 * back; any other page is put back by `restoreTabScroll` after it lands.
 * Returns the y to restore, or null when the page restores itself.
 */
export function prepareTabArrival(href: string): number | null {
  const at = pathOnly(href)
  /* Profile and the library open at their top (round 15: "when I land on /account it should take me to the top of the page"). */
  if (opensAtTop(at)) return 0
  const y = tabScrollFor(at)
  if (isExplore(at)) {
    try {
      if (y > 0) {
        sessionStorage.setItem(EXPLORE_Y, String(y))
        sessionStorage.setItem(EXPLORE_PENDING, "1")
      } else {
        sessionStorage.removeItem(EXPLORE_PENDING)
      }
    } catch {
      /* Explore opens at the top */
    }
    return y > 0 ? null : 0
  }
  return y
}

/**
 * Profile and settings open at the top. The library keeps its own place
 * (a tab remembers how far down a list was).
 */
export function opensAtTop(path: string): boolean {
  if (path === "/account/library" || path.startsWith("/account/library/")) return false
  return path === "/account" || path.startsWith("/account/")
}

/**
 * Put the page that just arrived back at `y`. The page may still be
 * growing (a list streaming in, pictures sizing), so it tries on each frame
 * for a short while until the document is tall enough, then stops. Returns
 * the cancel, for a press that moves on before it is done.
 */
let pinPausedUntil = 0
let pinnedY: number | null = null

/** After the edit-profile sheet closes, do not yank /account to the top (a refresh remounts the page). */
export function pauseAccountScrollPin(ms = 1600, y?: number) {
  pinPausedUntil = typeof performance === "undefined" ? Date.now() + ms : performance.now() + ms
  if (typeof y === "number") pinnedY = y
  else if (typeof window !== "undefined") pinnedY = window.scrollY
}

export function accountScrollPinPaused(): boolean {
  const now = typeof performance === "undefined" ? Date.now() : performance.now()
  return now < pinPausedUntil
}

/**
 * Put the window at the top. A smooth call is one scroll, not a smooth scroll
 * cancelled on the next frame (that read as a jump). An instant call pins for
 * a few frames so the router cannot put a mid-page scroll back.
 */
export function scrollPageToTop(opts?: { smooth?: boolean; frames?: number }): () => void {
  if (typeof window === "undefined") return () => {}
  if (document.querySelector("[data-edit-profile-sheet]")) return () => {}
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const smooth = !!opts?.smooth && !reduce && window.scrollY > 8
  let cancelled = false
  const stop = () => {
    cancelled = true
  }
  window.addEventListener("touchstart", stop, { once: true, passive: true })
  window.addEventListener("wheel", stop, { once: true, passive: true })
  const clear = () => {
    window.removeEventListener("touchstart", stop)
    window.removeEventListener("wheel", stop)
  }
  if (smooth) {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" })
    const t = window.setTimeout(() => {
      if (!cancelled && window.scrollY > 2) window.scrollTo(0, 0)
      clear()
    }, 680)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      clear()
    }
  }
  const pin = () => {
    if (cancelled) return
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }
  pin()
  let n = 0
  const max = Math.max(1, opts?.frames ?? 12)
  let id = 0
  const tick = () => {
    if (cancelled) return clear()
    pin()
    if (++n >= max) return clear()
    id = requestAnimationFrame(tick)
  }
  id = requestAnimationFrame(tick)
  return () => {
    cancelled = true
    cancelAnimationFrame(id)
    clear()
  }
}

/** Where a paused pin should stay (the profile under the edit sheet). */
export function accountPinnedScroll(): number | null {
  return pinnedY
}

export function restoreTabScroll(y: number, maxFrames = 30): () => void {
  if (typeof window === "undefined") return () => {}
  let frame = 0
  let tries = 0
  let cancelled = false
  /* A finger or a wheel moving the page means the person has taken over. */
  const stop = () => {
    cancelled = true
  }
  window.addEventListener("touchstart", stop, { once: true, passive: true })
  window.addEventListener("wheel", stop, { once: true, passive: true })
  const done = () => {
    window.removeEventListener("touchstart", stop)
    window.removeEventListener("wheel", stop)
  }
  const step = () => {
    if (cancelled) return done()
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const target = Math.min(y, max)
    if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target)
    tries++
    if (target >= y || tries >= maxFrames) return done()
    frame = requestAnimationFrame(step)
  }
  step()
  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
    done()
  }
}
