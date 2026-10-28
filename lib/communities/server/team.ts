import "server-only"

/**
 * ===========================================================================
 *  A STORE'S TEAM IN ITS COMMUNITIES (round 40)
 * ===========================================================================
 * Someone on a store's team with the Community permission runs the store's
 * communities. How:
 *
 *   which      only communities of the store they are working in
 *              (communities.creator_id), never another creator's, and never
 *              one they could reach some other way while the cookie names
 *              this store
 *   as what    an admin of each: everything an admin may do there, as the
 *              owner set it in the community's own Roles
 *              (communities.role_permissions). What stays with the owner
 *              stays with them: deleting a community, handing it over, its
 *              prices (lib/communities/permissions OWNER_ONLY_ACTIONS), and
 *              making a new community at all.
 *   as whom    the store. A post, a comment, an announcement or a message
 *              they write is the community owner's account
 *              (communities.owner_user_id), the identity members already
 *              see for the store; a team member has no member row and no
 *              place in the community of their own. community_feed_posts
 *              has no column for who really typed it, so every audit log
 *              line the action writes carries it instead, in
 *              detail.team_member_user_id (teamAuditDb below), and the
 *              owner can read who did what in the community's audit log.
 *
 * Pure apart from the Proxy, so tests/team-areas-r40.test.ts reads it whole.
 */
import type { CommunityRow, Role } from "../types"
import type { Db } from "./db"

/** The role a team member has in each of the store's communities. */
export const TEAM_COMMUNITY_ROLE: Role = "admin"

/** Where the person who really acted is written on an audit line. */
export const TEAM_AUDIT_KEY = "team_member_user_id"

/**
 * Whose account a team member's work in this community is, or null when the
 * community is not the store's (another creator's, or none).
 */
export function teamCommunityIdentity(community: Pick<CommunityRow, "creator_id" | "owner_user_id">, store: { creatorId: string; ownerUserId: string | null }): string | null {
  if (!community.creator_id || community.creator_id !== store.creatorId) return null
  return community.owner_user_id || store.ownerUserId || null
}

function stamp(row: unknown, memberUserId: string): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row
  const r = row as Record<string, unknown>
  const detail = r.detail && typeof r.detail === "object" && !Array.isArray(r.detail) ? (r.detail as Record<string, unknown>) : {}
  return { ...r, detail: { ...detail, [TEAM_AUDIT_KEY]: memberUserId } }
}

/** A row for community_audit_log with the team member written on it. Exported for the suite. */
export function stampAudit<T>(values: T, memberUserId: string): T {
  return (Array.isArray(values) ? values.map((v) => stamp(v, memberUserId)) : stamp(values, memberUserId)) as T
}

/**
 * The same database client, except that every line written to the
 * community's audit log names the team member who acted. Every other table,
 * call and property is the client's own.
 */
export function teamAuditDb(db: Db, memberUserId: string): Db {
  const bound = (target: object, key: PropertyKey) => {
    const v = Reflect.get(target, key)
    return typeof v === "function" ? v.bind(target) : v
  }
  return new Proxy(db, {
    get(target, key) {
      if (key !== "from") return bound(target, key)
      return (table: string, ...rest: unknown[]) => {
        const q = target.from(table, ...rest)
        if (table !== "community_audit_log" || !q || typeof q !== "object") return q
        return new Proxy(q, {
          get(t, k) {
            if (k !== "insert") return bound(t, k)
            return (values: unknown, ...more: unknown[]) => t.insert(stampAudit(values, memberUserId), ...more)
          },
        })
      }
    },
  })
}
