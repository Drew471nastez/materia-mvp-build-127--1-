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
 * Nothing on screen, nothing sent here, no third party: the touch travels
 * only with a new account. Not inside a frame, on a preview, or in /admin.
 */

import { useEffect } from "react"
import { keepOnConsent, notePlatformVisit } from "@/lib/attribution/browser"

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
      notePlatformVisit()
    } catch {
      /* attribution never breaks a page */
    }
    return keepOnConsent()
  }, [])
  return null
}
