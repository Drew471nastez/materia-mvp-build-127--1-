"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import {
  getOrCreateSessionId,
  getOrCreateVisitorId,
  getDeviceType,
  getBrowser,
  getOS,
  getScreenDimensions,
  getLanguage,
  getAttributionForTracking,
} from "@/lib/analytics-utils"
import { schedulePageView, skipReason, watchOutboundLinks } from "@/lib/analytics/page-tracker"
import { pixelEvent } from "@/lib/analytics/pixels"

interface TrackViewProps {
  /**
   * What kind of page this is, as the call sites have always said. The
   * server does not take it on trust: the property and the path come from
   * the page's own address (lib/analytics/property), a product from its id.
   */
  type?: "store" | "profile" | "product"
  creatorId: string | null | undefined
  productId?: string | null
  /**
   * Record clicks on links out of the page. Off on the OnePage, whose link
   * blocks report their own clicks with the block they came from
   * (app/api/onepage/track).
   */
  links?: boolean
}

/**
 * ===========================================================================
 *  A PAGE VIEW IS WORTH RECORDING AND IS NOT WORTH A MILLISECOND OF THE OPEN
 * ===========================================================================
 * One view per real page: the first load, and every route change after it,
 * because the effect is keyed by the path (usePathname), not by the
 * component being mounted. A website whose pages are full loads mounts this
 * afresh on each; one whose pages are client side route changes keeps it and
 * changes the path. Either way each page is one view, with its own path.
 *
 * It waits for the page to be shown (a prerendered page, a background tab),
 * to finish loading, and for the browser to be idle (lib/analytics/
 * page-tracker), so it never takes a request slot from the pictures a
 * visitor is waiting to see. A page left before then sends its view as it
 * goes. A refresh, or back to a page this tab sent in the last 30 minutes,
 * sends nothing. The server judges it all again.
 */
export function TrackView({ creatorId, productId, links = true }: TrackViewProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (!creatorId || typeof window === "undefined") return
    try {
      return schedulePageView(window, {
        creatorId,
        payload: () => {
          const sessionId = getOrCreateSessionId()
          const visitorId = getOrCreateVisitorId()
          /* First touch for the visit: where it came from, and the page it landed on. */
          const attr = getAttributionForTracking(sessionId)
          const screen = getScreenDimensions()
          return {
            creatorId,
            productId: productId || undefined,
            sessionId: sessionId || undefined,
            visitorId: visitorId || undefined,
            referrerDomain: attr.referrerDomain || "Direct",
            referrer: attr.referrer,
            pageUrl: attr.pageUrl,
            utm_source: attr.utm.utm_source,
            utm_medium: attr.utm.utm_medium,
            utm_campaign: attr.utm.utm_campaign,
            utm_term: attr.utm.utm_term,
            utm_content: attr.utm.utm_content,
            deviceType: getDeviceType(),
            browser: getBrowser(),
            os: getOS(),
            screenWidth: screen.width,
            screenHeight: screen.height,
            language: getLanguage(),
            /* How WhatsApp and the in-app browsers are told apart when there is no referrer. */
            clientApp: attr.clientApp || null,
          }
        },
      })
    } catch {
      return
    }
    /* The path is the page: a new one is a new view. */
  }, [creatorId, productId, pathname])

  /* A product page, told to the store's own Google Analytics and pixels too, once they have loaded (lib/analytics/pixels.ts). */
  useEffect(() => {
    if (!productId || typeof window === "undefined" || skipReason(window)) return
    const go = () => pixelEvent(window, "view_item", productId)
    if (document.readyState === "complete") {
      const t = window.setTimeout(go, 0)
      return () => window.clearTimeout(t)
    }
    window.addEventListener("load", go, { once: true })
    return () => window.removeEventListener("load", go)
  }, [productId, pathname])

  useEffect(() => {
    if (!links || !creatorId || typeof window === "undefined") return
    try {
      return watchOutboundLinks(window, {
        creatorId,
        mainDomain: process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com",
        ids: () => ({ sessionId: getOrCreateSessionId() || undefined, visitorId: getOrCreateVisitorId() || undefined }),
      })
    } catch {
      return
    }
  }, [links, creatorId])

  return null
}
