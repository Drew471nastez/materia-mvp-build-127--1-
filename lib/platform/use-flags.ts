"use client"

/**
 * THE PLATFORM SWITCHES IN A CLIENT COMPONENT. A server component reads
 * communitiesEnabled() and passes the answer down as `initial`; a client
 * component with nothing to pass asks GET /api/platform/flags once per page
 * load (every caller shares the one request). Until it answers, a switch reads
 * off, so nothing appears and then vanishes.
 */
import { useEffect, useState } from "react"

export interface PlatformFlags {
  communities: boolean
}

/*
  ONE REQUEST PER PAGE LOAD, KEPT ON THE WINDOW. Kept in module variables it was asked twice on every full
  load of /app (the header and the dashboard search each asked: scripts/check-dashboard-roundtrips.mjs FULL=1
  listed GET /api/platform/flags twice), the module being evaluated once per chunk that carries it.
*/
type FlagsHold = { loaded: PlatformFlags | null; pending: Promise<PlatformFlags> | null }
const hold: FlagsHold =
  typeof window === "undefined"
    ? { loaded: null, pending: null }
    : (((window as unknown as { __slFlags?: FlagsHold }).__slFlags ??= { loaded: null, pending: null }))

function loadFlags(): Promise<PlatformFlags> {
  if (hold.loaded) return Promise.resolve(hold.loaded)
  if (!hold.pending) {
    hold.pending = fetch("/api/platform/flags", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : { communities: false }))
      .then((body: Partial<PlatformFlags>) => {
        hold.loaded = { communities: body?.communities === true }
        return hold.loaded
      })
      .catch(() => {
        hold.pending = null
        return { communities: false }
      })
  }
  return hold.pending
}

/** Whether communities are switched on. `initial` from the server wins and skips the request. */
export function useCommunitiesEnabled(initial?: boolean): boolean {
  const [enabled, setEnabled] = useState<boolean>(initial ?? hold.loaded?.communities ?? false)
  useEffect(() => {
    if (initial !== undefined) return
    let live = true
    void loadFlags().then((flags) => {
      if (live) setEnabled(flags.communities)
    })
    return () => {
      live = false
    }
  }, [initial])
  return initial ?? enabled
}
