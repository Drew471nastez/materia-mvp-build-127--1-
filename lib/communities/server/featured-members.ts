import "server-only"

/**
 * ===========================================================================
 *  FEATURED MEMBERS, ON THE SERVER
 * ===========================================================================
 * The mark a creator or an admin puts on a member (round 34,
 * lib/communities/featured-members.ts for the rules and the words). Two
 * columns on the member's own row, run-now part 223.
 *
 * BEFORE PART 223 HAS RUN the columns are not there. Every read answers an
 * empty set, so no mark is drawn anywhere and nothing fails; the write
 * answers 503 needs_update, and the sheet says a database update is needed.
 * The whole Members screen works as it did.
 *
 * NOTHING IS RANKED. The read is the short list (FEATURED_MAX at most, on
 * the partial index), as a Set of user ids: a row that is in it says one
 * word. There is no order to be first in and no count to beat.
 */
import { FEATURED_MAX, FEATURE_MEMBER_ACTION, featureRefusal } from "../featured-members"
import { can, type RolePermissions } from "../permissions"
import type { CommunityRow, Role } from "../types"
import { audit } from "./audit"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { memberOf } from "./membership"
import { staffPermissions } from "./creator-roles"

export interface FeaturedRead {
  /** The featured members' user ids, newest mark first. Empty before part 223, and for a community with none. */
  ids: string[]
  /** False when the columns are not there yet: no mark is drawn, and a press on Feature is answered 503 needs_update in words. */
  ready: boolean
}

const EMPTY: FeaturedRead = { ids: [], ready: false }

/**
 * The community's featured members. One small read, bounded by FEATURED_MAX
 * however large the community is, so a member list can mark its rows without
 * a read per row.
 */
export async function featuredMembers(db: Db, communityId: string): Promise<FeaturedRead> {
  try {
    const { data, error } = await db
      .from("community_members")
      .select("user_id, featured_at")
      .eq("community_id", communityId)
      .eq("status", "active")
      .not("featured_at", "is", null)
      .order("featured_at", { ascending: false })
      .limit(FEATURED_MAX)
    if (error) {
      if (!missing(error)) console.error(`[communities] featured members read: ${reasonOf(error)}`)
      return EMPTY
    }
    return { ids: ((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id), ready: true }
  } catch (e) {
    console.error(`[communities] featured members read: ${reasonOf(e)}`)
    return EMPTY
  }
}

/** The same read as a Set, for marking the rows of a page. */
export async function featuredSet(db: Db, communityId: string): Promise<Set<string>> {
  return new Set((await featuredMembers(db, communityId)).ids)
}

export type FeatureOutcome = { ok: true; featured: boolean } | { ok: false; status: number; error: string }

/**
 * Feature a member, or stop featuring them. The "feature" permission, the
 * owner's own choices for the actor's role, and an active member who is not
 * the person pressing. No rank rule, because a mark takes nothing away from
 * anybody and nobody is stopped from recognising somebody who outranks them,
 * but nobody features themselves either.
 */
export async function setMemberFeatured(
  db: Db,
  a: { community: Pick<CommunityRow, "id" | "name">; actor: { userId: string; role: Role; perms?: RolePermissions | null }; userId: string; on: boolean },
): Promise<FeatureOutcome> {
  const perms = a.actor.perms !== undefined ? a.actor.perms : await staffPermissions(db, a.community.id, a.actor.role)
  if (!can(a.actor.role, FEATURE_MEMBER_ACTION, perms)) return { ok: false, status: 403, error: "forbidden" }

  const [member, current] = await Promise.all([memberOf(db, a.community.id, a.userId), featuredMembers(db, a.community.id)])
  if (!current.ready) return { ok: false, status: 503, error: "needs_update" }
  const already = current.ids.includes(a.userId)
  const refusal = featureRefusal({ on: a.on, member, featured: current.ids.filter((id) => id !== a.userId).length, self: a.userId === a.actor.userId })
  if (refusal) return { ok: false, status: refusal === "not_found" ? 404 : refusal === "too_many" ? 409 : 400, error: refusal }
  /* Already as asked: say yes without writing, so a double press is one state and not two log lines. */
  if (already === a.on) return { ok: true, featured: a.on }

  const patch = a.on ? { featured_at: nowIso(), featured_by: a.actor.userId } : { featured_at: null, featured_by: null }
  const { error } = await db.from("community_members").update(patch).eq("community_id", a.community.id).eq("user_id", a.userId)
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "needs_update" }
    console.error(`[communities] featured member write: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "failed" }
  }
  await audit(db, {
    communityId: a.community.id,
    actorId: a.actor.userId,
    actorKind: "member",
    action: a.on ? "member.featured" : "member.unfeatured",
    targetType: "member",
    targetId: a.userId,
  })
  return { ok: true, featured: a.on }
}
