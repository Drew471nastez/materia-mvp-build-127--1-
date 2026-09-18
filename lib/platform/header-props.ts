import "server-only"

import { cookies, headers } from "next/headers"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"

/**
 * ===========================================================================
 *  THE TWO THINGS THE PLATFORM HEADER NEEDS FROM THE SERVER
 * ===========================================================================
 * Both of these lived inside app/(marketing)/layout, which was fine while the
 * marketing tree was the only one that drew the header. /library draws it now
 * too, and a second copy of a function is a second thing to remember when the
 * first one changes.
 */

/**
 * The wishlist badge's number, from the cookie the client keeps in step.
 * Server-rendered so the badge is right in the first paint rather than
 * appearing a moment later.
 */
export async function readWishlistCount(): Promise<number> {
  try {
    const store = await cookies()
    const raw = store.get("storelib_wishlist_count")?.value
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : 0
  } catch {
    /* cookies() throws outside a request scope (static render): no badge,
       which is what this rendered before it existed. */
    return 0
  }
}

/**
 * Is this request on the platform's own domain, rather than a seller
 * subdomain or a custom domain?
 *
 * Only the server can answer this at render time — the client has to wait for
 * an effect to read window.location — and it is what lets a page draw its
 * header in the first paint instead of after hydration.
 */
export async function isPlatformDomain(): Promise<boolean> {
  try {
    const host = (await headers()).get("host") || ""
    if (!host) return false
    return extractUsernameFromHost(host) === null && !isCustomDomain(host)
  } catch {
    /* Outside a request scope: fall back to the client deciding after mount. */
    return false
  }
}
