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

/**
 * ===========================================================================
 *  AND THE SAME WORK, WHEN A CONTROL IN THE APP LEAVES THE PAGE
 * ===========================================================================
 * Everything above holds the BROWSER'S Back. A page holding work can also be
 * left by something inside the app, and on a phone the nearest of those is
 * the nav pill: four tabs across the bottom of the screen, one tap from
 * anywhere in the product editor. The editor's own Cancel asks before unsaved
 * changes are thrown away; a tab went straight through with them.
 *
 * So the page on the screen leaves a QUESTION here — its own question, in its
 * own words — and the pill asks it before it navigates
 * (components/app/sidebar-mobile-nav.tsx). The shell never learns what
 * "unsaved" means for a page, and a page never learns what the pill is.
 *
 * A module variable, where the guard above is on the window: that one is read
 * by instrumentation-client.ts, which is bundled on its own, and this one is
 * only ever set and read inside the app's own bundle.
 *
 * WHY `true` AND NOT A PROMISE WHEN NOTHING ASKS. A press on a tab is
 * answered on its own frame, and a promise costs it one: the navigation would
 * start in a microtask after the press's task, behind whatever React does in
 * between. Almost every page has no question, so `mayLeave` says so with a
 * value the caller can act on in the press itself.
 *
 * One question at a time, which is what the screen is: the layer over the
 * page is the page you are looking at. A second one replaces the first, and
 * each page only ever takes its own away.
 */

/** Answers whether the page on the screen may be left for `href`. */
type LeaveQuestion = (href: string) => boolean | Promise<boolean>

let question: LeaveQuestion | null = null

/**
 * The page on the screen has something to lose, and this is what it asks.
 * Returns the remove, for the page's own unmount.
 */
export function askBeforeLeaving(ask: LeaveQuestion): () => void {
  question = ask
  return () => {
    if (question === ask) question = null
  }
}

/** Is a page asking before it is left? */
export function pageAsksBeforeLeaving(): boolean {
  return question !== null
}

/**
 * May the page on the screen be left for `href`? `true` when nothing asks, so
 * the caller navigates in the press's own task; otherwise the answer, once
 * the page has it.
 *
 * THE QUESTION GOES UP AFTER THE TAP THAT ASKED FOR IT. The pill picks on the
 * pointer's LIFT, and a tap's click comes after that. A sheet put up inside
 * the lift is on the screen, full width, by the time that click is
 * dispatched, and the click lands on its scrim: the question appeared and
 * dismissed itself in the same gesture, which answered Keep editing and left
 * the tap doing nothing (4 of 4 taps, scripts/check-pill-nav-from-editor.mjs).
 * So the page is asked in the task after the gesture, by which time every
 * event of the tap has been delivered. Nobody is kept waiting by that: the
 * answer is a promise either way.
 */
export function mayLeave(href: string): true | Promise<boolean> {
  const ask = question
  if (!ask) return true
  return new Promise<boolean>((resolve) => {
    const put = () => {
      try {
        Promise.resolve(ask(href)).then(resolve, () => resolve(true))
      } catch {
        /* A page whose question threw does not get to hold the app. */
        resolve(true)
      }
    }
    if (typeof setTimeout === "function") setTimeout(put, 0)
    else put()
  })
}
