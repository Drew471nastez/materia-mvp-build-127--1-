/**
 * ===========================================================================
 *  SECOND SEGMENTS THE PLATFORM OWNS UNDER A CREATOR'S HANDLE
 * ===========================================================================
 * A product lives at `storelib.com/{handle}/{slug}`. The OnePage now lives at
 * `storelib.com/{handle}/links`, and a static segment beats a dynamic sibling
 * in Next's route matching — so a product slugged `links` would be shadowed
 * by it and unreachable at its own address.
 *
 * Rather than leave that as a trap, a slug that collides is given the same
 * suffix the duplicate-slug check already gives one: `links-m3k2p-a7f`. The
 * product keeps a working address, the creator sees a slug that is theirs,
 * and nothing silently 404s.
 *
 * WHY THIS IS NOT THE FRAMING LIST IN proxy.ts. That one is about FIRST
 * segments — which names cannot be creator handles. This is about SECOND
 * segments under a handle that already exists. Different question, different
 * list, and merging them would reserve `login` as a product name for no
 * reason.
 */

/** Names a product slug cannot take, because a route already answers there. */
export const RESERVED_PRODUCT_SLUGS = new Set(["links"])

export function isReservedProductSlug(slug: string): boolean {
  return RESERVED_PRODUCT_SLUGS.has(slug.trim().toLowerCase())
}

/**
 * A slug that will actually resolve.
 *
 * Returns the slug unchanged unless it is reserved, in which case it is
 * suffixed the same way a duplicate is. The suffix generator is passed in so
 * that the caller's own uniqueness scheme stays the one scheme.
 */
export function avoidReservedProductSlug(slug: string, suffix: () => string): string {
  return isReservedProductSlug(slug) ? `${slug}-${suffix()}` : slug
}
