"use client"

import { useEffect, useState } from "react"
import { isNativeApp } from "@/lib/platform-utils"

/**
 * ===========================================================================
 *  OPENING YOUR OWN SITE FROM THE APP DOES NOT ADD A VISITOR
 * ===========================================================================
 * The app and the creator's site are different hosts, and the session cookie
 * is host-only, so the site cannot tell the creator from anybody else
 * (lib/analytics/own-marker says why, and what the hand-off is). This is the
 * app's half of it:
 *
 *   useOwnMarker()  once, in a screen that can open the site: asks the
 *                   server for a token naming this creator, keeps it in
 *                   memory only, and draws again when it arrives
 *   ownOpen(url)    the address to OPEN, which carries that token to the
 *                   site's own marker route
 *
 * `ownOpen` is for opening and nothing else: what the screen SHOWS and what
 * a Copy button COPIES stays the plain address, so a creator never shares a
 * link with a token on it, and the marker route takes the token back out of
 * the address before the page is drawn.
 *
 * It is called with an address the app built for this creator's own site,
 * and a connected domain can be any name at all, so the only address rule it
 * can keep is that the address is an absolute https one. The token is not a
 * secret worth guarding: it names a creator, grants nothing, and the worst a
 * leaked one does is stop counting the browser holding it on that creator's
 * pages. The token route mints it only for the session's own creator.
 *
 * With no token, a slow answer or a signed-out session, every address comes
 * back exactly as it went in: the link works, and the visit is counted as it
 * was before. Nothing here can stop a creator opening their own site.
 */

const REFRESH_MS = 25 * 60_000

let token: string | null = null
/* Storelib's own domain, when the token's answer also marked every site under it (sl_own_d): those open at their plain address. */
let sitesDomain: string | null = null
let mintedAt = 0
let asking: Promise<void> | null = null
const waiting = new Set<() => void>()

/** An absolute https address, which is every address the app builds for a site. */
function openable(url: URL): boolean {
  return url.protocol === "https:" && url.host.length > 0
}

/**
 * Ask for a token, at most one request at a time, and keep it for as long as
 * it is good for. Safe to call on every mount.
 */
export function primeOwnMarker(): void {
  if (typeof window === "undefined") return
  if (token && Date.now() - mintedAt < REFRESH_MS) return
  if (asking) return
  asking = fetch("/api/analytics/own/token", { credentials: "same-origin", cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { token?: string | null; sitesMarked?: boolean; sitesDomain?: string } | null) => {
      if (data && typeof data.token === "string" && data.token) {
        token = data.token
        sitesDomain = data.sitesMarked === true && typeof data.sitesDomain === "string" && data.sitesDomain ? data.sitesDomain.toLowerCase() : null
        mintedAt = Date.now()
        for (const draw of waiting) draw()
      }
    })
    .catch(() => {
      /* No token, so links open as they always did. */
    })
    .finally(() => {
      asking = null
    })
}

/**
 * The address to open for the creator's own site: the same page, reached
 * through that host's marker route, which sets the marker and redirects to
 * the page with nothing extra in the address. The plain address whenever
 * there is no token to carry.
 */
export function ownOpen(siteUrl: string | null | undefined): string {
  const plain = typeof siteUrl === "string" ? siteUrl : ""
  if (!plain || !token) return plain
  let url: URL
  try {
    url = new URL(plain)
  } catch {
    return plain
  }
  if (!openable(url)) return plain
  /* A site on Storelib's own domain is already marked (sl_own_d): its plain address, with no hop through the marker route for the browser to show first. */
  /* Not from the app's shell: it opens the site in the phone's own browser, which never had the app's cookie. */
  if (sitesDomain && !isNativeApp() && url.hostname.toLowerCase().endsWith(`.${sitesDomain}`)) return plain
  const to = `${url.pathname}${url.search}` || "/"
  const marker = new URL("/api/analytics/own", url.origin)
  marker.searchParams.set("t", token)
  if (to !== "/") marker.searchParams.set("to", to)
  return marker.toString()
}

/**
 * A screen that can open the creator's own site asks for the token as it
 * mounts, and draws again when it arrives, so a link that was built before
 * then is rebuilt with the marker on it. Nothing waits for it: the first
 * draw links straight to the site, as it always did.
 */
export function useOwnMarker(): void {
  const [, redraw] = useState(0)
  useEffect(() => {
    if (token) return
    const draw = () => redraw((n) => n + 1)
    waiting.add(draw)
    primeOwnMarker()
    return () => {
      waiting.delete(draw)
    }
  }, [])
}

/** For the tests: the module keeps the token in memory, so they can clear it. */
export function forgetOwnMarker(): void {
  token = null
  sitesDomain = null
  mintedAt = 0
  waiting.clear()
}
