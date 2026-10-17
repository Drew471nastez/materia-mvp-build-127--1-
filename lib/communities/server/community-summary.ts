import "server-only"

/**
 * THE SHORT DESCRIPTION, READ SOFTLY (round 26).
 *
 * communities.summary arrives with SQL part 220: one plain line of up to 160
 * characters, written in the Page editor. The community's metadata reads it
 * first for the line a search result and a shared link show
 * (components/community/public/seo.ts describeCommunity). It is not in
 * COMMUNITY_COLUMNS, so a database before part 220 still reads every
 * community: here a missing column is simply no summary. Once per request
 * per community (React's cache), so the page and its metadata share it.
 *
 * The column is public facts of the community (its card shows it), so this
 * is safe for any page that already shows the community; it never reads
 * member_links or anything else members only.
 */
import { cache } from "react"
import { admin, missing, reasonOf, type Db } from "./db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The summary as stored, trimmed to one line; null for none, an unknown id, or a database without the column. */
export async function readCommunitySummary(db: Db, communityId: string): Promise<string | null> {
  if (!UUID.test(communityId)) return null
  try {
    const { data, error } = await db.from("communities").select("summary").eq("id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] summary read: ${reasonOf(error)}`)
      return null
    }
    const raw = (data as { summary?: unknown } | null)?.summary
    if (typeof raw !== "string") return null
    const line = raw.replace(/\s+/g, " ").trim()
    return line ? line.slice(0, 160) : null
  } catch (e) {
    console.error(`[communities] summary read: ${reasonOf(e)}`)
    return null
  }
}

/** The same, once per request. */
export const communitySummary = cache(async (communityId: string): Promise<string | null> => readCommunitySummary(admin(), communityId))

/**
 * WAITING TO BE DELETED (round 26, the deletion is W1's: ./community-deletion.ts, part 202). A scheduled deletion
 * archives the community, which already keeps it out of search and previews; this asks the deletion's own row too, so a
 * community waiting to be deleted is never previewed whatever its status says. Softly: before part 202, or on any
 * failure, it reads as not deleting (the status rule still holds).
 */
export async function readCommunityDeleting(db: Db, communityId: string): Promise<boolean> {
  if (!UUID.test(communityId)) return false
  try {
    const { data, error } = await db.from("community_deletions").select("state").eq("community_id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] deletion read: ${reasonOf(error)}`)
      return false
    }
    return (data as { state?: unknown } | null)?.state === "scheduled"
  } catch (e) {
    console.error(`[communities] deletion read: ${reasonOf(e)}`)
    return false
  }
}

/** The same, once per request. */
export const communityDeleting = cache(async (communityId: string): Promise<boolean> => readCommunityDeleting(admin(), communityId))
