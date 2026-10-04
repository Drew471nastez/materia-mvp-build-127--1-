import "server-only"

/**
 * ===========================================================================
 *  A PERSON, AS THE HOVER CARD IN A COMMUNITY SHOWS THEM
 * ===========================================================================
 * Resting on a name in a community opens a small card
 * (components/community/member/person-card.tsx): their photo (with their
 * level here while the community counts points), name, when they were last
 * here, their bio, how many public communities they are in and how many of
 * those the viewer shares, how many they own, and Profile / Follow /
 * Message. This reads it, for one person, in a handful of bounded reads.
 *
 * ONLY WHAT IS PUBLIC, AND ONLY WHAT IS REAL. The communities counted are
 * published, public, open and not hidden by Storelib, the same ones a
 * profile's Communities tab lists (lib/profile/profile-communities.ts); a
 * private or unlisted community never adds to anybody's number. Somebody who
 * hides their memberships (profiles.show_communities) gets no communities
 * line at all; what they own is public either way. "Active" is their
 * heartbeat here (last_seen_at, part 85) or their last activity here,
 * whichever is later, and nothing when neither is known.
 *
 * Only an active member of this community has a card here: a departed or
 * banned person's name in an old post opens nothing.
 */
import { personHref } from "@/lib/profile/person-href"
import type { PersonCardView } from "@/components/community/member/view-types"
import type { CommunityRow, Role } from "../types"
import type { Viewer } from "./context"
import { missing, reasonOf, type Db } from "./db"
import { directReady } from "./direct"
import { authorViews, levelNames } from "./directory"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** How many memberships are looked at for the counts: far more than anybody shows, and still one bounded read. */
const LOOK_AT = 500

const MISSING_COLUMN = new Set(["42703", "PGRST204"])

interface CardMember {
  user_id: string
  role: Role
  status: string
  level: number
  bio: string | null
  banned_at: string | null
  last_active_at: string | null
  last_seen_at?: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const listed = (q: any) => q.eq("status", "published").eq("visibility", "public").eq("platform_hidden", false).is("deleted_at", null).is("suspended_at", null)
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Their row here, with the heartbeat column when part 85 has added it. */
async function memberRow(db: Db, communityId: string, userId: string): Promise<CardMember | null> {
  const base = "user_id, role, status, level, bio, banned_at, last_active_at"
  const read = (cols: string) => db.from("community_members").select(cols).eq("community_id", communityId).eq("user_id", userId).maybeSingle()
  let { data, error } = await read(`${base}, last_seen_at`)
  if (error && MISSING_COLUMN.has(String(error.code ?? ""))) ({ data, error } = await read(base))
  if (error) {
    if (!missing(error)) console.error(`[communities] person card member: ${reasonOf(error)}`)
    return null
  }
  return (data as CardMember | null) ?? null
}

/** Their Storelib bio and whether they show their memberships (on until part 85 adds the switch). */
async function profileExtras(db: Db, userId: string): Promise<{ bio: string | null; showCommunities: boolean }> {
  const read = (cols: string) => db.from("profiles").select(cols).eq("id", userId).maybeSingle()
  try {
    let { data, error } = await read("bio, show_communities")
    if (error && MISSING_COLUMN.has(String(error.code ?? ""))) ({ data, error } = await read("bio"))
    if (error) return { bio: null, showCommunities: true }
    const row = (data ?? {}) as { bio?: string | null; show_communities?: boolean | null }
    return { bio: (row.bio || "").trim() || null, showCommunities: row.show_communities !== false }
  } catch {
    return { bio: null, showCommunities: true }
  }
}

async function ids(run: () => PromiseLike<{ data: unknown; error: unknown }>, key: string): Promise<string[]> {
  try {
    const { data, error } = await run()
    if (error) return []
    return ((data as Record<string, unknown>[] | null) ?? []).map((r) => r[key]).filter((v): v is string => typeof v === "string")
  } catch {
    return []
  }
}

/** The communities someone is an active member of (any visibility; filtered by the caller). */
function activeIn(db: Db, userId: string): Promise<string[]> {
  return ids(() => db.from("community_members").select("community_id").eq("user_id", userId).eq("status", "active").limit(LOOK_AT), "community_id")
}

/** Of these communities, the ones anybody may see listed. */
async function publicOf(db: Db, communityIds: string[]): Promise<Set<string>> {
  const list = [...new Set(communityIds)]
  if (!list.length) return new Set()
  return new Set(await ids(() => listed(db.from("communities").select("id").in("id", list)), "id"))
}

/** How many public communities they are in, how many of those the viewer is in too, and how many public ones they own. */
export async function communityFacts(db: Db, targetId: string, viewerId: string | null, showMemberships: boolean): Promise<{ communities: { count: number; inCommon: number } | null; owns: number }> {
  const [owned, theirs, mine] = await Promise.all([
    ids(() => listed(db.from("communities").select("id").eq("owner_user_id", targetId)).limit(LOOK_AT), "id"),
    showMemberships ? activeIn(db, targetId) : Promise.resolve([] as string[]),
    showMemberships && viewerId && viewerId !== targetId ? activeIn(db, viewerId) : Promise.resolve([] as string[]),
  ])
  if (!showMemberships) return { communities: null, owns: owned.length }
  const shown = await publicOf(db, theirs)
  const mineSet = new Set(mine)
  let inCommon = 0
  for (const id of shown) if (mineSet.has(id)) inCommon++
  return { communities: { count: shown.size, inCommon }, owns: owned.length }
}

async function follows(db: Db, followerId: string | null, targetId: string): Promise<boolean> {
  if (!followerId || followerId === targetId) return false
  try {
    const { data } = await db.from("follows").select("follower_id").eq("follower_id", followerId).eq("following_id", targetId).maybeSingle()
    return !!data
  } catch {
    return false
  }
}

function latest(...isos: (string | null | undefined)[]): string | null {
  let best: number | null = null
  for (const iso of isos) {
    const t = iso ? Date.parse(iso) : NaN
    if (Number.isFinite(t) && (best === null || t > best)) best = t
  }
  return best === null ? null : new Date(best).toISOString()
}

/** One person's card in this community, or null when they are not an active member here. */
export async function personCard(db: Db, community: CommunityRow, viewer: Pick<Viewer, "userId">, targetId: string): Promise<PersonCardView | null> {
  if (!UUID.test(targetId)) return null
  try {
    const row = await memberRow(db, community.id, targetId)
    if (!row || row.status !== "active" || row.banned_at) return null
    const isSelf = viewer.userId === targetId
    const extras = await profileExtras(db, targetId)
    const [author, facts, following, levels, dmReady] = await Promise.all([
      authorViews(db, community.id, [targetId]).then((m) => m.get(targetId) ?? null),
      communityFacts(db, targetId, viewer.userId, extras.showCommunities),
      follows(db, viewer.userId, targetId),
      community.gamification_enabled ? levelNames(db, community.id) : Promise.resolve(new Map<number, string>()),
      !isSelf && community.chat_enabled ? directReady(db, community) : Promise.resolve(false),
    ])
    if (!author) return null
    const level = community.gamification_enabled ? Number(row.level) || 1 : null
    return {
      id: targetId,
      name: author.name,
      username: author.username,
      avatarUrl: author.avatarUrl,
      href: personHref({ username: author.username, hasStorefront: !!author.hasStorefront }),
      bio: extras.bio ?? ((row.bio || "").trim() || null),
      role: row.role,
      level,
      levelName: level ? (levels.get(level) ?? null) : null,
      activeAt: latest(row.last_seen_at, row.last_active_at),
      communities: facts.communities,
      owns: facts.owns,
      following,
      isSelf,
      canMessage: dmReady,
    }
  } catch (e) {
    console.error(`[communities] person card ${targetId}: ${reasonOf(e)}`)
    return null
  }
}
