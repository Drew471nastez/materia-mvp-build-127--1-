"use client"

import { useEffect, useRef } from "react"
import {
  getOrCreateSessionId,
  getOrCreateVisitorId,
  getDeviceType,
  getBrowser,
  getOS,
  getScreenDimensions,
  getLanguage,
  hasViewBeenTracked,
  markViewAsTracked,
  getPageKey,
  getAttributionForTracking,
  isAutomatedBrowser,
} from "@/lib/analytics-utils"

interface TrackViewProps {
  type: "store" | "profile" | "product"
  creatorId: string
  productId?: string | null
}

/**
 * ===========================================================================
 *  A PAGE VIEW IS WORTH RECORDING AND IS NOT WORTH A MILLISECOND OF THE OPEN
 * ===========================================================================
 * This fires on mount, which on a product page is the same moment the hero
 * image, the gallery thumbnails and the seller's avatar are all being
 * fetched. A POST carrying attribution, device, screen and UTM data is not
 * large, but it opens a connection and takes a slot in the browser's request
 * queue from the pictures the visitor is actually waiting to see.
 *
 * It waits for the browser to be idle instead. `requestIdleCallback` with a
 * two-second deadline, so it still runs promptly on a page nobody scrolls,
 * and a `setTimeout` fallback for Safari, which has no idle callback.
 *
 * NOTHING IS LOST BY WAITING. The unload path is the one case where a delay
 * could drop a view, and this does not run there: a visitor who leaves inside
 * two seconds has their view recorded by the timer firing before teardown, or
 * not at all — which was already true of a fetch that had not resolved.
 */
const IDLE_DEADLINE_MS = 2000

function whenIdle(run: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }).requestIdleCallback
  if (typeof ric === "function") {
    const id = ric(run, { timeout: IDLE_DEADLINE_MS })
    return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(run, 400)
  return () => window.clearTimeout(id)
}

export function TrackView({ type, creatorId, productId }: TrackViewProps) {
  const hasTracked = useRef(false)

  useEffect(() => {
    if (!creatorId || hasTracked.current) return

    const pageKey = getPageKey(type, creatorId, productId)

    // Prevent refresh spam + repeated re-mounts in same tab session
    if (hasViewBeenTracked(pageKey)) {
      hasTracked.current = true
      return
    }

    /*
      SET WHEN IT RUNS, NOT WHEN IT IS SCHEDULED. The work is deferred to
      idle now, and the cleanup below cancels a pending one — so marking it
      here would let React's development double-mount cancel the first
      callback and then refuse to schedule a second, and no view would ever
      be recorded while developing.
    */
    const trackView = async () => {
      if (hasTracked.current) return
      hasTracked.current = true
      /* A browser driven by a script is not a visitor. */
      if (isAutomatedBrowser()) return
      try {
        const sessionId = getOrCreateSessionId()
        const visitorId = getOrCreateVisitorId()

        // ✅ Always use first-touch attribution (prevents "Direct" on internal nav)
        const attr = getAttributionForTracking(sessionId)

        const deviceType = getDeviceType()
        const browser = getBrowser()
        const os = getOS()
        const screen = getScreenDimensions()
        const language = getLanguage()

        const payload = {
          type,
          creatorId,
          productId: productId || undefined,

          sessionId,
          visitorId,

          referrerDomain: attr.referrerDomain || "Direct",
          referrer: attr.referrer,
          pageUrl: attr.pageUrl,

          utm_source: attr.utm.utm_source,
          utm_medium: attr.utm.utm_medium,
          utm_campaign: attr.utm.utm_campaign,
          utm_term: attr.utm.utm_term,
          utm_content: attr.utm.utm_content,

          deviceType,
          browser,
          os,
          screenWidth: screen.width,
          screenHeight: screen.height,
          language,

          // ✅ Critical: this is how WhatsApp works when referrer is blank
          clientApp: attr.clientApp || null,

          // Client hint (server will compute authoritative category)
          sourceCategory: attr.sourceCategory,

          pageKey,
        }

        const response = await fetch("/api/track-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (response.ok) {
          markViewAsTracked(pageKey)
        }
      } catch {
        // Silent fail - do not break UX if tracking fails
      }
    }

    return whenIdle(trackView)
  }, [type, creatorId, productId])

  return null
}
