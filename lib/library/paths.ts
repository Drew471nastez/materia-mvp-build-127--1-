/**
 * ===========================================================================
 *  WHERE THE LIBRARY LIVES: INSIDE THE PROFILE
 * ===========================================================================
 * The owner: "/account becomes the profile center ... The library lives
 * inside /account as subpages (/account/library, /account/library/courses,
 * ...); every old /library/* URL redirects to its new place (keep query
 * strings)". So every address of the library is written here once, and the
 * old ones are answered by app/library/[[...path]]/route.ts with the place
 * this file says they went.
 *
 * Pure, so a client component, a server route, an email template and
 * tests/account-center.test.ts all ask the same question.
 */

export const LIBRARY_HOME = "/account/library"
export const LIBRARY_COURSES = "/account/library/courses"
export const LIBRARY_MEMBERSHIPS = "/account/library/memberships"
export const LIBRARY_WISHLIST = "/account/library/wishlist"
export const LIBRARY_REVIEWS = "/account/library/reviews"
export const LIBRARY_RECEIPTS = "/account/library/receipts"
/** The communities a person is in are a pill of their profile now, not of the library. */
export const ACCOUNT_COMMUNITIES = "/account/communities"
export const ACCOUNT_SETTINGS = "/account/settings"

/** One purchase, opened from the library. */
export function libraryProductPath(productId: string): string {
  return `${LIBRARY_HOME}/products/${encodeURIComponent(productId)}`
}

/** A course's player. */
export function libraryCoursePath(courseId: string): string {
  return `${LIBRARY_COURSES}/${encodeURIComponent(courseId)}`
}

/** One membership's page. */
export function libraryMembershipPath(membershipId: string): string {
  return `${LIBRARY_MEMBERSHIPS}/${encodeURIComponent(membershipId)}`
}

/**
 * THE OLD ADDRESS, ANSWERED. Where a path under /library went, or null for
 * a path that is not the library's. Three of them were already redirects
 * of their own and go straight to the end of the chain: /library/products
 * and /library/my-downloads were the products list, and /library/settings
 * was the account's settings. Communities left the library for the profile.
 * Everything else keeps its tail: /library/courses/<id> is
 * /account/library/courses/<id>.
 */
export function legacyLibraryTarget(pathname: string): string | null {
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  if (path !== "/library" && !path.startsWith("/library/")) return null
  const rest = path.slice("/library".length)
  if (rest === "" || rest === "/products" || rest === "/my-downloads") return LIBRARY_HOME
  if (rest === "/settings" || rest.startsWith("/settings/")) return ACCOUNT_SETTINGS
  if (rest === "/communities" || rest.startsWith("/communities/")) return ACCOUNT_COMMUNITIES
  return `${LIBRARY_HOME}${rest}`
}

/** Whether a path is the library inside the profile (its lists, a purchase, a course, a membership). */
export function isLibraryPath(pathname: string | null | undefined): boolean {
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  return path === LIBRARY_HOME || path.startsWith(`${LIBRARY_HOME}/`)
}
