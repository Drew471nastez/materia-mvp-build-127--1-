"use client"

/**
 * ===========================================================================
 *  THE LAST WORD ON A LINK, INSIDE THE PHONE APP
 * ===========================================================================
 * Every link that opens a Storelib page should already say so (SmartLink,
 * openExternal and the header all route through lib/native-links.ts). This
 * catches the ones that do not, wherever they are drawn: a plain
 * <a target="_blank"> to a storelib.com page (Terms from checkout, a product
 * linked in a post), an absolute www.storelib.com or storelib.me address, a
 * window.open of one of our pages. Inside the app each of those went to
 * Safari, because Capacitor sends a new window and any host outside
 * allowNavigation to the system browser. Here they navigate the app instead.
 *
 * WHAT IT LEAVES ALONE. A click something else already handled (Next's
 * <Link>, a SmartLink, a menu that closes first: anything that called
 * preventDefault), a modified click, a download, a mailto: or tel:, an
 * #anchor, and a plain same host link without a target, which the WebView
 * follows in place already. Somebody else's site goes to the browser as it
 * always did. Outside the app nothing is installed at all.
 *
 * The click is read on window in the bubble phase, so it runs after React's
 * own handlers (attached at the root) have had their say.
 */

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { isNativeApp } from "@/lib/platform-utils"
import { nativeLinkFor } from "@/lib/native-links"
import { navigateInApp, onCreatorTools, openInApp, openInBrowser } from "@/lib/native-bridge"

/** Pages that are half of a flow: a new window link from them opens in the sheet over them. */
const FLOW_PAGES = ["/checkout", "/purchase"]
/*
  THE CREATOR'S OWN TOOLS. A new window opened from these (View live, Preview,
  View page, View store, Open the live page) is the creator checking what the
  world sees: it opens in the phone's browser (openInBrowser), not the app.
*/
const inCreatorTools = onCreatorTools
const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

function sameHost(href: string): boolean {
  try {
    return new URL(href).host === window.location.host
  } catch {
    return false
  }
}

/** Stripe's hosted pages. Opening one is what sends payout setup to the system browser. */
function stripeLeavesApp(href: string): boolean {
  return /^https?:\/\/(?:js\.stripe\.com|connect\.stripe\.com)\//.test(href)
}

/** Not null (Stripe would then navigate this page) and not this window (Stripe would set its address). */
function fakeStripeWindow(url: string): Window {
  const stub = {
    closed: false,
    close() {
      stub.closed = true
    },
    focus() {},
    blur() {},
    postMessage() {},
    location: { href: url },
    opener: null as Window | null,
  }
  return stub as unknown as Window
}

export function NativeLinkGuard() {
  const router = useRouter()
  /* The router the listeners use, kept current without reinstalling them. */
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    if (!isNativeApp()) return

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.hasAttribute("download")) return
      /* A tap that would leave for Stripe's site stays on this page. The embedded form is the iframe. */
      if (stripeLeavesApp(a.href)) {
        e.preventDefault()
        return
      }
      const link = nativeLinkFor(a.href)
      if (link.kind === "none" || link.kind === "external") return
      const newWindow = !!a.target && !["_self", "_top", "_parent"].includes(a.target)
      /* A link on the host the app is on, in this window: the WebView follows it in place already. */
      if (!newWindow && sameHost(a.href)) return
      e.preventDefault()
      if ((newWindow && inCreatorTools()) || a.hasAttribute("data-open-browser")) {
        openInBrowser(a.href)
        return
      }
      /*
        FROM CHECKOUT, A PAGE TO READ OPENS OVER IT. Terms, the refund policy
        and Privacy are new window links there; following them in place would
        throw away a payment half filled in. The in-app sheet slides over the
        checkout and closes back to it, still in the app.
      */
      if (newWindow && link.kind === "path" && FLOW_PAGES.some((p) => under(window.location.pathname, p))) {
        openInApp(new URL(link.path, window.location.origin).toString())
        return
      }
      navigateInApp(link.kind === "path" ? link.path : link.url, routerRef.current)
    }
    window.addEventListener("click", onClick)

    /*
      window.open OF ONE OF OUR PAGES navigates the app. Wrapped over
      whatever is installed already (the Stripe guard in the root layout's
      first script), and handed back on unmount. An empty URL is a window a
      caller fills in itself (a download, a print), so it is left alone.
      The return is this window, never null: a null reads as "blocked" to
      callers that then try another way out (openExternal's storelib://
      fallback).
    */
    const before = window.open
    const wrapped = function (this: Window, url?: string | URL, target?: string, features?: string) {
      const href = url == null ? "" : String(url)
      /* The in-app sheet (openInApp) asked for this window itself: let it through. */
      const sheet = window as unknown as { __storelibSheet?: string }
      if (href && sheet.__storelibSheet === href) {
        sheet.__storelibSheet = undefined
        return before.call(window, url as string, target, features)
      }
      /* openInBrowser asked for this one: the phone's own browser. */
      const browser = window as unknown as { __storelibBrowser?: string }
      if (href && browser.__storelibBrowser === href) {
        browser.__storelibBrowser = undefined
        return before.call(window, url as string, target, features)
      }
      /* From the creator's tools, a page of ours in a new window is the live site being checked: the browser. */
      if (href && inCreatorTools() && target !== "_self") {
        const link = nativeLinkFor(href)
        if (link.kind === "path" || link.kind === "host") {
          openInBrowser(link.kind === "path" ? new URL(link.path, window.location.origin).toString() : link.url)
          return window
        }
      }
      /* A popup of Stripe's site is not this window, or the app would follow it out to the browser. */
      if (href && stripeLeavesApp(href)) return fakeStripeWindow(href)
      if (href) {
        const link = nativeLinkFor(href)
        if ((link.kind === "path" || link.kind === "host") && navigateInApp(link.kind === "path" ? link.path : link.url, routerRef.current)) return window
      }
      return before.call(window, url as string, target, features)
    } as typeof window.open
    window.open = wrapped

    return () => {
      window.removeEventListener("click", onClick)
      if (window.open === wrapped) window.open = before
    }
  }, [])

  return null
}
