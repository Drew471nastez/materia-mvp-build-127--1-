/**
 * ===========================================================================
 *  STORELIB MEASURES ITSELF ON EVERY PAGE LOAD, AND COSTS NOTHING
 * ===========================================================================
 * Loaded by components/perf/perf-beacon.tsx after the page is idle. The
 * observers read the browser's buffered entries, so nothing measured before
 * then is lost. Everything here is the browser's own PerformanceObserver
 * plus a few listeners; nothing runs per frame.
 *
 * WHERE. storelib.com and the apps (which load it), OnePages on
 * storelib.me, and Storelib's checkout and receipt on a website's own host
 * (lib/perf/routes.ts classifyFor). A published website's own pages have
 * their own collector.
 *
 * WHAT A PAGE VIEW IS. The first page load, and then every move to another
 * address inside the app without a reload (a tap on the tab bar, a link in
 * the dashboard), and a page brought back from the back/forward cache. Each
 * view gets its own INP and CLS; the first one also gets LCP, FCP and TTFB,
 * which only a real page load has.
 *
 * TAP TO NEXT SCREEN (`nav`). From the tap to the first frame painted after
 * the address changed. Next changes the address once the new screen has
 * committed, so the frame after it is the new screen (a loading placeholder
 * counts, as that is what the person sees). Back and forward are not timed:
 * there is no tap to start the clock from.
 *
 * FLOW STEPS (`step`, `fail`) come from lib/perf/mark.ts: the editor
 * opening, a save, the payment form drawing, a payment starting.
 *
 * SENT IN SMALL BATCHES, first party (BEACON_PATH), with sendBeacon (fetch
 * keepalive where sendBeacon refuses): when the browser is next idle a few
 * seconds after something was measured, at once when twenty items wait, and
 * when the page is hidden or left. A phone app that is closed without ever
 * being hidden loses at most the last few seconds. No cookie is read or
 * written, and the body carries the route pattern (lib/perf/routes.ts),
 * never the address.
 *
 * CAPS PER PAGE LOAD (lib/perf/config.ts): MAX_ITEMS_PER_PAGE_LOAD items in
 * all, full measurement of the first FULL_VIEWS_PER_PAGE_LOAD screens and
 * then one in VIEW_SAMPLE_AFTER, MAX_STEPS_PER_PAGE_LOAD flow steps and
 * MAX_ERRORS_PER_PAGE errors. An app left open all day costs no more than a
 * long session.
 */

import { clsFromShifts, inpFromInteractions } from "@/lib/website-builder/web-vitals"

import {
  BEACON_PATH,
  FULL_VIEWS_PER_PAGE_LOAD,
  MAX_ERRORS_PER_PAGE,
  MAX_ITEMS_PER_PAGE_LOAD,
  MAX_STEPS_PER_PAGE_LOAD,
  STEPS,
  VIEW_SAMPLE_AFTER,
  type ClientMetric,
  type StepRoute,
} from "./config"
import { classifyFor, isStorelibHost } from "./routes"
import { maskDetail } from "./telemetry"

const ENDPOINT = BEACON_PATH
const FLUSH_AT = 20
/** How long a measurement waits for others to go with it, before the next idle moment sends them. */
const FLUSH_AFTER_MS = 4000
/** A tap older than this did not cause the address change that follows it. */
const TAP_WINDOW_MS = 3000

type Item = [ClientMetric, string, string, number] | [ClientMetric, string, string, number, string]
type Pending = ["step" | "fail", StepRoute, number, string?]
type PerfWindow = Window & { __slPerf?: Pending[] & { take?: (item: Pending) => void }; __slPerfScreenStart?: number }

type LcpEntry = PerformanceEntry & { renderTime?: number; loadTime?: number }
type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean }
type EventEntry = PerformanceEntry & { interactionId?: number; duration: number }

interface View {
  path: string
  area: string | null
  route: string
  interactions: Map<number, number>
  shifts: Array<{ value: number; startTime: number }>
  /** When the view began: its interactions and shifts are the ones that started after this. */
  start: number
  /** Past FULL_VIEWS_PER_PAGE_LOAD, a view that did not draw the sample sends nothing of its own. */
  measured: boolean
  countAtStart: number
  countAtLeave: number | null
  closed: boolean
  first: boolean
}

/** How long a view that was left keeps taking the entries that began in it (the browser reports a tap's timing after the next paint). */
const SETTLE_MS = 1000

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
  const host = location.hostname
  /* storelib.com (and the apps) measure from the first page on; anywhere else only the pages that are Storelib's. */
  if (!isStorelibHost(host) && !classifyFor(host, location.pathname)) return
  started = true

  const supported: readonly string[] = PerformanceObserver.supportedEntryTypes ?? []
  const queue: Item[] = []
  const seenErrors = new Set<string>()
  let errorCount = 0
  let stepCount = 0
  let sentCount = 0
  let viewCount = 0
  let lastTap = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null

  const post = (items: Item[]) => {
    const body = JSON.stringify({ i: items })
    try {
      const blob = new Blob([body], { type: "text/plain" })
      if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
        void fetch(ENDPOINT, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {})
      }
    } catch {
      /* A measurement is never worth an error on somebody's page. */
    }
  }
  const send = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    while (queue.length) post(queue.splice(0, FLUSH_AT))
  }
  /* A few seconds after the first waiting item, at the browser's next idle moment. */
  const sendSoon = () => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      if (idle) idle(send, { timeout: 2000 })
      else send()
    }, FLUSH_AFTER_MS)
  }
  const push = (item: Item) => {
    if (sentCount >= MAX_ITEMS_PER_PAGE_LOAD) return
    sentCount++
    queue.push(item)
    if (queue.length >= FLUSH_AT) send()
    else sendSoon()
  }

  const newView = (first: boolean): View => {
    const c = classifyFor(host, location.pathname)
    viewCount++
    const measured = viewCount <= FULL_VIEWS_PER_PAGE_LOAD || viewCount % VIEW_SAMPLE_AFTER === 0
    return { path: location.pathname, area: measured ? c?.area ?? null : null, route: c?.route ?? "", interactions: new Map(), shifts: [], start: first ? 0 : performance.now(), measured, countAtStart: interactionCount(0), countAtLeave: null, closed: false, first }
  }

  /* ── Flow steps (lib/perf/mark.ts), the ones that waited for this and the ones to come ── */
  const takeStep = (p: Pending) => {
    try {
      const [kind, route, value, code] = p
      const step = STEPS[route]
      if (!step || stepCount >= MAX_STEPS_PER_PAGE_LOAD) return
      stepCount++
      push(kind === "fail" ? ["fail", step.area, route, 1, String(code ?? "")] : ["step", step.area, route, value])
    } catch {
      /* never in the way */
    }
  }
  const w = window as PerfWindow
  const waiting = (w.__slPerf ??= [] as Pending[])
  for (const p of waiting.splice(0, waiting.length)) takeStep(p)
  waiting.take = takeStep

  let view = newView(true)
  /* The current view and any just left that are still settling, oldest first. */
  let views: View[] = [view]
  const viewAt = (t: number): View | undefined => {
    for (let k = views.length - 1; k >= 0; k--) if (views[k].start <= t) return views[k].closed ? undefined : views[k]
    return undefined
  }
  if (view.area) push(["view", view.area, view.route, 1])

  /* ── The first page load: TTFB, FCP, LCP ────────────────────────────── */
  const nav = performance.getEntriesByType("navigation")[0] as (PerformanceNavigationTiming & { activationStart?: number }) | undefined
  const activation = nav?.activationStart ?? 0
  const firstArea = view.area
  const firstRoute = view.route
  if (firstArea && nav && nav.responseStart > 0) push(["ttfb", firstArea, firstRoute, Math.max(0, nav.responseStart - activation)])

  /* A page hidden before this loaded (a background tab) has no honest LCP or FCP after that moment; the browser remembers when. */
  const firstHidden = (supported.includes("visibility-state") ? performance.getEntriesByType("visibility-state") : []).find((e) => e.name === "hidden")
  let hiddenAt = firstHidden ? firstHidden.startTime : document.visibilityState === "hidden" ? 0 : Infinity
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
    for (const e of entries as ShiftEntry[]) if (!e.hadRecentInput) viewAt(e.startTime)?.shifts.push({ value: e.value, startTime: e.startTime })
  })
  const onEvents = (entries: PerformanceEntryList) => {
    for (const e of entries as EventEntry[]) {
      const id = e.interactionId
      const v = id ? viewAt(e.startTime) : undefined
      if (!v || !id) continue
      const seen = v.interactions.get(id)
      if (seen === undefined || e.duration > seen) v.interactions.set(id, e.duration)
    }
  }
  observe("event", onEvents, { durationThreshold: 16 })
  observe("first-input", onEvents)

  /* A view left by a navigation settles for a second first; one left by hiding the page is finished at once. */
  const closeView = (v: View, settle: boolean) => {
    if (v.countAtLeave === null) v.countAtLeave = interactionCount(v.interactions.size)
    if (settle) setTimeout(() => finishView(v), SETTLE_MS)
    else for (const w of [...views]) finishView(w)
  }
  const finishView = (v: View) => {
    if (v.closed) return
    for (const [o, onEntries] of handlers) {
      try {
        onEntries(o.takeRecords())
      } catch {
        /* nothing pending */
      }
    }
    v.closed = true
    views = views.filter((w) => w !== v)
    if (v.first) finishLcp()
    if (!v.area) return
    const inp = inpFromInteractions([...v.interactions.values()], Math.max(v.interactions.size, (v.countAtLeave ?? interactionCount(0)) - v.countAtStart))
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
    closeView(view, true)
    view = newView(false)
    views.push(view)
    const v = view
    const tap = lastTap
    const tapped = timed && performance.now() - tap <= TAP_WINDOW_MS
    /* The screen's own clock, for a flow step timed from when it opened (lib/perf/mark.ts screenStart). */
    w.__slPerfScreenStart = tapped ? tap : performance.now()
    if (!v.area) return
    push(["view", v.area, v.route, 1])
    if (!tapped) return
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
    /* Masked here as well as on the server: an address in a message never leaves the browser. */
    const text = maskDetail(message)
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
      closeView(view, false)
      send()
    },
    true,
  )
  addEventListener("pagehide", () => {
    closeView(view, false)
    send()
  }, true)
  /* Back from the back/forward cache: the page did not load again, but it is a new view of it. */
  addEventListener("pageshow", (e) => {
    if (!(e as PageTransitionEvent).persisted) return
    view = newView(false)
    views = [view]
    w.__slPerfScreenStart = performance.now()
    if (view.area) push(["view", view.area, view.route, 1])
  }, true)
}
