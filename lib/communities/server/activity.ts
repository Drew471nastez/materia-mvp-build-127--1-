import "server-only"

/**
 * WHAT MEMBERS DID, for analytics and the "active" count: one row per thing
 * that happened (community_activity), and the member's last_active_at,
 * moved at most once every ten minutes so a busy member is not a write per
 * click. Never throws.
 */
import type { ActivityKind } from "../types"
import { missing, nowIso, reasonOf, type Db } from "./db"

export const ACTIVE_BUMP_MS = 10 * 60_000

export interface ActivityEntry {
  communityId: string
  userId: string | null
  kind: ActivityKind
  targetType?: string | null
  targetId?: string | null
}

export async function recordActivity(db: Db, a: ActivityEntry): Promise<void> {
  try {
    const { error } = await db.from("community_activity").insert({
      community_id: a.communityId,
      user_id: a.userId,
      kind: a.kind,
      target_type: a.targetType ?? null,
      target_id: a.targetId ?? null,
    })
    if (error && !missing(error)) console.error(`[communities] activity ${a.kind} not written: ${reasonOf(error)}`)
  } catch (err) {
    console.error(`[communities] activity ${a.kind} not written: ${reasonOf(err)}`)
  }
  if (a.userId) await touchMember(db, a.communityId, a.userId)
}

/** Moves the member's last_active_at to now, unless it moved in the last ten minutes. */
export async function touchMember(db: Db, communityId: string, userId: string, now: number = Date.now()): Promise<void> {
  try {
    const cutoff = nowIso(now - ACTIVE_BUMP_MS)
    const { error } = await db
      .from("community_members")
      .update({ last_active_at: nowIso(now) })
      .eq("community_id", communityId)
      .eq("user_id", userId)
      .or(`last_active_at.is.null,last_active_at.lt."${cutoff}"`)
    if (error && !missing(error)) console.error(`[communities] last active not moved: ${reasonOf(error)}`)
  } catch (err) {
    console.error(`[communities] last active not moved: ${reasonOf(err)}`)
  }
}
