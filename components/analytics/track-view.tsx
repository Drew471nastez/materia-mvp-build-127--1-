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
} from "@/lib/analytics-utils"

interface TrackViewProps {
  type: "store" | "profile" | "product"
  creatorId: string
  productId?: string | null
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

    hasTracked.current = true

    const trackView = async () => {
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

    trackView()
  }, [type, creatorId, productId])

  return null
}
