import "server-only"

/**
 * ===========================================================================
 *  THE FOLLOW GRAPH: COUNTS AND ONE QUESTION
 * ===========================================================================
 * `follows (follower_id, following_id, created_at)` points person to person
 * (supabase/migrations/20260731_follows.sql), so a buyer, a member and a
 * creator are all followed the same way. Indexed on both ends.
 *
 * Counts are `head` counts on those indexes. There is no list of who
 * follows whom any more: the owner asked for the followers and following
 * dialog to go, and the route that paged it (GET /api/follow/list) went
 * with it, since nothing else read it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v)
}

export interface FollowCounts {
  followers: number
  following: number
}

export async function followCounts(db: Db, userId: string): Promise<FollowCounts> {
  try {
    const [followers, following] = await Promise.all([
      db.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
      db.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
    ])
    return { followers: followers.error ? 0 : followers.count ?? 0, following: following.error ? 0 : following.count ?? 0 }
  } catch {
    return { followers: 0, following: 0 }
  }
}

export async function isFollowing(db: Db, followerId: string | null, targetId: string): Promise<boolean> {
  if (!followerId || followerId === targetId) return false
  try {
    const { data } = await db.from("follows").select("id").eq("follower_id", followerId).eq("following_id", targetId).maybeSingle()
    return !!data
  } catch {
    return false
  }
}
