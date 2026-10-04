"use client"

import { startTransition, useEffect, useState } from "react"

/**
 * ===========================================================================
 *  A NEW GRID DRAWS ITS FIRST ROWS FIRST
 * ===========================================================================
 * A pill tap in Explore swaps a grid of twenty four cards. Measured at 4x CPU
 * on a phone (scripts/check-explore-speed.mjs), drawing all of them took
 * 200 to 300ms after the tap, and none of them were on screen until every one
 * was: the visitor waited for the eighteen cards below the fold to see the
 * six above it.
 *
 * So when the list CHANGES (its `token`: the pill, the filters, the page),
 * the first `first` cards are drawn in that render and the rest in the next,
 * as a transition: interruptible, so another tap meanwhile throws the
 * remainder away instead of queueing it. On a phone six cards is more than
 * the screen holds; on a computer it is the first two rows.
 *
 * ARRIVING IS NOT A CHANGE. The first render (the server's HTML, and coming
 * back to Explore from a product) draws everything: the page must be its full
 * height at once for the scroll to be put back where it was, and for the
 * HTML to carry every card.
 */
export function useProgressiveCount(token: string, total: number, first = 6): number {
  const [state, setState] = useState<{ token: string; full: boolean }>({ token, full: true })
  let full = state.full
  if (state.token !== token) {
    /* A change, seen during render: start from the first rows (React re-renders at once with this). */
    full = false
    setState({ token, full: false })
  }
  useEffect(() => {
    if (full) return
    const id = requestAnimationFrame(() => {
      startTransition(() => setState((s) => (s.token === token ? { token, full: true } : s)))
    })
    return () => cancelAnimationFrame(id)
  }, [token, full])
  return full ? total : Math.min(total, first)
}
