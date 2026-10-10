"use client"

/**
 * ===========================================================================
 *  A PERSON'S FULL PAGE, ARRIVING FROM A COMMUNITY
 * ===========================================================================
 * Round 15 (R, item 22), the owner: "if I'm in a community and I click on
 * someone's profile, it glitches, it flashes ... the cover photo". The full
 * page (a creator page, or a profile) is a page of its own, so the community
 * goes and this one comes. Two things make that a native push rather than a
 * flash:
 *
 *   THE PUSH     when the page was reached from a community (the page before
 *                it in this tab was /community/..., or the address says
 *                ?from=community), its root comes in from a little to the
 *                right as it fades up: 260ms on the iOS push curve, translate
 *                and opacity only, so the compositor does all of it. Any
 *                other arrival keeps the app's own short fade
 *                (html.nav-landing in app/globals.css) and nothing else.
 *   THE COVER    the cover is the largest picture on the page and the first
 *                thing the eye lands on. On a move inside the app it was
 *                shown as soon as it had bytes, so a phone painted the grey
 *                band and then the picture in one frame, or in strips. Here,
 *                when it is not already decoded, it is kept clear on its
 *                band's own colour until `decode()` says it is whole, then
 *                fades in (180ms). One already decoded (back and forth, or
 *                drawn by the server with the page) is left exactly as it is:
 *                no fade to replay.
 *
 * VISIT PAGE AND BACK (round 18, C18 item 12). Opened with a member
 * profile's Visit page, the page comes in from the right edge over the
 * community as it drifts left under it (lib/navigation/page-push.ts, armed by
 * the press in components/community/member/member-profile.tsx) instead of the
 * short push above. Its own back arrow arms a pop: in the commit that takes
 * this page away it slides off to the right over the page it returns to. A
 * way back the system draws (the app's edge swipe, a browser's swipe) is
 * never armed, so it never moves twice.
 *
 * Renders an empty marker as the first child of the page's root and works
 * on that root (its parent), so no page's markup or position changes.
 * Reduced motion: no push and no fade, the page and its cover simply there.
 */
import { useLayoutEffect, useRef } from "react"
import { previousPath } from "@/lib/navigation/in-app-history"
import { armPageMotion, arriveWithPageMotion, holdPageMotion, takeArmedMotion } from "@/lib/navigation/page-push"

/** The push: how far from the right the page starts, and for how long it moves. */
export const ARRIVAL_SHIFT_PX = 28
export const ARRIVAL_MS = 260
/** The cover's fade once decoded. */
export const COVER_IN_MS = 180
const PUSH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/** Whether this arrival is a push from a community. Pure, for the tests. */
export function arrivesFromCommunity(previous: string | null | undefined, search: string): boolean {
  if (previous && /^\/community\//.test(previous)) return true
  try {
    return new URLSearchParams(search.replace(/^\?/, "")).get("from") === "community"
  } catch {
    return false
  }
}

const COVER_SELECTOR = "[data-cover-band] img, [data-profile-cover-band] img"

export function ProfileArrival() {
  const marker = useRef<HTMLSpanElement | null>(null)
  /* Our back arrow arms a pop; the commit that takes this page away plays it. */
  useLayoutEffect(() => {
    const root = marker.current?.parentElement
    if (!root || typeof document === "undefined") return
    const onPress = (e: MouseEvent) => {
      if (e.button === 0 && !e.metaKey && !e.ctrlKey && (e.target as Element | null)?.closest?.("[data-profile-back-button]")) armPageMotion("pop")
    }
    document.addEventListener("click", onPress, true)
    return () => {
      document.removeEventListener("click", onPress, true)
      if (takeArmedMotion("pop")) holdPageMotion(root, "pop")
    }
  }, [])
  useLayoutEffect(() => {
    const root = marker.current?.parentElement
    if (!root || typeof window === "undefined") return
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    /* A server render of this page (a reload, a first visit) has its cover in the HTML already: nothing to hold. */
    const hydrating = !document.documentElement.hasAttribute("data-profile-arrived")
    document.documentElement.setAttribute("data-profile-arrived", "")
    if (hydrating && !previousPath()) return

    const prev = previousPath()
    /* Pushed by Visit page in this same commit: it moves with the community leaving, and nothing of its own. */
    if (arriveWithPageMotion(root)) {
      /* The cover below is still held until decoded. */
    } else if (!reduced && arrivesFromCommunity(prev, window.location.search) && typeof root.animate === "function") {
      root.animate(
        [
          { translate: `${ARRIVAL_SHIFT_PX}px 0`, opacity: 0.001 },
          { translate: "0 0", opacity: 1 },
        ],
        { duration: ARRIVAL_MS, easing: PUSH_EASE },
      )
    }

    const img = root.querySelector<HTMLImageElement>(COVER_SELECTOR)
    if (!img || reduced) return
    /* Whole already (decoded a moment ago, or from the cache with its pixels): leave it, nothing to replay. */
    if (img.complete && img.naturalWidth > 0) return
    let live = true
    img.style.opacity = "0"
    const show = () => {
      if (!live) return
      img.style.opacity = ""
      if (typeof img.animate === "function") img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: COVER_IN_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
    }
    const whole = () => {
      if (typeof img.decode === "function") img.decode().then(show, show)
      else show()
    }
    if (img.complete) whole()
    else {
      img.addEventListener("load", whole, { once: true })
      img.addEventListener("error", show, { once: true })
    }
    /* Never held clear for long: a picture that will not come leaves the band as it is after 2.5s. */
    const cap = window.setTimeout(show, 2500)
    return () => {
      live = false
      window.clearTimeout(cap)
      img.removeEventListener("load", whole)
      img.removeEventListener("error", show)
      img.style.opacity = ""
    }
  }, [])
  return <span ref={marker} hidden aria-hidden data-profile-arrival="" />
}
