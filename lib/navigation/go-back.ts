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
 * Go back when there is somewhere of ours to go back to, otherwise call
 * `navigate` with the creator's page. Returns the plan it followed.
 */
export function goBackOr(creatorHref: string | null | undefined, navigate: (href: string) => void): BackPlan {
  const plan = planBack(readBackEvidence(), creatorHref)
  if (plan.kind === "navigate") {
    navigate(plan.href)
    return plan
  }

  let settled = false
  const nav = navigationApi()
  const done = () => {
    settled = true
    window.removeEventListener("popstate", done)
    window.removeEventListener("pagehide", done)
    window.removeEventListener("beforeunload", done)
    nav?.removeEventListener?.("navigate", done)
  }
  window.addEventListener("popstate", done)
  window.addEventListener("pagehide", done)
  window.addEventListener("beforeunload", done)
  nav?.addEventListener?.("navigate", done)
  window.history.back()
  window.setTimeout(() => {
    if (settled) return
    done()
    navigate(fallbackHref(creatorHref))
  }, BACK_WATCH_MS)
  return plan
}

