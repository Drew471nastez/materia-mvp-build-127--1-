import "server-only"

/**
 * ===========================================================================
 *  WHAT storelib.com/<handle> SHOWS EVERY VISITOR, READ ONCE FOR ALL OF THEM
 * ===========================================================================
 * The creator page is one HTML for every visitor (round 49: no cookie, no
 * header, the owner's and a buyer's controls asked by the browser after
 * load), and the CDN already keeps that HTML for a minute. Its server still
 * asked the database the same questions for every visit that reached it:
 * the products, the reviews, where the creator is from, which products are
 * off the page, each limited download's standing, each membership's
 * interval, and for the head the SEO override and the published count.
 *
 * Those answers are held here in Next's data cache for a minute at most,
 * keyed by the creator's ids and tagged by them:
 *
 *   creator:<creator id>, creator:<user id>
 *                         cleared by every writer of the page
 *                         (lib/storefront/creator-page-purge creatorPagesChanged:
 *                         a product, a review, the store's currency, a sales
 *                         channel, the builder's publish, the profile, the
 *                         cover; lib/account/identity-caches a new name or photo)
 *   shop-products:<creator id>
 *                         every product writer, the database's triggers too
 *
 * WHO THE ADDRESS IS, IS NEVER HELD. The profile by the name in the address
 * and its creator row are read live for every request
 * (lib/commerce/creator-page-data, deduped within it), and everything here
 * is keyed by the ids that lookup answered, so a renamed account never shows
 * somebody else's page: the new owner of a name has other ids.
 *
 * A read that failed is answered for that visit and never held.
 */
import { unstable_cache } from "next/cache"

/** The backstop, in seconds: the same minute the CDN holds the page for. */
export const CREATOR_PAGE_HOLD_SECONDS = 60

/** The tags every held read of one creator's page carries (lib/commerce/product-page-cache creatorTag, lib/onepage/public-cache shopProductsTag). */
export const creatorPageTags = (creatorId: string, userId: string): string[] => [`creator:${creatorId}`, `creator:${userId}`, `shop-products:${creatorId}`]

class NotHeld<T> extends Error {
  constructor(readonly value: T) {
    super("a read failed, so the answer is not held")
  }
}

/** Held under the creator's tags; a value `failed` says is answered once and not held; read directly outside Next. */
export async function heldForCreatorPage<T>(key: string[], creatorId: string, userId: string, read: () => Promise<T>, failed: (v: T) => boolean): Promise<T> {
  try {
    return await unstable_cache(
      async () => {
        const value = await read()
        if (failed(value)) throw new NotHeld(value)
        return value
      },
      key,
      { revalidate: CREATOR_PAGE_HOLD_SECONDS, tags: creatorPageTags(creatorId, userId) },
    )()
  } catch (e) {
    if (e instanceof NotHeld) return e.value as T
    if (e instanceof Error && /incrementalCache missing/.test(e.message)) return read()
    throw e
  }
}
