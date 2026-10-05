/**
 * HOW MANY COMMUNITIES A PLAN MAY HAVE (round 13).
 *
 * Free: two. Pro (and the older Growth and Pro plans): as many as they
 * like. Counted per creator account: every community they own that is not
 * deleted, archived ones included, so archiving one and making another
 * does not get round it. Communities somebody helps run as an admin or a
 * moderator are somebody else's and do not count.
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

/** The error code a create answers with at the limit, and what the screens say. */
export const PLAN_LIMIT_ERROR = "plan_limit"
export const PLAN_LIMIT_TEXT = `The Free plan includes ${FREE_COMMUNITY_LIMIT} communities. Upgrade to Pro to run more.`
