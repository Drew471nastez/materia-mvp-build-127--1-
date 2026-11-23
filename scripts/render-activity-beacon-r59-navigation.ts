/* next/navigation for scripts/render-activity-beacon-r59.tsx: the path is window.__path, changed by the check with window.__go(path). */
import * as React from "react"

type W = Window & { __path?: string; __go?: (p: string) => void; __subs?: Set<() => void> }
const w = window as W
w.__path = w.__path ?? location.pathname
w.__subs = w.__subs ?? new Set()
w.__go = (p: string) => {
  w.__path = p
  for (const s of w.__subs!) s()
}

export function usePathname(): string {
  return React.useSyncExternalStore(
    (cb) => {
      w.__subs!.add(cb)
      return () => w.__subs!.delete(cb)
    },
    () => w.__path!,
  )
}
