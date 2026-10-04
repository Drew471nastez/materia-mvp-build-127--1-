/**
 * ===========================================================================
 *  HOW MUCH TO FETCH AHEAD, FOR THIS PHONE ON THIS NETWORK
 * ===========================================================================
 * Explore warms the lists a visitor is likely to open next (the pills beside
 * the one they are on) while the page is idle. On a fast laptop that is
 * free; on a phone on a slow network with Data Saver on it competes with the
 * pictures they are looking at, and costs them data they asked us to save.
 * So the number of lists fetched ahead is read from what the browser says
 * about the connection and the device:
 *
 *   Data Saver, or slow-2G        0   nothing ahead; a tap still loads, and a
 *                                     press (pointerdown) still starts it early
 *   2G (DevTools' "Slow 3G")      1   the next pill only, one small request
 *   3G, or a small device         2   the pills on either side
 *   4G and a capable device       4
 *   no signal at all (Safari)     3   Safari tells us nothing; a middle answer
 *
 * Pure apart from reading `navigator`, safe on the server (answers 0 there).
 * Round 10 also asks for one app wide prefetch policy (the tab bar, explore,
 * community links); when that helper lands this is the one place Explore
 * reads it from.
 */

type ConnectionInfo = { saveData?: boolean; effectiveType?: string }
type NavigatorInfo = { connection?: ConnectionInfo; deviceMemory?: number; hardwareConcurrency?: number }

export function prefetchBudgetFor(nav: NavigatorInfo | null | undefined): number {
  if (!nav) return 0
  const c = nav.connection
  if (c?.saveData) return 0
  const type = c?.effectiveType
  if (type === "slow-2g") return 0
  if (type === "2g") return 1
  const small = (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) || (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency < 4)
  if (type === "3g" || small) return 2
  if (type === "4g") return 4
  return 3
}

export function prefetchBudget(): number {
  if (typeof navigator === "undefined") return 0
  return prefetchBudgetFor(navigator as unknown as NavigatorInfo)
}

/** Runs `job` when the browser is idle (or after `timeout` ms), cancelable. */
export function whenIdle(job: () => void, timeout = 1200): () => void {
  if (typeof window === "undefined") return () => {}
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(job, { timeout })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(job, 200)
  return () => window.clearTimeout(id)
}
