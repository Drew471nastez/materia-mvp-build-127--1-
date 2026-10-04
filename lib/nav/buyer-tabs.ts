/**
 * ===========================================================================
 *  WHERE THE BUYER'S TAB BAR IS, AND WHICH TAB A PAGE BELONGS TO
 * ===========================================================================
 * The phone's bar on the buyer's side of storelib.com (components/nav/
 * buyer-tab-bar.tsx): Home, Search, Library and the person's own avatar, in
 * that order. Pure functions, so tests/buyer-tab-bar.test.ts can ask them
 * about every address without a browser.
 *
 * IT IS ON STORELIB'S OWN BUYER PAGES AND NOWHERE ELSE. An allow list, not a
 * block list: a new route of the platform does not grow a tab bar until it is
 * named here, so the dashboard, admin, checkout, sign in, a receipt opened
 * from an email and every creator's own site are left alone without each of
 * them having to remember to say so.
 *
 *   Explore and its categories     /explore, /explore/<category>
 *   Search                         /explore/search
 *   Library and everything in it   /library/...
 *   The account page               /account
 *   The wishlist                   /wishlist (a platform route of its own)
 *   A product or creator page      never. It is somebody's shop, and the
 *                                  page's own buy bar already stands at the
 *                                  foot of it; a second bar under that is
 *                                  two rows of somebody else's navigation
 *                                  over the thing being sold. The platform
 *                                  header stays, so the way back to Storelib
 *                                  is still there.
 *
 * The homepage is not on the list. It is the page that sells Storelib to
 * sellers, with its own calls to action, and the native app never shows it.
 */

/** The four tabs, in the order the owner asked for. */
export const BUYER_TABS = [
  { key: "home", label: "Home", href: "/explore" },
  { key: "search", label: "Search", href: "/explore/search" },
  { key: "library", label: "Library", href: "/account/library" },
  { key: "profile", label: "Profile", href: "/account" },
] as const

/** Tab bar rows when Discover is off: Library and Profile only. */
export function buyerTabsForMarketplace(exploreMarketplaceEnabled: boolean) {
  if (exploreMarketplaceEnabled) return [...BUYER_TABS]
  return BUYER_TABS.filter((t) => t.key === "library" || t.key === "profile")
}

export type BuyerTabKey = (typeof BUYER_TABS)[number]["key"]

/** Where a signed out person's Profile tab goes: sign in, then their account. */
export const SIGNED_OUT_PROFILE_HREF = "/login?next=%2Faccount"

/** The search screen's own address. A static route under /explore, so no new root word is taken from creators' handles. */
export const SEARCH_HREF = "/explore/search"

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

/** Storelib's own buyer pages, by address alone. */
export function isBuyerPath(pathname: string, exploreMarketplaceEnabled = true): boolean {
  return (
    (exploreMarketplaceEnabled && under(pathname, "/explore")) ||
    under(pathname, "/account/library") ||
    under(pathname, "/account") ||
    (exploreMarketplaceEnabled && under(pathname, "/wishlist"))
  )
}

/**
 * Whether the bar belongs on this page.
 *
 * A CREATOR'S STORE PAGE KEEPS THE BAR; THEIR PRODUCT DOES NOT. It was taken
 * off both, because on a product the page's own buy bar already stands at
 * the foot of it and a second row under that is two navigations stacked over
 * the thing being sold. But a creator's store page has no buy bar, and
 * opening one from the library then left no way back to it. So:
 *
 *   sellerProduct   a product, however its address is spelled. Never the
 *                   bar: the buy bar is already there.
 *   sellerStore     a creator's own page, on storelib.com. The bar, so the
 *                   library and Explore stay one press away.
 *   sellerSite      their subdomain. That is their site rather than
 *                   Storelib browsing, so nothing of ours goes over it.
 *   customDomain    their own domain, where none of this is drawn at all.
 */
export function buyerTabsBelongOn(
  pathname: string,
  /* `sellerSurface` is taken but not read here: it is what lights Home on the bar
     (buyerTabFor below), and callers hand this the whole answer from useBuyerTabsWhere. */
  where: { sellerSurface?: boolean; sellerProduct?: boolean; sellerStore?: boolean; sellerSite?: boolean; customDomain?: boolean; exploreMarketplaceEnabled?: boolean } = {},
): boolean {
  const exploreOn = where.exploreMarketplaceEnabled !== false
  if (where.customDomain) return false
  /* /account/continue is a redirect, never a page anybody sees. */
  if (under(pathname, "/account/continue")) return false
  /* A COMMUNITY IS SOMEBODY'S COMMUNITY, like a product page: it has its own
     sections to move between, so the bar never goes over it. */
  if (under(pathname, "/community")) return false
  if (where.sellerSite) return false
  if (where.sellerProduct) return false
  if (where.sellerStore) return true
  return isBuyerPath(pathname, exploreOn)
}

/**
 * The tab a page belongs to, as an index into BUYER_TABS, or -1 for none.
 *
 * Search owns its screen and the results it leads to (Explore with a query).
 * A product or creator page browsed from Explore is still Home: it is where
 * Home led, the way a phone's own tab bar keeps the tab you came through.
 */
export function buyerTabFor(
  pathname: string,
  where: { query?: boolean; sellerSurface?: boolean; exploreMarketplaceEnabled?: boolean } = {},
): number {
  const exploreOn = where.exploreMarketplaceEnabled !== false
  const tabs = buyerTabsForMarketplace(exploreOn)
  const idx = (key: BuyerTabKey) => tabs.findIndex((t) => t.key === key)

  if (exploreOn) {
    if (under(pathname, SEARCH_HREF)) return 1
    if (under(pathname, "/explore")) return where.query ? 1 : 0
    if (under(pathname, "/account/library") || under(pathname, "/wishlist")) return 2
    if (under(pathname, "/account")) return 3
    if (where.sellerSurface) return 0
    return -1
  }

  if (under(pathname, "/account/library") || under(pathname, "/wishlist")) return idx("library")
  if (under(pathname, "/account")) return idx("profile")
  return -1
}
