/**
 * ===========================================================================
 *  BACK, WHILE A PAGE HOLDS WORK THAT IS NOT SAVED
 * ===========================================================================
 * The OnePage editor asks before Back leaves it with unsaved changes. It used
 * to do that with a history entry of its own, pushed on arrival so Back had
 * something to pop, and its tabs pushed one entry each (`#settings`). So Back
 * went nowhere for a press or three before it left the page, the entry pushed
 * on arrival could carry none of the router's own state, and "Discard" went
 * back two entries by counting, which is not a number anybody can know.
 *
 * Now there is no extra entry. A page with work to lose holds Back here, and
 * the one listener for it is added by instrumentation-client.ts, before
 * Next's router adds its own: listeners on the window run in the order they
 * were added, capture or not (measured in Chromium 141: a capture listener
 * added later still runs after an earlier one), so a page cannot get in
 * front of the router from its own effect. When Back or Forward arrives while
 * a page holds it:
 *
 *   the event goes no further, so the router never starts that traversal
 *   and the shell never starts its bar for it;
 *
 *   the address is put back with the entry the page was on, whose state
 *   carries the router's own marker (`__NA`), which the router's history
 *   patch lets through untouched, so the router is left exactly where it
 *   was, on the page;
 *
 *   the page is told, and asks. Leaving after that is the page letting go
 *   (setLeaveGuard(null)) and going back itself: one entry back from the one
 *   just put back is the one Back or Forward was going to.
 *
 * On the window, as lib/ui/router-starts.ts keeps its count: the
 * instrumentation file is bundled on its own, so a module variable would be
 * two variables.
 */

const KEY = "__storelibLeaveGuard"
const WATCHING = "__storelibLeaveGuardWatched"

export type LeaveGuard = {
  /** The address of the entry the page is on... */
  url: string
  /** ...and its history state, the router's marker in it. */
  state: unknown
  /** Back or Forward was held on its way to `to`. */
  onHeld: (to: string) => void
}

type GuardWindow = Window & { [KEY]?: LeaveGuard | null; [WATCHING]?: boolean }

/** A page with unsaved work holds Back (and lets go with null). */
export function setLeaveGuard(guard: LeaveGuard | null) {
  if (typeof window === "undefined") return
  ;(window as GuardWindow)[KEY] = guard
}

export function leaveGuard(): LeaveGuard | null {
  if (typeof window === "undefined") return null
  return (window as GuardWindow)[KEY] ?? null
}

/** Whether a history state carries the router's marker, so it can be put back without the router following it. */
export function hasRouterMarker(state: unknown): boolean {
  return !!state && typeof state === "object" && !!(state as { __NA?: unknown }).__NA
}

/**
 * The one popstate listener, added before the router's (instrumentation-
 * client.ts). Holds nothing unless a page has set a guard.
 */
export function watchLeaveGuard() {
  if (typeof window === "undefined") return
  const w = window as GuardWindow
  if (w[WATCHING]) return
  w[WATCHING] = true
  window.addEventListener("popstate", (e) => {
    const guard = w[KEY]
    if (!guard || !hasRouterMarker(guard.state)) return
    const to = window.location.href
    e.stopImmediatePropagation()
    window.history.pushState(guard.state, "", guard.url)
    guard.onHeld(to)
  })
}
