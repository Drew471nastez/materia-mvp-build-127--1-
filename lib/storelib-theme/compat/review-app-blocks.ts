/**
 * ===========================================================================
 *  STORELIB REVIEWS' OWN APP BLOCKS, FOR AN IMPORTED THEME
 * ===========================================================================
 * On Shopify a reviews app gives a theme two blocks, a star rating and the
 * reviews, which any section whose schema takes `{ "type": "@app" }` lists
 * under Apps in Add block: Dawn's main product and featured product, and
 * Horizon's product information, product details and group. Storelib
 * Reviews gives the same two, kept on the page as Shopify keeps an app's
 * block, by its address:
 *
 *   shopify://apps/storelib-reviews/blocks/star-rating/storelib
 *   shopify://apps/storelib-reviews/blocks/reviews/storelib
 *
 * so everything an imported theme already does with an app block applies to
 * them unchanged: `block.type` reads "@app" (Dawn's `when '@app'` renders
 * it), Horizon's {% content_for 'blocks' %} draws it, and Storelib draws it
 * in its place (./storelib-reviews.ts), as it draws a Judge.me block the
 * theme kept from Shopify.
 *
 * This file is only the names and the panel's settings, so the builder's
 * sidebar (lib/website-builder/storelib-schemas.ts) can offer them without
 * loading the engine. Pure.
 */
import type { BlockSchema } from "@/lib/website-builder/types"

export const REVIEW_STARS_BLOCK = "shopify://apps/storelib-reviews/blocks/star-rating/storelib"
export const REVIEWS_LIST_BLOCK = "shopify://apps/storelib-reviews/blocks/reviews/storelib"

/** An app block's address, as Shopify keeps one on a page: whatever app it is. */
export function isAppBlockAddress(type: unknown): boolean {
  return typeof type === "string" && /^shopify:\/\/apps\//.test(type)
}

/**
 * The two blocks as the sidebar's Add block offers them. Their settings are
 * read as they are stored (./storelib-reviews.ts reviewStarsHtml and the
 * reviews block), so the panel's ids are the drawing's.
 */
export const REVIEW_APP_BLOCK_SCHEMAS: readonly BlockSchema[] = [
  {
    type: REVIEW_STARS_BLOCK,
    name: "Star rating",
    theme: true,
    limit: 1,
    fields: [
      { id: "show_average", label: "Show the average", type: "toggle", default: false },
      { id: "show_count", label: "Show how many reviews", type: "toggle", default: true },
      { id: "link", label: "Go to the reviews when pressed", type: "toggle", default: true },
      { id: "star_color", label: "Star colour", type: "color", default: "" },
    ],
  },
  {
    type: REVIEWS_LIST_BLOCK,
    name: "Reviews",
    theme: true,
    limit: 1,
    fields: [
      { id: "heading", label: "Heading", type: "text", default: "", placeholder: "Customer reviews" },
      { id: "show_summary", label: "Show the rating", type: "toggle", default: true },
      { id: "show_bars", label: "Show reviews by stars", type: "toggle", default: true },
      { id: "show_write", label: "Show Write a review", type: "toggle", default: true },
      { id: "per_page", label: "Reviews before Show more", type: "range", default: 3, min: 1, max: 24, step: 1 },
      { id: "star_color", label: "Star colour", type: "color", default: "" },
    ],
  },
]

/** The sidebar's schema for one of the two, by its address. */
export function reviewAppBlockSchema(type: string): BlockSchema | undefined {
  return REVIEW_APP_BLOCK_SCHEMAS.find((b) => b.type === type)
}
