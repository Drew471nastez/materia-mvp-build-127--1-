import "server-only"

/**
 * ===========================================================================
 *  WHAT MEMBERS › A MEMBER SHOWS BEYOND THE ROW (round 51)
 * ===========================================================================
 * The member's sheet (components/community/creator/member-sheet.tsx) draws
 * the row's facts at once and asks here for the rest, for one person in one
 * community the caller already checked (requireCreatorCommunity):
 *
 *   activity  what this community already records of them: posts, comments,
 *             events they said they are going to and events they attended
 *             (community_feed_posts / community_feed_comments by author_id,
 *             community_event_rsvps by user_id). Head counts on the author
 *             and (user_id, community_id) indexes; nothing is read in full.
 *   answers   what they answered before joining (community_join_answers),
 *             only for a role that may approve members, the same rule as
 *             Members › Requests. These are the community's own questions
 *             (approval, eligibility, onboarding), kept apart from
 *             marketing form responses: never written to form_submissions
 *             or the subscribers list.
 *
 * Every table may be missing on a store where its part has not run: that
 * figure is null and the sheet leaves it out.
 */
import type { MemberPanelFacts } from "@/components/community/creator/view-types"
import { answersOf } from "./join-questions"
import type { Db } from "./db"

export type { MemberPanelFacts }

const headCount = (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> =>
  Promise.resolve(q).then(
    (r) => (r.error ? null : (r.count ?? 0)),
    () => null,
  )

export async function memberPanelFacts(db: Db, communityId: string, userId: string, opts: { answers: boolean }): Promise<MemberPanelFacts> {
  const head = (table: string) => db.from(table).select("*", { count: "exact", head: true }).eq("community_id", communityId)
  const [posts, comments, going, attended, answers] = await Promise.all([
    headCount(head("community_feed_posts").eq("author_id", userId)),
    headCount(head("community_feed_comments").eq("author_id", userId)),
    headCount(head("community_event_rsvps").eq("user_id", userId).eq("status", "going")),
    headCount(head("community_event_rsvps").eq("user_id", userId).not("attended_at", "is", null)),
    opts.answers ? answersOf(db, communityId, [userId]).catch(() => new Map()) : Promise.resolve(null),
  ])
  const mine = answers?.get(userId)
  return { activity: { posts, comments, going, attended }, answers: mine ? { items: mine.answers, submittedAt: mine.submittedAt } : null }
}
