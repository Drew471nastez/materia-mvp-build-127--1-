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
