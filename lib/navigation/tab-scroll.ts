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
    const raw = sessionStorage.getItem(KEY)
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
    sessionStorage.setItem(KEY, JSON.stringify(all))
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

/** The account's pages, which always open at their top from a tab. */
export function opensAtTop(path: string): boolean {
  return path === "/account" || path.startsWith("/account/")
}

/**
 * Put the page that just arrived back at `y`. The page may still be
 * growing (a list streaming in, pictures sizing), so it tries on each frame
 * for a short while until the document is tall enough, then stops. Returns
 * the cancel, for a press that moves on before it is done.
 */
/** Put the window (and any account sheet scroll) at the top; repeat for a few frames so Next cannot restore mid-scroll. */
export function scrollPageToTop(opts?: { smooth?: boolean; frames?: number }): () => void {
  if (typeof window === "undefined") return () => {}
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const behavior = opts?.smooth && !reduce ? "smooth" : "auto"
  const max = Math.max(1, opts?.frames ?? 4)
  const apply = () => {
    window.scrollTo({ top: 0, left: 0, behavior })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    document.querySelector<HTMLElement>("[data-settings-sheet-scroll]")?.scrollTo({ top: 0, behavior: "auto" })
  }
  apply()
  let frame = 0
  let id = 0
  const tick = () => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    frame++
    if (frame < max) id = requestAnimationFrame(tick)
  }
  id = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(id)
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
