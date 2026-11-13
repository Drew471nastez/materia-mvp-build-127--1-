"use client"

/**
 * ===========================================================================
 *  THE APP'S START LANDS IN THE DOCUMENT IT STARTED IN
 * ===========================================================================
 * Opening the app showed a blank screen for too long before the real page.
 * The chain was (app/native-start/page.tsx):
 *
 *   1. the WebView loads /native-start: a document, its stylesheet, the
 *      framework and the page's scripts, then hydration
 *   2. the gate decides where to go from what the phone holds (a few ms)
 *   3. window.location.replace(target): a SECOND document from nothing.
 *      Its HTML, the same stylesheet and scripts read again (from the disk
 *      cache at best), a second hydration of the whole root layout, and
 *      everything between the two drawn as an empty WebView: the white
 *      frame
 *
 * Step 3 is now a client navigation (router.replace). Everything step 1
 * loaded stays loaded: the root layout, its providers, the fonts, the
 * stylesheet, the framework. Only the destination's own payload is fetched
 * and drawn, into the same document, and the gate's plain screen stays on
 * the glass until the page replaces it in one commit. There is no frame
 * between two documents because there is only one.
 *
 * WHAT STILL LOADS A DOCUMENT
 *   /auth/...    route handlers (the OAuth and session hops), which answer
 *                with a redirect rather than a page
 *   a stall      if the page has not arrived after LAND_WATCH_MS (a router
 *                that refused, a payload that never came), the address is
 *                loaded as a document after all, so a start can never stay
 *                on the gate
 *
 * The launch screen is still taken down by the page that lands, on its own
 * first steady frame (components/platform/native-chrome.tsx, or the three
 * pages that time it themselves): that runs on a client navigation exactly
 * as on a document load, because it follows the address, not the document.
 */

export const LAND_WATCH_MS = 8000

/** The targets a client navigation cannot carry. */
export function landsAsDocument(target: string): boolean {
  if (!target.startsWith("/") || target.startsWith("//")) return true
  return target === "/auth" || target.startsWith("/auth/")
}

type RouterLike = { replace: (href: string) => void }

export function landInPlace(target: string, router: RouterLike | null | undefined): void {
  if (typeof window === "undefined") return
  if (!router || landsAsDocument(target)) {
    window.location.replace(target)
    return
  }
  try {
    router.replace(target)
  } catch {
    window.location.replace(target)
    return
  }
  window.setTimeout(() => {
    /* Round AU: never while the phone is offline. That load fails, and on Android the system's error page replaces the app; the gate says "No internet connection" instead and goes on when it is back. */
    if (typeof navigator !== "undefined" && navigator.onLine === false) return
    if (window.location.pathname === "/native-start") window.location.replace(target)
  }, LAND_WATCH_MS)
}
