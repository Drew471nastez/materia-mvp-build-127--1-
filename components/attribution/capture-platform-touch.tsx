"use client"

/**
 * WHERE A VISIT TO STORELIB ITSELF CAME FROM
 *
 * Mounted once, in the root layout. On storelib.com (never on a creator's
 * subdomain or own domain, which lib/attribution/browser notePlatformVisit
 * refuses) it notes the document's arrival under Storelib's own scope, so a
 * Storelib account made later carries where the visit came from
 * (app/api/auth/signup-attribution). The same consent as every touch: kept
 * on the device only with a yes to analytics, otherwise in this document's
 * memory alone.
 *
 * The touch itself is never sent from here: it travels only with a new
 * account. One thing is (round 46): when the arrival names an AI assistant
 * and landed on one of Storelib's own public pages, ONE count of
 * { assistant, path } per tab session goes to /api/track/ai-visit, with the
 * same yes to analytics and nothing about the visitor
 * (lib/attribution/ai-visit-browser). Not inside a frame, on a preview, or
 * in /admin.
 */

import { useEffect } from "react"
import { keepOnConsent, notePlatformVisit } from "@/lib/attribution/browser"
import { noteAiVisit } from "@/lib/attribution/ai-visit-browser"

export function CapturePlatformTouch() {
  useEffect(() => {
    try {
      if (window.self !== window.top) return
      const path = window.location.pathname
      if (path.startsWith("/preview/") || path === "/admin" || path.startsWith("/admin/") || new URLSearchParams(window.location.search).has("preview")) return
    } catch {
      return
    }
    try {
      const touch = notePlatformVisit()
      /* Not undone on unmount: the arrival is noted once per document, and a listener waiting for a yes removes itself when it hears one. */
      if (touch?.ai_source) noteAiVisit(touch.ai_source, touch.landing_path)
    } catch {
      /* attribution never breaks a page */
    }
    return keepOnConsent()
  }, [])
  return null
}
