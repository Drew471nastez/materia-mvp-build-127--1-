"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

/** sessionStorage key shared by /explore and /explore/* category pages. */
export const EXPLORE_SCROLL_KEY = "explore-scroll-position"

function isExploreSurface(path = ""): boolean {
  return path === "/explore" || path.startsWith("/explore/")
}

function readSavedScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(EXPLORE_SCROLL_KEY)
    if (!raw) return null
    const y = parseInt(raw, 10)
    return Number.isFinite(y) && y >= 0 ? y : null
  } catch {
    return null
  }
}

function writeScroll(y: number) {
  try {
    sessionStorage.setItem(EXPLORE_SCROLL_KEY, String(Math.max(0, y)))
  } catch {
    /* Private mode, or storage that is full. */
  }
}

const RESTORE_PENDING_KEY = "explore-scroll-restore-pending"
const HOLD_CLASS = "explore-scroll-restoring"

/** Soft navigations do not update PerformanceNavigationTiming; popstate does. */
let backTraversal = false

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    backTraversal = true
  })
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && isExploreSurface(window.location.pathname)) {
      backTraversal = true
    }
  })
  const clearTraversal = () => {
    backTraversal = false
  }
  const { pushState, replaceState } = history
  history.pushState = function (...args) {
    clearTraversal()
    return pushState.apply(this, args)
  }
  history.replaceState = function (...args) {
    clearTraversal()
    return replaceState.apply(this, args)
  }
}

function peekRestorePending(): boolean {
  try {
    return sessionStorage.getItem(RESTORE_PENDING_KEY) === "1"
  } catch {
    return false
  }
}

/** True while explore is putting scroll back after back from a product. */
export function exploreScrollRestoreActive(): boolean {
  if (typeof window === "undefined") return false
  if (document.documentElement.classList.contains(HOLD_CLASS)) return true
  if (!isExploreSurface(window.location.pathname)) return false
  if (!peekRestorePending() && !backTraversal) return false
  const y = readSavedScroll()
  return y != null && y > 0
}

/**
 * Explore after leaving for a product: hold (only when the page is not yet
 * tall enough to stand at the saved place) and scroll, before paint (pairs
 * with explore-scroll-boot in the root layout for a document load).
 *
 * NOT DURING RENDER (round 11). This ran in the render of the incoming page,
 * when the page on screen is still the product: it scrolled the PRODUCT to
 * Explore's saved place and put `overflow: hidden` on <html> (the hold),
 * which on a computer takes the scrollbar away and shifts the product
 * sideways, all before Explore had even committed. It is called from the
 * layout effect now, where the DOM is Explore's.
 */
export function primeExploreScrollRestore(): boolean {
  if (typeof window === "undefined" || !isExploreSurface(window.location.pathname)) return false
  const target = readSavedScroll()
  if (target == null || target <= 0) return false
  setSettling(true)
  if (scrollToSaved(target)) return true
  setExploreHold(true)
  return false
}

function shouldRestoreOnEnter(): boolean {
  try {
    if (sessionStorage.getItem(RESTORE_PENDING_KEY) === "1") {
      sessionStorage.removeItem(RESTORE_PENDING_KEY)
      return true
    }
  } catch {
    /* ignore */
  }
  if (backTraversal) {
    backTraversal = false
    return true
  }
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    return nav?.type === "reload"
  } catch {
    return false
  }
}

function scrollToSaved(target: number): boolean {
  const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const y = Math.min(target, maxY)
  window.scrollTo(0, y)
  return Math.abs(window.scrollY - y) < 2
}

function setExploreHold(on: boolean) {
  document.documentElement.classList.toggle(HOLD_CLASS, on)
}

/*
  ===========================================================================
   COMING BACK IS ONE STILL PICTURE, THEN A GENTLE FADE
  ===========================================================================
  Filmed on the way back from a product (round 11): Explore's first frame
  stood at 1516 with the card the visitor had left at 291px showing at
  275px, and the next frame jumped it back to 1500. Nothing of ours scrolled
  to 1516: it was the browser's scroll anchoring, nudging the page while
  parts above the fold settled, and the restore loop then pulling it back.
  With anchoring off the same back lands at 1500, card at 291, on its first
  frame. So while Explore is putting itself back (and for a moment after,
  while the pictures above settle) anchoring is off, and the page comes in
  with a short fade from most of the way there rather than a hard cut.
  (globals.css: html.explore-scroll-settling.)
*/
const SETTLE_CLASS = "explore-scroll-settling"
/** Long enough for the fade (220ms) and the first pictures above to settle. */
export const EXPLORE_SETTLE_MS = 420
let settleTimer = 0

function setSettling(on: boolean) {
  window.clearTimeout(settleTimer)
  document.documentElement.classList.toggle(SETTLE_CLASS, on)
  if (on) settleTimer = window.setTimeout(() => document.documentElement.classList.remove(SETTLE_CLASS), EXPLORE_SETTLE_MS)
}

/**
 * Puts Explore back at the saved place, trying each frame while the page is
 * still growing. Returns the cancel.
 *
 * IT STOPS THE MOMENT IT IS NOT WANTED. It used to try for 48 frames
 * whatever happened, so a quick press on a card while it was still trying
 * opened the product and the loop went on scrolling the PRODUCT to
 * Explore's place ("the product page lands mid scroll"), and a finger
 * scrolling Explore in those frames was pulled back. Now it stops when the
 * address is no longer Explore's, when a finger, a wheel or a key moves the
 * page, and when Explore unmounts.
 */
function restoreScrollPosition(onDone?: () => void): () => void {
  const target = readSavedScroll()
  if (target == null || target <= 0) {
    setExploreHold(false)
    onDone?.()
    return () => {}
  }

  primeExploreScrollRestore()

  let attempts = 0
  let frame = 0
  let timer = 0
  let over = false
  const path = window.location.pathname
  const stopEvents = ["touchstart", "wheel", "keydown"] as const
  const finish = (reveal: boolean) => {
    if (over) return
    over = true
    cancelAnimationFrame(frame)
    window.clearTimeout(timer)
    for (const t of stopEvents) window.removeEventListener(t, stop)
    const root = document.documentElement
    const held = root.classList.contains(HOLD_CLASS)
    setExploreHold(false)
    if (reveal) {
      /* Held out of sight while the page grew: the fade starts now, as it shows, not back when it was hidden. */
      if (held) {
        root.classList.remove(SETTLE_CLASS)
        void root.offsetWidth
      }
      setSettling(true)
    }
    onDone?.()
  }
  const stop = () => finish(true)
  const tryOnce = () => {
    if (over) return
    if (window.location.pathname !== path) return finish(false)
    attempts += 1
    if (scrollToSaved(target) || attempts >= 48) return finish(true)
    frame = requestAnimationFrame(tryOnce)
  }
  for (const t of stopEvents) window.addEventListener(t, stop, { passive: true })
  frame = requestAnimationFrame(tryOnce)
  timer = window.setTimeout(stop, 700)
  /* Explore unmounting (a card pressed while it was still trying): stop, and show nothing of it. */
  return () => finish(false)
}

/**
 * Call right before leaving an explore browse surface for a product (same tab).
 * No-op when the current path is not /explore or a category page under it.
 */
export function saveExploreScrollNow(): void {
  if (typeof window === "undefined" || !isExploreSurface(window.location.pathname)) return
  writeScroll(window.scrollY)
  try {
    sessionStorage.setItem(RESTORE_PENDING_KEY, "1")
  } catch {
    /* ignore */
  }
}

/**
 * Keeps explore scroll in sessionStorage and puts it back after back/reload,
 * without writing on every scroll event (one rAF-throttled write per frame).
 */
export function useExploreScrollRestore(): void {
  const restoringRef = useRef(false)
  const [, bump] = useState(0)

  /* Before paint: scroll back to where you were so the top of Explore never flashes. */
  useLayoutEffect(() => {
    if (!isExploreSurface(window.location.pathname)) return
    if (!shouldRestoreOnEnter()) return
    const target = readSavedScroll()
    if (target == null || target <= 0) {
      setExploreHold(false)
      return
    }

    restoringRef.current = true
    const cancel = restoreScrollPosition(() => {
      restoringRef.current = false
      bump((n) => n + 1)
    })
    return cancel
  }, [])

  useEffect(() => {
    if (!isExploreSurface(window.location.pathname)) return

    let frame = 0
    const write = () => {
      frame = 0
      if (restoringRef.current) return
      writeScroll(window.scrollY)
    }
    const handleLeave = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      const y = window.scrollY
      writeScroll(y)
      if (y > 0) {
        try {
          sessionStorage.setItem(RESTORE_PENDING_KEY, "1")
        } catch {
          /* ignore */
        }
      }
    }
    const handleScroll = () => {
      if (restoringRef.current) return
      if (frame) return
      frame = requestAnimationFrame(write)
    }

    const beforeRestoration = history.scrollRestoration
    history.scrollRestoration = "manual"

    window.addEventListener("beforeunload", handleLeave)
    window.addEventListener("pagehide", handleLeave)
    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      history.scrollRestoration = beforeRestoration
      window.removeEventListener("beforeunload", handleLeave)
      window.removeEventListener("pagehide", handleLeave)
      window.removeEventListener("scroll", handleScroll)
      if (frame) handleLeave()
      setExploreHold(false)
    }
  }, [])
}

/** Skip entrance skeletons while scroll restore is in flight (back from a product). */
export function useExploreScrollRestoring(): boolean {
  const [active, setActive] = useState(() => exploreScrollRestoreActive())
  useLayoutEffect(() => {
    setActive(exploreScrollRestoreActive())
    const onEnd = () => setActive(false)
    const obs = new MutationObserver(() => {
      if (!document.documentElement.classList.contains(HOLD_CLASS)) onEnd()
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return active
}
