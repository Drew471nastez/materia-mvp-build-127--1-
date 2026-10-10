/**
 * ===========================================================================
 *  STORELIB MEASURES ITSELF IN ONE PAGE LOAD IN FIVE, AND COSTS NOTHING
 * ===========================================================================
 * Loaded by components/perf/perf-beacon.tsx only after the page is idle and
 * only for a page load that drew the sample (CLIENT_SAMPLE_RATE); the other
 * page loads never download this file. Everything here is the browser's own
 * PerformanceObserver plus a few listeners; nothing runs per frame.
 *
 * WHAT A PAGE VIEW IS. The first page load, and then every move to another
 * address inside the app without a reload (a tap on the tab bar, a link in
 * the dashboard). Each view gets its own INP and CLS; the first one also
 * gets LCP, FCP and TTFB, which only a real page load has.
 *
 * TAP TO NEXT SCREEN (`nav`). From the tap to the first frame painted after
 * the address changed. Next changes the address once the new screen has
 * committed, so the frame after it is the new screen (a loading placeholder
 * counts, as that is what the person sees). Back and forward are not timed:
 * there is no tap to start the clock from.
 *
 * SENT IN BATCHES, with sendBeacon, when the page is hidden or left, and
 * whenever twenty items are waiting. No cookie is read or written, and the
 * body carries the route pattern (lib/perf/routes.ts), never the address.
 */

import { clsFromShifts, inpFromInteractions } from "@/lib/website-builder/web-vitals"

import { MAX_ERRORS_PER_PAGE, type ClientMetric } from "./config"
import { classify, isStorelibHost } from "./routes"

const ENDPOINT = "/api/perf/beacon"
const FLUSH_AT = 20
/** A tap older than this did not cause the address change that follows it. */
const TAP_WINDOW_MS = 3000

type Item = [ClientMetric, string, string, number] | [ClientMetric, string, string, number, string]

type LcpEntry = PerformanceEntry & { renderTime?: number; loadTime?: number }
type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean }
type EventEntry = PerformanceEntry & { interactionId?: number; duration: number }

interface View {
  path: string
  area: string | null
  route: string
  interactions: Map<number, number>
  shifts: Array<{ value: number; startTime: number }>
  countAtStart: number
  closed: boolean
  first: boolean
}

let started = false

function interactionCount(fallback: number): number {
  return (performance as Performance & { interactionCount?: number }).interactionCount ?? fallback
}

export function startPerfBeacon(): void {
  if (started || typeof window === "undefined") return
  try {
    if (window.self !== window.top) return
  } catch {
    return
  }
  if (navigator.webdriver || typeof PerformanceObserver === "undefined") return
  if (!isStorelibHost(location.hostname)) return
  started = true

  const supported: readonly string[] = PerformanceObserver.supportedEntryTypes ?? []
  const queue: Item[] = []
  const seenErrors = new Set<string>()
  let errorCount = 0
  let lastTap = -Infinity

  const send = () => {
    if (!queue.length) return
    const body = JSON.stringify({ i: queue.splice(0, queue.length) })
    try {
      const blob = new Blob([body], { type: "text/plain" })
      if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
        void fetch(ENDPOINT, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {})
      }
    } catch {
      /* A measurement is never worth an error on somebody's page. */
    }
  }
  const push = (item: Item) => {
    queue.push(item)
    if (queue.length >= FLUSH_AT) send()
  }

  const newView = (first: boolean): View => {
    const c = classify(location.pathname)
    return { path: location.pathname, area: c?.area ?? null, route: c?.route ?? "", interactions: new Map(), shifts: [], countAtStart: interactionCount(0), closed: false, first }
  }

  let view = newView(true)
  if (view.area) push(["view", view.area, view.route, 1])

  /* ── The first page load: TTFB, FCP, LCP ────────────────────────────── */
  const nav = performance.getEntriesByType("navigation")[0] as (PerformanceNavigationTiming & { activationStart?: number }) | undefined
  const activation = nav?.activationStart ?? 0
  const firstArea = view.area
  const firstRoute = view.route
  if (firstArea && nav && nav.responseStart > 0) push(["ttfb", firstArea, firstRoute, Math.max(0, nav.responseStart - activation)])

  let hiddenAt = document.visibilityState === "hidden" ? 0 : Infinity
  let lcp: number | null = null
  let lcpDone = false

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

  observe("paint", (entries) => {
    for (const e of entries) {
      if (e.name === "first-contentful-paint" && firstArea && e.startTime < hiddenAt) push(["fcp", firstArea, firstRoute, Math.max(0, e.startTime - activation)])
    }
  })
  observe("largest-contentful-paint", (entries) => {
    if (lcpDone) return
    for (const e of entries as LcpEntry[]) if (e.startTime < hiddenAt) lcp = Math.max(0, e.startTime - activation)
  })
  const finishLcp = () => {
    if (lcpDone) return
    lcpDone = true
    if (firstArea && lcp !== null) push(["lcp", firstArea, firstRoute, lcp])
  }
  addEventListener("keydown", finishLcp, { once: true, capture: true })

  /* ── Every view: INP and CLS ────────────────────────────────────────── */
  observe("layout-shift", (entries) => {
    for (const e of entries as ShiftEntry[]) if (!e.hadRecentInput && !view.closed) view.shifts.push({ value: e.value, startTime: e.startTime })
  })
  const onEvents = (entries: PerformanceEntryList) => {
    for (const e of entries as EventEntry[]) {
      const id = e.interactionId
      if (!id || view.closed) continue
      const seen = view.interactions.get(id)
      if (seen === undefined || e.duration > seen) view.interactions.set(id, e.duration)
    }
  }
  observe("event", onEvents, { durationThreshold: 16 })
  observe("first-input", onEvents)

  const closeView = (v: View) => {
    if (v.closed) return
    for (const [o, onEntries] of handlers) {
      try {
        onEntries(o.takeRecords())
      } catch {
        /* nothing pending */
      }
    }
    v.closed = true
    if (v.first) finishLcp()
    if (!v.area) return
    const inp = inpFromInteractions([...v.interactions.values()], Math.max(0, interactionCount(v.interactions.size) - v.countAtStart))
    if (inp !== null) push(["inp", v.area, v.route, inp])
    if (supported.includes("layout-shift")) push(["cls", v.area, v.route, clsFromShifts(v.shifts)])
  }

  /* ── Tap to next screen ─────────────────────────────────────────────── */
  addEventListener(
    "pointerdown",
    (e) => {
      lastTap = e.timeStamp
      finishLcp()
    },
    { capture: true, passive: true },
  )
  addEventListener("click", (e) => (lastTap = Math.max(lastTap, e.timeStamp)), { capture: true, passive: true })

  const onAddress = (timed: boolean) => {
    if (location.pathname === view.path) return
    closeView(view)
    view = newView(false)
    const v = view
    if (!v.area) return
    push(["view", v.area, v.route, 1])
    const tap = lastTap
    if (!timed || performance.now() - tap > TAP_WINDOW_MS) return
    /* The frame after the next one is the first that shows the new screen. */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (v.area) push(["nav", v.area, v.route, Math.max(0, performance.now() - tap)])
      }),
    )
  }
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name]
    history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const out = original.apply(this, args)
      try {
        onAddress(true)
      } catch {
        /* never in the way of a navigation */
      }
      return out
    } as History["pushState"]
  }
  addEventListener("popstate", () => onAddress(false))

  /* ── JavaScript errors ──────────────────────────────────────────────── */
  const onError = (message: string) => {
    if (!view.area || errorCount >= MAX_ERRORS_PER_PAGE) return
    /* A cross-origin script's error says nothing, and a resize loop warning is not a fault. */
    if (!message || message === "Script error." || /ResizeObserver loop/i.test(message)) return
    const text = message.slice(0, 300)
    if (seenErrors.has(text)) return
    seenErrors.add(text)
    errorCount++
    push(["js_error", view.area, view.route, 1, text])
  }
  addEventListener("error", (e) => onError((e as ErrorEvent).message ?? ""))
  addEventListener("unhandledrejection", (e) => {
    const r = (e as PromiseRejectionEvent).reason
    onError(r instanceof Error ? `${r.name}: ${r.message}` : typeof r === "string" ? r : "")
  })

  /* ── Leaving ────────────────────────────────────────────────────────── */
  addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "hidden") return
      hiddenAt = Math.min(hiddenAt, performance.now())
      closeView(view)
      send()
    },
    true,
  )
  addEventListener("pagehide", () => {
    closeView(view)
    send()
  }, true)
}
