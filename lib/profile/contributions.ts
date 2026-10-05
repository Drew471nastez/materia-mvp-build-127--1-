import "server-only"

/**
 * ===========================================================================
 *  A PERSON'S CONTRIBUTIONS, PER COMMUNITY
 * ===========================================================================
 * Round 13, ask 30: "on a person's profile (and creator page Communities
 * tab), their contributions per community and their posts (clickable, to the
 * post; their own posts editable from there)".
 *
 * WHICH COMMUNITIES. For the person themselves: the communities they are an
 * active member of, most recently used first. For anybody else: the ones
 * the two share (lib/profile/shared-posts.ts sharedCommunities), because a
 * community's posts are its members' to read. Signed out: none. At most
 * SHARED_COMMUNITIES_MAX; `only` narrows them (a creator page: the
 * communities they made).
 *
 * WHAT IS COUNTED. Their posts the viewer may read there (the same filter
 * as the list, counted on the author index), and their level and points
 * where the community keeps points (community_members, the leaderboard's
 * own figures). No comment count: there is no index to count one person's
 * comments in a community without reading the community's comments.
 */
import { sharedCommunities, sharedPostsPage } from "./shared-posts"
import { SHARED_COMMUNITIES_MAX, type ContributionSection, type SharedCommunity } from "./shared-view"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function rows<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await run()
    return error ? [] : ((data as T[] | null) ?? [])
  } catch {
    return []
  }
}

/** The person's own communities, most recently used first: published, open, theirs as an active member. */
async function ownCommunities(db: Db, userId: string): Promise<SharedCommunity[]> {
  const mine = await rows<{ community_id: string }>(() =>
    db.from("community_members").select("community_id").eq("user_id", userId).eq("status", "active").is("banned_at", null).order("last_active_at", { ascending: false, nullsFirst: false }).limit(50),
  )
  const ids = [...new Set(mine.map((m) => m.community_id))]
  if (!ids.length) return []
  const found = await rows<{ id: string; slug: string; name: string; logo_url: string | null }>(() =>
    db.from("communities").select("id, slug, name, logo_url").in("id", ids).eq("status", "published").is("deleted_at", null).is("suspended_at", null),
  )
  const byId = new Map(found.map((c) => [c.id, c]))
  return ids.flatMap((id) => {
    const c = byId.get(id)
    return c ? [{ id: c.id, slug: c.slug, name: c.name, logoUrl: c.logo_url }] : []
  })
}

/** Their level and points in each community that keeps points; null where it does not, or where they could not be read. */
async function standing(db: Db, userId: string, communityIds: string[]): Promise<Map<string, { level: number | null; points: number | null }>> {
  const out = new Map<string, { level: number | null; points: number | null }>()
  if (!communityIds.length) return out
  const [members, communities] = await Promise.all([
    rows<{ community_id: string; level: number | null; points: number | null }>(() => db.from("community_members").select("community_id, level, points").eq("user_id", userId).in("community_id", communityIds)),
    rows<{ id: string; gamification_enabled: boolean | null }>(() => db.from("communities").select("id, gamification_enabled").in("id", communityIds)),
  ])
  const scored = new Set(communities.filter((c) => c.gamification_enabled).map((c) => c.id))
  for (const m of members) {
    if (!scored.has(m.community_id)) continue
    out.set(m.community_id, { level: typeof m.level === "number" ? m.level : null, points: typeof m.points === "number" ? Math.max(0, m.points) : null })
  }
  return out
}

export async function contributionsFor(db: Db, input: { viewerId: string | null; targetId: string; only?: string[] | null }): Promise<ContributionSection[]> {
  const { viewerId, targetId } = input
  if (!viewerId || !UUID.test(viewerId) || !UUID.test(targetId)) return []
  const own = viewerId === targetId
  const all = own ? await ownCommunities(db, targetId) : await sharedCommunities(db, viewerId, targetId)
  const only = input.only ? new Set(input.only) : null
  const list = (only ? all.filter((c) => only.has(c.id)) : all).slice(0, SHARED_COMMUNITIES_MAX)
  if (!list.length) return []
  const [pages, scores] = await Promise.all([
    Promise.all(list.map((community) => sharedPostsPage(db, { communityId: community.id, viewerId, targetId }).catch(() => null))),
    standing(db, targetId, list.map((c) => c.id)),
  ])
  return list.flatMap((community, i) => {
    const page = pages[i]
    if (!page) return []
    const s = scores.get(community.id)
    return [{ community, page, own, stats: { posts: page.total ?? null, level: s?.level ?? null, points: s?.points ?? null } }]
  })
}
