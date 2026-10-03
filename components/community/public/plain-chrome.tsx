"use client"

import { useLayoutEffect } from "react"

/**
 * A SHARED COMMUNITY LINK IS THE COMMUNITY'S PAGE, NOT STORELIB'S.
 * "When I share the actual community with someone it should not have the
 * Storelib header." The page already carries the community's cover, its
 * picture, its name and whose it is, so the platform's black bar (and the
 * phone's search strip under it) only said Storelib over somebody else's
 * front door. While this page is on screen both are hidden, by a class on
 * <html> that globals.css reads, and they come straight back on the way out.
 *
 * Nothing is unmounted: the header keeps its state, and the one rule is
 * `display: none`, so leaving costs nothing and the page it returns to is
 * the page it was.
 */
export function CommunityPlainChrome() {
  useLayoutEffect(() => {
    const html = document.documentElement
    html.classList.add("community-plain")
    return () => html.classList.remove("community-plain")
  }, [])
  return null
}
