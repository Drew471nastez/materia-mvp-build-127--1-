import { MIN_PHOTOS } from "@/lib/marketplace/listing-taxonomy"

/**
 * ===========================================================================
 *  WHAT A LISTING NEEDS BEFORE IT IS ALLOWED ON THE FEED
 * ===========================================================================
 *
 * Three routes can put a listing in front of the public — POST /api/listings,
 * PATCH /api/listings/drafts/[id] with publish, and PATCH /api/listings/[id] —
 * and all three had their own copy of the checklist. They disagreed, so the
 * feed's entry requirements depended on which door you came through:
 *
 *   POST      photos, title, description, price, category, subcategory, brand,
 *             condition, colour and size
 *   the two   photos, title, category, condition, price
 *   PATCHes
 *
 * So publishing through a draft produced a live listing POST would have
 * refused: no brand, no size, no colour, no description. The comment above one
 * of them even claimed it applied "the same completeness rules POST does".
 *
 * They also disagreed about ZERO. POST allows a price of 0 — free is a real
 * answer and the sell form offers it — while both PATCH routes rejected
 * `<= 0`. That refusal came back as the Romanian label "preț", which the
 * client maps to a control, and then had no message to print at it: the form
 * scrolled to the price and said nothing at all.
 *
 * One list, one set of field keys, in the language the client already maps.
 */

import { asksFor } from "@/lib/marketplace/listing-taxonomy"

export type ListingDraft = {
  photos: string[]
  title: string
  description: string
  priceCents: number
  category?: unknown
  subcategory?: unknown
  brand?: unknown
  condition?: unknown
  colour?: unknown
  size?: unknown
}

/**
 * The fields standing between this and the feed, as the keys the client's
 * SERVER_FIELD_TO_GAP already knows how to walk back to a control.
 *
 * An empty array means it is ready.
 */
export function publishProblems(v: ListingDraft): string[] {
  const problems: string[] = []
  if (v.photos.length < 1) problems.push("photos")
  if (v.photos.length < MIN_PHOTOS) problems.push("photos_min")
  if (!v.title || v.title.trim().length < 3) problems.push("title")
  if (v.description.trim().length < 10) problems.push("description")
  // 0 is a price. "Free" is a real listing and the sell form offers it; only a
  // negative or non-numeric one is missing.
  if (!Number.isFinite(v.priceCents) || v.priceCents < 0) problems.push("price")
  if (!v.category) problems.push("category")
  if (!v.subcategory) problems.push("subcategory")
  if (!v.condition) problems.push("condition")
  /**
   * THE SAME THREE, ASKED ONLY WHERE THEY HAVE ANSWERS.
   *
   * These were unconditional, and the day the tree grew past clothing that
   * became a wall: a paperback cannot have a size, a Pokémon card cannot have a
   * colour, and demanding them would refuse every listing outside a wardrobe
   * with a message pointing at rows the form does not draw.
   *
   * `asksFor` is the same function the form gates its rows on, so the two
   * cannot drift — a field the seller was never shown can never be the reason
   * their listing is rejected.
   */
  const groupId = typeof v.category === "string" ? v.category : null
  if (asksFor(groupId, "brand") && !v.brand) problems.push("brand")
  if (asksFor(groupId, "colour") && !v.colour) problems.push("colour")
  if (asksFor(groupId, "size") && !v.size) problems.push("size")
  // NO compare-at rule any more, and its removal is not only tidying. The
  // field is gone from the sell form, so a listing stored with a compare-at
  // below its price would have been refused for a reason with no control left
  // to fix it at — unpublishable, permanently, over a number nobody can see.
  return problems
}

/** A draft only has to be SOMETHING. One thing is enough to make it worth
 *  keeping; below that it is not a half-written listing, it is an empty one. */
export function draftProblems(v: Pick<ListingDraft, "photos" | "title">): string[] {
  return v.photos.length < 1 && !v.title.trim() ? ["empty"] : []
}
