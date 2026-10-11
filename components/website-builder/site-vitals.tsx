"use client"

/**
 * ===========================================================================
 *  THE PUBLISHED SITE MEASURES ITSELF, ONCE PER PAGE LOAD
 * ===========================================================================
 * LCP, INP and CLS, taken in the visitor's browser with the browser's own
 * PerformanceObserver and sent once, when the page is hidden or left, in one
 * beacon. No library: the three are a few dozen lines between them, and the
 * rules they follow are in lib/website-builder/web-vitals.ts where the tests
 * can reach them.
 *
 * WHERE IT RUNS. Only on a published site's pages: renderSite, the shop, the
 * search page and a product page mount it, and never on a preview. It also
 * refuses to run inside a frame (the editor's canvas, anybody embedding the
 * site) and in a browser driven by a script (the cover screenshots, bots).
 *
 * ONCE PER DOCUMENT. A site's pages link to each other without reloading, so
 * this can mount again on the next page; the browser's buffered entries
 * would then be the first page's numbers under the second page's name. The
 * module flag keeps it to the page load it was started in, which is what
 * Google counts too.
 *
 * WHAT IS SENT: the site's id and up to three numbers. No cookie is read or
 * written, and nothing about the visitor is in the body.
 */

import { useEffect } from "react"
import { SITE_BEACON_PATH } from "@/lib/perf/config"
import { clsFromShifts, inpFromInteractions } from "@/lib/website-builder/web-vitals"

const ENDPOINT = SITE_BEACON_PATH

let started = false

type LcpEntry = PerformanceEntry & { renderTime?: number; loadTime?: number }
type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean }
type EventEntry = PerformanceEntry & { interactionId?: number; duration: number }

export function SiteVitals({ installId }: { installId: string }) {
  useEffect(() => {
    if (started || !installId) return
    try {
      if (window.self !== window.top) return
    } catch {
      /* A cross-origin parent throws on `top`: that is a frame too. */
      return
    }
    if (navigator.webdriver || typeof PerformanceObserver === "undefined") return
    started = true

    const supported: readonly string[] = PerformanceObserver.supportedEntryTypes ?? []
    const nav = performance.getEntriesByType("navigation")[0] as (PerformanceEntry & { activationStart?: number }) | undefined
    /* A prerendered page starts when it is shown, not when it was fetched. */
    const activation = nav?.activationStart ?? 0
    /* A page opened in a background tab has no honest LCP. */
    let hiddenAt = document.visibilityState === "hidden" ? 0 : Infinity

    let lcp: number | null = null
    let lcpDone = false
    const shifts: Array<{ value: number; startTime: number }> = []
    const interactions = new Map<number, number>()

    const handlers: Array<[PerformanceObserver, (list: PerformanceEntryList) => void]> = []
    const observe = (type: string, onEntries: (list: PerformanceEntryList) => void, extra?: Record<string, unknown>) => {
      if (!supported.includes(type)) return
      try {
        const o = new PerformanceObserver((list) => onEntries(list.getEntries()))
        o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
        handlers.push([o, onEntries])
      } catch {
        /* An older browser that lists the type and refuses the options. */
      }
    }

    observe("largest-contentful-paint", (entries) => {
      if (lcpDone) return
      for (const e of entries as LcpEntry[]) {
        if (e.startTime < hiddenAt) lcp = Math.max(0, e.startTime - activation)
      }
    })
    observe("layout-shift", (entries) => {
      for (const e of entries as ShiftEntry[]) {
        if (!e.hadRecentInput) shifts.push({ value: e.value, startTime: e.startTime })
      }
    })
    const onEvents = (entries: PerformanceEntryList) => {
      for (const e of entries as EventEntry[]) {
        const id = e.interactionId
        if (!id) continue
        const seen = interactions.get(id)
        if (seen === undefined || e.duration > seen) interactions.set(id, e.duration)
      }
    }
    /* 16ms is the smallest threshold the browser accepts; the first input
       is always reported whatever it took, so a page with one quick tap
       still has an INP. */
    observe("event", onEvents, { durationThreshold: 16 })
    observe("first-input", onEvents)

    /* LCP stops at the visitor's first input: what is drawn after that is
       an answer to them, not the page loading. */
    const stopLcp = () => {
      lcpDone = true
    }
    addEventListener("keydown", stopLcp, { once: true, capture: true })
    addEventListener("pointerdown", stopLcp, { once: true, capture: true })

    let sent = false
    const send = () => {
      if (sent) return
      /* Whatever the observers have not delivered yet. */
      for (const [o, onEntries] of handlers) {
        try {
          onEntries(o.takeRecords())
        } catch {
          /* nothing pending */
        }
      }
      sent = true
      const count = (performance as Performance & { interactionCount?: number }).interactionCount ?? interactions.size
      const body = JSON.stringify({
        s: installId,
        lcp: lcp === null ? undefined : Math.round(lcp),
        inp: inpFromInteractions([...interactions.values()], count) ?? undefined,
        cls: supported.includes("layout-shift") ? clsFromShifts(shifts) : undefined,
      })
      try {
        const blob = new Blob([body], { type: "text/plain" })
        if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
          void fetch(ENDPOINT, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {})
        }
      } catch {
        /* A measurement is never worth an error on somebody's site. */
      }
      for (const [o] of handlers) o.disconnect()
    }
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return
      hiddenAt = Math.min(hiddenAt, performance.now())
      send()
    }
    addEventListener("visibilitychange", onVisibility, true)
    addEventListener("pagehide", send, true)
    /* Not removed on unmount: the next page of the same site keeps this page
       load's measurement going until the visitor leaves. */
  }, [installId])

  return null
}
