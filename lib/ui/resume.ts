/**
 * ===========================================================================
 *  ROUND AU: COMING BACK TO THE APP IS NOT A BURST OF READS
 * ===========================================================================
 * When the app comes back from the background after more than five minutes,
 * every part of /app that keeps something warm asked at the same instant:
 * the bottom bar's four whole pages (and Analytics' figures), the OnePage
 * editor, the tab bar's and the profile's pages (components/nav/keep-fresh),
 * next to the reads that the screen on show really needs (Home's progress,
 * the attention lines, the bell's count, live visitors). On a weak network
 * the reads for the screen queued behind pages nobody had pressed yet, and
 * after an hour away each of those page reads also met an expired session
 * cookie and asked the server to renew it, at the same moment as the
 * browser's own client renewed it.
 *
 * afterResume(job) runs a read ahead once the app has settled: RESUME_SETTLE_MS
 * after it came back (the screen's own reads and the session's renewal go
 * first), then when the main thread is idle. Not at all while the app is
 * hidden again or the phone is offline: the next time it is shown asks again.
 */
export const RESUME_SETTLE_MS = 1_500
const IDLE_TIMEOUT_MS = 2_000

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

export function afterResume(job: () => void, settle = RESUME_SETTLE_MS): () => void {
  if (typeof window === "undefined") return () => {}
  const w = window as IdleWindow
  let idle: number | undefined
  let gone = false
  const run = () => {
    if (gone) return
    if (document.visibilityState !== "visible") return
    if (typeof navigator !== "undefined" && navigator.onLine === false) return
    job()
  }
  const timer = window.setTimeout(() => {
    if (gone) return
    if (w.requestIdleCallback) idle = w.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
    else run()
  }, settle)
  return () => {
    gone = true
    window.clearTimeout(timer)
    if (idle !== undefined) w.cancelIdleCallback?.(idle)
  }
}
