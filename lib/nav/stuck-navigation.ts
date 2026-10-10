/**
 * ===========================================================================
 *  A PRESS THAT NEVER ARRIVES IS SENT AGAIN, AS A PAGE LOAD
 * ===========================================================================
 * Round 15, the owner: "when I'm in Profile and I click on the Library pill,
 * it shows the iOS loading thing for like 10 seconds and then doesn't take me
 * there. It takes me back to the profile account thing."
 *
 * WHAT THAT IS. Nothing sends anybody back to the profile. The ten seconds are
 * the loading line's own give up (components/navigation/route-loading-bar.tsx,
 * GIVE_UP_MS): its spinner covers the page from the press, and at ten seconds
 * it fades away whatever the router is doing. Under it the profile had never
 * left, because the router's move to the library had never committed. So the
 * person saw a spinner, then the page they pressed on, and read it as a
 * bounce.
 *
 * WHY THE MOVE NEVER COMMITS. The router moves inside a transition, which
 * keeps the old page on screen until the new one can render without waiting.
 * The library's layout is above its loading.tsx, so until the layout's data
 * is in, nothing of the new page can show. That data comes from one of two
 * requests: the navigation's own, or a prefetch already on its way for the
 * same address, which the router waits on (next/dist/client/components/
 * segment-cache/navigation.js, a segment entry that is Pending). The profile
 * starts several of those at once for the library (the pill's Link with
 * prefetch, the tab bar's read ahead, the pill's press), and a request that
 * was in flight when the phone locked or the app went to the background is,
 * on iOS, one that may never settle: there is no timeout on a prefetch. The
 * transition then waits on it forever, and the page under the spinner never
 * changes.
 *
 * THE ANSWER. A press that has not arrived after STUCK_MS of the page being
 * on screen is made again as a page load of the same address, which asks the
 * server afresh and cannot wait on anything the router kept. Time while the
 * page is hidden does not count (the app in the background is not a stuck
 * press), a newer press replaces the watch, and Back or Forward ends it. A
 * page that is merely slow still lands by itself well inside STUCK_MS; this
 * only ever runs for one that would otherwise have been a spinner and then
 * nothing.
 */

/** Visible time after a press with no arrival before it is sent again as a page load. */
export const STUCK_MS = 5000
const TICK_MS = 250

type Watch = { cancel: () => void }
let current: Watch | null = null

const pathOf = (href: string): string => {
  try {
    const u = new URL(href, "http://x")
    return u.pathname.replace(/\/+$/, "") || "/"
  } catch {
    return href.split(/[?#]/)[0]
  }
}

/** Whether the address now is the one a press was going to (its path; a query the page adds itself is the same place). */
export function arrivedAt(target: string, here: string): boolean {
  return pathOf(target) === pathOf(here)
}

/**
 * Watches a press toward `href` and makes it a page load if it never arrives.
 * Returns the cancel. `load` is the page load (window.location.assign by
 * default), and `now`/`visible`/`location` are there for tests.
 */
export function watchNavigation(
  href: string,
  opts: { ms?: number; load?: (href: string) => void; here?: () => string; visible?: () => boolean; schedule?: (fn: () => void, ms: number) => unknown; unschedule?: (id: unknown) => void } = {},
): () => void {
  if (typeof window === "undefined" && !opts.here) return () => {}
  current?.cancel()
  const ms = opts.ms ?? STUCK_MS
  const here = opts.here ?? (() => window.location.pathname + window.location.search)
  const visible = opts.visible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden")
  const load = opts.load ?? ((to: string) => window.location.assign(to))
  const schedule = opts.schedule ?? ((fn: () => void, t: number) => window.setTimeout(fn, t))
  const unschedule = opts.unschedule ?? ((id: unknown) => window.clearTimeout(id as number))
  const from = here()
  let waited = 0
  let live = true
  let timer: unknown = null
  const onPop = () => cancel()
  const cancel = () => {
    if (!live) return
    live = false
    if (timer !== null) unschedule(timer)
    if (typeof window !== "undefined") window.removeEventListener("popstate", onPop)
    if (current === watch) current = null
  }
  const tick = () => {
    timer = null
    if (!live) return
    const now = here()
    /* Arrived, or somewhere else altogether (a redirect, another press): nothing to send again. */
    if (arrivedAt(href, now) || !arrivedAt(from, now)) return cancel()
    if (visible()) waited += TICK_MS
    if (waited >= ms) {
      cancel()
      load(href)
      return
    }
    timer = schedule(tick, TICK_MS)
  }
  const watch: Watch = { cancel }
  current = watch
  if (typeof window !== "undefined") window.addEventListener("popstate", onPop)
  timer = schedule(tick, TICK_MS)
  return cancel
}
