/**
 * ===========================================================================
 *  WHO MAY DO WHAT IN A COMMUNITY
 * ===========================================================================
 * Every permission decision in a community is made here, from the member's
 * role, so a page, a route and a test always answer the same. Pages and
 * routes ask can(), canActOn() or meetsRole(); they never compare role
 * strings themselves. Pure and browser safe.
 *
 *   owner      everything. Money and the community itself stay with them.
 *   admin      everything except transfer_ownership, delete and
 *              manage_pricing.
 *   moderator  keeps the place in order: removes, pins and locks content,
 *              mutes, suspends, bans and removes members ranked below them,
 *              approves requests, reviews reports and reads the audit log.
 *   member     reads, posts, comments, reacts, chats, uploads and reports.
 *
 * Being active is not decided here: a role is only handed to can() for a
 * member whose row is active (lib/communities/server/context.ts).
 */
import type { NotificationKind, NotifyLevel, Role } from "./types"

export const ROLE_RANK: Readonly<Record<Role, number>> = { member: 1, moderator: 2, admin: 3, owner: 4 }

export const COMMUNITY_ACTIONS = [
  "view",
  "post",
  "comment",
  "react",
  "chat",
  "upload",
  "report",
  "moderate_content",
  "pin",
  "lock",
  "feature",
  "announce",
  "mention_everyone",
  "mute",
  "suspend",
  "ban",
  "remove_member",
  "approve_member",
  "review_reports",
  "manage_spaces",
  "manage_events",
  "manage_classroom",
  "manage_members",
  "change_role",
  "invite",
  "manage_settings",
  "manage_pricing",
  "view_analytics",
  "view_audit",
  "manage_gamification",
  "award_points",
  "archive",
  "delete",
  "transfer_ownership",
] as const
export type CommunityAction = (typeof COMMUNITY_ACTIONS)[number]

const MEMBER_ACTIONS: readonly CommunityAction[] = ["view", "post", "comment", "react", "chat", "upload", "report"]

const MODERATOR_ACTIONS: readonly CommunityAction[] = [
  ...MEMBER_ACTIONS,
  "moderate_content",
  "pin",
  "lock",
  "mute",
  "suspend",
  "ban",
  "remove_member",
  "approve_member",
  "review_reports",
  "view_audit",
]

/** What only the owner may do: the money, and the community's existence. */
export const OWNER_ONLY_ACTIONS: readonly CommunityAction[] = ["transfer_ownership", "delete", "manage_pricing"]

const ALLOWED: Readonly<Record<Role, ReadonlySet<CommunityAction>>> = {
  owner: new Set(COMMUNITY_ACTIONS),
  admin: new Set(COMMUNITY_ACTIONS.filter((a) => !OWNER_ONLY_ACTIONS.includes(a))),
  moderator: new Set(MODERATOR_ACTIONS),
  member: new Set(MEMBER_ACTIONS),
}

/** Whether this role may do this. No role (not an active member) may do nothing. */
export function can(role: Role | null | undefined, action: CommunityAction): boolean {
  if (!role) return false
  return ALLOWED[role]?.has(action) ?? false
}

/**
 * Whether an actor may act on a target member (mute, ban, remove, change
 * their role): only on someone ranked strictly below. A moderator never bans
 * an admin, an admin never touches the owner, nobody acts on an equal.
 */
export function canActOn(actorRole: Role | null | undefined, targetRole: Role | null | undefined): boolean {
  if (!actorRole || !targetRole) return false
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole]
}

/** Whether a role is at least another, e.g. a space's post_role: meetsRole(role, space.post_role). */
export function meetsRole(role: Role | null | undefined, min: Role): boolean {
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

/** The roles an actor may give somebody: below their own, and only with change_role. */
export function assignableRoles(actorRole: Role | null | undefined): Role[] {
  if (!actorRole || !can(actorRole, "change_role")) return []
  return (["admin", "moderator", "member"] as const).filter((r) => ROLE_RANK[r] < ROLE_RANK[actorRole])
}

/** Every action a role may take, for a client component that draws only what works. */
export function allowedActions(role: Role | null | undefined): Partial<Record<CommunityAction, boolean>> {
  const out: Partial<Record<CommunityAction, boolean>> = {}
  for (const a of COMMUNITY_ACTIONS) if (can(role, a)) out[a] = true
  return out
}

/*
  WHAT A MEMBER HEARS ABOUT, by their notify_level:
    all        everything
    important  everything except reactions
    mentions   things addressed to them: a mention, a reply, a message from
               the admins, and news about their own membership
    none       nothing
*/
const ADDRESSED_TO_THEM: readonly NotificationKind[] = ["mention", "reply", "admin_message", "membership"]

export function wantsNotification(level: NotifyLevel | null | undefined, kind: NotificationKind): boolean {
  switch (level ?? "important") {
    case "all":
      return true
    case "important":
      return kind !== "reaction"
    case "mentions":
      return ADDRESSED_TO_THEM.includes(kind)
    default:
      return false
  }
}
