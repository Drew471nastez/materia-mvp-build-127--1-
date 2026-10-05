import "server-only"

/**
 * ===========================================================================
 *  "IN <COMMUNITY>": SOMEBODY'S POSTS WHERE YOU BOTH ARE
 * ===========================================================================
 * The owner: "When you share a community with the person, their profile
 * shows 'In <community>' with their posts there: 6 at a time with
 * pagination (only spaces the viewer may see)." Round 13 (ask 30): the
 * person's own profile lists their own posts the same way (the viewer is
 * the person), and the first page says how many there are in all.
 *
 * WHICH COMMUNITIES. Ones where the viewer and the person are both active
 * members, neither banned, and the community is published and not
 * suspended or deleted: a place the viewer can open right now. Most
 * recently used by the viewer first, at most three.
 *
 * WHICH POSTS. Only what the viewer could read in that community's own
 * feed: the gate is the community's own (requireMember with "view"), and the
 * spaces are the ones the feed shows this viewer (canSeeSpace over each
 * space's access rule, no chat spaces, nothing archived). Published and not
 * deleted. A post in no space is in the community's general feed, which
 * every member reads. Newest first, a keyset page of six on
 * (created_at, id), the feed's own cursor.
 *
 * Every read is the service role's after those checks, as every community
 * read is (lib/communities/server/*).
 */
import { NextResponse } from "next/server"
import { requireMember } from "@/lib/communities/server/context"
import { accessOf, canSeeSpace, cursorAfter, decodeCursor, keysetCondition, listSpaces } from "@/lib/communities/server/feed"
import { POST_COLUMNS, type PostRow } from "@/lib/communities/types"
import { SHARED_COMMUNITIES_MAX, SHARED_PAGE, sharedPostView, type SharedCommunity, type SharedPostsPage } from "./shared-view"

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

/** Where the viewer and this person are both active members, most recently used by the viewer first. */
export async function sharedCommunities(db: Db, viewerId: string | null, targetId: string): Promise<SharedCommunity[]> {
  if (!viewerId || viewerId === targetId || !UUID.test(viewerId) || !UUID.test(targetId)) return []
  const [mine, theirs] = await Promise.all([
    rows<{ community_id: string }>(() =>
      db.from("community_members").select("community_id").eq("user_id", viewerId).eq("status", "active").is("banned_at", null).order("last_active_at", { ascending: false, nullsFirst: false }).limit(200),
    ),
    rows<{ community_id: string }>(() => db.from("community_members").select("community_id").eq("user_id", targetId).eq("status", "active").is("banned_at", null).limit(200)),
  ])
  const theirSet = new Set(theirs.map((m) => m.community_id))
  const shared = [...new Set(mine.map((m) => m.community_id))].filter((id) => theirSet.has(id))
  if (shared.length === 0) return []
  const found = await rows<{ id: string; slug: string; name: string; logo_url: string | null }>(() =>
    db.from("communities").select("id, slug, name, logo_url").in("id", shared).eq("status", "published").is("deleted_at", null).is("suspended_at", null),
  )
  const byId = new Map(found.map((c) => [c.id, c]))
  return shared
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .slice(0, SHARED_COMMUNITIES_MAX)
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, logoUrl: c.logo_url }))
}

/**
 * One page of this person's posts in this community, as the viewer may see
 * them, or null when the viewer may not look (not a member, not signed in,
 * the community closed, or the person not an active member there).
 */
export async function sharedPostsPage(db: Db, input: { communityId: string; viewerId: string | null; targetId: string; cursor?: string | null }): Promise<SharedPostsPage | null> {
  if (!UUID.test(input.communityId) || !UUID.test(input.targetId)) return null
  /* Their own posts too (round 13: a person's own profile lists theirs, to open or edit). */
  if (!input.viewerId) return null
  const gate = await requireMember(db, input.communityId, input.viewerId, "view")
  if (gate instanceof NextResponse) return null
  const { viewer, community } = gate

  const theirs = await rows<{ status: string; banned_at: string | null }>(() =>
    db.from("community_members").select("status, banned_at").eq("community_id", community.id).eq("user_id", input.targetId).limit(1),
  )
  if (!theirs[0] || theirs[0].status !== "active" || theirs[0].banned_at) return null

  const spaces = await listSpaces(db, community.id)
  const access = accessOf(viewer)
  const readable = spaces.filter((s) => s.kind !== "chat" && canSeeSpace(s, access))
  const names = new Map(readable.map((s) => [s.id, s.name]))
  const spaceScope = readable.length ? `space_id.is.null,space_id.in.(${readable.map((s) => s.id).join(",")})` : "space_id.is.null"
  const cursor = decodeCursor(input.cursor ?? null, "latest")

  let q = db
    .from("community_feed_posts")
    .select(POST_COLUMNS)
    .eq("community_id", community.id)
    .eq("author_id", input.targetId)
    .eq("status", "published")
    .is("deleted_at", null)
  /* One `or` holding an `and` of the two, so the space filter and the cursor both apply (the feed's own form). */
  q = cursor ? q.or(`and(or(${spaceScope}),or(${keysetCondition("latest", cursor)}))`) : q.or(spaceScope)
  /* On the first page, how many there are in all, by the same filter (author first: community_feed_posts_author_idx). */
  const counting = cursor
    ? Promise.resolve(null)
    : (async () => {
        try {
          const { count, error } = await db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("author_id", input.targetId).eq("community_id", community.id).eq("status", "published").is("deleted_at", null).or(spaceScope)
          return error ? null : typeof count === "number" ? count : null
        } catch {
          return null
        }
      })()
  const [found, total] = await Promise.all([rows<PostRow>(() => q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(SHARED_PAGE + 1)), counting])
  const page = found.slice(0, SHARED_PAGE)
  const last = page[page.length - 1]
  return {
    posts: page.map((row) => sharedPostView(row, community, (id) => names.get(id) ?? null)),
    next: found.length > SHARED_PAGE && last ? cursorAfter("latest", last) : null,
    ...(cursor ? {} : { total }),
  }
}
