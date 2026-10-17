/**
 * ===========================================================================
 *  FEATURED MEMBERS
 * ===========================================================================
 * Round 34, the owner: "let community creators/admins feature selected
 * members. Keep this optional and visually subtle. The feature should
 * recognize contributors without turning the community into an unnecessarily
 * competitive environment."
 *
 * So there is no board, no rank and no score. A creator or an admin marks a
 * member, and that member's row in the directory and their profile head say
 * one quiet word. A community can mark FEATURED_MAX of them; past that the
 * creator takes one off first, which keeps the list short enough to read and
 * short enough to mean something.
 *
 * The mark lives on the member's own row (community_members.featured_at and
 * featured_by, run-now part 222). Featuring needs the "feature" permission,
 * the same one that picks the posts shown first, so an owner who hands that
 * group to an admin hands both. Nothing about rank applies: an admin may
 * feature another admin, because this takes nothing away from anybody.
 *
 * Pure and browser safe: the server (lib/communities/server/featured-members.ts)
 * and the screens both read it.
 */
import { can, type CommunityAction, type RolePermissions } from "./permissions"
import type { Role } from "./types"

/** How many members one community may have featured at once. */
export const FEATURED_MAX = 12

/** The permission featuring a member needs. */
export const FEATURE_MEMBER_ACTION: CommunityAction = "feature"

/** Whether this role may feature and unfeature members here. */
export function canFeatureMembers(role: Role | null | undefined, perms?: RolePermissions | null): boolean {
  return can(role, FEATURE_MEMBER_ACTION, perms)
}

/**
 * Whether a member can be featured at all: only somebody who is actually
 * here. A request, somebody who left, was removed or banned cannot be
 * recognised, and unfeaturing one of those is always allowed so a mark left
 * on a row can be taken off.
 */
export function featurable(member: { status: string | null } | null | undefined): boolean {
  return member?.status === "active"
}

/** The word a row or a profile shows. One word, no count, no place in a list. */
export const FEATURED_WORD = "Featured"

/**
 * Why a feature was refused, or null when it may go ahead. `featured` is how
 * many the community has now, not counting this member. `self` is true when
 * the person pressing is the person they would be featuring: this is for
 * recognising somebody else, so it is refused, by the screen and by the
 * server alike.
 */
export function featureRefusal(a: { on: boolean; member: { status: string | null } | null; featured: number; self?: boolean }): "not_found" | "not_active" | "too_many" | "self" | null {
  if (!a.member) return "not_found"
  if (!a.on) return null
  if (a.self) return "self"
  if (!featurable(a.member)) return "not_active"
  if (a.featured >= FEATURED_MAX) return "too_many"
  return null
}

/** What the refusal says, for the sheet. */
export function featureRefusalText(reason: Exclude<ReturnType<typeof featureRefusal>, null> | "needs_update"): string {
  switch (reason) {
    case "not_found":
      return "That member is not here any more."
    case "not_active":
      return "Only a member who is here can be featured."
    case "too_many":
      return `A community can feature ${FEATURED_MAX} members. Take one off first.`
    case "self":
      return "Featuring is for somebody else."
    default:
      return "Featuring members needs a database update. Run the latest SQL part and try again."
  }
}
