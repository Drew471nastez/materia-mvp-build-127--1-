/**
 * ===========================================================================
 *  WHAT EACH COMMUNITY ROUTE AND SECTION PAGE DEMANDS
 * ===========================================================================
 * lib/communities/permissions.ts says what each role may do. This says what
 * each door asks for: one row per exported handler of every route under
 * app/api/community and app/api/app/community, and one per section page of
 * /app/community/<id>, with the gate it passes and the CommunityAction it
 * hands that gate.
 *
 * It is the audit the owner asked for after round 33: one place where the
 * roles a route is open to can be read off, and read off the same can() the
 * route itself calls, so the interface and the server cannot drift. Nothing
 * reads it at runtime: tests/communities-roles-r34.test.ts walks the routes
 * on the branch and fails when
 *
 *   a handler is not in here (a route added without saying what it demands),
 *   a row names a handler that is gone,
 *   a row's actions are not the ones the source hands its gate, or
 *   a row would let a moderator into a door MODERATOR_DOORS does not list.
 *
 * So the list is kept by the test, not by hand, and a new route has to say
 * which role it is for before it can land.
 *
 * READING A ROW
 *   gate    "creator"         requireCreatorCommunity: the owner, an admin
 *                             or a moderator of this community, through a
 *                             creator account (/api/app, /app/community)
 *           "member"          requireMember: an active member of it
 *           "viewer"          viewerContext: anybody, member or not, the
 *                             route deciding from what it reads
 *           "creator_account" requireCreator with no community yet
 *           "open"            a signed in person acting on their own row
 *                             (joining, leaving, redeeming an invite), the
 *                             rules inside lib/communities/server/join.ts
 *   demands every action the handler can hand its gate. One for most; where
 *           the body decides, every action that body can ask for, and `via`
 *           names what decides.
 *
 * Pure data and pure rules: no server import, so a test and a screen can
 * both read it.
 */
import { can, ROLE_RANK, type CommunityAction, type RolePermissions } from "./permissions"
import type { Role } from "./types"

export const ROUTE_GATES = ["creator", "member", "viewer", "creator_account", "open"] as const
export type RouteGate = (typeof ROUTE_GATES)[number]

export const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "PAGE"] as const
export type RouteMethod = (typeof ROUTE_METHODS)[number]

export interface CommunityRouteRule {
  /** The file, as the repository spells it. "PAGE" is a section page's default export. */
  route: string
  method: RouteMethod
  gate: RouteGate
  /** Every action this handler can demand, sorted. Empty for a gate that demands none. */
  demands: readonly CommunityAction[]
  /** What picks the action, when the body does rather than one literal. */
  via?: string
}

/**
 * THE DOORS A MODERATOR MAY WALK THROUGH, by default. Every other
 * creator-gated route refuses them, whatever the interface draws, because
 * requireCreatorCommunity asks can() and a moderator has none of those
 * actions (lib/communities/permissions.ts MODERATOR_ACTIONS). Written out
 * here so that opening one more to moderators is a line in this file and a
 * failing test, never a quiet change.
 */
export const MODERATOR_DOORS: readonly string[] = [
  "app/api/app/community/[id]/audit/route.ts GET",
  "app/api/app/community/[id]/join-requests/route.ts GET",
  "app/api/app/community/[id]/members/[userId]/route.ts PATCH",
  "app/api/app/community/[id]/members/route.ts GET",
  "app/api/app/community/[id]/moderation/route.ts GET",
  "app/api/app/community/[id]/moderation/route.ts PATCH",
  "app/api/app/community/[id]/moderation/route.ts POST",
  "app/api/app/community/[id]/posts/route.ts GET",
  "app/api/app/community/[id]/posts/route.ts POST",
  "app/api/app/community/[id]/route.ts GET",
  "app/api/app/community/[id]/route.ts PATCH",
  "app/api/app/community/[id]/scheduled-posts/[postId]/route.ts PATCH",
  "app/api/app/community/[id]/scheduled-posts/[postId]/route.ts DELETE",
  "app/api/app/community/[id]/scheduled-posts/route.ts GET",
  "app/api/app/community/[id]/scheduled-posts/route.ts POST",
  "app/api/app/community/[id]/videos/[videoId]/route.ts GET",
  "app/api/app/community/[id]/videos/[videoId]/route.ts DELETE",
  "app/api/app/community/[id]/videos/route.ts GET",
  "app/api/app/community/[id]/videos/route.ts POST",
  "app/api/app/community/[id]/words/route.ts GET",
  "app/app/community/[id]/feed/page.tsx PAGE",
  "app/app/community/[id]/members/page.tsx PAGE",
  "app/app/community/[id]/moderation/page.tsx PAGE",
  "app/app/community/[id]/page.tsx PAGE",
] as const

/** A row's key: the file and the method, as MODERATOR_DOORS spells it. */
export function routeKey(rule: Pick<CommunityRouteRule, "route" | "method">): string {
  return `${rule.route} ${rule.method}`
}

/** Every door of every community route and section page on this branch. */
export const COMMUNITY_ROUTE_RULES: readonly CommunityRouteRule[] = [
  { route: "app/api/app/community/[id]/analytics/route.ts", method: "GET", gate: "creator", demands: ["view_analytics"] },
  { route: "app/api/app/community/[id]/archive/route.ts", method: "POST", gate: "creator", demands: ["archive"] },
  { route: "app/api/app/community/[id]/audit/route.ts", method: "GET", gate: "creator", demands: ["view_audit"] },
  { route: "app/api/app/community/[id]/classroom/[productId]/route.ts", method: "PATCH", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/classroom/[productId]/route.ts", method: "DELETE", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/classroom/route.ts", method: "GET", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/classroom/route.ts", method: "POST", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/classroom/route.ts", method: "PUT", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/delete/route.ts", method: "GET", gate: "creator", demands: ["delete"] },
  { route: "app/api/app/community/[id]/delete/route.ts", method: "POST", gate: "creator", demands: ["delete"] },
  { route: "app/api/app/community/[id]/duplicate/route.ts", method: "POST", gate: "creator", demands: ["transfer_ownership"] },
  { route: "app/api/app/community/[id]/events/[eventId]/route.ts", method: "PATCH", gate: "creator", demands: ["manage_events"] },
  { route: "app/api/app/community/[id]/events/[eventId]/tickets/route.ts", method: "GET", gate: "creator", demands: ["manage_events"] },
  { route: "app/api/app/community/[id]/events/[eventId]/tickets/route.ts", method: "PATCH", gate: "creator", demands: ["manage_events"] },
  { route: "app/api/app/community/[id]/events/[eventId]/tickets/route.ts", method: "DELETE", gate: "creator", demands: ["manage_events"] },
  { route: "app/api/app/community/[id]/events/route.ts", method: "GET", gate: "creator", demands: ["manage_events"] },
  { route: "app/api/app/community/[id]/events/route.ts", method: "POST", gate: "creator", demands: ["manage_events"] },
  { route: "app/api/app/community/[id]/gamification/badges/[badgeId]/route.ts", method: "POST", gate: "creator", demands: ["award_points"] },
  { route: "app/api/app/community/[id]/gamification/badges/[badgeId]/route.ts", method: "DELETE", gate: "creator", demands: ["manage_gamification"] },
  { route: "app/api/app/community/[id]/gamification/badges/route.ts", method: "POST", gate: "creator", demands: ["manage_gamification"] },
  { route: "app/api/app/community/[id]/gamification/points/route.ts", method: "POST", gate: "creator", demands: ["award_points"] },
  { route: "app/api/app/community/[id]/gamification/route.ts", method: "GET", gate: "creator", demands: ["manage_gamification"] },
  { route: "app/api/app/community/[id]/gamification/route.ts", method: "PATCH", gate: "creator", demands: ["manage_gamification"] },
  { route: "app/api/app/community/[id]/invites/[inviteId]/route.ts", method: "DELETE", gate: "creator", demands: ["invite"] },
  { route: "app/api/app/community/[id]/invites/bulk/route.ts", method: "POST", gate: "creator", demands: ["invite"] },
  { route: "app/api/app/community/[id]/invites/route.ts", method: "GET", gate: "creator", demands: ["invite"] },
  { route: "app/api/app/community/[id]/invites/route.ts", method: "POST", gate: "creator", demands: ["invite"] },
  { route: "app/api/app/community/[id]/join-questions/route.ts", method: "GET", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/[id]/join-questions/route.ts", method: "PUT", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/[id]/join-requests/route.ts", method: "GET", gate: "creator", demands: ["approve_member", "manage_members"], via: "the CSV copy demands manage_members, the list approve_member" },
  { route: "app/api/app/community/[id]/learn/[programId]/route.ts", method: "PATCH", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/learn/[programId]/route.ts", method: "DELETE", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/learn/members/route.ts", method: "GET", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/learn/route.ts", method: "GET", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/learn/route.ts", method: "POST", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/learn/route.ts", method: "PUT", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/api/app/community/[id]/members/[userId]/route.ts", method: "PATCH", gate: "creator", demands: ["approve_member", "ban", "change_role", "feature", "mute", "remove_member", "suspend"], via: "memberActionNeeds" },
  { route: "app/api/app/community/[id]/members/export/route.ts", method: "GET", gate: "creator", demands: ["manage_members"] },
  { route: "app/api/app/community/[id]/members/route.ts", method: "GET", gate: "creator", demands: ["remove_member"] },
  { route: "app/api/app/community/[id]/members/route.ts", method: "POST", gate: "creator", demands: ["manage_members"] },
  { route: "app/api/app/community/[id]/moderation/route.ts", method: "GET", gate: "creator", demands: ["review_reports"] },
  { route: "app/api/app/community/[id]/moderation/route.ts", method: "PATCH", gate: "creator", demands: ["review_reports"] },
  { route: "app/api/app/community/[id]/moderation/route.ts", method: "POST", gate: "creator", demands: ["feature", "lock", "moderate_content", "pin"], via: "contentActionNeeds" },
  { route: "app/api/app/community/[id]/onboarding/route.ts", method: "GET", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/[id]/onboarding/route.ts", method: "PUT", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/[id]/payments/route.ts", method: "GET", gate: "creator", demands: ["manage_pricing"] },
  { route: "app/api/app/community/[id]/posts/route.ts", method: "GET", gate: "creator", demands: ["moderate_content"] },
  { route: "app/api/app/community/[id]/posts/route.ts", method: "POST", gate: "creator", demands: ["post"] },
  { route: "app/api/app/community/[id]/refunds/route.ts", method: "POST", gate: "creator", demands: ["manage_pricing"] },
  { route: "app/api/app/community/[id]/route.ts", method: "GET", gate: "creator", demands: ["view"] },
  { route: "app/api/app/community/[id]/route.ts", method: "PATCH", gate: "creator", demands: ["manage_settings", "view"], via: "notifyOrSettings" },
  { route: "app/api/app/community/[id]/scheduled-posts/[postId]/route.ts", method: "PATCH", gate: "creator", demands: ["post"] },
  { route: "app/api/app/community/[id]/scheduled-posts/[postId]/route.ts", method: "DELETE", gate: "creator", demands: ["post"] },
  { route: "app/api/app/community/[id]/scheduled-posts/route.ts", method: "GET", gate: "creator", demands: ["post"] },
  { route: "app/api/app/community/[id]/scheduled-posts/route.ts", method: "POST", gate: "creator", demands: ["post"] },
  { route: "app/api/app/community/[id]/setup/route.ts", method: "GET", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/[id]/setup/route.ts", method: "POST", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/[id]/spaces/[spaceId]/route.ts", method: "PATCH", gate: "creator", demands: ["manage_spaces"] },
  { route: "app/api/app/community/[id]/spaces/[spaceId]/route.ts", method: "DELETE", gate: "creator", demands: ["manage_spaces"] },
  { route: "app/api/app/community/[id]/spaces/route.ts", method: "GET", gate: "creator", demands: ["manage_spaces"] },
  { route: "app/api/app/community/[id]/spaces/route.ts", method: "POST", gate: "creator", demands: ["manage_spaces"] },
  { route: "app/api/app/community/[id]/spaces/route.ts", method: "PUT", gate: "creator", demands: ["manage_spaces"] },
  { route: "app/api/app/community/[id]/tiers/[tierId]/products/route.ts", method: "POST", gate: "creator", demands: ["manage_pricing"] },
  { route: "app/api/app/community/[id]/tiers/[tierId]/route.ts", method: "PATCH", gate: "creator", demands: ["manage_pricing"] },
  { route: "app/api/app/community/[id]/tiers/route.ts", method: "GET", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/[id]/tiers/route.ts", method: "POST", gate: "creator", demands: ["manage_pricing"] },
  { route: "app/api/app/community/[id]/videos/[videoId]/route.ts", method: "GET", gate: "creator", demands: ["upload"] },
  { route: "app/api/app/community/[id]/videos/[videoId]/route.ts", method: "DELETE", gate: "creator", demands: ["moderate_content"] },
  { route: "app/api/app/community/[id]/videos/route.ts", method: "GET", gate: "creator", demands: ["upload"] },
  { route: "app/api/app/community/[id]/videos/route.ts", method: "POST", gate: "creator", demands: ["upload"] },
  { route: "app/api/app/community/[id]/words/route.ts", method: "GET", gate: "creator", demands: ["view"] },
  { route: "app/api/app/community/[id]/words/route.ts", method: "PUT", gate: "creator", demands: ["manage_settings"] },
  { route: "app/api/app/community/route.ts", method: "GET", gate: "creator_account", demands: [] },
  { route: "app/api/app/community/route.ts", method: "POST", gate: "creator_account", demands: [] },
  { route: "app/api/community/[communityId]/bookmarks/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/bookmarks/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/checkout/route.ts", method: "GET", gate: "viewer", demands: [] },
  { route: "app/api/community/[communityId]/classroom/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/comments/[commentId]/files/[assetId]/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/comments/[commentId]/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/comments/[commentId]/route.ts", method: "PATCH", gate: "member", demands: ["comment"] },
  { route: "app/api/community/[communityId]/comments/[commentId]/route.ts", method: "DELETE", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/contact/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/dms/[conversationId]/messages/[messageId]/route.ts", method: "DELETE", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/dms/[conversationId]/read/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/dms/[conversationId]/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/dms/[conversationId]/route.ts", method: "POST", gate: "member", demands: ["chat"] },
  { route: "app/api/community/[communityId]/dms/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/dms/route.ts", method: "POST", gate: "member", demands: ["chat"] },
  { route: "app/api/community/[communityId]/events/[eventId]/checkout/confirm/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/events/[eventId]/checkout/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/events/[eventId]/ics/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/events/[eventId]/invite/route.ts", method: "POST", gate: "member", demands: ["price_events"] },
  { route: "app/api/community/[communityId]/events/[eventId]/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/events/[eventId]/rsvp/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/events/[eventId]/ticket/route.ts", method: "DELETE", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/events/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/files/route.ts", method: "POST", gate: "member", demands: ["upload"] },
  { route: "app/api/community/[communityId]/get-started/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/get-started/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/gifs/route.ts", method: "GET", gate: "member", demands: ["post"] },
  { route: "app/api/community/[communityId]/invite/redeem/route.ts", method: "POST", gate: "open", demands: [] },
  { route: "app/api/community/[communityId]/invites/route.ts", method: "POST", gate: "member", demands: ["invite"] },
  { route: "app/api/community/[communityId]/join-questions/route.ts", method: "GET", gate: "viewer", demands: [] },
  { route: "app/api/community/[communityId]/join/route.ts", method: "POST", gate: "open", demands: [] },
  { route: "app/api/community/[communityId]/leaderboard/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/learn/[programId]/checkout/confirm/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/learn/[programId]/checkout/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/learn/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/leave/route.ts", method: "POST", gate: "open", demands: [] },
  { route: "app/api/community/[communityId]/links/[linkId]/click/route.ts", method: "POST", gate: "viewer", demands: [] },
  { route: "app/api/community/[communityId]/live/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/me/route.ts", method: "PATCH", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/member-profile/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/members/[userId]/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/members/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/membership/plan/route.ts", method: "GET", gate: "viewer", demands: [] },
  { route: "app/api/community/[communityId]/membership/plan/route.ts", method: "POST", gate: "viewer", demands: [] },
  { route: "app/api/community/[communityId]/membership/route.ts", method: "GET", gate: "viewer", demands: [] },
  { route: "app/api/community/[communityId]/membership/route.ts", method: "POST", gate: "viewer", demands: [] },
  { route: "app/api/community/[communityId]/messages/[messageId]/route.ts", method: "PATCH", gate: "member", demands: ["chat"] },
  { route: "app/api/community/[communityId]/messages/[messageId]/route.ts", method: "DELETE", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/moderation/act/route.ts", method: "POST", gate: "member", demands: ["feature", "lock", "moderate_content", "pin"], via: "contentActionNeeds" },
  { route: "app/api/community/[communityId]/moderation/members/route.ts", method: "POST", gate: "member", demands: ["approve_member", "ban", "change_role", "feature", "mute", "remove_member", "suspend"], via: "memberActionNeeds" },
  { route: "app/api/community/[communityId]/moderation/reports/route.ts", method: "GET", gate: "member", demands: ["review_reports"] },
  { route: "app/api/community/[communityId]/moderation/reports/route.ts", method: "PATCH", gate: "member", demands: ["review_reports"] },
  { route: "app/api/community/[communityId]/notifications/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/notifications/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/onboarding/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/people/[userId]/card/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/place/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/polls/[pollId]/vote/route.ts", method: "POST", gate: "member", demands: ["react"] },
  { route: "app/api/community/[communityId]/posts/[postId]/comments/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/posts/[postId]/comments/route.ts", method: "POST", gate: "member", demands: ["comment"] },
  { route: "app/api/community/[communityId]/posts/[postId]/files/[assetId]/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/posts/[postId]/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/posts/[postId]/route.ts", method: "PATCH", gate: "member", demands: ["post"] },
  { route: "app/api/community/[communityId]/posts/[postId]/route.ts", method: "DELETE", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/posts/link-preview/route.ts", method: "POST", gate: "member", demands: ["post"] },
  { route: "app/api/community/[communityId]/posts/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/posts/route.ts", method: "POST", gate: "member", demands: ["post"] },
  { route: "app/api/community/[communityId]/presence/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/reactions/route.ts", method: "POST", gate: "member", demands: ["react"] },
  { route: "app/api/community/[communityId]/reports/route.ts", method: "POST", gate: "member", demands: ["report"] },
  { route: "app/api/community/[communityId]/search/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/spaces/[spaceId]/messages/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/spaces/[spaceId]/messages/route.ts", method: "POST", gate: "member", demands: ["chat"] },
  { route: "app/api/community/[communityId]/spaces/[spaceId]/read/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/videos/[videoId]/captions/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/videos/[videoId]/play/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/videos/[videoId]/poster/route.ts", method: "POST", gate: "member", demands: ["view"] },
  { route: "app/api/community/[communityId]/videos/[videoId]/route.ts", method: "GET", gate: "member", demands: ["upload"] },
  { route: "app/api/community/[communityId]/videos/route.ts", method: "POST", gate: "member", demands: ["upload"] },
  { route: "app/api/community/[communityId]/visit/route.ts", method: "POST", gate: "viewer", demands: [] },
  { route: "app/api/community/by-slug/[slug]/member-chrome/route.ts", method: "GET", gate: "member", demands: ["view"] },
  { route: "app/api/store-builder/communities/route.ts", method: "GET", gate: "creator_account", demands: [] },
  { route: "app/app/community/[id]/analytics/page.tsx", method: "PAGE", gate: "creator", demands: ["view_analytics"] },
  { route: "app/app/community/[id]/events/page.tsx", method: "PAGE", gate: "creator", demands: ["manage_events"] },
  { route: "app/app/community/[id]/feed/page.tsx", method: "PAGE", gate: "creator", demands: ["moderate_content"] },
  { route: "app/app/community/[id]/gamification/page.tsx", method: "PAGE", gate: "creator", demands: ["manage_gamification"] },
  { route: "app/app/community/[id]/learn/page.tsx", method: "PAGE", gate: "creator", demands: ["manage_classroom"] },
  { route: "app/app/community/[id]/members/page.tsx", method: "PAGE", gate: "creator", demands: ["remove_member"] },
  { route: "app/app/community/[id]/moderation/page.tsx", method: "PAGE", gate: "creator", demands: ["review_reports"] },
  { route: "app/app/community/[id]/page.tsx", method: "PAGE", gate: "creator", demands: ["view"] },
  { route: "app/app/community/[id]/page/page.tsx", method: "PAGE", gate: "creator", demands: ["manage_settings"] },
  { route: "app/app/community/[id]/settings/page.tsx", method: "PAGE", gate: "creator", demands: ["manage_settings"] },
  { route: "app/app/community/[id]/spaces/page.tsx", method: "PAGE", gate: "creator", demands: ["manage_spaces"] },
] as const

/** The rows for one file, in the order they are written. */
export function rulesForRoute(route: string): CommunityRouteRule[] {
  return COMMUNITY_ROUTE_RULES.filter((r) => r.route === route)
}

/**
 * The roles that get through a door, from the same can() the route calls.
 * A door the body decides the action for lets a role in when any of its
 * actions does: the route then refuses the ones they may not take. `perms`
 * is a community's own choices for its admins and moderators; without it
 * the defaults.
 */
export function rolesThrough(rule: CommunityRouteRule, perms?: RolePermissions | null): Role[] {
  const roles: Role[] = ["owner", "admin", "moderator", "member"]
  return roles.filter((role) => {
    /* requireCreatorCommunity answers 404 to a plain member before it asks can() at all. */
    if (rule.gate === "creator" && role === "member") return false
    if (!rule.demands.length) return true
    return rule.demands.some((a) => can(role, a, perms))
  })
}

/** Whether a role is strictly above another, for a row that says who may act on whom. */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target]
}
