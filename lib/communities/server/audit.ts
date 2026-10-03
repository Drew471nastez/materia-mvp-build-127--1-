import "server-only"

/**
 * THE COMMUNITY'S AUDIT LOG: who did what, to what, and why. Append only
 * (a trigger refuses updates and deletes) and never cleaned up. Written after
 * the action; a failure to write it is logged and never undoes the action or
 * breaks the request, so this never throws.
 */
import type { AuditActorKind } from "../types"
import { missing, reasonOf, type Db } from "./db"

export interface AuditEntry {
  communityId: string | null
  actorId: string | null
  actorKind: AuditActorKind
  /** "community.created", "member.banned", "post.removed", ... */
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel?: string | null
  reason?: string | null
  detail?: Record<string, unknown>
}

export async function audit(db: Db, e: AuditEntry): Promise<boolean> {
  try {
    const { error } = await db.from("community_audit_log").insert({
      community_id: e.communityId,
      actor_id: e.actorId,
      actor_kind: e.actorKind,
      action: e.action.slice(0, 100),
      target_type: e.targetType,
      target_id: e.targetId,
      target_label: e.targetLabel ? e.targetLabel.slice(0, 200) : null,
      reason: e.reason ? e.reason.slice(0, 1000) : null,
      detail: e.detail ?? {},
    })
    if (error) {
      if (!missing(error)) console.error(`[communities] audit ${e.action} not written: ${reasonOf(error)}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[communities] audit ${e.action} not written: ${reasonOf(err)}`)
    return false
  }
}
