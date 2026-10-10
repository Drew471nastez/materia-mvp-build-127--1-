"use client"

/**
 * The store's return and refund reasons in the app's own dialogs (the order
 * panel's return, both refund dialogs). Storelib's defaults straight away,
 * the store's own list a moment later; one request per page, shared.
 */
import * as React from "react"
import { DEFAULT_REFUND_REASONS, DEFAULT_RETURN_REASONS, type Reason, type ReasonKind } from "./reasons"

type Lists = { return: Reason[]; refund: Reason[] }
let cached: Lists | null = null
let pending: Promise<Lists | null> | null = null

function fetchLists(): Promise<Lists | null> {
  if (cached) return Promise.resolve(cached)
  pending ??= fetch("/api/store/reasons", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: Partial<Lists> | null) => {
      if (!d || !Array.isArray(d.return) || !Array.isArray(d.refund)) return null
      cached = { return: d.return, refund: d.refund }
      return cached
    })
    .catch(() => null)
    .finally(() => {
      pending = null
    })
  return pending
}

/** After Settings changes a list, the next dialog reads it again. */
export function forgetReasons() {
  cached = null
}

export function useReasons(kind: ReasonKind): Reason[] {
  const [lists, setLists] = React.useState<Lists | null>(cached)
  React.useEffect(() => {
    let live = true
    void fetchLists().then((l) => live && l && setLists(l))
    return () => {
      live = false
    }
  }, [])
  return lists?.[kind] ?? (kind === "return" ? DEFAULT_RETURN_REASONS : DEFAULT_REFUND_REASONS)
}
