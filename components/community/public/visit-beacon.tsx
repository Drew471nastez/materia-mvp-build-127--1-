"use client"

/**
 * ===========================================================================
 *  A COMMUNITY PAGE ON SOMEBODY'S SCREEN, TOLD ONCE A DAY
 * ===========================================================================
 * Drawn by the community's layout (app/(marketing)/community/[slug]/
 * layout.tsx) around every page of a published community, for everybody but
 * its owner, on storelib.com and on the community's own domain. Its first
 * mount posts the page's address (with its utm tags), the page the visitor
 * came from and whether the screen takes touches to
 * app/api/community/<id>/visit, which counts one visit a visitor a day
 * (lib/communities/server/record-view.ts).
 *
 * WHY HERE AND NOT IN THE RENDER (round 33): a page drawn ahead of a click
 * (a prefetch from Explore) is never mounted, so it is never a visit, and
 * the click that shows it is, whatever page of the community it opens
 * first. A browser driven by a program (navigator.webdriver) says nothing;
 * a page being prerendered waits until it is really shown.
 *
 * WHERE THEY CAME FROM is `referer`, the Referer the layout's own request
 * carried: on a first load it is the site that linked here, and on a move
 * inside Storelib (Explore to a community) it is the Storelib page the
 * visitor was on, which the document's own referrer would not say.
 *
 * ONCE A DAY PER BROWSER, by the UTC day the database counts by, so moving
 * between the feed, a post and a space costs nothing more. The day is
 * remembered only after the server answered; without storage it simply
 * asks again and the database counts the visit once all the same.
 */
import * as React from "react"

const KEY = "storelib:community-visit:"

export function CommunityVisitBeacon({ communityId, referer }: { communityId: string; referer: string | null }) {
  /* The address as the page opened, before anything on it trims its query. */
  const opened = React.useRef<string | null>(null)
  if (opened.current === null && typeof window !== "undefined") opened.current = `${window.location.pathname}${window.location.search}`
  React.useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.webdriver) return
    const day = new Date().toISOString().slice(0, 10)
    const key = `${KEY}${communityId}`
    try {
      if (window.localStorage.getItem(key) === day) return
    } catch {
      /* No storage: the database still counts the visit once. */
    }
    const send = () => {
      const body = JSON.stringify({
        path: opened.current ?? `${window.location.pathname}${window.location.search}`,
        referrer: referer || document.referrer || null,
        touch: typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : null,
      })
      fetch(`/api/community/${communityId}/visit`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((answer: { ok?: boolean } | null) => {
          if (!answer?.ok) return
          try {
            window.localStorage.setItem(key, day)
          } catch {
            /* Asked again next time; counted once all the same. */
          }
        })
        .catch(() => {})
    }
    const doc = document as Document & { prerendering?: boolean }
    if (doc.prerendering) {
      doc.addEventListener("prerenderingchange", send, { once: true })
      return () => doc.removeEventListener("prerenderingchange", send)
    }
    send()
  }, [communityId, referer])
  return null
}
