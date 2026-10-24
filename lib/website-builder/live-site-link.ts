"use client"

/**
 * ===========================================================================
 *  THE LIVE SITE OPENS IN THE PHONE'S BROWSER, NEVER IN THE APP'S OWN VIEW
 * ===========================================================================
 * The owner, on the publish sheet's open icon beside Copy: "in iOS Capacitor
 * and Android it should take me to the browser outside the app, and do
 * nothing inside the app. Right now it redirects inside the Capacitor frame
 * to the live website and bugs things out."
 *
 * The icon was a plain <a target="_blank"> left to whatever caught it. In the
 * app a new window to one of our own hosts is the app's: <name>.storelib.com
 * is in allowNavigation (capacitor.config.ts), so Android's WebView loads it
 * over the builder, where the shell rewrites a creator's subdomain to their
 * profile (StorelibWebViewClient), and the builder is gone. The only thing
 * standing between the tap and that was the link guard's window listener
 * (components/platform/native-link-guard.tsx), and openInBrowser's own way
 * out on Android, when the browser plugin did not answer, was that same new
 * window.
 *
 * Now every open of the live site or its preview from the builder is the
 * press's own: the click is taken (preventDefault, so nothing else follows
 * the link) and handed to openInBrowser, which is the system browser in the
 * app (Safari on iOS, Chrome on Android) and a new tab on the web. The link
 * keeps its href and target, so a long press, Copy link and a computer's
 * modified click still behave as links do.
 */
import type React from "react"
import { openInBrowser } from "@/lib/native-bridge"

/** A click that is the browser's own business: a new tab or window asked for with a key or a middle button. */
function browserOwnsClick(e: React.MouseEvent<HTMLElement>): boolean {
  return e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
}

/** The click handler for a link to the creator's live site (or its preview). */
export function openLiveSite(url: string) {
  return (e: React.MouseEvent<HTMLElement>) => {
    if (!url || browserOwnsClick(e)) return
    e.preventDefault()
    openInBrowser(url)
  }
}

/** Everything a link to the live site carries: its address, a new window on the web, and the press handled here. */
export function liveSiteLink(url: string) {
  return { href: url, target: "_blank", rel: "noopener noreferrer", onClick: openLiveSite(url), "data-open-browser": "" } as const
}
