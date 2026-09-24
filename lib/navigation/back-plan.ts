/**
 * ===========================================================================
 *  BACK, OR TO THE CREATOR'S PAGE
 * ===========================================================================
 * "Sometimes when I'm on a creator page product and click the back icon, but
 * there is no other point to go back to, it loads forever. If there is no
 * point to go back to at all, it should take me to the creator page of that
 * product."
 *
 * A back arrow on a product page has two honest answers and one dishonest
 * one. If this tab came here from another page of ours, go back to it: it is
 * instant and it restores the scroll. If it did not (a shared link, a search
 * result, a fresh tab), go to the creator's page, which is where the product
 * belongs. The dishonest answer is `history.back()` with nothing behind it:
 * the browser does nothing, the arrow turns into a spinner, and the page
 * "loads forever".
 *
 * This file is the decision and nothing else: no window, no router, so the
 * rules can be tested as they are written.
 *
 * THE EVIDENCE, BEST FIRST.
 *
 *   `navigation.canGoBack`, from the Navigation API, where the browser has it
 *   (Chromium, and Safari and Firefox in their current releases). It is the
 *   browser's own answer to exactly this question, counting only entries of
 *   this origin in this tab, so it wins whenever it is there: a `true` goes
 *   back and a `false` never does, whatever else is claimed.
 *
 *   Otherwise the app's own count of client navigations in this document
 *   (lib/navigation/in-app-history), which a pushed route raises.
 *
 *   Otherwise a same-origin referrer AND a history longer than this one entry:
 *   a hard load from another page of ours in the same tab. The referrer alone
 *   is not enough, because a link opened in a new tab carries a referrer and
 *   has nothing behind it.
 *
 * Anything short of that navigates.
 */

import { getStoreInternalPath } from "@/lib/url-helpers"

export interface BackEvidence {
  /** `navigation.canGoBack` where the Navigation API exists, otherwise null. */
  canGoBack: boolean | null
  /** Client navigations this document has made, less the ones a back undid. */
  depth: number
  /** `document.referrer`, or "" when there is none. */
  referrer: string
  /** `location.origin`. */
  origin: string
  /** `history.length`. */
  historyLength: number
}

export type BackPlan = { kind: "history" } | { kind: "navigate"; href: string }

/** Where a product with no known creator sends its visitor. */
export const NO_CREATOR_HREF = "/explore"

/** The same sanitising getStoreUrl does, so a handle cannot carry a path. */
function sanitiseHandle(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * The creator's page for a username: `/<handle>` on the main domain, relative
 * so it works on a subdomain, a custom domain and in the app alike. "#" when
 * there is no username, which fallbackHref turns into NO_CREATOR_HREF.
 *
 * Only ever the username: a UUID makes an address that always 404s, and a
 * display name sanitised into a handle may be somebody else's.
 *
 * Here rather than in the product bar because the product page, a server
 * component, needs it too, and a function exported from a "use client" file
 * cannot be called on the server.
 */
export function creatorPageHref(username?: string | null): string {
  const handle = sanitiseHandle((username ?? "").toString())
  return handle ? getStoreInternalPath(handle) : "#"
}

/** The fallback, made safe: a relative path of ours, never "#" or nothing. */
export function fallbackHref(href: string | null | undefined): string {
  const h = (href ?? "").trim()
  if (!h || h === "#" || !h.startsWith("/") || h.startsWith("//")) return NO_CREATOR_HREF
  return h
}

function sameOrigin(referrer: string, origin: string): boolean {
  if (!referrer) return false
  try {
    return new URL(referrer).origin === origin
  } catch {
    return false
  }
}

export function planBack(e: BackEvidence, creatorHref: string | null | undefined): BackPlan {
  const navigate: BackPlan = { kind: "navigate", href: fallbackHref(creatorHref) }
  if (e.canGoBack === true) return { kind: "history" }
  if (e.canGoBack === false) return navigate
  if (e.depth > 0) return { kind: "history" }
  if (sameOrigin(e.referrer, e.origin) && e.historyLength > 1) return { kind: "history" }
  return navigate
}

/**
 * A press the browser should handle itself: another button, or a modifier
 * that means "new tab", "new window" or "download". The link's href does
 * the right thing for all of those.
 */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}
