/**
 * HOW MANY COMMUNITIES A PLAN MAY HAVE (round 13).
 *
 * Free: two. Pro (and the older Growth and Pro plans): as many as they
 * like. Counted per creator account: every community they own that is not
 * deleted, archived ones included, so archiving one and making another
 * does not get round it. Communities somebody helps run as an admin or a
 * moderator are somebody else's and do not count.
 *
 * Round 26 ("a community scheduled for deletion on November 5 should not
 * stop me making a replacement on October 16"): a community whose deletion
 * is scheduled (run-now part 202, community_deletions.state 'scheduled')
 * takes no place either. Keeping it again (Undo) needs a free place, and is
 * refused with KEEP_LIMIT_TEXT when the replacement has taken it.
 *
 * The plan itself is read where Sites reads it (lib/sites/plan-server
 * creatorSitePlan: the subscription's plan while it is active or trialing),
 * never derived again here. Pure, browser safe: the list draws "Upgrade"
 * from it without asking the server.
 */
export type CommunityPlan = "free" | "growth" | "pro"

export const FREE_COMMUNITY_LIMIT = 2

/** The most communities this plan may own, or null for no limit. */
export function communityLimitFor(plan: CommunityPlan | null | undefined): number | null {
  return !plan || plan === "free" ? FREE_COMMUNITY_LIMIT : null
}

/** Whether one more may be made: `owned` is the count of communities the account owns now. */
export function mayCreateCommunity(plan: CommunityPlan | null | undefined, owned: number): boolean {
  const max = communityLimitFor(plan)
  return max === null || owned < max
}

/**
 * Whether a community the account owns takes one of its plan's places: not
 * deleted, and not on its way to being deleted. Archived ones do.
 */
export function takesCommunitySlot(c: { deleted?: boolean; deleting?: boolean }): boolean {
  return !c.deleted && !c.deleting
}

/** The error code a create answers with at the limit, and what the screens say. */
export const PLAN_LIMIT_ERROR = "plan_limit"
export const PLAN_LIMIT_TEXT = `The Free plan includes ${FREE_COMMUNITY_LIMIT} communities. Upgrade to Pro to run more.`

/** Round 26: Keep (undo a scheduled deletion) when the replacement has taken the place. */
export const KEEP_LIMIT_TEXT = `The Free plan includes ${FREE_COMMUNITY_LIMIT} communities and ${FREE_COMMUNITY_LIMIT} are in use. Delete one or upgrade to Pro to keep this one.`
