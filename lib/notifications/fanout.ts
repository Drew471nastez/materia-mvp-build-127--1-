import "server-only"

/**
 * ===========================================================================
 *  TELLING PEOPLE ABOUT SOMETHING NEW, LATER AND ONCE
 * ===========================================================================
 * The routes a creator publishes through call these, after their own work is
 * done. Each only puts a job on the community job queue (community_jobs, the
 * kinds part 85 adds), keyed so the same product, community or post is
 * queued once ever; /api/cron/community runs it within five minutes, a page
 * of people at a time (lib/communities/server/jobs/fanout_followers.ts and
 * fanout_membership_post.ts). The request never waits on the people.
 *
 *   queueProductFanout          a product went on sale: the creator's
 *                               followers, then the people who bought from
 *                               them before.
 *   queueCommunityFanout        a community was published: the creator's
 *                               followers.
 *   queueMembershipPostFanout   a membership post was created: the
 *                               membership's members who can read it.
 *
 * None of them throws and none of them can fail the publish that called it:
 * a missing table or a refused write is a line in the log. Products that sell
 * a community tier (products.community_id) are not announced as products;
 * the community is.
 */
import { queueJob, type QueueOutcome } from "@/lib/communities/server/notify"
import { reasonOf, type Db } from "@/lib/communities/server/db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FanoutOutcome = QueueOutcome | "skipped"

/** A product of this creator that is on sale now: its followers and past buyers hear about it once. */
export async function queueProductFanout(db: Db, p: { productId: string; creatorId: string }): Promise<FanoutOutcome> {
  try {
    if (!UUID.test(p.productId) || !UUID.test(p.creatorId)) return "skipped"
    const { data, error } = await db.from("products").select("id, status, archived, creator_id, community_id").eq("id", p.productId).eq("creator_id", p.creatorId).maybeSingle()
    if (error) {
      console.error(`[notifications] product ${p.productId} not read for followers: ${reasonOf(error)}`)
      return "unavailable"
    }
    const product = data as { status: string | null; archived: boolean | null; community_id?: string | null } | null
    if (!product || product.status !== "published" || product.archived || product.community_id) return "skipped"
    const { data: creator } = await db.from("creators").select("user_id").eq("id", p.creatorId).maybeSingle()
    const creatorUserId = (creator as { user_id?: string | null } | null)?.user_id
    if (!creatorUserId) return "skipped"
    return await queueJob(db, {
      kind: "fanout_followers",
      payload: { type: "product", productId: p.productId, creatorUserId, phase: "followers", after: null },
      idempotencyKey: `fanout_followers:product:${p.productId}`,
    })
  } catch (e) {
    console.error(`[notifications] product ${p.productId} not queued for followers: ${reasonOf(e)}`)
    return "unavailable"
  }
}

/** A community just published: the owner's followers hear about it once. */
export async function queueCommunityFanout(db: Db, c: { communityId: string; ownerUserId: string | null }): Promise<FanoutOutcome> {
  try {
    if (!UUID.test(c.communityId) || !c.ownerUserId || !UUID.test(c.ownerUserId)) return "skipped"
    return await queueJob(db, {
      kind: "fanout_followers",
      payload: { type: "community", communityId: c.communityId, creatorUserId: c.ownerUserId, phase: "followers", after: null },
      idempotencyKey: `fanout_followers:community:${c.communityId}`,
    })
  } catch (e) {
    console.error(`[notifications] community ${c.communityId} not queued for followers: ${reasonOf(e)}`)
    return "unavailable"
  }
}

/** A new membership post: the members who can read it hear about it in the bell, once. */
export async function queueMembershipPostFanout(db: Db, m: { postId: string; productId: string }): Promise<FanoutOutcome> {
  try {
    if (!UUID.test(m.postId) || !UUID.test(m.productId)) return "skipped"
    return await queueJob(db, {
      kind: "fanout_membership_post",
      payload: { postId: m.postId, productId: m.productId, after: null },
      idempotencyKey: `fanout_membership_post:${m.postId}`,
    })
  } catch (e) {
    console.error(`[notifications] membership post ${m.postId} not queued: ${reasonOf(e)}`)
    return "unavailable"
  }
}
