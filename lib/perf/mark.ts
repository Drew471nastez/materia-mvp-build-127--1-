/**
 * ===========================================================================
 *  A FLOW STEP, TIMED WHERE IT HAPPENS
 * ===========================================================================
 * The editor opening, its canvas painting, a save, the payment form drawing,
 * a payment starting: things no Web Vital sees. A page calls
 *
 *     perfStep("/step/editor/save", ms)        // it took ms
 *     perfFail("/step/checkout/intent", "network")   // it failed
 *
 * and the collector (lib/perf/beacon-client.ts) sends it with the rest of
 * the page's measurements. The collector loads when the browser is idle, so
 * a step that happens before then waits in a small array on window and is
 * taken when it starts. Only the routes in STEPS (lib/perf/config.ts) are
 * accepted, by the type here and again by the beacon route.
 *
 * Costs an array push. Never throws, never in the way of what it measures.
 * Imports nothing that runs: safe in any client component.
 */

import type { StepRoute } from "./config"

type Pending = ["step" | "fail", StepRoute, number, string?]

type PerfQueue = Pending[] & { take?: (item: Pending) => void }
type PerfWindow = Window & { __slPerf?: PerfQueue; __slPerfScreenStart?: number }

const MAX_PENDING = 60

function queue(item: Pending) {
  try {
    if (typeof window === "undefined") return
    const w = window as PerfWindow
    const q: PerfQueue = (w.__slPerf ??= [])
    if (q.take) return q.take(item)
    if (q.length < MAX_PENDING) q.push(item)
  } catch {
    /* never in the way */
  }
}

/** A flow step that finished, and how long it took in milliseconds. */
export function perfStep(route: StepRoute, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return
  queue(["step", route, Math.round(ms)])
}

/** A flow step that failed: a short code ("network", "load", "refused"), never a message. */
export function perfFail(route: StepRoute, code: string): void {
  queue(["fail", route, 1, code])
}

/**
 * When the screen on show began, in performance.now() time: 0 for the page
 * load (the navigation's own start), or the tap that opened it when it was
 * reached without a reload (the collector notes it).
 */
export function screenStart(): number {
  try {
    return (window as PerfWindow).__slPerfScreenStart ?? 0
  } catch {
    return 0
  }
}

/** Milliseconds since the screen on show began (see screenStart). */
export function sinceScreenStart(): number {
  try {
    return Math.max(0, performance.now() - screenStart())
  } catch {
    return 0
  }
}

/** Times a promise: its step when it settles, `fail` with the code `classify` gives when it throws. */
export async function timedStep<T>(route: StepRoute, run: () => Promise<T>, classify: (e: unknown) => string = failCode): Promise<T> {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0
  try {
    const out = await run()
    perfStep(route, performance.now() - t0)
    return out
  } catch (e) {
    perfFail(route, classify(e))
    throw e
  }
}

/** A failure as a short code: offline, a dropped connection, or refused. */
export function failCode(e: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline"
  if (e instanceof TypeError) return "network"
  return "refused"
}
