"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

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

function restoreScrollPosition(onDone?: () => void): void {
  const target = readSavedScroll()
  if (target == null || target <= 0) {
    onDone?.()
    return
  }

  setExploreHold(true)
  scrollToSaved(target)

  let attempts = 0
  const finish = () => {
    setExploreHold(false)
    onDone?.()
  }
  const tryOnce = () => {
    attempts += 1
    if (scrollToSaved(target) || attempts >= 48) {
      requestAnimationFrame(finish)
      return
    }
    requestAnimationFrame(tryOnce)
  }
  requestAnimationFrame(tryOnce)
  window.setTimeout(finish, 700)
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

  /* Before paint: scroll back to where you were so the top of Explore never flashes. */
  useLayoutEffect(() => {
    if (!isExploreSurface(window.location.pathname)) return
    if (!shouldRestoreOnEnter()) return
    const target = readSavedScroll()
    if (target == null || target <= 0) return

    restoringRef.current = true
    restoreScrollPosition(() => {
      restoringRef.current = false
    })
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
