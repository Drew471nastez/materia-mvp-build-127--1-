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
 * named here, so the dashboard, admin, checkout, sign in and every
 * creator's own site are left alone without each of them having to
 * remember to say so.
 *
 *   Explore and its categories     /explore, /explore/<category>
 *   Search                         /explore/search
 *   Library and everything in it   /library/...
 *   A receipt                      /receipt/<token>, under Library
 *   The account page               /account
 *   The wishlist                   /wishlist (a platform route of its own)
 *   A person's profile             /u/<username>, the bar stays (round 15)
 *   Inside a community             /community/<slug>/..., community aware:
 *                                  Home is the community's home, Search
 *                                  its own search, Create post in
 *                                  Library's place and Profile your
 *                                  profile in it (communityTabs below)
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

import { placeHref } from "@/lib/communities/client/places"

/** The four tabs, in the order the owner asked for. */
export const BUYER_TABS = [
  { key: "home", label: "Home", href: "/explore" },
  { key: "search", label: "Search", href: "/explore/search" },
  { key: "library", label: "Library", href: "/account/library" },
  { key: "profile", label: "Profile", href: "/account" },
] as const

/** Tab bar rows when Discover is off: Library and Profile only. */
export function buyerTabsForMarketplace(exploreMarketplaceEnabled: boolean): BuyerTab[] {
  if (exploreMarketplaceEnabled) return [...BUYER_TABS]
  return BUYER_TABS.filter((t) => t.key === "library" || t.key === "profile")
}

/** A tab's key: the four above, and Create post, which stands in Library's place inside a community. */
export type BuyerTabKey = (typeof BUYER_TABS)[number]["key"] | "compose"
export type BuyerTab = { key: BuyerTabKey; label: string; href: string }

/** Where a signed out person's Profile tab goes: sign in, then their account. */
export const SIGNED_OUT_PROFILE_HREF = "/login?next=%2Faccount"

/**
 * ===========================================================================
 *  INSIDE A COMMUNITY THE BAR IS THE COMMUNITY'S
 * ===========================================================================
 * "On phones inside a community the buyer bottom tab bar is shown and becomes
 * community aware: Home goes to that community's home, Search opens the
 * community search, Library and Profile stay global."
 *
 * The community is read from the address, so the bar is right on the first
 * frame of every page in it. /community alone (the list of communities) is
 * not inside one, and keeps no bar, as before. All four tabs are there with
 * Discover switched off too: Home and Search here are the community's, not
 * Discover's.
 */
const COMMUNITY_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** The slug of the community this address is inside, or null. */
export function communityOf(pathname: string): string | null {
  const m = /^\/community\/([^/?#]+)(?:[/?#]|$)/.exec(pathname)
  return m && COMMUNITY_SLUG.test(m[1]) ? m[1] : null
}

/** A person's own profile inside a community: the community's address with ?profile=me (lib/communities/client/places.ts). */
export function communityProfileHref(slug: string): string {
  return placeHref(slug, { kind: "profile", ref: "me" })
}

/**
 * ROUND 15, THE OWNER: "when someone is inside of a community the navigation
 * bottom bar doesn't have the library icon there. Inside of a community,
 * replace Library with Create post." So inside a community the four are its
 * home (the community's feed), its search, Create post (the composer, asked
 * for through lib/communities/client/compose-intent.ts) and Profile, which is
 * the person's own profile inside this community rather than the account.
 *
 * OUTSIDE ONE, WITH A COMMUNITY KEPT AS HOME (the context, below), only Home
 * is the community's: Library and Profile are the site's again, because the
 * page you are on is the site's.
 */
export function communityTabs(slug: string, inside = true): BuyerTab[] {
  return BUYER_TABS.map((t): BuyerTab => {
    if (t.key === "home") return { ...t, href: `/community/${slug}` }
    if (!inside) return t
    if (t.key === "library") return { key: "compose", label: "Create post", href: `/community/${slug}` }
    if (t.key === "profile") return { ...t, href: communityProfileHref(slug) }
    return t
  })
}

/**
 * The tabs for this address: the community's inside one, else as Discover allows.
 *
 * THE COMMUNITY CONTEXT (round 12). Outside a community, `homeCommunity` is
 * the one the person was last inside (lib/nav/community-context.ts): Home
 * still leads back to it from Profile, Library or Search, until the
 * navigator's Explore, Discover communities or Dashboard ends it. Only Home
 * changes; Search outside a community is the site's.
 */
export function buyerTabsAt(pathname: string, exploreMarketplaceEnabled = true, homeCommunity: string | null = null): BuyerTab[] {
  const inside = communityOf(pathname)
  if (inside) return communityTabs(inside, true)
  /* With Discover off the bar outside a community is Library and Profile alone (no Home to keep), so the context waits for inside. */
  const kept = exploreMarketplaceEnabled && homeCommunity && COMMUNITY_SLUG.test(homeCommunity) ? homeCommunity : null
  return kept ? communityTabs(kept, false) : buyerTabsForMarketplace(exploreMarketplaceEnabled)
}

/** The search screen's own address. A static route under /explore, so no new root word is taken from creators' handles. */
export const SEARCH_HREF = "/explore/search"

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

/** Storelib's own buyer pages, by address alone. */
export function isBuyerPath(pathname: string, exploreMarketplaceEnabled = true): boolean {
  return (
    (exploreMarketplaceEnabled && under(pathname, "/explore")) ||
    under(pathname, "/account/library") ||
    under(pathname, "/account") ||
    (exploreMarketplaceEnabled && under(pathname, "/wishlist")) ||
    /* A person's profile (/u/<username>), opened from a community, Explore or a post: the bar stays, as on a creator's page (round 15). */
    /^\/u\/[^/]+\/?$/.test(pathname)
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
  where: {
    sellerSurface?: boolean
    sellerProduct?: boolean
    sellerStore?: boolean
    sellerSite?: boolean
    customDomain?: boolean
    exploreMarketplaceEnabled?: boolean
    /** False on a phone browser: a visitor reads About/join without Storelib's tab bar over it. */
    signedIn?: boolean
  } = {},
): boolean {
  const exploreOn = where.exploreMarketplaceEnabled !== false
  if (where.customDomain) return false
  /* /account/continue is a redirect, never a page anybody sees. */
  if (under(pathname, "/account/continue")) return false
  if (where.sellerSite) return false
  /* Inside a community, the bar for signed-in members only; visitors keep the join page clear. */
  if (communityOf(pathname)) return where.signedIn !== false
  if (under(pathname, "/community")) return false
  if (where.sellerProduct) return false
  if (where.sellerStore) return true
  /*
    A RECEIPT HAS THE BAR. Somebody who has just bought something in the app
    was left on the receipt with nothing around it (image 64): no header, no
    tab bar, no way back. It is one of their own pages now, under Library,
    where everything they bought lives (app/receipt/layout.tsx).
  */
  if (under(pathname, "/receipt")) return true
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
  where: { query?: boolean; sellerSurface?: boolean; exploreMarketplaceEnabled?: boolean; homeCommunity?: string | null; profile?: string | null } = {},
): number {
  const exploreOn = where.exploreMarketplaceEnabled !== false
  /*
    Every page of a community is that community's Home, the way a product
    reached from Explore is still Home; except your own profile in it
    (?profile=me), which is the Profile tab's. Create post is never lit: it
    opens a screen over the page, it is not a page.
  */
  if (communityOf(pathname)) return where.profile === "me" ? 3 : 0
  /* While Home is a community's (the context), Explore's own pages are not Home: nothing is lit there but Search's results. */
  if (where.homeCommunity && exploreOn && under(pathname, "/explore") && !under(pathname, SEARCH_HREF) && !where.query) return -1
  /* And a creator's page reached from there is not the community's Home either. */
  if (where.homeCommunity && exploreOn && where.sellerSurface) return -1
  const tabs = buyerTabsForMarketplace(exploreOn)
  const idx = (key: BuyerTabKey) => tabs.findIndex((t) => t.key === key)

  if (exploreOn) {
    if (under(pathname, SEARCH_HREF)) return 1
    if (under(pathname, "/explore")) return where.query ? 1 : 0
    if (under(pathname, "/account/library") || under(pathname, "/wishlist") || under(pathname, "/receipt")) return 2
    if (under(pathname, "/account")) return 3
    if (where.sellerSurface) return 0
    return -1
  }

  if (under(pathname, "/account/library") || under(pathname, "/wishlist") || under(pathname, "/receipt")) return idx("library")
  if (under(pathname, "/account")) return idx("profile")
  return -1
}

/**
 * ===========================================================================
 *  HOME IS DISCOVER AS YOU LEFT IT
 * ===========================================================================
 * Round 15, the owner: "when I go from a Library page back to the Discover
 * page, it flashes too much and reloads and flips the thing with communities
 * and digital products there, which doesn't make any sense."
 *
 * Discover shows products or communities, and which one you chose is kept in
 * a cookie (lib/explore/discover-mode-cookie.ts) and, while you are on it, in
 * the address (?type=). Home was the bare /explore. The router keeps a page it
 * has drawn for staleTimes (next.config.mjs), and the bare /explore it kept
 * had been drawn with whichever mode the cookie said THEN: choose communities,
 * go to the Library, press Home, and the kept page came back in products, then
 * put itself right once the page was asked again. That is the flip.
 *
 * So Home carries the mode in its address, as Discover's own switcher writes
 * it: the router keeps one page per mode, each drawn in its own mode, and the
 * one Home opens is the one you left.
 */
export function discoverHomeHref(mode: string | null | undefined): string {
  return mode === "communities" || mode === "products" ? `/explore?type=${mode}` : "/explore"
}

/** The mode Discover was left in, from the cookie Discover writes. Null on the server, or when it was never chosen. */
export function discoverModeFromCookie(cookie: string | null | undefined): "products" | "communities" | null {
  const m = /(?:^|;\s*)storelib_discover_mode=(products|communities)(?:;|$)/.exec(cookie || "")
  return m ? (m[1] as "products" | "communities") : null
}

