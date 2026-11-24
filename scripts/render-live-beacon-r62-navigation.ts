/* next/navigation for scripts/render-live-beacon-r62.tsx: window.__go(path) moves the address bar (history.pushState) and tells usePathname, as a Next route change does. */
import * as React from "react"

type W = Window & { __go?: (p: string) => void; __subs?: Set<() => void> }
const w = window as W
w.__subs = w.__subs ?? new Set()
w.__go = (p: string) => {
  history.pushState(null, "", p)
  for (const s of w.__subs!) s()
}

export function usePathname(): string {
  return React.useSyncExternalStore(
    (cb) => {
      w.__subs!.add(cb)
      return () => w.__subs!.delete(cb)
    },
    () => location.pathname,
  )
}
