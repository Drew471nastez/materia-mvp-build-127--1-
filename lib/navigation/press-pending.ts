"use client"

/**
 * ===========================================================================
 *  A BUTTON THAT HAS BEEN PRESSED, UNTIL THE PAGE IS SHOWN AGAIN
 * ===========================================================================
 * The Buy buttons set a loading state when pressed and never cleared it. The
 * product page is kept by the router (and by the browser's back-forward
 * cache), so coming back from the checkout showed the same page with the
 * button still "Loading..." and disabled: the Buy button that "became
 * unavailable".
 *
 * This holds the pressed state for the press alone. It clears when the page
 * is shown again (a remount, a history restore, a return from the cache) and,
 * whatever else happens, after `ms`.
 */

import { useCallback, useEffect, useState } from "react"

export function usePressPending(ms = 8000): [boolean, () => void] {
  const [pending, setPending] = useState(false)
  /* Shown again after being kept hidden: the press is over. */
  useEffect(() => {
    setPending(false)
  }, [])
  useEffect(() => {
    const reset = () => setPending(false)
    window.addEventListener("pageshow", reset)
    window.addEventListener("popstate", reset)
    return () => {
      window.removeEventListener("pageshow", reset)
      window.removeEventListener("popstate", reset)
    }
  }, [])
  useEffect(() => {
    if (!pending) return
    const t = window.setTimeout(() => setPending(false), ms)
    return () => window.clearTimeout(t)
  }, [pending, ms])
  const start = useCallback(() => setPending(true), [])
  return [pending, start]
}
