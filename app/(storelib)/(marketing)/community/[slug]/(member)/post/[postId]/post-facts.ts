import "server-only"

/**
 * THE ROWS A POST'S METADATA AND PICTURE ARE MADE FROM (./post-seo.ts),
 * read with the service role whoever is asking, because what they say must
 * not depend on who is looking: a crawler, a chat app and a member get the
 * same answer, and post-seo's rule decides how much of it is said.
 *
 * Only what the rule and the card need: the community's public face, the
 * space's name and access rule, the post's title, text, media, status and
 * dates, and its author's public name, handle and photo. Null when communities
 * are off, or there is no such community or post here (a post id from another
 * community is no post).
 */
import { cache } from "react"
import { communitiesEnabled } from "@/lib/communities/flag"
import { loadCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import type { CommunityRow, PostMedia } from "@/lib/communities/types"
import { parsePostParam, postShortIdRange } from "@/lib/communities/post-url"
import { creatorIsBanned } from "@/lib/seo/bans"
import type { PostFacts } from "./post-seo"

export const postFacts = cache(async (slug: string, postIdParam: string): Promise<(PostFacts & { communityRow: CommunityRow }) | null> => {
  const parsed = parsePostParam(postIdParam)
  if (!parsed) return null
  try {
    if (!(await communitiesEnabled())) return null
    const db = admin()
    const community = await loadCommunity(db, { slug: decodeURIComponent(slug || "").toLowerCase() })
    if (!community) return null
    let q = db
      .from("community_feed_posts")
      .select("id, community_id, space_id, author_id, title, body_text, media, status, deleted_at, created_at, edited_at, comment_count")
      .eq("community_id", community.id)
    if (parsed.kind === "uuid") q = q.eq("id", parsed.id)
    else {
      const range = postShortIdRange(parsed.short)
      q = q.gte("id", range.from)
      if (range.to) q = q.lt("id", range.to)
    }
    const { data: row, error } = await q.limit(1).maybeSingle()
    if (error || !row) return null
    const post = row as {
      id: string
      space_id: string | null
      author_id: string | null
      title: string | null
      body_text: string | null
      media: PostMedia[] | null
      status: string
      deleted_at: string | null
      created_at: string
      edited_at: string | null
      comment_count: number | null
    }
    const [space, author, ownerBanned] = await Promise.all([
      post.space_id
        ? db.from("community_spaces").select("name, view_access, archived_at").eq("id", post.space_id).eq("community_id", community.id).maybeSingle().then((r: { data: unknown }) => r.data as PostFacts["space"])
        : Promise.resolve(null),
      post.author_id
        ? db.from("profiles").select("display_name, username, avatar_url").eq("id", post.author_id).maybeSingle().then((r: { data: unknown }) => r.data as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null)
        : Promise.resolve(null),
      /* Round 44: its creator banned keeps the post out of search (./post-seo.ts indexablePost). */
      community.creator_id ? creatorIsBanned(community.creator_id) : Promise.resolve(false),
    ])
    /* A post in a space that is gone is out of sight for everybody (lib/communities/server/feed.ts visiblePostRow): never public. */
    const spaceGone = !!post.space_id && !space
    return {
      communityRow: community,
      community,
      space: spaceGone ? { name: "", view_access: { roles: ["owner"] }, archived_at: "gone" } : space,
      post: {
        id: post.id,
        title: post.title,
        bodyText: post.body_text || "",
        media: Array.isArray(post.media) ? post.media : [],
        status: post.status,
        deletedAt: post.deleted_at,
        createdAt: post.created_at,
        editedAt: post.edited_at,
        commentCount: post.comment_count ?? 0,
      },
      author: author
        ? { name: (author.display_name || author.username || "A member").trim(), username: author.username || null, avatarUrl: author.avatar_url || null }
        : null,
      ownerBanned,
    }
  } catch {
    return null
  }
})
