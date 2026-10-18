"use client"

/**
 * "Add to my library" from storelib.com/themes, one theme at a time.
 *
 * Signed out: the server answers 401 and the page goes to sign in, coming
 * back to this theme with ?add=1, where the add runs once by itself. The page
 * is the same for everybody (it is served from the CDN), so who is signed in
 * is the server's answer to the click, not something drawn into the page.
 */
import * as React from "react"

import { listingPath } from "@/lib/themes/marketplace-shared"

export type AddState =
  | { phase: "idle" }
  | { phase: "adding"; slug: string }
  | { phase: "added"; slug: string }
  | { phase: "refused"; slug: string; text: string; code?: string }

export function useAddTheme() {
  const [state, setState] = React.useState<AddState>({ phase: "idle" })
  const busy = React.useRef(false)

  const add = React.useCallback(async (slug: string) => {
    if (busy.current) return
    busy.current = true
    setState({ phase: "adding", slug })
    try {
      const res = await fetch("/api/themes/marketplace/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) })
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
      if (res.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(`${listingPath(slug)}?add=1`)}`)
        return
      }
      if (!res.ok) {
        setState({ phase: "refused", slug, text: body.error || "Could not add the theme. Try again.", code: body.code })
        return
      }
      setState({ phase: "added", slug })
    } catch {
      setState({ phase: "refused", slug, text: "Could not reach Storelib. Try again." })
    } finally {
      busy.current = false
    }
  }, [])

  return { state, add, reset: () => setState({ phase: "idle" }) }
}
