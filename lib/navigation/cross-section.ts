"use client"

/**
 * ===========================================================================
 *  LEAVING /app FOR EXPLORE IS A MOVE, NOT A NEW START
 * ===========================================================================
 * "From /app to /explore: no white blank then an abrupt paint." In the app
 * the dashboard's Explore went through openExternal, which inside the app
 * becomes a document load of storelib.com/explore: the WebView emptied to
 * white, then Explore arrived all at once. On a computer the dashboard's own
 * Explore button set window.location, the same thing in a browser.
 *
 * Explore needs nothing a document load gives it (lib/native-links.ts
 * needsDocumentLoad: only /app and the builders do), so it is a client
 * navigation now: the dashboard stays on screen, untouched, until Explore is
 * ready to replace it in one commit. And Explore is read ahead while the
 * dashboard is idle (lib/nav/prefetch-policy.ts, as much as the device and
 * the network allow), so on a good phone that commit is the next frame.
 */

import { navigateInApp } from "@/lib/native-bridge"
import { prefetchHref, prefetchOnIdle } from "@/lib/nav/prefetch-policy"

type RouterLike = { push: (href: string) => void; prefetch: (href: string, options?: never) => void }

const MAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

/** Open a page of the buyer's side (Explore) from /app, in the same document. */
export function openStorelibPage(router: RouterLike, path: string): void {
  prefetchHref(router, path, "press")
  /* In the app a Storelib address is followed in the WebView, through the router where the page allows it. */
  if (navigateInApp(`https://${MAIN}${path}`, router)) return
  router.push(path)
}

/** Read Explore ahead while /app is idle. Returns the cancel. */
export function warmStorelibPages(router: RouterLike, paths: readonly string[] = ["/explore"]): () => void {
  return prefetchOnIdle(router, paths)
}
