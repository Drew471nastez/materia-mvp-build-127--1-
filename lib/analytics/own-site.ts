"use client"

import { useEffect, useState } from "react"
import { OWN_HASH_PARAM } from "./events"
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
 *   ownOpen(url)    the address to OPEN, which carries that token in its
 *                   fragment (#sl_own=) to the site's own tracker
 *
 * `ownOpen` is for opening and nothing else: what the screen SHOWS and what
 * a Copy button COPIES stays the plain address, so a creator never shares a
 * link with a token on it, and the site's tracker takes the token back out
 * of the address as soon as it runs (lib/analytics/page-tracker
 * takeOwnHandoff). A token lasts half an hour (HANDOFF_TTL_MS).
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
 * The address to open for the creator's own site, opened at once, never
 * through a route first.
 *
 * A site on Storelib's own domain is already marked when the app asks for
 * its token (sl_own_d, set by /api/analytics/own/token), so the creator's
 * visit is left out of their analytics. Anything else (a connected domain,
 * storelib.me, the phone app) used to go through the marker route first:
 * the owner watched /api/analytics/own?t=... sit in the address bar while
 * the server answered, a whole extra round trip before the site even
 * started loading. That hop is gone and stays gone; the token goes in the
 * fragment instead.
 */
export function ownOpen(siteUrl: string | null | undefined): string {
  if (typeof siteUrl !== "string") return ""
  /*
    THE HAND-OFF IN THE FRAGMENT, NOT THROUGH A HOP (round AD1). A connected
    domain, storelib.me and the phone's own browser cannot have the marker
    yet, so the creator's every look at them was a visitor. The token now
    rides in #sl_own=: the site opens at once, as above, the browser never
    sends a fragment to any server, the page's tracker takes it off the
    address straight away and sends it with its view, and the answer marks
    this browser on that host (lib/analytics/collect). A site under
    Storelib's own domain already marked here (sl_own_d) opens plain.
  */
  if (!token) return siteUrl
  let url: URL
  try {
    url = new URL(siteUrl)
  } catch {
    return siteUrl
  }
  if (url.protocol !== "https:" || url.hash) return siteUrl
  const host = url.hostname.toLowerCase()
  /* The phone app opens a site in the phone's own browser, which holds none of the app's cookies: it always carries the hand-off. */
  if (sitesDomain && (host === sitesDomain || host.endsWith(`.${sitesDomain}`)) && !isNativeApp()) return siteUrl
  url.hash = `${OWN_HASH_PARAM}=${encodeURIComponent(token)}`
  return url.toString()
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
