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

let loaded: PlatformFlags | null = null
let pending: Promise<PlatformFlags> | null = null

function loadFlags(): Promise<PlatformFlags> {
  if (loaded) return Promise.resolve(loaded)
  if (!pending) {
    pending = fetch("/api/platform/flags", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : { communities: false }))
      .then((body: Partial<PlatformFlags>) => {
        loaded = { communities: body?.communities === true }
        return loaded
      })
      .catch(() => {
        pending = null
        return { communities: false }
      })
  }
  return pending
}

/** Whether communities are switched on. `initial` from the server wins and skips the request. */
export function useCommunitiesEnabled(initial?: boolean): boolean {
  const [enabled, setEnabled] = useState<boolean>(initial ?? loaded?.communities ?? false)
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
