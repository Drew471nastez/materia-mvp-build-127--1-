"use client"

/**
 * ===========================================================================
 *  IS THERE ONE OF OUR OWN PAGES BEHIND THIS ONE
 * ===========================================================================
 * The product page's back arrow has to choose between two things that look
 * the same and are not:
 *
 *   `history.back()` returns to a page the router still has. It is instant,
 *   it restores the scroll position, and it does not ask the server for
 *   anything.
 *
 *   `router.push(creatorHref)` fetches the creator page from scratch. On a
 *   cold route that was measured at 2.0 to 3.5 seconds against production —
 *   long enough that the arrow appears not to have worked, which is why it
 *   was being pressed twice.
 *
 * The control was choosing between them with `document.referrer`, and that is
 * the wrong instrument. A referrer describes how the DOCUMENT was fetched.
 * Storelib navigates on the client: pressing a product card on a creator page
 * does not fetch a document, so the referrer still describes whatever loaded
 * the tab — usually nothing at all, because most visits start from a shared
 * link or a search result. So the common visit, the one where there is a
 * perfectly good creator page one entry behind, took the slow path every
 * single time.
 *
 * What is actually being asked is "has this document navigated since it
 * loaded", and only the app can answer that. So the app counts.
 *
 * WHAT IT DOES NOT TRY TO DO. This counts pushes and subtracts pops, which is
 * right for going back but cannot tell a forward pop from a backward one — go
 * back and then forward again and the count is one too low. That resolves to
 * `router.push`, which is the behaviour this replaces, so the worst case is
 * the old behaviour on a rare gesture rather than a wrong destination.
 */

/** Client navigations this document has made, less those a back undid. */
let depth = 0

/**
 * ===========================================================================
 *  AND WHICH PAGE IS BEHIND THIS ONE
 * ===========================================================================
 * `depth` answers "is there one of ours back there". It does not answer "is
 * it THAT one", and a control that says "Back to product" is making the
 * second claim.
 *
 * Getting that wrong is what produced the bug this was written for. The
 * checkout's "Back to product" was a plain `<a href>`, so it PUSHED the
 * product page instead of returning to it, and history went
 *
 *     explore -> product -> checkout -> product
 *
 * Measured on production by reading history.length at each step: 2, 3, 4, 5.
 * A real back leaves the length alone; the fourth entry is the push. The
 * product page's own arrow then did its job perfectly and popped to the
 * checkout, which is what was reported as the arrow being broken.
 *
 * So the paths are kept as well as counted. The browser will not let anyone
 * read its history entries, but this document knows every navigation it made
 * because the tracker tells it.
 */
const trail: string[] = []
/** Long enough for any real journey, short enough to never be a leak. */
const TRAIL_LIMIT = 50

/** A client navigation committed. `from` is the path it left, when known. */
export function noteClientNavigation(from?: string) {
  depth += 1
  if (from) {
    trail.push(from)
    if (trail.length > TRAIL_LIMIT) trail.shift()
  }
}

/** The browser went back (or forward) through one of them. */
export function notePopNavigation() {
  depth = Math.max(0, depth - 1)
  trail.pop()
}

/** The path this document was on before the current one, if it knows. */
export function previousPath(): string | null {
  return trail.length ? trail[trail.length - 1] : null
}

/** The paths behind the current one, oldest first, as far as this document knows. */
export function recentPaths(): string[] {
  return trail.slice(-5)
}

/**
 * True when `history.back()` would land on exactly `href`.
 *
 * This is the question a "Back to <somewhere named>" control has to ask, and
 * the reason it is a different function from canReturnInApp: returning to a
 * page of ours and returning to THE page named on the button are not the same
 * claim, and only the second one justifies pressing back.
 *
 * On a hard load the trail is empty — this document has made no navigations —
 * and the referrer is then the only evidence there is. It is reliable in
 * exactly that case, because a hard load is the one case where the browser
 * actually sets it.
 */
export function canReturnTo(href: string): boolean {
  if (typeof window === "undefined") return false
  if (!canReturnInApp()) return false
  let target: string
  try {
    target = new URL(href, window.location.href).pathname
  } catch {
    return false
  }
  const prev = previousPath()
  if (prev !== null) return prev === target
  try {
    const ref = new URL(document.referrer)
    return ref.origin === window.location.origin && ref.pathname === target
  } catch {
    return false
  }
}

/**
 * The query this document was loaded with. Read once, when this module is
 * first evaluated, which is the root layout's tracker hydrating on the
 * page the visit landed on: after a client navigation the address says
 * where the visitor is now, and a link's utm tags were on where they came
 * in. Memory only, gone with the tab. Read by lib/orders/checkout-origin.
 */
const landing = typeof window !== "undefined" ? window.location.search : ""

export function landingSearch(): string {
  return landing
}

/** For tests and probes: what the count is now. */
export function inAppDepth(): number {
  return depth
}

/** A hard load that came from another page of ours, which history can return to. */
function cameFromOurOwnDocument(): boolean {
  if (typeof window === "undefined") return false
  const referrer = document.referrer
  if (!referrer) return false
  try {
    return new URL(referrer).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * True when `history.back()` lands on a Storelib page rather than on a search
 * result, a message, or an empty tab.
 */
export function canReturnInApp(): boolean {
  if (typeof window === "undefined") return false
  if (depth > 0) return true
  return cameFromOurOwnDocument() && window.history.length > 1
}
