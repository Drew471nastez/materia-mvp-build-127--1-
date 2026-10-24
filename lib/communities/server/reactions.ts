import "server-only"

/**
 * ===========================================================================
 *  REACTIONS, AND THE POINTS THEY GIVE
 * ===========================================================================
 * One like per person per post, comment or chat message (the unique key in
 * part 81 makes a double press one row); a trigger keeps the target's
 * reaction_count, so the number on a card is always the count of real rows.
 *
 * A like gives the author one point, keyed `react:<type>:<id>:<reactorId>`
 * (awardPoints takes each key once and never pays for a self like); taking
 * the like back takes the point back by the same key. The author hears about
 * it once per person (notify_level "all" only, wantsNotification).
 *
 * The target must be in this community and visible to the person reacting:
 * a post or comment through its space's rule, a message through its chat
 * space's rule.
 */
import type { CommunityRow, ReactionTarget } from "../types"
import { recordActivity } from "./activity"
import type { Viewer } from "./context"
import { isUniqueViolation, missing, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { accessOf, canSeeSpace, listSpaces, visiblePostRow, type Checked, type WriteContext } from "./feed"
import { snippet } from "./mentions"
import { notifyMember } from "./notify"
import { awardPoints, revokePoints } from "./points"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The idempotency key of the point a like gives. */
export function reactionPointKey(type: ReactionTarget, targetId: string, reactorId: string): string {
  return `react:${type}:${targetId}:${reactorId}`
}

interface Target {
  authorId: string | null
  postId: string | null
  count: number
  text: string
  table: "community_feed_posts" | "community_feed_comments" | "community_messages"
  url: string
}

/** The thing being liked, when it is in this community, published and visible to this viewer. */
async function findTarget(db: Db, community: CommunityRow, viewer: Viewer, type: ReactionTarget, id: string): Promise<Target | null> {
  if (type === "post") {
    const found = await visiblePostRow(db, community, viewer, id)
    if (!found || found.row.status !== "published") return null
    return {
      authorId: found.row.author_id,
      postId: id,
      count: found.row.reaction_count,
      text: found.row.title || found.row.body_text,
      table: "community_feed_posts",
      url: `/community/${community.slug}/post/${id}`,
    }
  }
  if (type === "comment") {
    const { data } = await db.from("community_feed_comments").select("id, post_id, author_id, status, body, reaction_count").eq("id", id).eq("community_id", community.id).maybeSingle()
    if (!data || data.status !== "published") return null
    const found = await visiblePostRow(db, community, viewer, data.post_id)
    if (!found || found.row.status !== "published") return null
    return {
      authorId: data.author_id,
      postId: data.post_id,
      count: data.reaction_count,
      text: data.body,
      table: "community_feed_comments",
      url: `/community/${community.slug}/post/${data.post_id}#c-${id}`,
    }
  }
  const { data } = await db.from("community_messages").select("id, space_id, author_id, status, body, reaction_count").eq("id", id).eq("community_id", community.id).maybeSingle()
  if (!data || data.status !== "published") return null
  const spaces = await listSpaces(db, community.id)
  const space = spaces.find((s) => s.id === data.space_id)
  if (!space || space.kind !== "chat" || !canSeeSpace(space, accessOf(viewer))) return null
  return { authorId: data.author_id, postId: null, count: data.reaction_count, text: data.body, table: "community_messages", url: `/community/${community.slug}/space/${space.slug}` }
}

async function countOf(db: Db, table: Target["table"], id: string, fallback: number): Promise<number> {
  const { data } = await db.from(table).select("reaction_count").eq("id", id).maybeSingle()
  return typeof data?.reaction_count === "number" ? data.reaction_count : fallback
}

/** Likes or unlikes. Answers the state the viewer now has and the target's real count. */
export async function setReaction(w: WriteContext, type: ReactionTarget, targetId: string, on: boolean): Promise<Checked<{ on: boolean; count: number }>> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: false, error: "Sign in to react.", status: 401 }
  if (!UUID.test(targetId)) return { ok: false, error: "That is gone.", status: 404 }
  const target = await findTarget(db, community, viewer, type, targetId)
  if (!target) return { ok: false, error: "That is gone.", status: 404 }
  const key = reactionPointKey(type, targetId, viewer.userId)

  if (on) {
    const { error } = await db.from("community_reactions").insert({ community_id: community.id, target_type: type, target_id: targetId, user_id: viewer.userId, kind: "like" })
    if (error && !isUniqueViolation(error)) {
      if (!missing(error)) console.error(`[communities] reaction not written: ${reasonOf(error)}`)
      return { ok: false, error: "That did not save. Try again.", status: missing(error) ? 503 : 500 }
    }
    if (!error && target.authorId && target.authorId !== viewer.userId) {
      await awardPoints(db, { communityId: community.id, userId: target.authorId, points: 1, reason: "reaction_received", sourceKey: key, actorId: viewer.userId })
      const actor = (await authorViews(db, community.id, [viewer.userId])).get(viewer.userId)
      await notifyMember(db, {
        userId: target.authorId,
        communityId: community.id,
        kind: "reaction",
        actorId: viewer.userId,
        target: { type, id: targetId },
        title: `${actor?.name ?? "A member"} liked your ${type === "message" ? "message" : type}`,
        body: snippet(target.text, 100) || null,
        url: target.url,
        dedupeKey: `reaction:${type}:${targetId}:${viewer.userId}`,
      })
    }
    /*
      EVERY NEW LIKE IS SOMETHING THE MEMBER DID (round 37), a like on their
      own post or on one whose author has gone included: it marks them active
      today and is in the community's activity like a post or a comment. The
      points and the bell above are the author's, and stay where they were.
    */
    if (!error) await recordActivity(db, { communityId: community.id, userId: viewer.userId, kind: "reaction", targetType: type, targetId })
  } else {
    const { error } = await db.from("community_reactions").delete().eq("target_type", type).eq("target_id", targetId).eq("user_id", viewer.userId)
    if (error) return { ok: false, error: "That did not save. Try again.", status: missing(error) ? 503 : 500 }
    if (target.authorId && target.authorId !== viewer.userId) await revokePoints(db, { communityId: community.id, userId: target.authorId, sourceKey: key })
  }
  return { ok: true, value: { on, count: await countOf(db, target.table, targetId, target.count) } }
}
