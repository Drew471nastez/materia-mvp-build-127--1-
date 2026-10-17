"use client"

/**
 * Whether each of Storelib's apps is on for this store, for the Apps
 * category of Add section (lib/website-builder/app-sections.ts): read from
 * GET /api/store/integrations/apps the first time the library opens, and
 * again when the tab comes back into view (an app turned on in another tab
 * shows without a reload). Null until it answers, and when it cannot: the
 * cards then say nothing about the app being on or off.
 */
import { useEffect, useState } from "react"

type States = Record<string, string | null>
let kept: States | null = null

export function useAppStates(wanted: boolean): States | null {
  const [states, setStates] = useState<States | null>(kept)
  useEffect(() => {
    if (!wanted) return
    let alive = true
    const read = () =>
      fetch("/api/store/integrations/apps", { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { states?: States } | null) => {
          if (!alive || !d?.states) return
          kept = d.states
          setStates(d.states)
        })
        .catch(() => undefined)
    void read()
    const onVisible = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [wanted])
  return states
}
