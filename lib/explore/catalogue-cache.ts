/**
 * ===========================================================================
 *  EXPLORE'S CATALOGUE, ONE COPY FOR EVERYBODY
 * ===========================================================================
 * The grid on /explore (and Most popular under it) is the newest hundred
 * published products with their creators' faces: the same rows for every
 * visitor. It was read for each one, four round trips in three waves
 * (products with their creators, then the faces, the products taken off
 * Explore and the membership intervals), on the page most visitors open.
 *
 * Browsing is held here for a minute under one tag. A search is not: it is
 * one person's words and stays a live read. What is personal on the page
 * (For you, the cookie's mode, the signed in visitor) is not in here and
 * stays per visit in app/(marketing)/explore/page.tsx.
 *
 * READ AS A STRANGER. The catalogue is read through the anon client with no
 * session (lib/supabase/public-read.ts), so it holds exactly what a signed
 * out visitor is shown and nothing a session could add.
 *
 * CLEARED BY THE WRITES THAT CHANGE IT, so a minute is the most it can lag
 * and usually it does not: a product saved in the editor (app/api/revalidate,
 * which the editor calls after every save), deleted
 * (lib/products/forget-product.ts), taken down or put back by an operator
 * (app/api/admin/products/moderate, app/api/admin/creators/moderate). Taken
 * down is immediate (`expire: 0`): the next visitor waits for a fresh read
 * rather than being shown it once more.
 */
import { unstable_cache, revalidateTag } from "next/cache"

export const EXPLORE_CATALOGUE_TAG = "explore-catalogue"
const TTL = 60

/**
 * NEVER AN EMPTY CATALOGUE. The page's read answers an empty list when the
 * database did not answer, and holding that would show everybody an empty
 * Explore for a minute. An empty answer is thrown here so nothing is kept;
 * the caller's own catch draws the page as it did before.
 */
class EmptyCatalogue extends Error {}

/**
 * `key` names the list: /explore's grid and the category pages' build the
 * same catalogue by their own code, so each keeps its own copy, and one tag
 * clears both.
 */
export function cachedExploreCatalogue<T extends unknown[]>(read: () => Promise<T>, key = "explore-catalogue"): Promise<T> {
  const nonEmpty = async () => {
    const rows = await read()
    if (!Array.isArray(rows) || rows.length === 0) throw new EmptyCatalogue("no products read")
    return rows
  }
  return unstable_cache(nonEmpty, [key], { revalidate: TTL, tags: [EXPLORE_CATALOGUE_TAG] })()
}

/** A product changed: the next visitor's refresh shows it (stale while revalidating). */
export function exploreCatalogueChanged() {
  revalidateTag(EXPLORE_CATALOGUE_TAG, "max")
}

/** A product was taken down: nobody is shown the held copy again. */
export function exploreCatalogueTakenDown() {
  revalidateTag(EXPLORE_CATALOGUE_TAG, { expire: 0 })
}
