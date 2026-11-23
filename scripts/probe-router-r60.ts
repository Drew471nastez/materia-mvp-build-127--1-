/*
 * next/navigation for a probe page served over HTTP (scripts/check-offers-flow-r60.mjs):
 * push and replace move the real address (history.pushState, replaceState),
 * back is the browser's own, and every move is told to the page, which draws
 * the route the address names, as the app router would. refresh() asks the
 * page to read its "server" again.
 */
import * as React from "react"

const listeners = new Set<() => void>()
const tell = () => listeners.forEach((l) => l())
export const subscribeRoute = (l: () => void) => (listeners.add(l), () => listeners.delete(l))
const where = () => `${window.location.pathname}${window.location.search}`
if (typeof window !== "undefined") window.addEventListener("popstate", tell)

type W = Window & { __nav?: string[]; __refreshes?: number }
const log = (what: string) => ((window as W).__nav ??= []).push(what)

const router = {
  push: (href: string) => {
    log(`push ${href}`)
    window.history.pushState(null, "", href)
    tell()
  },
  replace: (href: string) => {
    log(`replace ${href}`)
    window.history.replaceState(null, "", href)
    tell()
  },
  back: () => {
    log("back")
    window.history.back()
  },
  forward: () => window.history.forward(),
  refresh: () => {
    const w = window as W
    w.__refreshes = (w.__refreshes ?? 0) + 1
    tell()
  },
  prefetch: () => undefined,
}

export function useRouter() {
  return router
}
/** The address, and how many times the page asked its server again: a new value draws the route again. */
export function useRoute() {
  const key = () => `${where()}#${(window as W).__refreshes ?? 0}`
  return React.useSyncExternalStore(subscribeRoute, key, key)
}
export function useSearchParams() {
  const s = React.useSyncExternalStore(subscribeRoute, () => window.location.search, () => window.location.search)
  return React.useMemo(() => new URLSearchParams(s), [s])
}
export function usePathname() {
  return window.location.pathname
}
export function redirect(): never {
  throw new Error("redirect in a probe")
}
export function notFound(): never {
  throw new Error("notFound in a probe")
}
