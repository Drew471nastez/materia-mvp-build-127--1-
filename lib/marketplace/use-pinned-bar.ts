"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

/**
 * ===========================================================================
 *  THE BAR THAT ARRIVES WHEN THE TITLE LEAVES
 * ===========================================================================
 *
 * Two screens need this and they need it to behave identically: a profile,
 * where scrolling takes the name and the controls away, and a listing, where
 * scrolling takes the photograph and the same three controls away. On both, the
 * moment the thing identifying the screen goes off the top, a bar carrying its
 * name and its controls comes down to stand in for it.
 *
 * It lives here rather than being written twice because the interesting part is
 * not the bar, it is WHEN it flips — and getting that wrong is invisible in
 * review and obvious in the hand.
 *
 * ---------------------------------------------------------------------------
 * NOT A SCROLL HANDLER
 * ---------------------------------------------------------------------------
 * A scroll listener runs on the main thread on every frame of every flick, on
 * screens that are already scrolling photographs, to compute a boolean that
 * changes twice a session. An IntersectionObserver on a zero-height sentinel
 * fires exactly on the crossings.
 *
 * ---------------------------------------------------------------------------
 * TWO OBSERVERS, AND THE SIGN OF THE MARGIN IS THE WHOLE THING
 * ---------------------------------------------------------------------------
 * With one observer and one line, the state flips the instant that line is
 * crossed — so anything leaving you sitting ON it (a slow drag, the tail of a
 * flick, an overscroll settling back) crosses it repeatedly, and each crossing
 * starts a 320ms slide that the next one reverses partway through. The judder is
 * not one animation played badly; it is several played over each other, none of
 * them finishing.
 *
 * So there are two lines with a dead band between them, and the margins are
 * POSITIVE. This is the part that is easy to get backwards and was:
 *
 *   negative rootMargin SHRINKS the root — it moves the observed line DOWN into
 *   the viewport. Written that way, the "show" observer fires its crossing at a
 *   sentinel top of about +56, and its own test asks for `top < 0`, which +56 is
 *   not. An observer only calls back on a crossing, so once that one has passed
 *   nothing fires again however far you scroll: the bar never appears at all.
 *
 *   positive GROWS the root upward, putting the line above the viewport top,
 *   which is where "the title has gone past" actually lives.
 *
 * SHOW_AT is the larger of the two, so the bar arrives only once the title is
 * properly gone, and leaves as soon as it is nearly back.
 */
const SHOW_AT = 56
const HIDE_AT = 8

export function usePinnedBar<T extends HTMLElement>() {
  const sentinel = useRef<T>(null)
  const [pinned, setPinned] = useState(false)

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  A BAR NEVER SURVIVES A SCREEN OPENING OVER ITS PAGE
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * The sell form opened with the listing page's bar across the top of it: a
   * back arrow, a ⋯, a share button and the words "Eu 2" — the title of the
   * listing behind — sitting above a form for editing that same listing, with
   * its own Renunță and Actualizează at the bottom. Two screens' chrome, one
   * screen.
   *
   * WHY IT IS NOT A Z-INDEX PROBLEM, THOUGH IT LOOKS EXACTLY LIKE ONE. The bar
   * is z-60 and the sheet is z-95, so the sheet ought to win and does not. The
   * bar is portalled to <body>, while the sheet renders inside the marketing
   * layout — and an ancestor of the sheet establishes a stacking context, so its
   * 95 is only compared with its siblings INSIDE that context. Against a
   * body-level element the whole wrapper competes as one, and loses. Raising
   * numbers is chasing that around rather than answering it.
   *
   * THE HONEST TEST IS THE URL. `/products/new` and `/products/edit/<id>` are
   * intercepted routes: they render into the layout's @modal slot while the page
   * underneath stays mounted, which is exactly why its bar goes on being drawn.
   * When the modal is open the URL is the modal's, so a page whose pathname is
   * no longer the current one is a page that is UNDERNEATH something.
   *
   * WHY IT LIVES HERE. The profile solved this for itself with
   * `pathname === "/profile" || pathname.startsWith("/member/")` — a hand-written
   * list of the paths that bar belongs to. It was correct and it did not
   * generalise: the listing page grew a bar, did not copy the list, and the bug
   * came straight back on a different screen. A rule each caller has to remember
   * is a rule that is one new caller away from being broken.
   *
   * Captured at mount rather than listed, so there is nothing to keep in step:
   * whatever path the page was on when its bar was created is the path that bar
   * belongs to, and any other current path means something is in front of it.
   */
  const pathname = usePathname()
  const ownPath = useRef<string | null>(null)
  if (ownPath.current === null) ownPath.current = pathname ?? ""
  const onOwnScreen = (pathname ?? "") === ownPath.current

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === "undefined") return

    const show = new IntersectionObserver(
      ([entry]) => {
        // Gone past, and well past. `boundingClientRect.top` is measured against
        // the real viewport rather than the grown root, so it is still the test
        // for direction: without it the bar also appears when the sentinel has
        // not been reached yet, which on a short page is most of the time.
        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) setPinned(true)
      },
      { threshold: 0, rootMargin: `${SHOW_AT}px 0px 0px 0px` },
    )
    const hide = new IntersectionObserver(
      ([entry]) => {
        // Back in view near the top: the real title is about to be readable
        // again, so the stand-in should be gone before it is.
        if (entry.isIntersecting) setPinned(false)
      },
      { threshold: 0, rootMargin: `${HIDE_AT}px 0px 0px 0px` },
    )

    show.observe(el)
    hide.observe(el)
    return () => {
      show.disconnect()
      hide.disconnect()
    }
  }, [])

  /**
   * `pinned` is what the SCROLL says; `onOwnScreen` is whether this page is the
   * one in front. Both have to be true, and the second is not the caller's
   * business to remember.
   *
   * `left` is the DIFFERENCE between the two reasons a bar can be hidden, and
   * they want opposite motion:
   *
   *   scrolled back up   the bar leaves the way it arrived. It is the only
   *                      thing moving and the movement is the point.
   *
   *   another screen
   *   opened over it     the bar must simply stop existing. A sell sheet climbs
   *                      from the bottom of the screen while a header slides
   *                      out of the top of it, and two surfaces travelling past
   *                      each other in opposite directions for one press is
   *                      read as the header being shoved out of the way —
   *                      which is exactly what it looks like, because it is.
   *
   * Reported rather than decided here, because a hook cannot set an attribute;
   * the bars pass it to `data-instant`, and app/globals.css drops the
   * transition when it is set.
   */
  return { sentinel, pinned: pinned && onOwnScreen, left: !onOwnScreen }
}

/**
 * ===========================================================================
 *  HOW MUCH OF THE TOP OF THE SCREEN IS SPOKEN FOR
 * ===========================================================================
 *
 * Anything scrolling something INTO view has to know what is already sitting on
 * top of it, or it puts the thing it was aiming for underneath a bar.
 *
 * It used to measure the profile's own pinned bar and nothing else, which was
 * complete on a phone — in the app there is no site header at all, and the bar
 * is the only fixed thing above the page. On the WEB it is not: the marketplace
 * header is `sticky top-0` on a desktop and the mobile browser has its own
 * sticky header, and both of those are covering the top of the viewport
 * whether or not a profile bar happens to be up. Aiming at y=0 with a 71px
 * black header parked there lands the tab strip behind it.
 *
 * So it is the LOWEST EDGE of everything currently occupying the top, not one
 * element's height. Three candidates, any of which may be absent:
 *
 *   #platform-header-root   the desktop marketplace header, sticky
 *   .web-only-header        the phone browser's header, sticky
 *   .profile-pinned[shown]  the profile's own bar, fixed, when it is up
 *
 * `bottom` rather than `height`, and that is the correction that matters: an
 * element's height is where it ends only if it starts at zero. The profile bar
 * sits BELOW the site header on a desktop (see `.profile-pinned` in
 * app/globals.css), so its height is about two thirds of what it actually
 * covers.
 *
 * Anything not on screen contributes nothing: a sticky header scrolled out of
 * view, or a bar that has slid up, has a negative `bottom`, and `Math.max`
 * with a floor of zero is the whole of that test.
 */
const TOP_CHROME = [
  "#platform-header-root",
  ".web-only-header",
  '.profile-pinned[data-shown="true"]',
]

export function pinnedOffset(): number {
  if (typeof document === "undefined") return 0
  let lowest = 0
  for (const selector of TOP_CHROME) {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) continue
    // An element that is `display: none` — the desktop header on a phone, the
    // phone header on a desktop — reports a zero-height rect at the origin,
    // which contributes nothing on its own and needs no separate test.
    const { top, bottom } = el.getBoundingClientRect()
    // Only what is actually pinned to the TOP. A sticky header that has been
    // scrolled past sits above the viewport; one that has not been reached yet
    // sits below the fold and is not covering the destination either.
    if (top > 4 || bottom <= 0) continue
    if (bottom > lowest) lowest = bottom
  }
  return lowest
}
