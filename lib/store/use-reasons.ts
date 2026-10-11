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

/*
 * IN REAL TIME. Every dialog open on the page holds the list it was drawn
 * with; a change in Settings tells them all (here, through `listeners`) and
 * every other tab of the app (BroadcastChannel), and each reads the new list
 * at once. An order page open in another tab offers a reason added a second
 * ago, in the order it was just put in.
 */
const listeners = new Set<(l: Lists) => void>()
const CHANNEL = "storelib-reasons"
let channel: BroadcastChannel | null = null
function openChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (e: MessageEvent) => {
      const d = e.data as Partial<Lists> | null
      if (d && Array.isArray(d.return) && Array.isArray(d.refund)) publish({ return: d.return, refund: d.refund }, false)
      else {
        cached = null
        void fetchLists()
      }
    }
  } catch {
    channel = null
  }
  return channel
}

function publish(l: Lists, broadcast: boolean) {
  cached = l
  for (const fn of listeners) fn(l)
  if (broadcast) openChannel()?.postMessage(l)
}

function fetchLists(): Promise<Lists | null> {
  if (cached) return Promise.resolve(cached)
  pending ??= fetch("/api/store/reasons", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: Partial<Lists> | null) => {
      if (!d || !Array.isArray(d.return) || !Array.isArray(d.refund)) return null
      publish({ return: d.return, refund: d.refund }, false)
      return cached
    })
    .catch(() => null)
    .finally(() => {
      pending = null
    })
  return pending
}

/**
 * After Settings changes a list: every open dialog, here and in other tabs,
 * draws the new one. With the lists as saved, nothing is fetched; without,
 * they are read again.
 */
export function forgetReasons(next?: Partial<Lists>) {
  if (next && Array.isArray(next.return) && Array.isArray(next.refund)) {
    publish({ return: next.return, refund: next.refund }, true)
    return
  }
  if (next && cached) {
    publish({ return: Array.isArray(next.return) ? next.return : cached.return, refund: Array.isArray(next.refund) ? next.refund : cached.refund }, true)
    return
  }
  cached = null
  openChannel()?.postMessage(null)
  void fetchLists()
}

export function useReasons(kind: ReasonKind): Reason[] {
  const [lists, setLists] = React.useState<Lists | null>(cached)
  React.useEffect(() => {
    let live = true
    const on = (l: Lists) => live && setLists(l)
    listeners.add(on)
    openChannel()
    void fetchLists().then((l) => live && l && setLists(l))
    return () => {
      live = false
      listeners.delete(on)
    }
  }, [])
  return lists?.[kind] ?? (kind === "return" ? DEFAULT_RETURN_REASONS : DEFAULT_REFUND_REASONS)
}
