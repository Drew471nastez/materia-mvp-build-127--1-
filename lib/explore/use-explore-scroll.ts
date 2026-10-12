"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * sessionStorage key shared by /explore and /explore/* category pages.
 *
 * ONE PLACE PER PAGE, NOT ONE FOR ALL OF THEM. It held a single number, so
 * Explore, then a category, then Back put Explore at the category's offset.
 *
 * AND ONE PLACE PER VISIT, NOT PER PATH (round 25). It was keyed by the path
 * alone, so Explore, its search results (/explore?q=), Discover communities
 * (/explore?type=communities) and a second visit to Explore further back in
 * the history all shared one number: Back from a product opened in the
 * results put Explore at the results' offset. A place is kept now under the
 * history entry it belongs to (the Navigation API's entry key, which a
 * replaceState keeps and a push never shares) and under the full address
 * (path and query) for a browser without that API. `{ "<key>": y }`, the
 * entry keys starting with "#" so they never meet an address, which starts
 * with "/" (explore-scroll-boot reads the same shape).
 */
export const EXPLORE_SCROLL_KEY = "explore-scroll-position"
/** The places kept at most: an entry key per visit adds up over a long session, the oldest go first. */
const MAX_PLACES = 60

function isExploreSurface(path = ""): boolean {
  return path === "/explore" || path.startsWith("/explore/")
}

/** The history entry on screen, where the browser names it (the Navigation API: Chrome, Edge, Safari 26). */
export function exploreEntryKey(): string | null {
  try {
    const key = (window as { navigation?: { currentEntry?: { key?: unknown } | null } }).navigation?.currentEntry?.key
    return typeof key === "string" && key ? `#${key}` : null
  } catch {
    return null
  }
}

/** The address on screen, with its query: Explore and its search results are different places. */
export function exploreAddressKey(): string {
  return window.location.pathname + (window.location.search || "")
}

/** Where the place on screen is kept, most exact first: its history entry, then its address. */
export function explorePlaceKeys(): string[] {
  const entry = exploreEntryKey()
  return entry ? [entry, exploreAddressKey()] : [exploreAddressKey()]
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
  const places = readPlaces()
  for (const key of explorePlaceKeys()) {
    const y = places[key]
    if (typeof y === "number" && Number.isFinite(y) && y >= 0) return y
  }
  return null
}

/** Written under the keys of the place on screen, the newest last so the oldest are the ones let go. */
function writeScroll(y: number, keys: string[] = explorePlaceKeys()) {
  try {
    const places = readPlaces()
    for (const key of keys) {
      delete places[key]
      places[key] = Math.max(0, Math.round(y))
    }
    const all = Object.keys(places)
    for (const key of all.slice(0, Math.max(0, all.length - MAX_PLACES))) delete places[key]
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
/**
 * WHERE THE LAST BACK OR FORWARD WENT, kept until a push or until Explore
 * has acted on it. The flag above is cleared by the router's own history
 * write in the commit; this is not (a replaceState keeps the entry), so a
 * Back between two addresses of the same mounted Explore (its results and
 * Explore itself) is still known in the layout effect that follows it, and
 * so is a Back whose Explore mounts a commit later (after its loading
 * screen). While it names the address on screen, no scroll is written for
 * it: in the moment between the address
 * changing and the page under it being drawn, the scroll belongs to the
 * page that is going.
 */
let traversalTo: string | null = null
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
  /*
    IN THE CAPTURE PHASE, SO IT IS HEARD BEFORE THE ROUTER (round 25). This is
    why Back to Explore landed at the top on the live site while every probe
    against `next dev` passed. The router's own popstate listener (Next's
    app-router.js) was added when the app started, this one only when
    Explore's code first loaded, so the router heard each Back first; and it
    starts its update inside the popstate event, which React 19 renders and
    commits synchronously there and then (so the browser can restore the
    scroll). Explore was drawn, and its layout effect asked whether this was
    a return, before this listener had said so: no, so the top. Measured on
    a production build, at 1440: first frame back at 0, not 2000. A capture
    listener on the window runs before every listener added without one,
    whenever it was added.
  */
  window.addEventListener("popstate", () => {
    backTraversal = true
    documentArrivalUsed = true
    /*
      NO CLOCK ON IT. It had one (1.5s), and a Back whose page took longer to come (the router drawing Explore's loading
      screen first, then Explore once its data was in) reached an Explore that no longer knew it was a return: it landed at
      the top. It lasts until Explore acts on it, the next Back or Forward, or a push.
    */
    traversalTo = exploreAddressKey()
  }, { capture: true })
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
    traversalTo = null
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

/**
 * This render is of a Back or Forward to the page on screen, as a client
 * navigation (the page's state can be drawn as it was left, from its first
 * frame). Read while rendering, like backTraversal; nothing consumed.
 */
export function exploreReturning(): boolean {
  if (typeof window === "undefined") return false
  return backTraversal || (traversalTo !== null && traversalTo === exploreAddressKey())
}

/** This document was loaded by a reload or a Back or Forward that nothing has acted on yet: state is put back from a layout effect, never while hydrating. */
export function exploreDocumentReturn(): boolean {
  if (typeof window === "undefined") return false
  return documentArrivedByHistory()
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
  /* A Back or Forward to this very address that the render did not see (the router wrote the entry first). */
  const traversed = traversalTo !== null && traversalTo === exploreAddressKey()
  documentArrivalUsed = true
  backTraversal = false
  traversalTo = null
  clearRestorePending()
  if (!cameBack && !traversed && !byDocument && !held) return null
  /* A return, at the top or not: it is drawn as it was left, so the landing fade of a new visit is not played on it. */
  setSettling(true)
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
  return Math.abs(window.scrollY - y) < 2 && y === target
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
   COMING BACK IS THE PAGE AS IT WAS LEFT, AND NOTHING MOVES
  ===========================================================================
  Filmed on the way back from a product (round 11): Explore's first frame
  stood at 1516 with the card the visitor had left at 291px showing at
  275px, and the next frame jumped it back to 1500. Nothing of ours scrolled
  to 1516: it was the browser's scroll anchoring, nudging the page while
  parts above the fold settled, and the restore loop then pulling it back.
  With anchoring off the same back lands at 1500, card at 291, on its first
  frame. So while Explore is putting itself back (and for a moment after,
  while the pictures above settle) anchoring is off (globals.css:
  html.explore-scroll-settling).

  NO FADE WHEN NOTHING WAS HIDDEN (round 25, the owner: "it must return
  exactly where I was, smoothly, not jump to the top or glitch"). Every
  return used to come in on a fade from 0.55, so the first frame back was a
  washed out copy of the page (filmed at 390 with 4x CPU: one pale frame,
  then the page). A Back on a phone shows the screen as it was, so that is
  what this does: when the place is put back before the first frame is
  painted, the page is simply there. Only a return that had to be held out
  of sight for painted frames (the page still growing, or a document load
  the boot script hid) comes in on the short fade, from most of the way
  there (html.explore-scroll-revealing).
*/
const SETTLE_CLASS = "explore-scroll-settling"
const REVEAL_CLASS = "explore-scroll-revealing"
/** Long enough for the pictures above the place to settle with anchoring off. */
export const EXPLORE_SETTLE_MS = 420
/** The fade after a hold (220ms) and a frame to spare. */
export const EXPLORE_REVEAL_MS = 260
let settleTimer = 0
let revealTimer = 0

function setSettling(on: boolean) {
  window.clearTimeout(settleTimer)
  document.documentElement.classList.toggle(SETTLE_CLASS, on)
  if (on) settleTimer = window.setTimeout(() => document.documentElement.classList.remove(SETTLE_CLASS), EXPLORE_SETTLE_MS)
}

/** The fade in after a hold: started as the page shows, not back when it was hidden. */
function reveal() {
  const root = document.documentElement
  window.clearTimeout(revealTimer)
  root.classList.remove(REVEAL_CLASS)
  void root.offsetWidth
  root.classList.add(REVEAL_CLASS)
  revealTimer = window.setTimeout(() => root.classList.remove(REVEAL_CLASS), EXPLORE_REVEAL_MS)
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
  /* Hidden before this ran (the boot script, for a document load): frames were painted hidden. */
  const bootHeld = document.documentElement.classList.contains(HOLD_CLASS)
  primeExploreScrollRestore(target)

  let attempts = 0
  let frame = 0
  let timer = 0
  let over = false
  const path = window.location.pathname
  const stopEvents = ["touchstart", "wheel", "keydown"] as const
  const finish = (show: boolean) => {
    if (over) return
    over = true
    cancelAnimationFrame(frame)
    window.clearTimeout(timer)
    for (const t of stopEvents) window.removeEventListener(t, stop)
    const root = document.documentElement
    const held = root.classList.contains(HOLD_CLASS)
    setExploreHold(false)
    if (show) {
      setSettling(true)
      /* The first try runs before the first frame is painted: a page put back there was never seen hidden, and needs no fade. */
      if (held && (bootHeld || attempts > 1)) reveal()
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
  if (traversalTo === exploreAddressKey()) return
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
  /* The address this Explore is drawing, for a Back or Forward that stays on the same mounted page (results and Explore). */
  const address = typeof window === "undefined" ? "" : exploreAddressKey()
  const drawnAddress = useRef(address)
  const cancelRef = useRef<(() => void) | null>(null)

  const putBack = (target: number) => {
    cancelRef.current?.()
    restoringRef.current = true
    const cancel = restoreScrollPosition(target, () => {
      restoringRef.current = false
      decided.current = null
      if (cancelRef.current === cancel) cancelRef.current = null
      bump((n) => n + 1)
    })
    cancelRef.current = cancel
    return cancel
  }

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

    const cancel = putBack(target)
    return cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
    A BACK THAT STAYS ON THIS PAGE. Explore and its search results are one
    route, so going back from the results to Explore (or forward again) does
    not mount Explore again: the same page draws the other address, and the
    layout effect above never runs. The place of the entry it goes to is put
    back here, before paint, the same way. A push or a pill (a replaceState)
    is not a return and leaves the scroll to the page.
  */
  useLayoutEffect(() => {
    if (drawnAddress.current === address) return
    drawnAddress.current = address
    if (!isExploreSurface(window.location.pathname)) return
    if (traversalTo === null || traversalTo !== address) return
    traversalTo = null
    backTraversal = false
    setSettling(true)
    const target = readSavedScroll()
    if (target != null && target > 0) putBack(target)
    else window.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  useEffect(() => () => cancelRef.current?.(), [])

  useEffect(() => {
    if (!isExploreSurface(window.location.pathname)) return
    const path = window.location.pathname
    /*
      WRITTEN ONLY FOR THE PAGE ON SCREEN. Not while it is being put back,
      not while a Back or Forward is on its way (the address is already the
      next entry's, the page under it not yet), and not once the address is
      another page's (the scroll then belongs to that page).
    */
    const mine = () => !restoringRef.current && traversalTo !== exploreAddressKey() && window.location.pathname === path

    let frame = 0
    const write = () => {
      frame = 0
      if (!mine()) return
      writeScroll(window.scrollY)
    }
    const handleLeave = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      if (!mine()) return
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
    /* A press that leaves (a card, a creator, a community, a search sent): the place as it is at that moment, before the address changes. */
    document.addEventListener("click", handleLeave, true)
    document.addEventListener("submit", handleLeave, true)

    return () => {
      history.scrollRestoration = beforeRestoration
      window.removeEventListener("beforeunload", handleLeave)
      window.removeEventListener("pagehide", handleLeave)
      window.removeEventListener("scroll", handleScroll)
      document.removeEventListener("click", handleLeave, true)
      document.removeEventListener("submit", handleLeave, true)
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
