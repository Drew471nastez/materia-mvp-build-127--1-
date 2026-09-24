/**
 * DID THE ROUTER START ANYTHING ON THIS PRESS? A link whose click the page
 * handles itself (Explore in the native app opens the system browser, a row
 * that opens a sheet) is a click on an <a> the bar sees, with a default the
 * page prevented and no navigation behind it. It started a record nothing
 * would ever end: the bar under the clock for ten seconds.
 *
 * Next tells instrumentation-client.ts (at the root) when the router starts a navigation
 * (`onRouterTransitionStart`), synchronously, inside the click that caused
 * it. That file counts them on the window (`noteRouterStart`), so the bar
 * can read the count as the click begins and again after the page's own
 * handlers: a prevented click that did not move the count went nowhere.
 * On the window, not in a module variable, because the instrumentation file is
 * bundled on its own and runs before the app. Null until that file has run,
 * and then every click is taken at its word, as before.
 */
const ROUTER_STARTS = "__storelibRouterStarts"
type WithStarts = { [ROUTER_STARTS]?: number }

export function noteRouterStart() {
  if (typeof window === "undefined") return
  const w = window as unknown as WithStarts
  w[ROUTER_STARTS] = (w[ROUTER_STARTS] ?? 0) + 1
}
export function watchRouterStarts() {
  if (typeof window === "undefined") return
  const w = window as unknown as WithStarts
  if (w[ROUTER_STARTS] == null) w[ROUTER_STARTS] = 0
}
export function routerStartCount(): number | null {
  if (typeof window === "undefined") return null
  const n = (window as unknown as WithStarts)[ROUTER_STARTS]
  return typeof n === "number" ? n : null
}
