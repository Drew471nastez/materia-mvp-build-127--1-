"use client"

/**
 * ===========================================================================
 *  WHO IS ON STORELIB NOW: ONE SMALL REQUEST A MINUTE WHILE THE TAB IS SHOWN
 * ===========================================================================
 * Mounted once in Storelib's root layout and once in a creator website's
 * (app/(storelib)/layout.tsx, app/(site)/layout.tsx). The queue and its rules
 * are lib/live/live-client.ts; what is kept and when an account is linked is
 * lib/live/live.ts and lib/live/live-server.ts.
 *
 * Not run in /app or the website editor (round 59's ActivityBeacon is there),
 * in /admin, inside a frame (an editor's preview), or in a page the browser
 * is only prerendering. No cookie is set; the tab's id is in sessionStorage.
 */
import * as React from "react"
import { usePathname } from "next/navigation"

import { hasConsent } from "@/lib/consent/client"
import { LIVE_SEND_EVERY_MS, liveSampleRate, sampledIn, type HostKind } from "@/lib/live/live"
import { LIVE_EVENT, LIVE_SID_KEY, actionOfRequest, createLiveQueue, receiptTokenOf, sourceOf, tabSid, type LiveQueue } from "@/lib/live/live-client"

const URL_PATH = "/api/live"

function send(body: string) {
  try {
    void fetch(URL_PATH, { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "Content-Type": "text/plain" } }).catch(() => undefined)
  } catch {
    /* Not sent; the next minute carries what comes after. */
  }
}

function beacon(body: string) {
  try {
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(URL_PATH, body)) return
  } catch {
    /* Fall through to fetch. */
  }
  send(body)
}

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function random(n: number): Uint8Array {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return a
}

function inApp(): boolean {
  try {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    return !!w.Capacitor?.isNativePlatform?.() || /StorelibApp|Capacitor/.test(navigator.userAgent)
  } catch {
    return false
  }
}

export function LiveBeacon({ host = "storelib" }: { host?: HostKind }) {
  const pathname = usePathname()
  const queueRef = React.useRef<LiveQueue | null>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    if (window.self !== window.top) return
    /* A page the browser is only prerendering is not a visit until it is shown. */
    const doc = document as Document & { prerendering?: boolean }
    if (doc.prerendering) {
      const start = () => setReady(true)
      document.addEventListener("prerenderingchange", start, { once: true })
      return () => document.removeEventListener("prerenderingchange", start)
    }
    setReady(true)
  }, [])

  React.useEffect(() => {
    if (!ready) return
    const main = (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").toLowerCase()
    /* Before a yes to analytics nothing is stored on the device (the privacy policy's promise): the id lives in this page's memory only, and one kept from an earlier yes is removed. With a yes it is kept in sessionStorage for the tab. */
    const consented = hasConsent("analytics")
    if (!consented) {
      try {
        storage()?.removeItem(LIVE_SID_KEY)
      } catch {
        /* blocked */
      }
    }
    const sid = tabSid(consented ? storage() : null, random)
    /* Sampled out (only ever below 1 when NEXT_PUBLIC_LIVE_ANON_SAMPLE says so): an anonymous tab sends nothing at all. */
    if (!consented && !sampledIn(sid, liveSampleRate(process.env.NEXT_PUBLIC_LIVE_ANON_SAMPLE))) return
    const queue = createLiveQueue({
      now: Date.now,
      sid,
      host,
      source: sourceOf(document.referrer, location.href, [location.hostname.toLowerCase(), main]),
      app: inApp(),
      send,
      beacon,
      receiptToken: receiptTokenOf,
    })
    queueRef.current = queue
    queue.page(location.pathname)

    const onVisibility = () => (document.visibilityState === "hidden" ? queue.hide() : queue.show())
    const onHide = () => queue.hide()
    const onAction = (e: Event) => queue.action(String((e as CustomEvent).detail ?? ""))
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onHide)
    window.addEventListener(LIVE_EVENT, onAction)
    /* A theme site's own Add to cart is a request to /cart/add: heard by its address only. */
    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const name = actionOfRequest(entry.name)
          if (name) queue.action(name)
        }
      })
      observer.observe({ type: "resource", buffered: false })
    } catch {
      observer = null
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") queue.tick()
    }, LIVE_SEND_EVERY_MS)
    return () => {
      window.clearInterval(id)
      observer?.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onHide)
      window.removeEventListener(LIVE_EVENT, onAction)
      queue.hide()
      queueRef.current = null
    }
  }, [host, ready])

  /*
    A route change inside the page. The first page is noted as the queue
    starts. The address bar's own path, not the router's: on a creator's
    website the router may know the page by its internal /w/<name>/ path.
  */
  React.useEffect(() => {
    if (pathname) queueRef.current?.page(window.location.pathname)
  }, [pathname, host])

  return null
}
