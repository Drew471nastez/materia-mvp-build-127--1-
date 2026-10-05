"use client"

/**
 * Carries out lib/navigation/back-plan in a real tab. The decision is there;
 * this reads the evidence, acts on it, and keeps one promise the decision
 * cannot: a back that does nothing is followed by the fallback.
 *
 * WHY THE WATCH. Every rule in back-plan is right in the cases it knows about
 * and the browser has more cases than that: a history entry the app counted
 * but the browser replaced, a hash entry, a webview that reports a length it
 * cannot go back through. `history.back()` gives no answer when it does
 * nothing, so this listens for what a real back produces (a popstate for a
 * page the router still has, a pagehide or beforeunload for one it does not,
 * a navigate event where the Navigation API exists) and, when none arrives
 * within BACK_WATCH_MS, sends the visitor to the fallback. A spinner that
 * never ends is the one outcome this rules out.
 */

import { inAppDepth } from "./in-app-history"
import { fallbackHref, planBack, type BackEvidence, type BackPlan } from "./back-plan"

/** How long a real back has to show itself before the fallback is used. */
export const BACK_WATCH_MS = 900

/**
 * ===========================================================================
 *  ONE BACK PER PRESS, HOWEVER MANY TIMES THE FINGER LANDS
 * ===========================================================================
 * A double tap on a back arrow was two `history.back()` calls: the first
 * landed on the page behind (a page the router keeps answers in a frame or
 * two), the second tap then hit that page's own back, or the same control
 * still on its way out, and the visitor went back twice, past the page they
 * wanted. So a back that is on its way holds every other one: until it has
 * shown itself (or given up for the fallback), and for at least
 * BACK_HOLD_MS from the press, which is longer than any double tap and
 * shorter than a deliberate second back. Shared by every control that goes
 * back through here: the header arrows, the profile bar's chevron next to
 * the avatar, a ReturnLink, the app's own back handler.
 */
export const BACK_HOLD_MS = 400

let backPending = false
let backStartedAt = -Infinity

/*
  AND A BACK THAT IS A PUSH HOLDS UNTIL IT HAS LEFT (round 11). With nothing
  of ours behind, "back" is a push to the fallback (the creator's page, the
  profile), a server render that can take a second or two. BACK_HOLD_MS
  covered only the first 400ms of it, so a second tap landing later (a slow
  phone, filmed at 4x CPU: the second tap of a double tap reached the page
  after the hold) pushed the page a second time, and the next Back then
  needed two presses. So a push holds every other back for as long as this
  page is still the one on screen, up to PUSH_HOLD_MS.
*/
export const PUSH_HOLD_MS = 3000
let pushedFrom: string | null = null
let pushedAt = -Infinity

function pushStillLeaving(now: number): boolean {
  if (pushedFrom === null || typeof window === "undefined") return false
  if (window.location.pathname !== pushedFrom || now - pushedAt >= PUSH_HOLD_MS) {
    pushedFrom = null
    return false
  }
  return true
}

/** A back from here is on its way, so another press is the same press. */
export function backInFlight(now: number = Date.now()): boolean {
  return backPending || now - backStartedAt < BACK_HOLD_MS || pushStillLeaving(now)
}

/**
 * A back that has to be a push (nothing of ours behind, or a page behind that
 * must not be gone back to): once, however many times the finger lands,
 * until this page has gone. Returns whether it pushed.
 */
export function pushBackOnce(href: string, navigate: (href: string) => void): boolean {
  if (typeof window !== "undefined") {
    const now = Date.now()
    if (backInFlight(now)) return false
    backStartedAt = now
    pushedFrom = window.location.pathname
    pushedAt = now
    swallowEchoClicks()
  }
  navigate(href)
  return true
}

/**
 * AND THE SECOND TAP DOES NOT LAND ON THE PAGE BEHIND. A page the router
 * keeps comes back within a frame or two of the first tap, so the second tap
 * of a double tap lands on IT, on whatever row or card is under the finger
 * there, and opens that: back and straight forward again, measured on the
 * back probe (scripts/check-native-shell.mjs). So for BACK_HOLD_MS after a
 * back, and for LANDED_HOLD_MS after it lands (a slow second tap, seen on
 * the profile's chevron), a click anywhere is the same press and is
 * dropped. The press that started the back is already past the capture
 * phase, so it is not.
 */
/** And after the page behind has come back: a slow second tap lands on it later than BACK_HOLD_MS from the press. */
export const LANDED_HOLD_MS = 300

function swallowEchoClicks(): () => void {
  let until = Date.now() + BACK_HOLD_MS
  let timer = 0
  const eat = (e: Event) => {
    if (Date.now() > until) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  const arm = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => window.removeEventListener("click", eat, true), until - Date.now() + 50)
  }
  window.addEventListener("click", eat, true)
  arm()
  /* Called when the back lands: the hold runs on for LANDED_HOLD_MS from there. */
  return () => {
    until = Math.max(until, Date.now() + LANDED_HOLD_MS)
    arm()
  }
}

/** For tests: as if no back had ever been pressed. */
export function resetBackHold(): void {
  backPending = false
  backStartedAt = -Infinity
  pushedFrom = null
  pushedAt = -Infinity
}

type NavigationLike = { canGoBack?: boolean; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void }

function navigationApi(): NavigationLike | null {
  if (typeof window === "undefined") return null
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation
  return nav && typeof nav.canGoBack === "boolean" ? nav : null
}

export function readBackEvidence(): BackEvidence {
  if (typeof window === "undefined") {
    return { canGoBack: false, depth: 0, referrer: "", origin: "", historyLength: 1 }
  }
  const nav = navigationApi()
  return {
    canGoBack: nav ? nav.canGoBack === true : null,
    depth: inAppDepth(),
    referrer: document.referrer || "",
    origin: window.location.origin,
    historyLength: window.history.length,
  }
}

/**
 * ===========================================================================
 *  GO BACK, AND WHEN THE BACK DOES NOTHING, GO SOMEWHERE REAL
 * ===========================================================================
 * `history.back()` reports nothing when it does nothing, and there are
 * several ways for it to do nothing: an entry the browser replaced, a hash
 * entry, an editor opened straight from a link or a notification with no list
 * behind it, a web view that reports a length it cannot go back through.
 *
 * Every screen that goes back also puts something up while it waits (a
 * dimmed arrow, a spinner, a page layer held live over the page behind), and
 * a back that does nothing leaves all of it there. Filmed on the product
 * editor, the layer sat over the list under a pressed Back for the full
 * LAYER_PRESS_KEPT_MS (8s) and then came back to life on the same page.
 *
 * So a real back has to show itself: a popstate for a page the router still
 * has, a pagehide or beforeunload for one it does not, a navigate event
 * where the Navigation API exists. When none arrives within `watchMs`,
 * `fallback` runs and the screen lands on a real destination instead.
 *
 * Returns the cancel, for a screen that goes away before the watch is over.
 */
export function backThen(fallback: () => void, watchMs: number = BACK_WATCH_MS): () => void {
  if (typeof window === "undefined") {
    fallback()
    return () => {}
  }
  /* The second tap of a double tap: the first is already taking the visitor back. */
  if (backInFlight()) return () => {}
  backPending = true
  backStartedAt = Date.now()
  const landed = swallowEchoClicks()
  let settled = false
  const nav = navigationApi()
  const off = () => {
    window.removeEventListener("popstate", done)
    window.removeEventListener("pagehide", done)
    window.removeEventListener("beforeunload", done)
    nav?.removeEventListener?.("navigate", done)
  }
  function done() {
    settled = true
    backPending = false
    landed()
    off()
  }
  window.addEventListener("popstate", done)
  window.addEventListener("pagehide", done)
  window.addEventListener("beforeunload", done)
  nav?.addEventListener?.("navigate", done)
  window.history.back()
  const timer = window.setTimeout(() => {
    if (settled) return
    done()
    fallback()
  }, watchMs)
  return () => {
    if (settled) return
    done()
    window.clearTimeout(timer)
  }
}

/**
 * Go back when there is somewhere of ours to go back to, otherwise call
 * `navigate` with the creator's page. Returns the plan it followed.
 */
export function goBackOr(creatorHref: string | null | undefined, navigate: (href: string) => void): BackPlan {
  const plan = planBack(readBackEvidence(), creatorHref)
  if (plan.kind === "navigate") {
    /* The same hold as a history back, and on until the page has gone: a double tap pushes the page once. */
    pushBackOnce(plan.href, navigate)
    return plan
  }
  backThen(() => navigate(fallbackHref(creatorHref)))
  return plan
}

