"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * sessionStorage key shared by /explore and /explore/* category pages.
 *
 * ONE PLACE PER PAGE, NOT ONE FOR ALL OF THEM. It held a single number, so
 * Explore, then a category, then Back put Explore at the category's offset.
 * It holds `{ "<path>": y }` now (explore-scroll-boot reads the same shape).
 */
export const EXPLORE_SCROLL_KEY = "explore-scroll-position"

function isExploreSurface(path = ""): boolean {
  return path === "/explore" || path.startsWith("/explore/")
}

function readPlaces(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(EXPLORE_SCROLL_KEY)
    const places: unknown = raw ? JSON.parse(raw) : null
    return places && typeof places === "object" ? (places as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function readSavedScroll(): number | null {
  const y = readPlaces()[window.location.pathname]
  return typeof y === "number" && Number.isFinite(y) && y >= 0 ? y : null
}

/** `path` is the page the position belongs to: read when its listeners were set, because on the way out the address is already the next page's. */
function writeScroll(y: number, path: string = window.location.pathname) {
  try {
    const places = readPlaces()
    places[path] = Math.max(0, Math.round(y))
    sessionStorage.setItem(EXPLORE_SCROLL_KEY, JSON.stringify(places))
  } catch {
    /* Private mode, or storage that is full. */
  }
}

const RESTORE_PENDING_KEY = "explore-scroll-restore-pending"
const HOLD_CLASS = "explore-scroll-restoring"

/**
 * ===========================================================================
 *  THE LONGEST EXPLORE IS EVER HIDDEN, WHATEVER HAPPENS
 * ===========================================================================
 * While the place is put back and the page is still too short to stand at
 * it, `html.explore-scroll-restoring` hides Explore (app/globals.css). A
 * hide with no end is a blank page, and that is what was reported:
 * "sometimes Explore is completely empty until I reload". So every hide
 * carries its own end, here, independent of React: whoever puts the class
 * on, it comes off within this, restored or not.
 */
export const EXPLORE_HOLD_MAX_MS = 700

/**
 * Soft navigations do not update PerformanceNavigationTiming; popstate does.
 *
 * READ IT WHILE RENDERING, NEVER IN AN EFFECT. Next's router writes the
 * history entry (history.replaceState, its HistoryUpdater) in an insertion
 * effect of EVERY commit, a back included, and that runs before any layout
 * effect of the page. The replaceState below clears this flag, so by the
 * time Explore's layout effect ran a back had already been forgotten. See
 * useExploreScrollRestore.
 */
let backTraversal = false
/** The document's own arrival (a reload, or a back that loaded the page again) is honoured once, not on every later visit in the tab. */
let documentArrivalUsed = false

if (typeof window !== "undefined") {
  /* Loaded after the visitor has already moved within the tab: the page now showing is not the document's arrival. */
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    if (nav && new URL(nav.name).pathname !== window.location.pathname) documentArrivalUsed = true
  } catch {
    /* no timing entry: the arrival rule below simply finds nothing */
  }
  window.addEventListener("popstate", () => {
    backTraversal = true
    documentArrivalUsed = true
  })
  /*
    A PAGE BROUGHT BACK WHOLE FROM THE BROWSER'S CACHE IS ALREADY WHERE IT
    WAS: its DOM and its scroll come back with it, and no React render or
    effect runs to put anything back. So nothing is held for it (the boot
    script lets go of the same class on the same event) and no back is
    recorded for a later render to act on by mistake.
  */
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) document.documentElement.classList.remove(HOLD_CLASS)
  })
  const clearTraversal = () => {
    backTraversal = false
  }
  const { pushState, replaceState } = history
  history.pushState = function (...args) {
    clearTraversal()
    /* A page pushed after the document's first one is a visit by a link, never the document's own arrival. */
    documentArrivalUsed = true
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

function clearRestorePending() {
  try {
    sessionStorage.removeItem(RESTORE_PENDING_KEY)
  } catch {
    /* ignore */
  }
}

/** This document was loaded by a reload or by Back/Forward, and nothing has acted on that yet. */
function documentArrivedByHistory(): boolean {
  if (documentArrivalUsed) return false
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    return nav?.type === "reload" || nav?.type === "back_forward"
  } catch {
    return false
  }
}

/**
 * ===========================================================================
 *  PUT THE PLACE BACK ONLY ON THE WAY BACK
 * ===========================================================================
 * Explore puts the scroll back when it is returned to: a back (or forward)
 * in this tab, or a reload, or a back that loaded the page again after
 * Explore was left with a place worth keeping (RESTORE_PENDING_KEY, written
 * on the way out). A visit by a link (the header's Discover, the tab bar)
 * starts at the top, as a new visit does everywhere else.
 *
 * Pure reads, nothing consumed, so it is safe to call while rendering.
 */
function arrivingByHistory(): boolean {
  if (backTraversal) return true
  return documentArrivedByHistory() && peekRestorePending()
}

/** True while explore is putting scroll back after back from a product. */
export function exploreScrollRestoreActive(): boolean {
  if (typeof window === "undefined") return false
  if (document.documentElement.classList.contains(HOLD_CLASS)) return true
  if (!isExploreSurface(window.location.pathname)) return false
  if (!arrivingByHistory()) return false
  const y = readSavedScroll()
  return y != null && y > 0
}

/**
 * The decision, made once for an arrival on Explore: the place to put back,
 * or null for "start where the page starts". Called from the hook's layout
 * effect, never while rendering. `cameBack` is what the render saw (see
 * backTraversal). Consumes the markers, so a later visit by a link is not
 * mistaken for a return.
 */
export function decideExploreRestore(cameBack: boolean): number | null {
  if (typeof window === "undefined" || !isExploreSurface(window.location.pathname)) return null
  const byDocument = documentArrivedByHistory() && peekRestorePending()
  /* The boot script (explore-scroll-boot) already holds for a document arrival: that is an arrival too. */
  const held = document.documentElement.classList.contains(HOLD_CLASS)
  documentArrivalUsed = true
  backTraversal = false
  clearRestorePending()
  if (!cameBack && !byDocument && !held) return null
  const target = readSavedScroll()
  return target != null && target > 0 ? target : null
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
export function primeExploreScrollRestore(target: number): boolean {
  if (typeof window === "undefined" || !isExploreSurface(window.location.pathname)) return false
  if (target <= 0) return false
  setSettling(true)
  if (scrollToSaved(target)) return true
  setExploreHold(true)
  return false
}

function scrollToSaved(target: number): boolean {
  const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const y = Math.min(target, maxY)
  window.scrollTo(0, y)
  return Math.abs(window.scrollY - y) < 2
}

let holdTimer = 0
function setExploreHold(on: boolean) {
  document.documentElement.classList.toggle(HOLD_CLASS, on)
  window.clearTimeout(holdTimer)
  /* The end every hide carries (EXPLORE_HOLD_MAX_MS above). */
  if (on) holdTimer = window.setTimeout(() => document.documentElement.classList.remove(HOLD_CLASS), EXPLORE_HOLD_MAX_MS + 100)
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
function restoreScrollPosition(target: number, onDone?: () => void): () => void {
  primeExploreScrollRestore(target)

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
  timer = window.setTimeout(stop, EXPLORE_HOLD_MAX_MS)
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
  /*
    WHETHER THIS IS A RETURN, AS THE RENDER SAW IT. A back sets backTraversal
    on popstate, and the router's own history write clears it again before
    any layout effect runs (see backTraversal). Read here, while rendering,
    it is still true; the layout effect asking it again found it gone, so a
    Back from anything but a product card came to Explore at the top.
  */
  const [cameBack] = useState(() => typeof window !== "undefined" && backTraversal)
  /* Decided once per arrival, so an effect run twice (development) puts the place back the same way. */
  const decided = useRef<number | null | undefined>(undefined)

  /* Before paint: scroll back to where you were so the top of Explore never flashes. */
  useLayoutEffect(() => {
    if (!isExploreSurface(window.location.pathname)) return
    if (decided.current === undefined) decided.current = decideExploreRestore(cameBack)
    const target = decided.current
    if (target == null) {
      /* Nothing to put back: whatever held Explore (the boot script) lets go now. */
      setExploreHold(false)
      return
    }

    restoringRef.current = true
    const cancel = restoreScrollPosition(target, () => {
      restoringRef.current = false
      decided.current = null
      bump((n) => n + 1)
    })
    return cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isExploreSurface(window.location.pathname)) return
    const path = window.location.pathname

    let frame = 0
    const write = () => {
      frame = 0
      if (restoringRef.current) return
      writeScroll(window.scrollY, path)
    }
    const handleLeave = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      const y = window.scrollY
      writeScroll(y, path)
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
    /* After useExploreScrollRestore's own layout effect (called first by the page): the hold is on now exactly when a place is being put back out of sight. */
    setActive(document.documentElement.classList.contains(HOLD_CLASS))
    const onEnd = () => setActive(false)
    const obs = new MutationObserver(() => {
      if (!document.documentElement.classList.contains(HOLD_CLASS)) onEnd()
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return active
}
