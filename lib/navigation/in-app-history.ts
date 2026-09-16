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

/** A client navigation committed. */
export function noteClientNavigation() {
  depth += 1
}

/** The browser went back (or forward) through one of them. */
export function notePopNavigation() {
  depth = Math.max(0, depth - 1)
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
