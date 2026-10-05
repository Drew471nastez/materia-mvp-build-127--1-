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
 *              approves requests, reviews reports, reads the audit log, and
 *              prices events and refunds tickets.
 *   member     reads, posts, comments, reacts, chats, uploads and reports.
 *
 * The owner can narrow or widen what admins and moderators may do, a group
 * at a time (PERMISSION_GROUPS below); the lines above are the defaults.
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
  "price_events",
  "refund_tickets",
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
  "price_events",
  "refund_tickets",
]

/** What only the owner may do: the money, and the community's existence. */
export const OWNER_ONLY_ACTIONS: readonly CommunityAction[] = ["transfer_ownership", "delete", "manage_pricing"]

const ALLOWED: Readonly<Record<Role, ReadonlySet<CommunityAction>>> = {
  owner: new Set(COMMUNITY_ACTIONS),
  admin: new Set(COMMUNITY_ACTIONS.filter((a) => !OWNER_ONLY_ACTIONS.includes(a))),
  moderator: new Set(MODERATOR_ACTIONS),
  member: new Set(MEMBER_ACTIONS),
}

/*
  WHAT THE OWNER MAY HAND TO ADMINS AND MODERATORS (round 13, run-now part
  100: communities.role_permissions). The actions an admin or a moderator may
  take, in groups a person can read, each one on or off per role. What a
  member may do is always theirs, and the owner only actions never move:
  money, deleting the community and handing it over stay with the owner.
  A community that never changed anything (or a database without the column)
  has the defaults below, which are exactly the roles as they were:
    admin      every group
    moderator  posts and comments, members, reports, the audit log, and
               pricing events and refunding tickets
*/
export const STAFF_ROLES = ["admin", "moderator"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const PERMISSION_GROUPS = [
  { key: "content", label: "Remove, restore, pin and close comments", detail: "On any post or comment by a member ranked below them.", actions: ["moderate_content", "pin", "lock"] },
  { key: "feature", label: "Feature posts", detail: "Pick the posts shown first on the About page.", actions: ["feature"] },
  { key: "members", label: "Mute, suspend, ban and remove members", detail: "And approve or decline requests to join.", actions: ["mute", "suspend", "ban", "remove_member", "approve_member"] },
  { key: "reports", label: "Review reports", detail: "The report queue, held posts and join alarms.", actions: ["review_reports"] },
  { key: "audit", label: "Read the audit log", detail: "Who did what, and when.", actions: ["view_audit"] },
  { key: "announce", label: "Post announcements", detail: "And mention everyone at once.", actions: ["announce", "mention_everyone"] },
  { key: "people", label: "Invite people and change roles", detail: "Invite links, member emails and roles below their own.", actions: ["manage_members", "change_role", "invite"] },
  { key: "spaces", label: "Manage spaces", detail: "Add, rename, order and archive spaces.", actions: ["manage_spaces"] },
  { key: "learn", label: "Manage Learn", detail: "Programs, modules and lessons.", actions: ["manage_classroom"] },
  { key: "events", label: "Manage the calendar", detail: "Add, change and cancel events.", actions: ["manage_events"] },
  { key: "tickets", label: "Price events and refund tickets", detail: "Set what an event costs, invite people free, and give money back.", actions: ["price_events", "refund_tickets"] },
  { key: "settings", label: "Change settings", detail: "The page, features, points and levels, and archiving.", actions: ["manage_settings", "manage_gamification", "award_points", "archive"] },
  { key: "analytics", label: "See analytics", detail: "Members, activity and revenue.", actions: ["view_analytics"] },
] as const satisfies readonly { key: string; label: string; detail: string; actions: readonly CommunityAction[] }[]

export type PermissionKey = (typeof PERMISSION_GROUPS)[number]["key"]
export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_GROUPS.map((g) => g.key)

/** Per role, the groups that differ from the defaults (or all of them; extra keys are ignored). */
export type RolePermissions = Partial<Record<StaffRole, Partial<Record<PermissionKey, boolean>>>>

const GROUP_OF = new Map<CommunityAction, PermissionKey>(PERMISSION_GROUPS.flatMap((g) => g.actions.map((a) => [a as CommunityAction, g.key] as const)))

/** The groups each staff role has when the owner changed nothing: the roles as they were before round 13. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<StaffRole, Readonly<Record<PermissionKey, boolean>>>> = {
  admin: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermissionKey, boolean>,
  moderator: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, ["content", "members", "reports", "audit", "tickets"].includes(k)])) as Record<PermissionKey, boolean>,
}

/**
 * Whatever is stored (or sent), as permissions: only the two staff roles,
 * only known groups, only booleans. Anything else is dropped, so a bad row
 * means the defaults, never more.
 */
export function parseRolePermissions(raw: unknown): RolePermissions {
  const out: RolePermissions = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const role of STAFF_ROLES) {
    const given = (raw as Record<string, unknown>)[role]
    if (!given || typeof given !== "object" || Array.isArray(given)) continue
    const groups: Partial<Record<PermissionKey, boolean>> = {}
    for (const key of PERMISSION_KEYS) {
      const v = (given as Record<string, unknown>)[key]
      if (typeof v === "boolean") groups[key] = v
    }
    if (Object.keys(groups).length) out[role] = groups
  }
  return out
}

/** Every group of a staff role, on or off, with the defaults filled in. */
export function roleGroups(role: StaffRole, perms?: RolePermissions | null): Record<PermissionKey, boolean> {
  return { ...DEFAULT_ROLE_PERMISSIONS[role], ...(perms?.[role] ?? {}) }
}

/**
 * Whether this role may do this. No role (not an active member) may do
 * nothing. `perms` is the community's role_permissions; without it an admin
 * and a moderator have the defaults.
 */
export function can(role: Role | null | undefined, action: CommunityAction, perms?: RolePermissions | null): boolean {
  if (!role) return false
  if (role === "admin" || role === "moderator") {
    if (OWNER_ONLY_ACTIONS.includes(action)) return false
    if (MEMBER_ACTIONS.includes(action)) return true
    const group = GROUP_OF.get(action)
    if (!group) return ALLOWED[role]?.has(action) ?? false
    return perms?.[role]?.[group] ?? DEFAULT_ROLE_PERMISSIONS[role][group]
  }
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
export function assignableRoles(actorRole: Role | null | undefined, perms?: RolePermissions | null): Role[] {
  if (!actorRole || !can(actorRole, "change_role", perms)) return []
  return (["admin", "moderator", "member"] as const).filter((r) => ROLE_RANK[r] < ROLE_RANK[actorRole])
}

/** Every action a role may take, for a client component that draws only what works. */
export function allowedActions(role: Role | null | undefined, perms?: RolePermissions | null): Partial<Record<CommunityAction, boolean>> {
  const out: Partial<Record<CommunityAction, boolean>> = {}
  for (const a of COMMUNITY_ACTIONS) if (can(role, a, perms)) out[a] = true
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
