"use client"

/**
 * ===========================================================================
 *  A PART OF A PAGE WHOSE READ FAILED ASKS AGAIN, QUIETLY (round 53)
 * ===========================================================================
 * A panel that reads its own figures in the browser (Analytics' reports and
 * sales cards) drew its gray shapes, or a line saying to refresh the page,
 * for good after one failed request: with 10% of database requests failing
 * that was most loads of /app/analytics (scripts/check-app-resilience-r53.mjs).
 *
 * `useQuietRetry(question)` gives a `tick` to put in the read's effect and a
 * `failed()` to call when it fails: the read runs again after
 * QUIET_PANEL_RETRY_MS, twice, then `failed()` answers true and the panel
 * says so with its own Try again (which calls `again()`). A new question
 * starts the count again. Nothing runs while the tab is hidden or offline;
 * it waits for the tab to come back.
 */
import * as React from "react"

export const QUIET_PANEL_RETRY_MS = [1_500, 5_000] as const

export function useQuietRetry(question: string): { tick: number; failed: () => boolean; again: () => void } {
  const [tick, setTick] = React.useState(0)
  const count = React.useRef({ question, n: 0 })
  const timer = React.useRef<number | undefined>(undefined)
  if (count.current.question !== question) count.current = { question, n: 0 }
  React.useEffect(() => () => window.clearTimeout(timer.current), [])
  const failed = React.useCallback((): boolean => {
    const c = count.current
    if (c.n >= QUIET_PANEL_RETRY_MS.length) return true
    const wait = QUIET_PANEL_RETRY_MS[c.n++]
    window.clearTimeout(timer.current)
    const go = () => {
      if (document.visibilityState === "hidden" || navigator.onLine === false) {
        timer.current = window.setTimeout(go, 1_000)
        return
      }
      setTick((t) => t + 1)
    }
    timer.current = window.setTimeout(go, wait + Math.round(Math.random() * 400))
    return false
  }, [])
  const again = React.useCallback(() => {
    count.current = { question: count.current.question, n: 0 }
    setTick((t) => t + 1)
  }, [])
  return { tick, failed, again }
}
