"use client"

/**
 * ===========================================================================
 *  WHAT THE ADMIN SEES OF A CREATOR'S /app, SENT ONCE A MINUTE
 * ===========================================================================
 * Mounted once by app/(storelib)/app/layout.tsx and the website builder's
 * layout. The queue and its rules are lib/activity/creator-activity-client.ts:
 * pages (ids as `:id`), named actions, one small request a minute while the
 * tab is visible, one as it hides, none while hidden. No storage on the
 * device, no typed text, no click positions.
 */
import * as React from "react"
import { usePathname } from "next/navigation"

import { SEND_EVERY_MS } from "@/lib/activity/creator-activity"
import { ACTIVITY_EVENT, actionOfClick, createActivityQueue } from "@/lib/activity/creator-activity-client"

const URL_PATH = "/api/activity"

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

export function ActivityBeacon() {
  const pathname = usePathname()
  const queue = React.useMemo(() => (typeof window === "undefined" ? null : createActivityQueue({ now: Date.now, send, beacon })), [])

  React.useEffect(() => {
    if (queue && pathname) queue.page(pathname)
  }, [queue, pathname])

  React.useEffect(() => {
    if (!queue) return
    /* Mounted again after a cleanup (React's development double mount): open again. */
    if (document.visibilityState === "visible") queue.show()
    const onVisibility = () => (document.visibilityState === "hidden" ? queue.hide() : queue.show())
    const onHide = () => queue.hide()
    const onAction = (e: Event) => queue.action(String((e as CustomEvent).detail ?? ""))
    const onClick = (e: MouseEvent) => {
      const name = actionOfClick(e.target)
      if (name) queue.action(name)
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onHide)
    window.addEventListener(ACTIVITY_EVENT, onAction)
    document.addEventListener("click", onClick, { capture: true, passive: true })
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") queue.tick()
    }, SEND_EVERY_MS)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onHide)
      window.removeEventListener(ACTIVITY_EVENT, onAction)
      document.removeEventListener("click", onClick, { capture: true })
      /* Leaving /app for another part of Storelib: what is waiting goes now. */
      queue.hide()
    }
  }, [queue])

  return null
}
