"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { RouteSkeleton } from "@/components/app/route-skeletons"
import { cn } from "@/lib/utils"
import {
  endAppNavigation,
  isPhoneShell,
  markLanded,
  NAV_ENTER_EASE,
  NAV_ENTER_MS,
  NAV_ENTER_RISE_PX,
  NAV_PHONE_OUTLINE_FADE_MS,
  outlineDelay,
  recalledScroll,
  rememberScroll,
  takeTraversal,
  useAppNavigation,
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
 *   NAV_SKELETON_AFTER_MS on a computer, or NAV_PHONE_OUTLINE_AFTER_MS on a
 *   phone, the next page's outline is laid over the content area, and it
 *   fades out as the page fades in. The product editor never gets one.
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

/** The landing, on every top level box of the page that is showing. */
export function playEntrance(outer: HTMLElement) {
  if (reducedMotion()) return
  for (const child of Array.from(outer.children) as HTMLElement[]) {
    if (typeof child.animate !== "function") continue
    const cs = getComputedStyle(child)
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue
    const rise = !holdsVisibleFixed(child)
    child.animate(
      rise
        ? [{ opacity: 0, translate: `0 ${NAV_ENTER_RISE_PX}px` }, { opacity: 1, translate: "0 0" }]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: NAV_ENTER_MS, easing: NAV_ENTER_EASE },
    )
  }
}

export function AppStage() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const key = search ? `${pathname}?${search}` : pathname
  const keyRef = useRef(key)
  const firstRef = useRef(true)
  const prevPathRef = useRef(pathname)

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
    const traversal = takeTraversal()
    endAppNavigation()
    if (firstRef.current) { firstRef.current = false; return }
    const pageChanged = prevPathRef.current !== pathname
    prevPathRef.current = pathname
    if (!pageChanged) return
    markLanded()
    const s = scrollers()
    if (!s) return
    const saved = traversal ? recalledScroll(key) : null
    s.outer.scrollTop = saved?.outer ?? 0
    if (s.inner) s.inner.scrollTop = saved?.inner ?? 0
    playEntrance(s.outer)
  }, [key, pathname])

  return <SlowPageOutline />
}

/**
 * The outline of the page being opened, over the content area, once a
 * navigation has run long enough (lib/ui/app-navigation: a second on a
 * computer, 90ms on a phone, never for the product editor). Positioned by
 * the same numbers as <main> (the header above it, the sidebar beside it
 * from md), so it covers exactly the page and nothing else.
 *
 * On a phone it arrives on a 120ms opacity fade and nothing else, over the
 * page you were on, so there is no frame with nothing on screen. When the
 * page lands the outline fades out from wherever its own fade had got to: a
 * page that arrives 10ms after its outline started must not flash it to full
 * and back.
 */
function SlowPageOutline() {
  const nav = useAppNavigation()
  const [shownFor, setShownFor] = useState<string | null>(null)
  const phoneRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!nav) {
      /* The page is here: the outline fades as the page rises under it. */
      const el = ref.current
      if (!shownFor || !el) return
      if (typeof el.animate !== "function" || reducedMotion()) { setShownFor(null); return }
      const from = Number(getComputedStyle(el).opacity)
      for (const a of el.getAnimations?.() ?? []) a.cancel()
      const out = el.animate([{ opacity: from }, { opacity: 0 }], { duration: NAV_ENTER_MS, easing: NAV_ENTER_EASE, fill: "forwards" })
      out.onfinish = () => setShownFor(null)
      return () => { out.onfinish = null }
    }
    const href = nav.href
    if (!href || shownFor === href) return
    const phone = isPhoneShell()
    const delay = outlineDelay(href, phone)
    if (delay == null) return
    /* Leaving a page drawn over the whole shell: that layer stays over
       everything until the next page is here, so there is nothing to draw. */
    if (document.querySelector("[data-page-layer]")) return
    const wait = Math.max(0, delay - (performance.now() - nav.startedAt))
    const t = window.setTimeout(() => {
      phoneRef.current = phone
      setShownFor(href)
    }, wait)
    return () => window.clearTimeout(t)
  }, [nav, shownFor])

  /* A phone's outline: in on opacity alone, before it is first painted. */
  useLayoutEffect(() => {
    const el = ref.current
    if (!shownFor || !el || !phoneRef.current || reducedMotion() || typeof el.animate !== "function") return
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: NAV_PHONE_OUTLINE_FADE_MS, easing: "ease-out" })
  }, [shownFor])

  if (!shownFor) return null
  return (
    <div
      ref={ref}
      key={shownFor}
      data-app-route-skeleton=""
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 top-[calc(68px+env(safe-area-inset-top,0px))] z-[38] overflow-hidden rounded-t-[20px] bg-[#f8f9fa] md:left-[240px] md:top-[calc(58px+env(safe-area-inset-top,0px))] md:rounded-none",
        !phoneRef.current && "skeleton-fade",
      )}
    >
      <RouteSkeleton href={shownFor} />
    </div>
  )
}
