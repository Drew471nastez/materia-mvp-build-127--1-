"use client"

import { useEffect, useState } from "react"

/**
 * ===========================================================================
 *  ARRIVING IN A COMMUNITY FROM OUTSIDE IT
 * ===========================================================================
 * Opened from Discover, a community used to snap in: Explore, then the
 * community's frame in the next frame, then a spinner in the middle column
 * while its page came. It lands the way an /app page lands now
 * (components/app/app-stage.tsx: opacity and a 2px rise over 180ms on
 * NAV_ENTER_EASE), and while it lands the middle column waits as the app's
 * slow page does (NAV_PHONE_SPINNER_AFTER_MS on a phone, NAV_SPINNER_AFTER_MS
 * on a computer) before it shows the small spinner, so a page that comes
 * quickly is never preceded by one (app/globals.css .community-land).
 *
 * The public frame (the sales page, what somebody opening a community from
 * Discover usually gets) lands whole. The member frame's columns have a
 * landing of their own (shell-frame.tsx LAND), so there only the spinner's
 * wait is taken from here.
 *
 * ONLY AN ARRIVAL. The frame is drawn once by the community's layout and
 * kept while the member moves around inside, so it lands once, from
 * Explore, a profile or a link, and moving between the feed and Members
 * changes only the page inside it. And not on a page loaded as a document:
 * there the frame is already in the server's HTML when this first runs, and
 * fading that would hide a page that is already on screen.
 */

/** How long the frame counts as arriving: past the landing and past the longest wait before a spinner. */
export const LANDING_MS = 1500

const FRAME = "[data-community-shell], [data-community-public]"

export function useCommunityLanding(): boolean {
  /* On the server and while hydrating: false (the frame is already drawn). On a client navigation into the community: no frame yet, so true. */
  const [landing, setLanding] = useState(() => typeof document !== "undefined" && !document.querySelector(FRAME))
  useEffect(() => {
    if (!landing) return
    const t = window.setTimeout(() => setLanding(false), LANDING_MS)
    return () => window.clearTimeout(t)
  }, [landing])
  return landing
}

/*
  THE GROUND UNDER THE FADE IS THE COMMUNITY'S (round 30, the owner: "a flash and a white space while it opens"). The
  frame lands from nothing, so for its first frames what shows is whatever is under it: the document's own white in the
  light look, where Explore and the frame are both the page's #f8f9fa, so every arrival dipped to white and came back.
  For the length of the landing the document is painted the frame's own ground, read once from the frame as it is drawn
  (the light grey, or the dark ground in the dark look), so the fade goes from that colour to the page and nothing else
  shows. Put back as it was once the landing is over.
*/
export const LANDING_GROUND_MS = 400

export function holdLandingGround(el: HTMLElement | null | undefined, ms = LANDING_GROUND_MS): () => void {
  if (!el || typeof window === "undefined") return () => {}
  const ground = getComputedStyle(el).backgroundColor
  if (!ground || ground === "transparent" || /rgba\([^)]*,\s*0\)$/.test(ground)) return () => {}
  /* <body> only: <html> carries the bar's colour for the strip under the clock (lib/ui/light-chrome), and the body's box is the page's whole height. */
  const body = document.body
  const was = body.style.backgroundColor
  body.style.backgroundColor = ground
  let over = false
  const done = () => {
    if (over) return
    over = true
    window.clearTimeout(t)
    if (body.style.backgroundColor === ground) body.style.backgroundColor = was
  }
  const t = window.setTimeout(done, ms)
  return done
}
