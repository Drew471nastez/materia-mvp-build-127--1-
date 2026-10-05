/**
 * THE ADDRESSES A COMMUNITY'S PUBLIC SIDE LINKS TO, spelled once. Pure and
 * browser safe: the server builds them into the page data, and the join card
 * and the probe read the same functions.
 */

/** storelib.com/community/<slug>, as a path. */
export function communityPath(slug: string): string {
  return `/community/${slug}`
}

/** Where a paid join lands after checkout: the community, with a welcome. */
export function welcomePath(slug: string): string {
  return `${communityPath(slug)}?welcome=1`
}

/**
 * The existing checkout for the product that sells a tier. A recurring tier
 * opens the membership checkout on the interval asked for; `return` is read
 * back on the server (app/checkout/page.tsx) and honoured only when it is
 * this product's own community.
 */
export function checkoutPath(productId: string, slug: string, interval?: "month" | "year" | null): string {
  const q = new URLSearchParams({ productId })
  if (interval) q.set("interval", interval)
  q.set("return", welcomePath(slug))
  return `/checkout?${q.toString()}`
}

/** Sign in, then back to the community with the join picked up again (?join=1). */
export function signInToJoinPath(slug: string): string {
  return `/login?next=${encodeURIComponent(`${communityPath(slug)}?join=1`)}`
}

/** Set as the member's frame is asked for after a join: the frame says "Welcome to <name>" once, and forgets it (round 12). */
export const JOINED_KEY = "storelib:community-joined"
