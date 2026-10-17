import "server-only"

/**
 * ===========================================================================
 *  WHO MAY MESSAGE THEM, ON THE SERVER
 * ===========================================================================
 * The member's own choice (lib/communities/message-privacy.ts) read from
 * their row, and the one place that answers "may this person message that
 * one".
 *
 * ITS OWN READ, not a column on the member read. community_members.dm_from
 * is added by run-now part 222; asking for it inside MEMBER_COLUMNS would
 * fail every member read until the part has run, and that would take the
 * whole community down. Read on its own it degrades to the default, so
 * before the part runs everybody may message everybody, exactly as today.
 */
import { DEFAULT_DM_FROM, mayMessage, parseDmFrom, type DmFrom } from "../message-privacy"
import type { Role } from "../types"
import { missing, reasonOf, type Db } from "./db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What this member lets through. The default for anybody who never chose, and before part 222. */
export async function dmFromOf(db: Db, communityId: string, userId: string): Promise<DmFrom> {
  if (!UUID.test(userId)) return DEFAULT_DM_FROM
  try {
    const { data, error } = await db.from("community_members").select("dm_from").eq("community_id", communityId).eq("user_id", userId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] message privacy read: ${reasonOf(error)}`)
      return DEFAULT_DM_FROM
    }
    return parseDmFrom((data as { dm_from?: unknown } | null)?.dm_from)
  } catch (e) {
    console.error(`[communities] message privacy read: ${reasonOf(e)}`)
    return DEFAULT_DM_FROM
  }
}

/**
 * Whether `senderRole` may message `targetId` here. Asked when a
 * conversation is opened and again on every message, so a setting changed
 * after a conversation started takes effect at once.
 */
export async function mayMessageMember(db: Db, communityId: string, targetId: string, senderRole: Role | null | undefined): Promise<boolean> {
  return mayMessage(await dmFromOf(db, communityId, targetId), senderRole)
}
