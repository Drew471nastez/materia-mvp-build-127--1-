import "server-only"

/**
 * ===========================================================================
 *  POINTS, LEVELS AND THE LEADERBOARD
 * ===========================================================================
 * A point is a row in community_point_events with a key that says what
 * earned it (`react:post:<postId>:<reactorId>`), and the database takes each
 * key once (public.community_award_points). A trigger keeps the member's
 * total and level in step, so the number on a profile is always the sum of
 * real rows. Taking a reaction back takes its points back by the same key.
 *
 * The leaderboard for the last 7 or 30 days is a sum over those rows
 * (public.community_leaderboard); all time is the member's running total.
 */
import type { LeaderboardEntry, PointReason } from "../types"
import { notifyMember } from "./notify"
import { recordActivity } from "./activity"
import { missing, nowIso, reasonOf, type Db } from "./db"

export interface AwardInput {
  communityId: string
  userId: string
  points: number
  reason: PointReason
  sourceKey: string
  actorId?: string | null
}

export interface AwardResult {
  awarded: boolean
  level: number | null
  leveledUp: boolean
}

async function memberLevel(db: Db, communityId: string, userId: string): Promise<{ level: number; status: string } | null> {
  const { data, error } = await db.from("community_members").select("level, status").eq("community_id", communityId).eq("user_id", userId).maybeSingle()
  if (error || !data) return null
  return { level: Number(data.level) || 1, status: String(data.status) }
}

/**
 * Gives a member points once per key. Nobody earns points from themselves:
 * the caller passes the reactor as actorId and a self reaction earns nothing.
 * A member who reaches a new level gets one notification and one activity
 * row for it.
 */
export async function awardPoints(db: Db, a: AwardInput): Promise<AwardResult> {
  const none: AwardResult = { awarded: false, level: null, leveledUp: false }
  if (!a.sourceKey || !Number.isFinite(a.points) || a.points === 0) return none
  if (a.actorId && a.actorId === a.userId && a.reason === "reaction_received") return none
  try {
    const before = await memberLevel(db, a.communityId, a.userId)
    if (!before) return none
    const { data, error } = await db.rpc("community_award_points", {
      p_community: a.communityId,
      p_user: a.userId,
      p_points: Math.trunc(a.points),
      p_reason: a.reason,
      p_source_key: a.sourceKey.slice(0, 200),
      p_actor: a.actorId ?? null,
    })
    if (error) {
      if (!missing(error)) console.error(`[communities] points ${a.sourceKey}: ${reasonOf(error)}`)
      return none
    }
    if (data !== true) return { awarded: false, level: before.level, leveledUp: false }
    const after = await memberLevel(db, a.communityId, a.userId)
    const level = after?.level ?? before.level
    const leveledUp = level > before.level
    if (leveledUp) await announceLevel(db, a.communityId, a.userId, level, before.level)
    return { awarded: true, level, leveledUp }
  } catch (e) {
    console.error(`[communities] points ${a.sourceKey}: ${reasonOf(e)}`)
    return none
  }
}

async function announceLevel(db: Db, communityId: string, userId: string, level: number, before: number): Promise<void> {
  await recordActivity(db, { communityId, userId, kind: "level_up", targetType: "level", targetId: String(level) })
  /* Round 38: the community's automated messages for each level reached on the way, once per member (./chat-automations.ts). Never throws. */
  try {
    const { automationsOnEvent } = await import("./chat-automations")
    await automationsOnEvent(db, communityId, userId, [{ kind: "level", before, after: level }])
  } catch (e) {
    console.error(`[communities] automated messages on a level: ${reasonOf(e)}`)
  }
  const [{ data: community }, { data: named }] = await Promise.all([
    db.from("communities").select("slug, name").eq("id", communityId).maybeSingle(),
    db.from("community_levels").select("name").eq("community_id", communityId).eq("level", level).maybeSingle(),
  ])
  if (!community?.slug) return
  await notifyMember(db, {
    userId,
    communityId,
    kind: "level_up",
    title: named?.name ? `You reached level ${level}: ${named.name}` : `You reached level ${level}`,
    body: community.name ? `In ${community.name}.` : null,
    url: `/community/${community.slug}/leaderboard`,
    dedupeKey: `level:${communityId}:${userId}:${level}`,
  })
}

/** Takes back the points one key gave (a reaction undone). True when there were some. */
export async function revokePoints(db: Db, r: { communityId: string; userId: string; sourceKey: string }): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("community_point_events")
      .delete()
      .eq("community_id", r.communityId)
      .eq("user_id", r.userId)
      .eq("source_key", r.sourceKey)
      .select("id")
    if (error) {
      if (!missing(error)) console.error(`[communities] points back ${r.sourceKey}: ${reasonOf(error)}`)
      return false
    }
    return Array.isArray(data) && data.length > 0
  } catch (e) {
    console.error(`[communities] points back ${r.sourceKey}: ${reasonOf(e)}`)
    return false
  }
}

export type LeaderboardPeriod = "7d" | "30d" | "all"

const PERIOD_DAYS: Record<Exclude<LeaderboardPeriod, "all">, number> = { "7d": 7, "30d": 30 }

/**
 * The top active members by points: earned in the last 7 or 30 days, or all
 * time. Ranks are shared on a tie (two members on 40 are both second).
 */
export async function leaderboard(db: Db, communityId: string, period: LeaderboardPeriod, limit = 10, now: number = Date.now()): Promise<LeaderboardEntry[]> {
  const n = Math.max(1, Math.min(100, Math.floor(limit) || 10))
  try {
    let rows: { userId: string; points: number; level: number }[] = []
    if (period === "all") {
      const { data, error } = await db
        .from("community_members")
        .select("user_id, points, level")
        .eq("community_id", communityId)
        .eq("status", "active")
        .gt("points", 0)
        .order("points", { ascending: false })
        .order("user_id", { ascending: true })
        .limit(n)
      if (error) {
        if (!missing(error)) console.error(`[communities] leaderboard: ${reasonOf(error)}`)
        return []
      }
      rows = ((data as { user_id: string; points: number; level: number }[] | null) ?? []).map((r) => ({ userId: r.user_id, points: r.points, level: r.level }))
    } else {
      const since = nowIso(now - PERIOD_DAYS[period] * 86_400_000)
      const { data, error } = await db.rpc("community_leaderboard", { p_community: communityId, p_since: since, p_limit: n })
      if (error) {
        if (!missing(error)) console.error(`[communities] leaderboard: ${reasonOf(error)}`)
        return []
      }
      const sums = ((data as { user_id: string; points: number | string }[] | null) ?? []).map((r) => ({ userId: r.user_id, points: Number(r.points) }))
      const levels = new Map<string, number>()
      if (sums.length) {
        const { data: members } = await db.from("community_members").select("user_id, level").eq("community_id", communityId).in("user_id", sums.map((s) => s.userId))
        for (const m of (members as { user_id: string; level: number }[] | null) ?? []) levels.set(m.user_id, m.level)
      }
      rows = sums.map((s) => ({ ...s, level: levels.get(s.userId) ?? 1 }))
    }
    let rank = 0
    let last: number | null = null
    return rows.map((r, i) => {
      if (r.points !== last) {
        rank = i + 1
        last = r.points
      }
      return { rank, userId: r.userId, points: r.points, level: r.level }
    })
  } catch (e) {
    console.error(`[communities] leaderboard: ${reasonOf(e)}`)
    return []
  }
}
