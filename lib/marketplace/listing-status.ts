/**
 * ===========================================================================
 *  THE STATES A LISTING CAN BE IN, AND WHO CAN SEE EACH ONE
 * ===========================================================================
 *
 * `products.status` is free text, which is why this file exists: the moment a
 * fourth and fifth state appeared (`archived`, `reserved`) the answer to "which
 * of these does the feed show" was being spelled out again at every call site,
 * and the one that got it wrong would leak an unpublished listing into public
 * view or hide a seller's own work from them.
 *
 *   draft       started, never published. Only its owner has ever seen it.
 *   published   on the feed.
 *   reserved    promised to someone. Still readable — the buyer it is being
 *               held for has the link — but off the feed, because a listing you
 *               cannot have is noise in a grid you are shopping.
 *   archived    taken down by its owner. Still theirs, off the feed.
 *   sold        gone. Terminal: the page stays because it is in somebody's
 *               receipt, and one physical object cannot be sold twice.
 *
 * PUBLIC_FEED is the allowlist. Everything else is between a seller and their
 * own shelf.
 */

export const LISTING_STATUSES = ["draft", "published", "reserved", "archived", "sold"] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

/** What a stranger's query may return. One entry, on purpose. */
export const PUBLIC_FEED: ListingStatus[] = ["published"]

/** What a listing PAGE may render. Wider than the feed by two, and each for a
 *  reason: a sold listing is in the buyer's receipt and the seller's history,
 *  and a reserved one is being held for somebody who has the link. */
export const PUBLIC_PAGE: ListingStatus[] = ["published", "sold", "reserved"]

/** What you see on your own shelf: everything you have ever made. */
export const OWNER_SHELF: ListingStatus[] = ["published", "reserved", "archived", "draft", "sold"]

/** The states this account may still edit or move between. `sold` is not one:
 *  changing a sold listing rewrites what somebody already bought. */
export const EDITABLE_STATUSES: ListingStatus[] = ["published", "draft", "archived", "reserved"]

export type StatusBadge = { label: string; tone: "neutral" | "warning" | "muted" }

/**
 * The mark on an owner's card, or null when there is nothing to say.
 *
 * `published` gets nothing: it is the ordinary case, and a badge on every card
 * is a badge on none of them.
 */
export function ownerStatusBadge(status: string | null | undefined): StatusBadge | null {
  switch (status) {
    case "draft":
      return { label: "Ciornă", tone: "warning" }
    case "reserved":
      return { label: "Rezervat", tone: "warning" }
    case "archived":
      return { label: "Arhivat", tone: "muted" }
    case "sold":
      return { label: "Vândut", tone: "neutral" }
    default:
      return null
  }
}

/**
 * Where an owner's card goes.
 *
 * Keyed off PUBLIC_PAGE rather than off the single string "draft", because
 * `archived` has exactly the same problem and only one of the two was handled:
 * the listing route calls notFound() for ANY status it will not render, so an
 * archived card — on the one shelf that exists to make archived listings
 * reachable again — linked straight to a 404.
 *
 * Anything the page refuses opens the form instead, which is the screen that
 * can actually do something about it. Drafts go through the drafts route,
 * because that is the one scoped to drafts and the one that knows how to
 * publish from there.
 */
export function ownerListingHref(listing: { slug: string; id: string; status?: string | null }): string {
  if (PUBLIC_PAGE.includes(listing.status as ListingStatus)) return `/products/${listing.slug}`
  const key = listing.status === "draft" ? "draft" : "edit"
  return `/products/new?${key}=${encodeURIComponent(listing.id)}`
}
