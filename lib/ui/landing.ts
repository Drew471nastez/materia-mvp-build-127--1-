"use client"

/**
 * ===========================================================================
 *  ONE LANDING, AND EVERY BUYER PAGE ARRIVES ON IT
 * ===========================================================================
 * "When I click on somebody's profile it should be more smooth and clean
 * taking me there." "The back from the account settings back to the profile
 * account is too direct." "Every time I land on Discover, from every kind of
 * place, make sure it is not a direct animation when I land on it."
 *
 * The app already had the answer and only /app and a community were using
 * it: opacity and a 2px rise over 180ms on one curve (NAV_ENTER_* in
 * lib/ui/app-navigation.ts, app/globals.css `.community-land`). Nothing new
 * is invented here. The numbers are imported from the one place they are
 * written, and the CSS the classes below name reuses the keyframes already
 * in the stylesheet.
 *
 * THREE THINGS IT MUST NOT DO, and each is a rule rather than a hope:
 *
 *   never on a document load   a reload, a cold start or a link opened fresh
 *                              paints the page from the server's HTML, and
 *                              fading that hides a page that is already
 *                              there. Both entry points below start by
 *                              recording where they are and animating
 *                              nothing.
 *   never inside one page      a pill press, a filter, a `?tab=`: the
 *                              address a landing is keyed to is the
 *                              PATHNAME, and a change that leaves it alone
 *                              plays nothing.
 *   nothing under reduced      the stylesheet turns the animation off, and
 *   motion                     NavLanding does not even set its class.
 */

import { useRef } from "react"
import { NAV_ENTER_EASE, NAV_ENTER_MS, NAV_ENTER_RISE_PX } from "./app-navigation"

/** The class a page's own box carries to land. app/globals.css holds the animation. */
export const LANDING_CLASS = "page-land"

/**
 * The class on <html> while a client navigation's landing runs, for the
 * pages whose outermost box this code does not own (a person's page,
 * Explore). The stylesheet names those surfaces; this only says "a
 * navigation just landed".
 */
export const LANDING_HTML_CLASS = "nav-landing"

/** The landing's own numbers, from the one place they are written. */
export const LANDING_MS = NAV_ENTER_MS
export const LANDING_RISE_PX = NAV_ENTER_RISE_PX
export const LANDING_EASE = NAV_ENTER_EASE

/**
 * How long the class stays on <html>. The animation plus a margin: taking
 * the class off while the animation is still running would cancel it mid
 * fade, which is the hard cut this exists to remove.
 */
export const LANDING_HOLD_MS = LANDING_MS + 120
/**
 * The surfaces html.nav-landing plays its fade on (app/globals.css, "the same selectors, to the letter"). With none of them
 * on the page that arrived, the class has nothing to do and is not set (components/ui/nav-landing.tsx, round 29).
 */
export const LANDING_SURFACES = "[data-member-profile], [data-storefront-root], .explore-ground"

/**
 * Whether an address lands this way. The seller dashboard has a landing of
 * its own, played by its shell (components/app/app-stage.tsx), and the admin
 * console is not a buyer surface at all. Everything else does.
 */
export function landsWithPageFade(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname === "/app" || pathname.startsWith("/app/")) return false
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false
  return true
}

/** Reduced motion, asked of the browser, with no answer counting as no preference. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * The landing class for a box whose contents are swapped by the router,
 * given whatever token the caller already keys that box on.
 *
 * NOT `useEntranceOnChange`, which compares every token against the FIRST
 * one forever: /account to /account/settings and back to /account is back at
 * the first token, so the return journey played nothing, and the return
 * journey is the one the owner named ("the back from the account settings
 * back to the profile account is too direct"). This asks a different
 * question, has the address moved AT ALL since the document loaded, and
 * once the answer is yes it stays yes.
 *
 * A ref rather than state, for the reason useEntranceOnChange gives: the
 * answer has to be right on the first painted frame of the new content, and
 * state would settle a render later, which is a late fade.
 */
export function useLandingOnMove(token: string): string {
  const at = useRef(token)
  const moved = useRef(false)
  if (token !== at.current) {
    at.current = token
    moved.current = true
  }
  return moved.current ? LANDING_CLASS : ""
}
