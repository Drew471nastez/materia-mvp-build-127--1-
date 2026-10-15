"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import {
  beginAppNavigation,
  endAppNavigation,
  isCommittedAddress,
  isCurrentAddress,
  isPhoneShell,
  markTraversal,
  NAV_BAR_AFTER_MS,
  routerStartCount,
  sameStageFrame,
  spinnerDelay,
  takeTraversal,
  useAppNavigation,
} from "@/lib/ui/app-navigation"

/**
 * Fire this inside any onClick that calls router.push(), with the address,
 * so the shell knows a navigation is underway and where to: a link click is
 * seen on its own, a push is not.
 *
 *   onClick={() => { startNavigationLoading("/app/orders"); router.push("/app/orders") }}
 */
export function startNavigationLoading(href?: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("nav-loading-start", { detail: { href: href ?? null } }))
}

/**
 * ===========================================================================
 *  THE BAR ALONG THE TOP, ONLY WHEN A PAGE IS SLOW
 * ===========================================================================
 * It used to appear on every click, for at least 250ms, even when the page
 * was already in the router's cache and landed on the next frame: a flash of
 * progress for something that took no time. Now it waits NAV_BAR_AFTER_MS
 * (lib/ui/app-navigation) and most navigations are over before it would
 * have shown. When it does show it is 2px, a quiet white along the black bar
 * (not violet), runs on an easing that slows as it goes, and finishes and
 * fades when the page commits.
 *
 * Width and opacity are written straight to the node, never through React.
 */
export function NavigationLoadingBar() {
  const pathname = usePathname()
  const nav = useAppNavigation()
  const [shown, setShown] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)

  /* Where a navigation starts: a link click, a push that says so, back and forward. */
  useEffect(() => {
    /* The router's count of navigations as the click begins, before any of
       the page's handlers (the window's capture phase comes first). */
    let startsAtClick: number | null = null
    const onClickStart = () => { startsAtClick = routerStartCount() }
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute("download")) return
      if (anchor.target && anchor.target !== "_self") return
      /* A link the page handled itself: its default prevented and the router
         started nothing (lib/ui/router-starts.ts). Explore in the native
         app, a row that opens a sheet. Nothing is on its way, so nothing
         begins. A Link prevents its default too, but the router has counted
         it by now. */
      if (e.defaultPrevented) {
        const now = routerStartCount()
        if (now !== null && now === startsAtClick) return
      }
      try {
        const url = new URL(anchor.href)
        if (url.origin !== window.location.origin) return
        /* The page showing: nothing to begin, and whatever was on its way
           has just been dropped by the router (isCurrentAddress). */
        if (isCurrentAddress(url.href)) { endAppNavigation(); return }
        /* A back whose page never committed (a hash, a sheet closing on
           Back) must not make this click restore an old scroll. */
        takeTraversal()
        beginAppNavigation(url.pathname + url.search)
      } catch {
        /* an href that is not a URL starts nothing */
      }
    }
    const onProgrammatic = (e: Event) => {
      const href = (e as CustomEvent<{ href?: string | null }>).detail?.href ?? null
      /* A push to the page already showing commits nothing, so nothing would
         ever end the record (isCurrentAddress, lib/ui/app-navigation). */
      if (isCurrentAddress(href)) { endAppNavigation(); return }
      takeTraversal()
      beginAppNavigation(href)
    }
    const onPop = () => {
      /* Back to the page already committed (an editor's guard entry, a
         #tab): the router has nothing to bring (isCommittedAddress). */
      if (isCommittedAddress(window.location.pathname, window.location.search)) {
        takeTraversal()
        endAppNavigation()
        return
      }
      markTraversal()
      beginAppNavigation(window.location.pathname + window.location.search)
    }
    window.addEventListener("click", onClickStart, true)
    document.addEventListener("click", onClick)
    window.addEventListener("nav-loading-start", onProgrammatic)
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("click", onClickStart, true)
      document.removeEventListener("click", onClick)
      window.removeEventListener("nav-loading-start", onProgrammatic)
      window.removeEventListener("popstate", onPop)
    }
  }, [])

  /* Shown only once the navigation has lasted long enough to be worth showing.
     Not on a phone when the spinner is coming: one quiet answer is enough
     there, and a violet line under the clock is not a quiet one
     (lib/ui/app-navigation). The product editor, which has no spinner, still
     gets the bar. */
  useEffect(() => {
    if (!nav) return
    /*
      ANOTHER SECTION OF THE COMMUNITY OPEN (round 32, the owner: "the reloading bar above the charts"). Its shell keeps the
      header and the tabs, lights the tab on the press and shows the section's frame in its place while the router brings
      it (components/community/creator/community-shell.tsx). A bar over the header on top of that is a second answer to
      the same press, and it read as the whole page reloading.
    */
    if (nav.href && sameStageFrame(window.location.pathname, nav.href)) return
    if (isPhoneShell() && spinnerDelay(nav.href, true) !== null) {
      /* A bar still finishing the last navigation (the editor's, say) goes
         now rather than running again under the spinner. */
      setShown(false)
      return
    }
    const wait = Math.max(0, NAV_BAR_AFTER_MS - (performance.now() - nav.startedAt))
    const t = window.setTimeout(() => setShown(true), wait)
    return () => window.clearTimeout(t)
  }, [nav])

  /* Running: approaches 90% and never reaches it until the page commits. */
  useEffect(() => {
    const el = barRef.current
    if (!shown || !el) return
    if (nav) {
      const from = nav.startedAt + NAV_BAR_AFTER_MS
      el.style.transition = "none"
      el.style.opacity = "1"
      const tick = (now: number) => {
        el.style.transform = `scaleX(${(0.9 * (1 - Math.exp(-Math.max(0, now - from) / 1400))).toFixed(4)})`
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
    }
    /* Landed: run to the end and fade, then go. */
    el.style.transition = "transform 200ms cubic-bezier(0.2, 0, 0, 1), opacity 240ms ease-out 120ms"
    el.style.transform = "scaleX(1)"
    el.style.opacity = "0"
    const t = window.setTimeout(() => setShown(false), 380)
    return () => window.clearTimeout(t)
  }, [shown, nav])

  /* A page that commits with no pending record (a redirect, say) clears the bar too. */
  useEffect(() => {
    if (!nav && shown && barRef.current) barRef.current.style.opacity = "0"
  }, [pathname, nav, shown])

  if (!shown) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[2px]" aria-hidden="true">
      <div
        ref={barRef}
        data-app-nav-progress=""
        className="h-full w-full origin-left bg-white/60 shadow-[0_0_6px_rgba(255,255,255,0.35)]"
        style={{ transform: "scaleX(0)", willChange: "transform, opacity" }}
      />
    </div>
  )
}
