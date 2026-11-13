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
import { inTimeOrThrow } from "@/lib/net/in-time"

export const EXPLORE_CATALOGUE_TAG = "explore-catalogue"
const TTL = 60

/**
 * NEVER AN EMPTY CATALOGUE. The page's read answers an empty list when the
 * database did not answer, and holding that would show everybody an empty
 * Explore for a minute. An empty answer is thrown here so nothing is kept;
 * the caller's own catch draws the page as it did before.
 */
class EmptyCatalogue extends Error {}

/*
  ===========================================================================
   A READ THAT FAILED SHOWS THE LAST GOOD CATALOGUE, NOT AN EMPTY EXPLORE
  ===========================================================================
  Round AU, from production: "[ExplorePage] Products error: DeadlineExceeded
  ... rest/v1/products took longer than 20s", "[CategoryPage] Products error:
  TimeoutError", and "revalidating cache with key: ...-explore-catalogue-[]
  Error: no products read". When Next's data cache has a copy (stale or not)
  the visitor is handed it and the failed refresh is only that log line. When
  it has none (a first read, an evicted entry, a takedown's `expire: 0`) the
  visitor waited out the whole 20 second read deadline and was shown "No
  products found", and the CDN kept that page (next.config.mjs edgeRule
  /explore, five minutes fresh) for everybody after them.

  So two things:

  - WAITED FOR SO LONG. The visitor waits CATALOGUE_WAIT_MS at most. The read
    goes on behind and fills the data cache for the next visitor if it lands.
  - THE LAST GOOD COPY ON THIS INSTANCE. Every catalogue this instance handed
    out is kept in memory under its key, and a read that failed, came back
    empty or was late answers that copy instead of nothing, for at most
    LAST_GOOD_MAX_AGE_MS. Only a catalogue already shown to strangers is kept
    (read with the anon key), so it shows nothing a visitor could not have
    seen. A takedown on this instance forgets it at once
    (exploreCatalogueTakenDown); on another instance it can be shown only
    while the database is also failing there, and for half an hour at most.

  Only when there is neither does the caller draw its unavailable state, and
  the browser asks again (components/explore/use-catalogue-retry.ts).
*/
export const CATALOGUE_WAIT_MS = 9000
export const LAST_GOOD_MAX_AGE_MS = 30 * 60_000
const lastGood = new Map<string, { rows: unknown[]; at: number }>()

/** Forget every last good catalogue on this instance (a takedown, tests). */
export function forgetLastGoodCatalogues() {
  lastGood.clear()
}

/** This instance's last good catalogue under `key`, while it is young enough. */
export function lastGoodCatalogue<T extends unknown[]>(key = "explore-catalogue", now = Date.now()): T | null {
  const held = lastGood.get(key)
  if (!held || now - held.at > LAST_GOOD_MAX_AGE_MS) return null
  return held.rows as T
}

class LateCatalogue extends Error {
  constructor(key: string) {
    super(`${key}: no answer in ${CATALOGUE_WAIT_MS / 1000}s`) // i18n-ignore: for the log
  }
}

/**
 * `key` names the list: /explore's grid and the category pages' build the
 * same catalogue by their own code, so each keeps its own copy, and one tag
 * clears both. Throws only when there is neither a catalogue nor a last good
 * one on this instance.
 */
export async function cachedExploreCatalogue<T extends unknown[]>(read: () => Promise<T>, key = "explore-catalogue"): Promise<T> {
  const nonEmpty = async () => {
    const rows = await read()
    if (!Array.isArray(rows) || rows.length === 0) throw new EmptyCatalogue("no products read")
    return rows
  }
  try {
    const held = unstable_cache(nonEmpty, [key], { revalidate: TTL, tags: [EXPLORE_CATALOGUE_TAG] })()
    const rows = await inTimeOrThrow(held, CATALOGUE_WAIT_MS, () => new LateCatalogue(key))
    lastGood.set(key, { rows, at: Date.now() })
    return rows
  } catch (e) {
    const kept = lastGoodCatalogue<T>(key)
    if (kept) {
      console.warn(`[explore] ${key}: ${(e as Error)?.message ?? e}; showing the last good catalogue`) // i18n-ignore: for the log
      return kept
    }
    throw e
  }
}

/** A product changed: the next visitor's refresh shows it (stale while revalidating). */
export function exploreCatalogueChanged() {
  revalidateTag(EXPLORE_CATALOGUE_TAG, "max")
}

/** A product was taken down: nobody is shown the held copy again. */
export function exploreCatalogueTakenDown() {
  revalidateTag(EXPLORE_CATALOGUE_TAG, { expire: 0 })
  /* Nor this instance's last good copy (above). */
  forgetLastGoodCatalogues()
  /* And the CDN's copy of Explore (round 49, next.config.mjs `Vercel-Cache-Tag: explore`), after the data, so the next render reads the list without it. */
  revalidateTag("explore", { expire: 0 })
}
