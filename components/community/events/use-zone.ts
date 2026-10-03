"use client"

import { useEffect, useState } from "react"

/**
 * The viewer's own time zone. The server cannot know it, so the first
 * render (on the server and the first one in the browser, which must match)
 * uses `fallback`, the event's own zone; straight after, the page moves to
 * the browser's zone. For the many viewers in the creator's zone nothing
 * changes on screen.
 */
export function useViewerZone(fallback: string | undefined): string | undefined {
  const [zone, setZone] = useState<string | undefined>(fallback)
  useEffect(() => {
    try {
      const own = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (own) setZone(own)
    } catch {
      /* Keep the event's zone. */
    }
  }, [])
  return zone
}

/** "6:00 PM" in a zone. */
export function clockIn(iso: string, timeZone?: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(t).replace(/[  ]/g, " ")
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(t).replace(/[  ]/g, " ")
  }
}

/** "New York" from "America/New_York". */
export function zoneCity(zone: string): string {
  const last = zone.split("/").pop() || zone
  return last.replace(/_/g, " ")
}
