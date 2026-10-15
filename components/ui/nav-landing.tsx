"use client"

/**
 * The landing for the pages whose outermost box this code does not write: a
 * person's page and a creator's page (/@handle), Explore and its categories.
 * It says nothing more than "a client navigation just landed"; app/globals.css
 * names the surfaces and plays the one landing on them.
 *
 * Why a class on <html> rather than a class on the page. Those pages are
 * server components drawn fresh by the router, and the landing must tell a
 * client navigation apart from a document load, which the page itself
 * cannot, because it looks the same either way. This can: it remembers the
 * address it was first mounted at and animates nothing for it.
 *
 * The rules, and what satisfies each, are in lib/ui/landing.ts.
 */

import { useLayoutEffect, useRef } from "react"
import { usePathname } from "next/navigation"

import { LANDED_ATTR, LANDING_HOLD_MS, LANDING_HTML_CLASS, LANDING_MARKED_CLASS, LANDING_SURFACES, landsWithPageFade, prefersReducedMotion } from "@/lib/ui/landing"
import { holdLandingGround } from "@/components/community/member/landing"

export function NavLanding() {
  const pathname = usePathname()
  /** The address this was first mounted at: the document's own, which never lands. */
  const at = useRef<string | null>(null)

  /*
    A LAYOUT EFFECT, not an effect. The new page is in the DOM on the commit
    that changes the pathname, and an animation starts when the element first
    matches the rule that declares it. A layout effect runs before that
    commit is painted, so the landing runs from the first painted frame; an
    ordinary effect can land after it, which is a page that appears and then
    fades.
  */
  useLayoutEffect(() => {
    if (at.current === null) {
      at.current = pathname
      return
    }
    /* A move inside one page: a filter, a pill, a `?tab=`. Nothing lands. */
    if (at.current === pathname) return
    at.current = pathname
    if (!landsWithPageFade(pathname)) return
    if (prefersReducedMotion()) return
    /*
      ROUND 29: NOT ON A PAGE THE RULE HAS NOTHING TO LAND. A class on <html> restyles the whole document twice (on, and off
      LANDING_HOLD_MS later), and inside a community every tab (Community, Learn, Calendar, Members, Leaderboards) is a new
      pathname with none of the three surfaces on it: two whole-page restyles per tap, landing nothing, on the phone the
      header was reported to flicker on (scripts/check-mobile-round29.mjs counts the writes on <html>). The surfaces are
      the ones app/globals.css names; the page that just committed is in the DOM already, so a look now is a look at it.
      Only under /community/: elsewhere a page can commit as its loading.tsx first (a person's page does) and its surface
      arrive inside the hold, which is the case the hold is for.
    */
    if ((pathname ?? "").startsWith("/community/") && !document.querySelector(LANDING_SURFACES)) return

    const html = document.documentElement
    /*
      ROUND 31: ONE LANDING PER ARRIVAL, ON ITS OWN GROUND. The owner: "a white blink on the way to Explore". Explore often
      commits as its loading.tsx first (the header's Discover reads ahead only to the loading screen), and the page that
      replaces it inside the hold is a new .explore-ground, which matched the rule and started the fade from nothing again:
      the screen dipped to the document twice. So the surfaces on screen at the commit are the ones that land
      (LANDED_ATTR, app/globals.css), and one that comes later in the hold is simply there. And for the length of the fade
      the document under it is the page's own ground (components/community/member/landing.ts holdLandingGround): in a
      browser <body> is white under Explore's #f8f9fa, which was the white of the blink in the light look.
    */
    const surfaces = Array.from(document.querySelectorAll<HTMLElement>(LANDING_SURFACES))
    for (const el of surfaces) el.setAttribute(LANDED_ATTR, "")
    if (surfaces.length) html.classList.add(LANDING_MARKED_CLASS)
    const ground = holdLandingGround(surfaces[0], LANDING_HOLD_MS)
    html.classList.add(LANDING_HTML_CLASS)
    const clear = () => {
      html.classList.remove(LANDING_HTML_CLASS, LANDING_MARKED_CLASS)
      for (const el of surfaces) el.removeAttribute(LANDED_ATTR)
      ground()
    }
    const done = window.setTimeout(() => html.classList.remove(LANDING_HTML_CLASS), LANDING_HOLD_MS)
    const after = window.setTimeout(clear, LANDING_HOLD_MS)
    return () => {
      window.clearTimeout(done)
      window.clearTimeout(after)
      html.classList.remove(LANDING_HTML_CLASS)
      clear()
    }
  }, [pathname])

  return null
}
