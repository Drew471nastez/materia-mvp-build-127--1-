"use client"

import { useEffect, useState } from "react"
import { appPlatform } from "@/lib/downloads/native"

/**
 * HOW A CREATOR'S STORE OPENS FROM THE LIBRARY.
 *
 * In a browser, in a tab of its own: the buyer came to the library for what
 * they bought, and a look at the shop must not take that away (the receipt
 * does the same, app/receipt/[token]/receipt-view.tsx data-seller-link).
 *
 * In the iPhone and Android apps, in the same web view, as every other
 * store link in the app opens today: the store is a path on storelib.com
 * there (lib/url-helpers getStoreUrl), so the session goes with it, and a
 * new window would be a second web view with nobody signed in.
 *
 * The server does not know which it is, so the first render has no target
 * (a press before the page is live simply opens it here) and the browser
 * gets its target once the page has asked.
 */
export function useStoreLinkProps(): { target?: "_blank"; rel?: string } {
  const [web, setWeb] = useState(false)
  useEffect(() => setWeb(appPlatform() === null), [])
  return web ? { target: "_blank", rel: "noopener" } : {}
}
