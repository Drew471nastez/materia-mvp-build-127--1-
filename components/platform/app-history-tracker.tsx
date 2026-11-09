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
  /* The path we are about to leave, so the trail records what is BEHIND the
     next entry rather than only how many entries there are. */
  const lastPath = useRef(pathname)
  /* Set by popstate so the pathname change it causes is counted as a return
     rather than as another push. popstate runs before the router commits. */
  const returning = useRef(false)

  useEffect(() => {
    /* Wave 7: a pop inside one page (Contacts › Forms moves its own query with pushState) changes no path and
       commits nothing here, and a flag left up by it counted the next real push as a return. Only a pop to
       another path is a return. */
    const onPop = () => { returning.current = window.location.pathname !== lastPath.current }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  /*
    A REPLACE IS NOT A PAGE BEHIND THIS ONE. router.replace changes the path
    without adding a history entry (a sign in finishing, the app's start
    screen), and counting it told the product page's back arrow there was a
    page of ours to go back to when there was not. Until this document has
    gone back once it is at the end of its history, where every push makes
    the history longer; a path change that did not is a replace. After a
    back a push can leave the length alone, so from then on every change
    counts, as before.
  */
  const length = useRef(typeof window === "undefined" ? 0 : window.history.length)
  const poppedOnce = useRef(false)

  useEffect(() => {
    const now = window.history.length
    const grew = now > length.current
    length.current = now
    if (first.current) {
      first.current = false
      lastPath.current = pathname
      return
    }
    if (returning.current) {
      returning.current = false
      poppedOnce.current = true
      notePopNavigation()
      lastPath.current = pathname
      return
    }
    if (!grew && !poppedOnce.current) {
      lastPath.current = pathname
      return
    }
    noteClientNavigation(lastPath.current)
    lastPath.current = pathname
  }, [pathname])

  return null
}
