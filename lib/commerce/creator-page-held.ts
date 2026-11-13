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

/*
  A READ THAT FAILED IS ANSWERED WITH THE LAST GOOD ONE (round AU). Production
  logged "creator-page-head ... Error: a read failed, so the answer is not
  held" on /<handle>. With a held copy in Next's data cache that is only the
  refresh behind the visitor failing, and the visitor gets the copy. With none
  (a first visit, an evicted entry, a save's `expire: 0` followed by a slow
  database) the visitor got the failed answer: an empty grid, or a head that
  counted no products and so said noindex, and the CDN kept that page for
  five minutes (next.config.mjs EDGE_PAGE). So every good answer handed out
  is also kept on this instance, by its key, and a failed read answers it
  while it is younger than LAST_GOOD_MAX_AGE_MS. It is a page already shown
  to every stranger (the anon key, round 49), so it shows nothing new; a save
  on this instance forgets it (forgetCreatorPageLastGood). Bounded to
  LAST_GOOD_MAX_KEYS keys, the oldest written first out.
*/
export const LAST_GOOD_MAX_AGE_MS = 15 * 60_000
const LAST_GOOD_MAX_KEYS = 500
const lastGood = new Map<string, { value: unknown; at: number; creatorId: string; userId: string }>()

function keep(key: string, value: unknown, creatorId: string, userId: string) {
  lastGood.delete(key)
  lastGood.set(key, { value, at: Date.now(), creatorId, userId })
  if (lastGood.size > LAST_GOOD_MAX_KEYS) {
    const oldest = lastGood.keys().next().value
    if (oldest !== undefined) lastGood.delete(oldest)
  }
}

function kept<T>(key: string): T | undefined {
  const held = lastGood.get(key)
  if (!held || Date.now() - held.at > LAST_GOOD_MAX_AGE_MS) return undefined
  return held.value as T
}

/** A creator's page changed (lib/storefront/creator-page-purge): this instance's last good copies of it go. No ids: all of them (tests). */
export function forgetCreatorPageLastGood(id?: string) {
  if (!id) return lastGood.clear()
  for (const [k, v] of lastGood) if (v.creatorId === id || v.userId === id) lastGood.delete(k)
}

/** Held under the creator's tags; a value `failed` says is answered once and not held (or the last good one, above); read directly outside Next. */
export async function heldForCreatorPage<T>(key: string[], creatorId: string, userId: string, read: () => Promise<T>, failed: (v: T) => boolean): Promise<T> {
  const id = JSON.stringify(key)
  try {
    const value = await unstable_cache(
      async () => {
        const value = await read()
        if (failed(value)) throw new NotHeld(value)
        return value
      },
      key,
      { revalidate: CREATOR_PAGE_HOLD_SECONDS, tags: creatorPageTags(creatorId, userId) },
    )()
    keep(id, value, creatorId, userId)
    return value
  } catch (e) {
    if (e instanceof NotHeld) {
      const last = kept<T>(id)
      if (last !== undefined) {
        console.warn(`[creator-page] ${key[0]}: a read failed, showing the last good answer`) // i18n-ignore: for the log
        return last
      }
      return e.value as T
    }
    if (e instanceof Error && /incrementalCache missing/.test(e.message)) return read()
    throw e
  }
}
