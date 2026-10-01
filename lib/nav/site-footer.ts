/**
 * ===========================================================================
 *  WHERE THE BLACK SITE FOOTER IS, BY WHO IS LOOKING
 * ===========================================================================
 * "On /explore and the other pages that have the bottom tab bar on phones,
 * do not show the black site footer. The black footer shows only on the
 * storelib.com homepage and marketing pages, and on /explore only when the
 * user is not logged in. Desktop: keep it on marketing pages and logged out
 * explore; drop it on library and account pages."
 *
 *   The marketing pages       always: it is where a visitor finds pricing,
 *                             the legal pages and the way to sell.
 *   Explore and /wishlist     only for somebody signed out, for whom Explore
 *                             is a front door like the homepage. Signed in,
 *                             Explore is a place to shop and the tab bar is
 *                             how you move on from it.
 *   Search (/explore/search)  never: it is a screen, not a page.
 *   The library, the account  never, at any width: somebody's own things.
 *
 * Asked by components/marketing/conditional-footer.tsx after it has ruled
 * out a creator's own site and the native app; that list of Storelib's own
 * pages stays there. Pure, so tests/site-footer.test.ts can ask it about
 * every address.
 */

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

/** Storelib's own pages the footer is never on, whoever is looking. */
export function isFooterlessPage(pathname: string): boolean {
  return under(pathname, "/library") || under(pathname, "/account") || under(pathname, "/explore/search")
}

/** Pages that are a front door when signed out and a place to shop when signed in. */
export function isShopPage(pathname: string): boolean {
  return under(pathname, "/explore") || under(pathname, "/wishlist")
}

/** Explore catalogue and category pages — not the full-screen search route. */
export function isExploreBrowsePage(pathname: string): boolean {
  return under(pathname, "/explore") && !under(pathname, "/explore/search")
}

/**
 * Whether a page of Storelib's own that has the footer at all keeps it for
 * this visitor. `signedIn` is the header's record of the session (lib/auth/
 * auth-snapshot), the same one the tab bar reads.
 */
export function siteFooterFor(pathname: string, who: { signedIn: boolean }): boolean {
  if (isFooterlessPage(pathname)) return false
  if (isShopPage(pathname)) return !who.signedIn
  return true
}
