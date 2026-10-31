import "server-only"

/**
 * IndexNow for a community's public posts (round 45). A post in a public
 * community's open space has an indexable page of its own, now listed in
 * the communities sitemap (./community-posts-sitemap.ts); this tells the
 * engines that take IndexNow the moment one appears, changes or goes.
 *
 * The rule is the page's own (post-seo.ts indexablePost, over the same
 * rows post-facts.ts reads), so a members only post is never announced: its address
 * would tell an engine nothing it may index, and its words are not public.
 * Called in `after()`; never throws.
 */
import { admin } from "@/lib/communities/server/db"
import { communitiesEnabled } from "@/lib/communities/flag"
import { indexablePost, postPath, type PostFacts } from "@/app/(marketing)/community/[slug]/(member)/post/[postId]/post-seo"
import { creatorIsBanned } from "./bans"
import { indexNowKey } from "./indexnow"

const STORELIB = "https://storelib.com"

/*
  Read here rather than through post-facts.ts: that one is held for the
  request (React's cache), and an edit asks before and after the save in
  one request, so the second answer would have been the first.
*/
async function factsOf(communityId: string, postId: string): Promise<PostFacts | null> {
  if (!(await communitiesEnabled())) return null
  const db = admin()
  const [{ data: community }, { data: post }] = await Promise.all([
    db.from("communities").select("slug, name, logo_url, visibility, access, status, platform_hidden, suspended_at, deleted_at, creator_id").eq("id", communityId).maybeSingle(),
    db.from("community_feed_posts").select("id, space_id, title, body_text, status, deleted_at, created_at, edited_at").eq("id", postId).eq("community_id", communityId).maybeSingle(),
  ])
  const c = community as (PostFacts["community"] & { creator_id?: string | null }) | null
  const p = post as { id: string; space_id: string | null; title: string | null; body_text: string | null; status: string; deleted_at: string | null; created_at: string; edited_at: string | null } | null
  if (!c?.slug || !p) return null
  const [space, ownerBanned] = await Promise.all([
    p.space_id
      ? db.from("community_spaces").select("name, view_access, archived_at").eq("id", p.space_id).eq("community_id", communityId).maybeSingle().then((r: { data: unknown }) => r.data as PostFacts["space"])
      : Promise.resolve(null),
    c.creator_id ? creatorIsBanned(c.creator_id) : Promise.resolve(false),
  ])
  /* A space that is gone keeps its posts from everybody, as post-facts.ts says. */
  if (p.space_id && !space) return null
  return {
    community: c,
    space,
    post: { id: p.id, title: p.title, bodyText: p.body_text || "", media: [], status: p.status, deletedAt: p.deleted_at, createdAt: p.created_at, editedAt: p.edited_at, commentCount: 0 },
    author: null,
    ownerBanned,
  }
}

/** The post's canonical address while it is a public, indexable post; nothing otherwise. */
export async function publicPostAddresses(communityId: string, postId: string): Promise<string[]> {
  if (!indexNowKey()) return []
  try {
    const facts = await factsOf(communityId, postId)
    return facts && indexablePost(facts) ? [`${STORELIB}${postPath(facts.community.slug, facts.post)}`] : []
  } catch {
    return []
  }
}

/**
 * The moderation actions that can take a public post's page away or bring it
 * back (round 45 leftovers): a removal, its undoing, and a move to another
 * space, which may be members only. Pinning, locking and featuring change
 * nothing an engine indexes. Pure, for app/api/community/[communityId]/
 * moderation/act and app/api/app/community/[id]/moderation.
 */
export function seenByModeration(targetType: unknown, action: unknown): boolean {
  return targetType === "post" && (action === "remove" || action === "restore" || action === "move")
}
