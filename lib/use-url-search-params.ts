"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

/**
 * ===========================================================================
 *  THE QUERY STRING, WITHOUT SUSPENDING THE COMPONENT THAT READS IT
 * ===========================================================================
 *
 * `useSearchParams()` opts its component into Suspense. That is by design and
 * it is fine in a leaf; it is a disaster in a header, because the nearest
 * boundary is what gets shown instead — and for the platform header that
 * boundary's fallback is a bare black bar with no logo, no search, no icons and
 * no avatar. Every navigation that made the header re-suspend blanked the whole
 * of it for as long as the payload took, then filled it back in. That is the
 * "header flashes for a second and all the icons come back" on pressing Vinde
 * acum, and it was never the button: it was the boundary above it.
 *
 * The technique here is already in the codebase — components/marketing/
 * conditional-header.tsx reads `window.location.search` for exactly this reason
 * and says so in a comment. It had only ever been applied to the component
 * DECIDING whether to render the header, not to the header itself, so the
 * bailout it was written to avoid was still one level down.
 *
 * ---------------------------------------------------------------------------
 * KEEPING IT CORRECT WITHOUT THE HOOK THAT SUBSCRIBES FOR YOU
 * ---------------------------------------------------------------------------
 * `window.location.search` is a snapshot, so something has to say when to take
 * another. Three things change it, and all three are covered:
 *
 *   · A NEW PATH. `usePathname()` already re-renders on those, and it does not
 *     suspend — it is the one router hook that is safe here.
 *
 *   · BACK AND FORWARD. `popstate`, which the browser fires for us.
 *
 *   · A QUERY-ONLY NAVIGATION — `?category=shoes` becoming `?category=bags`
 *     with the path unchanged. Nothing fires for this: the App Router calls
 *     `history.pushState` and re-renders its own tree, and the History API has
 *     no event for a programmatic push. So the two methods are wrapped, once,
 *     at module scope, to emit one. This is the only part that is not simply
 *     reading the platform, and it is why it is written here rather than
 *     inlined at the two call sites that would otherwise each need it.
 *
 * The patch is installed lazily and only in a browser, calls through to the
 * original every time, and never throws into the caller: a listener that fails
 * must not be able to break a navigation.
 */

const EVENT = "storelib:urlchange"

let patched = false

function patchHistoryOnce(): void {
  if (patched || typeof window === "undefined") return
  patched = true
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name]
    history[name] = function patchedHistoryMethod(this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args)
      try {
        window.dispatchEvent(new Event(EVENT))
      } catch {
        /* an observer that cannot be told is not a navigation that failed */
      }
      return result
    } as History[typeof name]
  }
}

/**
 * The current query string, as a `URLSearchParams`.
 *
 * A drop-in for `useSearchParams()` in components that must never suspend. Not
 * a replacement for it everywhere: inside an ordinary page, where a Suspense
 * boundary is cheap and correct, the real hook is better because it is the
 * router's own state rather than an observation of the address bar.
 */
export function useUrlSearchParams(): URLSearchParams {
  const pathname = usePathname()
  const [search, setSearch] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.location.search,
  )

  useEffect(() => {
    patchHistoryOnce()
    const sync = () => setSearch(window.location.search)
    // Once for the path change that ran this effect, then on every later one.
    sync()
    window.addEventListener("popstate", sync)
    window.addEventListener(EVENT, sync)
    return () => {
      window.removeEventListener("popstate", sync)
      window.removeEventListener(EVENT, sync)
    }
  }, [pathname])

  // Rebuilt from the string rather than stored as an object, so the identity
  // changes exactly when the query does. A `URLSearchParams` held in state
  // would be a new object on every sync and would defeat every `useMemo` that
  // depends on it.
  return new URLSearchParams(search)
}
