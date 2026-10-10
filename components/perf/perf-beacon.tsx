"use client"

/**
 * Storelib's own speed measurement, mounted once in the root layout. It does
 * nothing on four page loads in five: the dice are rolled here, before the
 * collector (lib/perf/beacon-client.ts) is even downloaded, and the one page
 * load in five that draws it loads the collector when the browser is idle,
 * so it never competes with the page for the first frames. The observers it
 * starts read the browser's buffered entries, so nothing measured before
 * then is lost.
 */

import { useEffect } from "react"

import { CLIENT_SAMPLE_RATE } from "@/lib/perf/config"

let rolled = false

export function PerfBeacon() {
  useEffect(() => {
    if (rolled) return
    rolled = true
    if (Math.random() >= CLIENT_SAMPLE_RATE) return
    const start = () => {
      void import("@/lib/perf/beacon-client").then((m) => m.startPerfBeacon()).catch(() => {})
    }
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    if (idle) idle(start, { timeout: 4000 })
    else setTimeout(start, 2000)
  }, [])
  return null
}
