"use client"

/**
 * WHERE THIS VISIT CAME FROM, NOTED AS IT ARRIVES
 *
 * Mounted on every public page a buyer or a subscriber can start from: the
 * creator page, a product page, the OnePage, and (from the site layout)
 * every page of a website. It records the arrival as a touch
 * (lib/attribution/browser noteVisit) and names the page's scope, so a
 * sign-up or a checkout from this page carries this creator's touches.
 *
 * Nothing on screen, nothing sent: the touch travels only with an order or a
 * sign-up. Inside a frame (the editor's canvas shows real pages) it does
 * nothing, and so on a website preview.
 */

import { useEffect } from "react"
import { clearPageScope, keepOnConsent, noteVisit, scopeFor, setPageScope } from "@/lib/attribution/browser"
import type { PropertyType } from "@/lib/attribution/touch"

export function CaptureTouch({ creatorId, property }: { creatorId?: string | null; property: PropertyType }) {
  useEffect(() => {
    try {
      if (window.self !== window.top) return
      if (window.location.pathname.startsWith("/preview/") || new URLSearchParams(window.location.search).has("preview")) return
    } catch {
      /* a frame that will not say whose it is: treat it as a frame */
      return
    }
    const scope = scopeFor(creatorId)
    if (!scope) return
    setPageScope(scope)
    try {
      noteVisit(scope, property)
    } catch {
      /* attribution never breaks a page */
    }
    const stop = keepOnConsent()
    return () => {
      stop()
      clearPageScope(scope)
    }
  }, [creatorId, property])
  return null
}
