"use client"

/**
 * Counts this document's client navigations so a back control can tell
 * whether there is a page of ours behind it. See lib/navigation/in-app-history
 * for why `document.referrer` cannot answer that question.
 *
 * Renders nothing and holds no state, so it never re-renders the tree it is
 * mounted in. `usePathname` is the commit signal: it changes once per
 * navigation, after the router has finished, whichever control started it.
 */

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { noteClientNavigation, notePopNavigation } from "@/lib/navigation/in-app-history"

export function AppHistoryTracker() {
  const pathname = usePathname()
  const first = useRef(true)
  /* Set by popstate so the pathname change it causes is counted as a return
     rather than as another push. popstate runs before the router commits. */
  const returning = useRef(false)

  useEffect(() => {
    const onPop = () => { returning.current = true }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (returning.current) {
      returning.current = false
      notePopNavigation()
      return
    }
    noteClientNavigation()
  }, [pathname])

  return null
}
