/*
 * next/navigation for a probe page outside Next (scripts/check-support.mjs):
 * the address is the page's own, replace() changes it in place and every
 * useSearchParams() reads it again.
 */
import * as React from "react"

const listeners = new Set<() => void>()
const tell = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))
const search = () => window.location.search

function move(href: string) {
  const url = new URL(href, window.location.href)
  window.history.replaceState(null, "", `${window.location.pathname}${url.search}`)
  tell()
}

export function useRouter() {
  return { replace: move, push: move, back: () => undefined, forward: () => undefined, refresh: () => undefined, prefetch: () => undefined }
}
export function useSearchParams() {
  const s = React.useSyncExternalStore(subscribe, search, search)
  return React.useMemo(() => new URLSearchParams(s), [s])
}
export function usePathname() {
  return window.location.pathname
}
export function redirect(): never {
  throw new Error("redirect in a probe")
}
