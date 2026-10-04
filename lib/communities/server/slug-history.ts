import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S OLD ADDRESSES (run-now part 94)
 * ===========================================================================
 * community_slug_history keeps every address a community had, with the
 * community it belongs to now. The database writes it (a trigger on
 * communities, in the same step as the change), so whatever renames a
 * community records the old address; this module only reads it:
 *
 *   loadCommunity({ slug }) falls back to it, so an old link still finds
 *   the community (and the community's layout sends it on to the new
 *   address, lib/communities/slug-move.ts);
 *
 *   Settings refuses an address another community used to have, so a link
 *   somebody shared to that community never starts opening a different one.
 *
 * Server only, through the service role. Until part 94 has run the table is
 * missing and both answer "nothing here", which is how addresses behaved
 * before: an old one is not found.
 */
import { missing, reasonOf, type Db } from "./db"

/** The community that used to be at this address, or null (never was, or part 94 not run). */
export async function communityIdForOldSlug(db: Db, slug: string): Promise<string | null> {
  const key = (slug ?? "").toLowerCase()
  if (!key || key.length > 64) return null
  try {
    const { data, error } = await db.from("community_slug_history").select("community_id").eq("slug", key).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] old address read: ${reasonOf(error)}`)
      return null
    }
    return (data as { community_id: string } | null)?.community_id ?? null
  } catch (e) {
    console.error(`[communities] old address read: ${reasonOf(e)}`)
    return null
  }
}

/** Whether this address was another community's: Settings keeps it for that community's old links. */
export async function slugHeldByAnother(db: Db, slug: string, communityId: string): Promise<boolean> {
  const owner = await communityIdForOldSlug(db, slug)
  return !!owner && owner !== communityId
}
