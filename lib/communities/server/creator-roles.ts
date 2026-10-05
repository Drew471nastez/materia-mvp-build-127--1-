import "server-only"

/**
 * ===========================================================================
 *  WHAT A COMMUNITY'S ADMINS AND MODERATORS MAY DO, ON THE SERVER
 * ===========================================================================
 * The owner's choices live in one column, communities.role_permissions
 * (run-now part 100), read here and nowhere else. Every gate hands what it
 * reads to can() (lib/communities/permissions.ts): requireMember and
 * requireCreatorCommunity through the viewer (context.ts), the moderation
 * actions through their actor (moderation.ts), the /app pages through
 * their context (creator.ts).
 *
 * BEFORE PART 100 HAS RUN the column is not there: the read answers the
 * defaults (the roles as they always were) with `ready: false`, so the Roles
 * settings can say an update is needed, and saving answers 503. Nothing
 * breaks and nobody gets more than the defaults.
 *
 * Only the owner changes it. Money, deleting the community and handing it
 * over are never in it (OWNER_ONLY_ACTIONS), whatever is stored.
 */
import { parseRolePermissions, roleGroups, STAFF_ROLES, type PermissionKey, type RolePermissions, type StaffRole } from "../permissions"
import type { Role } from "../types"
import { audit } from "./audit"
import { missing, reasonOf, type Db } from "./db"

export interface RolePermissionsRead {
  perms: RolePermissions
  /** False until run-now part 100 has added the column. */
  ready: boolean
}

/** What this community's owner chose for its admins and moderators. Never throws: anything unreadable is the defaults. */
export async function rolePermissionsOf(db: Db, communityId: string): Promise<RolePermissionsRead> {
  try {
    const { data, error } = await db.from("communities").select("role_permissions").eq("id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] role permissions read: ${reasonOf(error)}`)
      return { perms: {}, ready: !missing(error) }
    }
    return { perms: parseRolePermissions((data as { role_permissions?: unknown } | null)?.role_permissions), ready: true }
  } catch (e) {
    console.error(`[communities] role permissions read: ${reasonOf(e)}`)
    return { perms: {}, ready: false }
  }
}

/** For a gate: the owner's choices only matter to an admin or a moderator, so nobody else pays for the read. */
export async function staffPermissions(db: Db, communityId: string, role: Role | null | undefined): Promise<RolePermissions | null> {
  if (role !== "admin" && role !== "moderator") return null
  return (await rolePermissionsOf(db, communityId)).perms
}

/** The owner's choices for several communities at once (the /app list), by id; missing ids have the defaults. */
export async function staffPermissionsFor(db: Db, communityIds: string[]): Promise<Map<string, RolePermissions>> {
  const out = new Map<string, RolePermissions>()
  if (!communityIds.length) return out
  try {
    const { data, error } = await db.from("communities").select("id, role_permissions").in("id", communityIds)
    if (error) {
      if (!missing(error)) console.error(`[communities] role permissions read: ${reasonOf(error)}`)
      return out
    }
    for (const r of (data as { id: string; role_permissions?: unknown }[] | null) ?? []) out.set(r.id, parseRolePermissions(r.role_permissions))
  } catch (e) {
    console.error(`[communities] role permissions read: ${reasonOf(e)}`)
  }
  return out
}

/** Both staff roles with every group on or off, for the Roles settings. */
export function rolesView(perms: RolePermissions): Record<StaffRole, Record<PermissionKey, boolean>> {
  return { admin: roleGroups("admin", perms), moderator: roleGroups("moderator", perms) }
}

type Saved = { ok: true; roles: Record<StaffRole, Record<PermissionKey, boolean>> } | { ok: false; status: number; error: string }

/**
 * The owner's new choices, whole (both roles, every group): kept as sent
 * after parseRolePermissions drops anything that is not a known group and a
 * boolean. Logged with what changed.
 */
export async function saveRolePermissions(db: Db, a: { communityId: string; communityName: string; actorId: string; role: Role; body: unknown }): Promise<Saved> {
  if (a.role !== "owner") return { ok: false, status: 403, error: "forbidden" }
  const next = parseRolePermissions(a.body)
  if (!STAFF_ROLES.some((r) => next[r])) return { ok: false, status: 400, error: "invalid_permissions" }
  const before = await rolePermissionsOf(db, a.communityId)
  if (!before.ready) return { ok: false, status: 503, error: "needs_update" }
  /* Stored whole, defaults filled in, so a later change to the defaults never quietly changes what an owner chose. */
  const stored = rolesView({ ...before.perms, ...next })
  const { error } = await db.from("communities").update({ role_permissions: stored }).eq("id", a.communityId)
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "needs_update" }
    console.error(`[communities] role permissions save: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "failed" }
  }
  const old = rolesView(before.perms)
  const changed: string[] = []
  for (const r of STAFF_ROLES) for (const [k, v] of Object.entries(stored[r])) if (old[r][k as PermissionKey] !== v) changed.push(`${r}.${k}=${v ? "on" : "off"}`)
  if (changed.length) await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "community.roles_changed", targetType: "community", targetId: a.communityId, targetLabel: a.communityName, detail: { changed } })
  return { ok: true, roles: stored }
}
