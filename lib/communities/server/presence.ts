import "server-only"

/**
 * ===========================================================================
 *  WHO IS HERE NOW: A REAL HEARTBEAT, AND THE THREE NUMBERS ON A COMMUNITY
 * ===========================================================================
 * Online means an active member whose page told the server it was open in
 * the last five minutes. Every member page sends a heartbeat once a minute
 * while it is on screen (POST /api/community/<id>/presence); the server
 * writes community_members.last_seen_at at most once a minute per member,
 * whatever the page sends, so ten open tabs are one write a minute.
 *
 * Part 85 adds the column. Before it has run there is no heartbeat to store
 * and no number to show: the write answers "not ready" and the count is
 * null, which every page draws as nothing. Never a guess, never a fake.
 *
 * The count reads the (community_id, last_seen_at DESC) index part 85 makes,
 * so it is the same cost at ten members as at ten thousand.
 */
import type { CommunityRow } from "../types"
import { missing, reasonOf, type Db } from "./db"

/** How recently a member's page must have said it is open to count as online. */
export const ONLINE_WINDOW_MS = 5 * 60_000
/** How often a member's last_seen_at is written at most, and how often a page sends a heartbeat. */
export const HEARTBEAT_MS = 60_000

/** A column that is not there yet (42703, or PostgREST's PGRST204), or a table that is not. */
function notThereYet(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === "42703" || code === "PGRST204" || missing(error as { code?: string })
}

/**
 * Marks the member as here now, unless that was already written in the last
 * minute. "ready" false while part 85 has not run. Never throws.
 */
export async function touchPresence(db: Db, communityId: string, userId: string, now: number = Date.now()): Promise<{ ready: boolean; written: boolean }> {
  try {
    const at = new Date(now).toISOString()
    const since = new Date(now - HEARTBEAT_MS).toISOString()
    const { data, error } = await db
      .from("community_members")
      .update({ last_seen_at: at })
      .eq("community_id", communityId)
      .eq("user_id", userId)
      .eq("status", "active")
      .or(`last_seen_at.is.null,last_seen_at.lt."${since}"`)
      .select("id")
    if (error) {
      if (notThereYet(error)) return { ready: false, written: false }
      console.error(`[communities] presence write: ${reasonOf(error)}`)
      return { ready: true, written: false }
    }
    return { ready: true, written: Array.isArray(data) && data.length > 0 }
  } catch (e) {
    console.error(`[communities] presence write: ${reasonOf(e)}`)
    return { ready: true, written: false }
  }
}

/** Active members seen in the last five minutes, or null when that cannot be known (no column yet, a failed read). */
export async function onlineCount(db: Db, communityId: string, now: number = Date.now()): Promise<number | null> {
  try {
    const { count, error } = await db
      .from("community_members")
      .select("id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("status", "active")
      .gte("last_seen_at", new Date(now - ONLINE_WINDOW_MS).toISOString())
    if (error) {
      if (!notThereYet(error)) console.error(`[communities] online count: ${reasonOf(error)}`)
      return null
    }
    return typeof count === "number" ? count : null
  } catch (e) {
    console.error(`[communities] online count: ${reasonOf(e)}`)
    return null
  }
}

/** The community's team that runs it: its owner and admins who are active. Null when it cannot be read. */
export async function adminCount(db: Db, communityId: string): Promise<number | null> {
  try {
    const { count, error } = await db
      .from("community_members")
      .select("id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
    if (error) {
      if (!missing(error)) console.error(`[communities] admin count: ${reasonOf(error)}`)
      return null
    }
    return typeof count === "number" ? count : null
  } catch (e) {
    console.error(`[communities] admin count: ${reasonOf(e)}`)
    return null
  }
}

export interface CommunityStats {
  /** The trigger kept count of active members. */
  members: number
  /** Active members seen in the last five minutes; null hides the figure. */
  online: number | null
  /** Active owner and admins; null hides the figure. */
  admins: number | null
}

/** Members, online and admins, as the about card and the feed's side card show them. Two counted reads. */
export async function communityStats(db: Db, community: Pick<CommunityRow, "id" | "member_count">, now: number = Date.now()): Promise<CommunityStats> {
  const [online, admins] = await Promise.all([onlineCount(db, community.id, now), adminCount(db, community.id)])
  return { members: Math.max(0, community.member_count ?? 0), online, admins }
}
