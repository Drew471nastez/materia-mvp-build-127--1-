import "server-only"

/**
 * ===========================================================================
 *  THE WALL'S SIDE COLUMNS: WHO IS AROUND, WHAT IS NEXT, WHO TAKES PART
 * ===========================================================================
 * The member frame draws the feed between two columns (components/community/
 * member/shell-frame.tsx): on the left the community card with up to seven
 * faces of the members most recently here, on the right the next event and
 * the top contributors. Every figure comes from real rows, and a card with
 * nothing real to say is not drawn at all: no event coming, no card; nobody
 * contributed, no card.
 *
 * COST. Everything here is a handful of bounded reads on indexes part 81 and
 * part 85 made: faces on (community_id, last_seen_at DESC) or
 * (community_id, last_active_at DESC), the leaderboard through
 * public.community_leaderboard, activity on (community_id, created_at DESC)
 * with at most ACTIVITY_SCAN rows looked at, events on (community_id,
 * starts_at). Ten members or ten thousand, the same few reads.
 */
import { evaluateAccess } from "../access"
import { can } from "../permissions"
import type { CommunityRow } from "../types"
import type { WallContributors, WallData, WallEvent, WallFace } from "@/components/community/member/view-types"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { accessOf } from "./feed"
import { leaderboard } from "./points"
import { communityStats } from "./presence"

/** Faces in the stack on the community card. */
export const WALL_FACES = 7
/** Top contributors shown. */
export const WALL_CONTRIBUTORS = 3
/** The window both contributor lists look back over. */
export const CONTRIBUTOR_DAYS = 30
/** The most activity rows read to find the most active members; past it the window is cut short and the card says from when. */
export const ACTIVITY_SCAN = 1000

const DAY_MS = 86_400_000

/** A column part 85 adds that is not there yet (42703, or PostgREST's PGRST204). */
function columnMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === "42703" || code === "PGRST204"
}

/**
 * Up to seven active members, the ones here most recently first: by their
 * heartbeat (last_seen_at) once part 85 has run, then by their last
 * activity; before part 85, by their last activity alone.
 */
export async function recentFaces(db: Db, communityId: string, limit = WALL_FACES): Promise<WallFace[]> {
  const n = Math.max(1, Math.min(12, Math.floor(limit)))
  const base = () => db.from("community_members").select("user_id").eq("community_id", communityId).eq("status", "active")
  try {
    let res = await base().order("last_seen_at", { ascending: false, nullsFirst: false }).order("last_active_at", { ascending: false, nullsFirst: false }).limit(n)
    if (res.error && columnMissing(res.error)) res = await base().order("last_active_at", { ascending: false, nullsFirst: false }).limit(n)
    if (res.error) {
      if (!missing(res.error)) console.error(`[communities] wall faces: ${reasonOf(res.error)}`)
      return []
    }
    const ids = ((res.data as { user_id: string }[] | null) ?? []).map((r) => r.user_id)
    const people = await authorViews(db, communityId, ids)
    return ids.flatMap((id) => {
      const p = people.get(id)
      return p ? [{ id, name: p.name, username: p.username, avatarUrl: p.avatarUrl, hasStorefront: !!p.hasStorefront }] : []
    })
  } catch (e) {
    console.error(`[communities] wall faces: ${reasonOf(e)}`)
    return []
  }
}

/** Ranks with ties shared, as the leaderboard counts them (two on 40 are both second). */
export function rankRows<T extends { value: number }>(rows: T[]): (T & { rank: number })[] {
  let rank = 0
  let last: number | null = null
  return rows.map((r, i) => {
    if (r.value !== last) {
      rank = i + 1
      last = r.value
    }
    return { ...r, rank }
  })
}

/**
 * The members with the most posts and comments, counted from
 * community_activity over the last 30 days. At most ACTIVITY_SCAN rows are
 * read, newest first; when that many came back the window is shorter than
 * 30 days, and `since` says where it starts so the card can say so. Only
 * people who are still active members are listed.
 */
export async function mostActive(db: Db, communityId: string, now: number = Date.now(), limit = WALL_CONTRIBUTORS): Promise<{ since: string | null; rows: { userId: string; value: number }[] }> {
  const empty = { since: null, rows: [] }
  try {
    const { data, error } = await db
      .from("community_activity")
      .select("user_id, created_at")
      .eq("community_id", communityId)
      .in("kind", ["post", "comment"])
      .gte("created_at", nowIso(now - CONTRIBUTOR_DAYS * DAY_MS))
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_SCAN)
    if (error) {
      if (!missing(error)) console.error(`[communities] most active: ${reasonOf(error)}`)
      return empty
    }
    const rows = (data as { user_id: string | null; created_at: string }[] | null) ?? []
    const counts = new Map<string, number>()
    for (const r of rows) if (r.user_id) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1)
    if (!counts.size) return empty
    const since = rows.length >= ACTIVITY_SCAN ? rows[rows.length - 1].created_at : null
    /* The busiest twenty, then only the ones still here, so somebody who left or was banned is never listed. */
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 20)
    const { data: members } = await db
      .from("community_members")
      .select("user_id")
      .eq("community_id", communityId)
      .eq("status", "active")
      .in("user_id", ranked.map(([id]) => id))
    const active = new Set(((members as { user_id: string }[] | null) ?? []).map((m) => m.user_id))
    return { since, rows: ranked.filter(([id]) => active.has(id)).slice(0, limit).map(([userId, value]) => ({ userId, value })) }
  } catch (e) {
    console.error(`[communities] most active: ${reasonOf(e)}`)
    return empty
  }
}

/**
 * The right column's Top contributors: points earned over 30 days while the
 * community counts points (the leaderboard's own numbers), otherwise the
 * most posts and comments. Null when nobody qualifies, so no card is drawn.
 */
export async function topContributors(db: Db, community: Pick<CommunityRow, "id" | "gamification_enabled">, now: number = Date.now()): Promise<WallContributors | null> {
  let basis: WallContributors["basis"] = "activity"
  let since: string | null = null
  let rows: { userId: string; value: number }[] = []
  if (community.gamification_enabled) {
    basis = "points"
    rows = (await leaderboard(db, community.id, "30d", WALL_CONTRIBUTORS, now)).map((e) => ({ userId: e.userId, value: e.points }))
  } else {
    const active = await mostActive(db, community.id, now)
    since = active.since
    rows = active.rows
  }
  rows = rows.filter((r) => r.value > 0)
  if (!rows.length) return null
  const people = await authorViews(db, community.id, rows.map((r) => r.userId))
  const named = rows.flatMap((r) => {
    const p = people.get(r.userId)
    return p ? [{ userId: r.userId, name: p.name, username: p.username, avatarUrl: p.avatarUrl, hasStorefront: !!p.hasStorefront, value: r.value }] : []
  })
  if (!named.length) return null
  return { basis, since, rows: rankRows(named) }
}

/**
 * The next scheduled event this viewer may see (its access rule checked),
 * with how many are going; null when events are off or none is coming.
 * The next five are read, so an event the viewer may not see does not
 * hide the one after it.
 */
export async function upcomingEvent(db: Db, community: Pick<CommunityRow, "id" | "events_enabled">, viewer: Viewer, now: number = Date.now()): Promise<WallEvent | null> {
  if (!community.events_enabled) return null
  try {
    const { data, error } = await db
      .from("community_events")
      .select("id, title, starts_at, ends_at, access, status, going_count")
      .eq("community_id", community.id)
      .eq("status", "scheduled")
      .gt("starts_at", nowIso(now))
      .order("starts_at", { ascending: true })
      .limit(5)
    if (error) {
      if (!missing(error)) console.error(`[communities] upcoming event: ${reasonOf(error)}`)
      return null
    }
    const rows = (data as { id: string; title: string; starts_at: string; ends_at: string | null; access: unknown; going_count: number | null }[] | null) ?? []
    const next = rows.find((e) => evaluateAccess(e.access as never, accessOf(viewer)).ok)
    return next ? { id: next.id, title: next.title, startsAt: next.starts_at, endsAt: next.ends_at, going: Math.max(0, Number(next.going_count) || 0) } : null
  } catch (e) {
    console.error(`[communities] upcoming event: ${reasonOf(e)}`)
    return null
  }
}

/**
 * The creator side's address for this community, for somebody who can open
 * it: the owner, or staff with a creator account (/app is a creator's), the
 * same test as the top bar's Manage community.
 */
function appBase(community: Pick<CommunityRow, "id">, viewer: Pick<Viewer, "isOwner" | "isCreatorAccount">): string | null {
  return viewer.isOwner || viewer.isCreatorAccount ? `/app/community/${community.id}` : null
}

/** The creator side's settings, for somebody who may change them; null hides the card's Settings. */
export function settingsHrefFor(community: Pick<CommunityRow, "id">, viewer: Pick<Viewer, "isOwner" | "isCreatorAccount" | "active" | "role">): string | null {
  const app = appBase(community, viewer)
  return app && can(viewer.active ? viewer.role : null, "manage_settings") ? `${app}/settings` : null
}

/** The creator side's new event form, for somebody who may run events here; null hides the composer's Event. */
export function eventHrefFor(community: Pick<CommunityRow, "id" | "events_enabled">, viewer: Pick<Viewer, "isOwner" | "isCreatorAccount" | "active" | "role">): string | null {
  const app = appBase(community, viewer)
  return app && community.events_enabled && can(viewer.active ? viewer.role : null, "manage_events") ? `${app}/events?new=1` : null
}

/** All of the wall's side columns for one member, in one go. */
export async function wallData(db: Db, community: CommunityRow, viewer: Viewer, now: number = Date.now()): Promise<WallData> {
  const [stats, faces, upcoming, contributors] = await Promise.all([communityStats(db, community, now), recentFaces(db, community.id), upcomingEvent(db, community, viewer, now), topContributors(db, community, now)])
  return {
    card: { stats, faces, more: Math.max(0, stats.members - faces.length), settingsHref: settingsHrefFor(community, viewer) },
    upcoming,
    contributors,
  }
}
