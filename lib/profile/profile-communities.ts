import "server-only"

/**
 * ===========================================================================
 *  THE COMMUNITIES ON A PROFILE, AND WHERE "MESSAGE" CAN GO
 * ===========================================================================
 * COMMUNITIES TAB. The communities a person owns and the ones they are an
 * active member of, as the same cards Explore and a creator's page draw.
 * Only published, public, open communities that Storelib has not hidden:
 * a private or unlisted community is reachable by its link alone and is
 * never listed on anybody's profile. Owned ones are always listed; the
 * memberships only while the person shows them (profiles.show_communities,
 * decided by the caller).
 *
 * MESSAGE. Storelib's messages between people live inside a community
 * (run-now part 83, lib/communities/server/direct.ts): two people may write
 * to each other where they are both active members, chat is on and the
 * member directory is open. messageTarget finds such a community, most
 * recently active first, and answers that community's page for the person,
 * which is where Message opens the conversation. No shared community, no
 * Message button.
 */
import { cardsFor, CARD_COLUMNS, type CardRow } from "@/lib/communities/server/public"
import type { CommunityCard } from "@/lib/communities/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const LIST_MAX = 24

const uniq = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))]

/* eslint-disable @typescript-eslint/no-explicit-any */
const listed = (q: any) => q.eq("status", "published").eq("visibility", "public").eq("platform_hidden", false).is("deleted_at", null).is("suspended_at", null)
/* eslint-enable @typescript-eslint/no-explicit-any */

async function rows<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await run()
    return error ? [] : ((data as T[] | null) ?? [])
  } catch {
    return []
  }
}

export async function profileCommunities(db: Db, userId: string, opts: { includeMemberships: boolean }): Promise<{ owned: CommunityCard[]; member: CommunityCard[] }> {
  const owned = await rows<CardRow>(() =>
    listed(db.from("communities").select(CARD_COLUMNS).eq("owner_user_id", userId)).order("member_count", { ascending: false }).limit(LIST_MAX),
  )
  let joined: CardRow[] = []
  if (opts.includeMemberships) {
    const members = await rows<{ community_id: string }>(() =>
      db.from("community_members").select("community_id").eq("user_id", userId).eq("status", "active").order("joined_at", { ascending: false }).limit(200),
    )
    const ownedIds = new Set(owned.map((c) => c.id))
    const ids = uniq(members.map((m) => m.community_id)).filter((id) => !ownedIds.has(id))
    if (ids.length) {
      const found = await rows<CardRow>(() => listed(db.from("communities").select(CARD_COLUMNS).in("id", ids)))
      /* In the order they joined, newest first. */
      const byId = new Map(found.map((c) => [c.id, c]))
      joined = ids.map((id) => byId.get(id)).filter((c): c is CardRow => !!c).slice(0, LIST_MAX)
    }
  }
  const cards = await cardsFor(db, [...owned, ...joined])
  return { owned: cards.slice(0, owned.length), member: cards.slice(owned.length) }
}

/** The page where the viewer can message this person, or null when they share no community that allows it. */
export async function messageTarget(db: Db, viewerId: string | null, targetId: string): Promise<string | null> {
  if (!viewerId || viewerId === targetId) return null
  const [mine, theirs] = await Promise.all([
    rows<{ community_id: string }>(() =>
      db.from("community_members").select("community_id").eq("user_id", viewerId).eq("status", "active").is("banned_at", null).order("last_active_at", { ascending: false, nullsFirst: false }).limit(200),
    ),
    rows<{ community_id: string }>(() => db.from("community_members").select("community_id").eq("user_id", targetId).eq("status", "active").is("banned_at", null).limit(200)),
  ])
  const theirSet = new Set(theirs.map((m) => m.community_id))
  const shared = uniq(mine.map((m) => m.community_id)).filter((id) => theirSet.has(id))
  if (shared.length === 0) return null
  const communities = await rows<{ id: string; slug: string }>(() =>
    db
      .from("communities")
      .select("id, slug")
      .in("id", shared)
      .eq("status", "published")
      .eq("chat_enabled", true)
      .eq("directory_enabled", true)
      .is("deleted_at", null)
      .is("suspended_at", null),
  )
  if (communities.length === 0) return null
  /* Part 83's tables have to be there for a conversation to open. */
  const ready = await db.from("community_conversations").select("id", { count: "exact", head: true }).limit(1)
  if (ready?.error) return null
  const bySlug = new Map(communities.map((c) => [c.id, c.slug]))
  const first = shared.find((id) => bySlug.has(id))
  return first ? `/community/${bySlug.get(first)}/members/${targetId}?message=1` : null
}
