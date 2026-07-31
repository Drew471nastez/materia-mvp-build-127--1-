/**
 * Where a listing lives, and where you came from.
 *
 * One relative path — /products/<slug> — rather than the old subdomain-or-/p/
 * routing. Relative means Next can client-navigate it, which is what makes the
 * tap feel instant: no full document load, and the route is prefetched on hover
 * or as the card scrolls near.
 *
 * `origin` records the surface the tap came from. It is the whole basis of
 * "take me back to where I was": the back button reads it to decide where to
 * return to, and it doubles as attribution for which surfaces actually convert.
 */

export type ListingOrigin =
  | "feed"
  | "reels"
  | "search"
  | "profile"
  | "wishlist"
  | "following"
  | "category"
  | "direct"

export function getListingUrl(slug: string, origin: ListingOrigin = "direct"): string {
  if (!slug) return "/"
  const path = `/products/${encodeURIComponent(slug)}`
  return origin === "direct" ? path : `${path}?origin=${origin}`
}

/** Where the back arrow should go for a given origin. */
export function backHrefFor(origin: string | null | undefined): string {
  switch (origin) {
    case "wishlist":
      return "/wishlist"
    case "following":
    case "reels":
    case "feed":
    case "category":
    case "search":
    default:
      return "/"
  }
}
