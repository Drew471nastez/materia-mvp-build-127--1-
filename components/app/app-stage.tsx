"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import {
  endAppNavigation,
  markCommitted,
  markLanded,
  NAV_ENTER_EASE,
  NAV_ENTER_MS,
  NAV_ENTER_RISE_PX,
  NAV_SPINNER_CAP_MS,
  NAV_SPINNER_FADE_MS,
  recalledScroll,
  rememberScroll,
  spinnerDelay,
  takeTraversal,
  useAppNavigation,
  watchRouterCommits,
  type AppNavigation,
} from "@/lib/ui/app-navigation"

/**
 * ===========================================================================
 *  THE STAGE: HOW AN /app PAGE ARRIVES
 * ===========================================================================
 * Three jobs, all keyed on the moment the router commits a new page, which is
 * the moment `usePathname` changes (the address and the page are one commit):
 *
 *   THE LANDING. Before that commit is painted, every top level box of the
 *   new page starts at opacity 0 and 5px low and rises into place over
 *   180ms. Transform and opacity only, on the compositor, with no fill, so
 *   when it ends nothing is left on the element. A page that has something
 *   `position: fixed` showing inside it (a bottom bar, an editor) gets the
 *   fade without the rise: a transform on an ancestor would make the fixed
 *   thing move with the page for those 180ms.
 *
 *   THE SCROLL. A new visit starts at the top. A back or forward puts both
 *   scrollers (the shell's and the page's own) where they were, in the same
 *   frame, so the page never paints at the top and then jumps.
 *
 *   THE SLOW PAGE. The old page stays until the new one is ready. Past
 *   NAV_PHONE_SPINNER_AFTER_MS on a phone, or NAV_SPINNER_AFTER_MS on a
 *   computer, the content area goes plain with the spinner in the middle,
 *   and when the page lands that surface fades away over it. No outline of
 *   any page, at any width. The product editor and the plans page never get
 *   it (lib/ui/app-navigation waitsWithSpinner). It never blocks: it takes
 *   no presses, it gives way after NAV_SPINNER_CAP_MS whatever happens, and
 *   every way a navigation can end takes it down (see SlowPage).
 */

type Scrollers = { outer: HTMLElement; inner: HTMLElement | null }

function scrollers(): Scrollers | null {
  const outer = document.querySelector<HTMLElement>(".app-content-scroll")
  if (!outer) return null
  let inner: HTMLElement | null = null
  for (const child of Array.from(outer.children) as HTMLElement[]) {
    const oy = getComputedStyle(child).overflowY
    if (oy === "auto" || oy === "scroll") { inner = child; break }
    /* The orders page scrolls in the pane inside its stage. */
    const pane = child.querySelector<HTMLElement>(":scope > .orders-pane")
    if (pane) { inner = pane; break }
  }
  return { outer, inner }
}

/** Is anything fixed to the window showing inside this box? */
function holdsVisibleFixed(root: HTMLElement) {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(".fixed, [style*='fixed']"))) {
    const cs = getComputedStyle(el)
    if (cs.position !== "fixed" || cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return true
  }
  return false
}

function reducedMotion() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * The landing, on every top level box of the page that is showing.
 *
 * `fade: false` when the slow page's surface is up over it: that surface
 * fading away IS the page appearing, and fading the page in underneath it as
 * well would multiply the two, a reveal that crawls for half its length and
 * then hurries. So under the surface the page only rises.
 */
export function playEntrance(outer: HTMLElement, { fade = true }: { fade?: boolean } = {}) {
  if (reducedMotion()) return
  for (const child of Array.from(outer.children) as HTMLElement[]) {
    if (typeof child.animate !== "function") continue
    const cs = getComputedStyle(child)
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue
    const rise = !holdsVisibleFixed(child)
    if (!rise && !fade) continue
    const from: Keyframe = { ...(fade ? { opacity: 0 } : {}), ...(rise ? { translate: `0 ${NAV_ENTER_RISE_PX}px` } : {}) }
    const to: Keyframe = { ...(fade ? { opacity: 1 } : {}), ...(rise ? { translate: "0 0" } : {}) }
    child.animate([from, to], { duration: NAV_ENTER_MS, easing: NAV_ENTER_EASE })
  }
}

/**
 * The slow page's surface, when it is all the eye sees. Only then does the
 * page skip its own fade: a page landing while the surface is still coming
 * in (half up, say) would otherwise swap for the old one at half strength in
 * a single frame. Measured at 0.38 before this said "all" rather than "half".
 */
function slowSurfaceIsUp() {
  const el = document.querySelector<HTMLElement>("[data-app-slow-page]")
  return !!el && Number(getComputedStyle(el).opacity) >= 0.95
}

export function AppStage() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const key = search ? `${pathname}?${search}` : pathname
  const keyRef = useRef(key)
  const firstRef = useRef(true)
  const prevPathRef = useRef(pathname)

  /* A commit at the address already showing ends the navigation too
     (lib/ui/app-navigation watchRouterCommits). Once, for the tab. */
  useEffect(() => { watchRouterCommits() }, [])

  /* Where the reader is, recorded as they scroll, for the way back. */
  useEffect(() => {
    const onScroll = (e: Event) => {
      const s = scrollers()
      if (!s) return
      const t = e.target
      if (t !== s.outer && t !== s.inner) return
      rememberScroll(keyRef.current, s.outer.scrollTop, s.inner?.scrollTop ?? 0)
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])

  /* The commit: before it is painted. */
  useLayoutEffect(() => {
    keyRef.current = key
    markCommitted(pathname, search)
    const traversal = takeTraversal()
    endAppNavigation()
    if (firstRef.current) { firstRef.current = false; return }
    const pageChanged = prevPathRef.current !== pathname
    prevPathRef.current = pathname
    /* A change of query alone (a filter, a tab, an open order) is the same
       page: no landing, and the scroll stays where the reader put it. */
    if (!pageChanged) return
    markLanded()
    const s = scrollers()
    if (!s) return
    const saved = traversal ? recalledScroll(key) : null
    s.outer.scrollTop = saved?.outer ?? 0
    if (s.inner) s.inner.scrollTop = saved?.inner ?? 0
    playEntrance(s.outer, { fade: !slowSurfaceIsUp() })
  }, [key, pathname, search])

  return <SlowPage />
}

/**
 * THE PAGE HAS LANDED, WHATEVER THE ADDRESS SAYS. Mounted by the /app error
 * boundary and the not-found page (app/app/error.tsx, app/app/not-found.tsx):
 * a page that threw, or was not there, is still the navigation's answer, and
 * the spinner must not stay over it. The stage sees most of these already,
 * as a change of address; this is for the ones it cannot see (an error
 * thrown where you already were, a not-found at the same address).
 */
export function PageLanded() {
  useLayoutEffect(() => { endAppNavigation() }, [])
  return null
}

/** From wherever an element's opacity is now to `to`, dropping whatever was moving it. */
function fadeTo(el: HTMLElement, to: number, duration: number, easing: string) {
  const from = Number(getComputedStyle(el).opacity)
  for (const a of el.getAnimations?.() ?? []) a.cancel()
  return el.animate([{ opacity: from }, { opacity: to }], { duration, easing, fill: "forwards" })
}

/**
 * The content area while a page is slow: plain, the page's own colour, with
 * the spinner in the middle. Positioned by the same numbers as <main> (the
 * header above it, the rail beside it from md, the rounded top on a phone),
 * so it covers exactly the page and nothing else; the header and the pill
 * stay over it and stay pressable.
 *
 * THE CORNERS ARE THE HEADER'S COLOUR. On a phone the surface's top is
 * rounded, and a rounded box fixed over the page shows the page through its
 * corners. Home's top is the violet announcement bar, so leaving Home slowly
 * put two violet corners under the header: "the purple things in the
 * corners". So the fixed box itself is the header's #111111 and the rounded
 * surface sits inside it; the corners show the header, whatever page is
 * underneath. From md the surface is square and the box is transparent.
 *
 * In on a 150ms opacity fade, over the page you were on, so there is never a
 * frame with nothing on screen. When the page lands it fades out from
 * wherever its own fade had got to (a page that arrives 20ms after the
 * spinner started must not flash it to full and back).
 *
 * IT NEVER BLOCKS. "Make sure it never blocks, fully."
 *
 *   It takes no presses (`pointer-events: none`), ever: a press goes to
 *   whatever is under it, the header, the pill and the rail above all, so a
 *   second tab replaces the navigation and the surface follows the new one.
 *
 *   It gives way after NAV_SPINNER_CAP_MS from the press, whether or not the
 *   page came: the page you were on is back, and the delay is logged.
 *
 *   Every end of the navigation takes it down: a new address (a new page, a
 *   query of the same page, a redirect somewhere else), a commit at the
 *   address already showing (watchRouterCommits), the error boundary and the
 *   not-found page (PageLanded), a press on the page already showing, and
 *   the record's own give up. If the fade out is ever interrupted, a timer
 *   takes it off the screen anyway.
 */
function SlowPage() {
  const nav = useAppNavigation()
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)
  /* Which way out is the current one: a timer left from an earlier one does nothing. */
  const leaves = useRef(0)
  /* The navigation the cap has already run out on: it is not shown again. */
  const capped = useRef<AppNavigation | null>(null)
  const [capTick, setCapTick] = useState(0)

  useEffect(() => {
    const el = ref.current
    const delay = nav ? spinnerDelay(nav.href) : null
    if (nav && delay != null && capped.current !== nav) {
      const timers: number[] = []
      /* The cap, from the press. */
      timers.push(window.setTimeout(() => {
        capped.current = nav
        console.warn(`[app-stage] ${nav.href ?? "a page"} has not arrived after ${NAV_SPINNER_CAP_MS}ms: showing the page you were on`)
        setCapTick((n) => n + 1)
      }, Math.max(0, NAV_SPINNER_CAP_MS - (performance.now() - nav.startedAt))))
      const clear = () => { for (const t of timers) window.clearTimeout(t) }
      if (shown) {
        /* Another press while it is up, or while it was on its way out: it
           stays, and comes back from wherever it had got to. */
        if (el && leaving.current && typeof el.animate === "function") {
          leaving.current = false
          fadeTo(el, 1, NAV_SPINNER_FADE_MS, "ease-out")
        }
        return clear
      }
      /* Leaving a page drawn over the whole shell: that layer stays over
         everything until the next page is here, so there is nothing to draw. */
      if (document.querySelector("[data-page-layer]")) return clear
      const wait = Math.max(0, delay - (performance.now() - nav.startedAt))
      timers.push(window.setTimeout(() => setShown(true), wait))
      return clear
    }
    /* Landed, capped, or the navigation now underway is one that never waits with it. */
    if (!shown || leaving.current) return
    if (!el || typeof el.animate !== "function" || reducedMotion()) { setShown(false); return }
    leaving.current = true
    const id = ++leaves.current
    const out = fadeTo(el, 0, NAV_ENTER_MS, NAV_ENTER_EASE)
    const done = () => { if (leaving.current && leaves.current === id) { leaving.current = false; setShown(false) } }
    out.onfinish = done
    /* A fade that never finishes (cancelled, or a tab in the background)
       still leaves. */
    window.setTimeout(done, NAV_ENTER_MS + 120)
  }, [nav, shown, capTick])

  /* In on opacity alone, before it is first painted. */
  useLayoutEffect(() => {
    const el = ref.current
    if (!shown || !el || reducedMotion() || typeof el.animate !== "function") return
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: NAV_SPINNER_FADE_MS, easing: "ease-out" })
  }, [shown])

  if (!shown) return null
  return (
    <div
      ref={ref}
      data-app-slow-page=""
      className="pointer-events-none fixed inset-x-0 bottom-0 top-[calc(68px+env(safe-area-inset-top,0px))] z-[38] bg-[#111111] md:left-[240px] md:top-[calc(58px+env(safe-area-inset-top,0px))] md:bg-transparent"
    >
      <div data-app-slow-surface="" className="flex h-full items-center justify-center overflow-hidden rounded-t-[20px] bg-[#f8f9fa] md:rounded-none">
        <ActivitySpinner />
      </div>
    </div>
  )
}
