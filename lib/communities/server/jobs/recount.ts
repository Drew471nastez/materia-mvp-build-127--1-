import "server-only"

/**
 * RECOUNT: a community's member_count and post_count counted again from the
 * rows. The triggers keep both in step as rows change; this is the repair
 * for anything that ever went around them (a restore, a hand edit). Payload
 * { communityId }. Counts the same definitions the triggers use: active
 * members, published posts.
 */
import type { JobRow } from "../../types"
import { reasonOf, type Db } from "../db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function recount(db: Db, job: JobRow): Promise<void> {
  const communityId = typeof job.payload?.communityId === "string" ? job.payload.communityId : ""
  if (!UUID.test(communityId)) throw new Error("recount needs payload.communityId")
  const [members, posts] = await Promise.all([
    db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "active"),
    db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "published"),
  ])
  if (members.error) throw new Error(`members count: ${reasonOf(members.error)}`)
  if (posts.error) throw new Error(`posts count: ${reasonOf(posts.error)}`)
  const { error } = await db
    .from("communities")
    .update({ member_count: members.count ?? 0, post_count: posts.count ?? 0 })
    .eq("id", communityId)
  if (error) throw new Error(`community counts: ${reasonOf(error)}`)
}
