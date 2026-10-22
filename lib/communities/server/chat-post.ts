import "server-only"

/**
 * ===========================================================================
 *  A POST SENT IN A MESSAGE (round 39)
 * ===========================================================================
 * Sending: a message may carry one post, `{ type: "post", postId }` among its
 * attachments. It is kept only when the SENDER may see that post now
 * (published, in this community, in a space their access lets them read:
 * ./feed.ts visiblePostRow), and it is stored as that id alone. A removed or
 * deleted post, a post in a space the sender cannot open, an id from another
 * community: refused before anything is written.
 *
 * Reading: every reader's card is drawn from the post as it is when THEY read
 * the chat, through their own access (sharedPostViews), so a member without
 * the post's space, or a post since removed, reads "Post not available" and
 * nothing else: no title, no words, no picture, no author. The stored row
 * holds the id only, so realtime (which carries rows) carries nothing either.
 */
import { postPath } from "../post-url"
import { cardPictures } from "../post-media"
import { postItemsIn, postRefsIn, sharedPostCard, type ChatPostRef, type ChatSharedPost } from "../chat-people"
import type { CommunityRow, PostMedia } from "../types"
import type { Viewer } from "./context"
import type { Db } from "./db"
import { authorViews } from "./directory"
import { accessOf, canSeeSpace, listSpaces, visiblePostRow, type Checked } from "./feed"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The posts one page of messages may name, at most. */
const PAGE_POSTS = 60

/** The post a message is sending, checked against what the sender may see; null when it sends none. */
export async function checkPostShare(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, raw: unknown): Promise<Checked<ChatPostRef | null>> {
  const items = postItemsIn(raw)
  if (!items.length) return { ok: true, value: null }
  if (items.length > 1) return { ok: false, error: "One post per message.", status: 400 }
  const postId = items[0].postId
  if (typeof postId !== "string" || !UUID.test(postId)) return { ok: false, error: "That post can't be sent.", status: 400 }
  const found = await visiblePostRow(db, community, viewer, postId).catch(() => null)
  if (!found || found.row.status !== "published") return { ok: false, error: "That post can't be sent.", status: 404 }
  return { ok: true, value: { type: "post", postId: found.row.id } }
}

interface PostCardRow {
  id: string
  community_id: string
  space_id: string | null
  author_id: string | null
  title: string | null
  body_text: string | null
  media: PostMedia[] | null
  status: string
}

/** The cards for every post these messages name, each as this reader may see it. */
export async function sharedPostViews(db: Db, communityId: string, viewer: Viewer, attachments: unknown[]): Promise<Map<string, ChatSharedPost>> {
  const out = new Map<string, ChatSharedPost>()
  const ids = [...new Set(attachments.flatMap((a) => postRefsIn(a)))].slice(0, PAGE_POSTS)
  if (!ids.length) return out
  const none = () => {
    for (const id of ids) out.set(id, { postId: id, available: false })
    return out
  }
  try {
    const [found, spaces, community] = await Promise.all([
      db.from("community_feed_posts").select("id, community_id, space_id, author_id, title, body_text, media, status").eq("community_id", communityId).in("id", ids),
      listSpaces(db, communityId),
      db.from("communities").select("slug").eq("id", communityId).maybeSingle(),
    ])
    if (found.error) return none()
    const rows = ((found.data as PostCardRow[] | null) ?? []).filter((r) => r.community_id === communityId)
    const slug = (community.data as { slug?: string } | null)?.slug ?? ""
    const access = accessOf(viewer)
    const seen = (r: PostCardRow) => {
      if (r.status !== "published" || !viewer.userId || !slug) return false
      if (!r.space_id) return true
      const space = spaces.find((s) => s.id === r.space_id)
      return !!space && canSeeSpace(space, access)
    }
    const visible = rows.filter(seen)
    const authors = await authorViews(db, communityId, visible.map((r) => r.author_id))
    for (const id of ids) {
      const r = visible.find((x) => x.id.toLowerCase() === id)
      if (!r) {
        out.set(id, { postId: id, available: false })
        continue
      }
      const a = r.author_id ? authors.get(r.author_id) : null
      const picture = cardPictures(Array.isArray(r.media) ? r.media : [])[0]
      out.set(
        id,
        sharedPostCard({
          postId: id,
          visible: true,
          title: r.title,
          bodyText: r.body_text ?? "",
          image: picture?.url ?? null,
          author: a ? { name: a.name, avatarUrl: a.avatarUrl } : null,
          href: postPath(slug, { id: r.id, title: r.title, bodyText: r.body_text }),
          space: r.space_id ? (spaces.find((s) => s.id === r.space_id)?.name ?? null) : null,
        }),
      )
    }
    return out
  } catch {
    return none()
  }
}

/** The card for one message's post, from the map sharedPostViews answered (undefined when it carries none). */
export function postCardOf(map: Map<string, ChatSharedPost>, attachments: unknown, live: boolean): ChatSharedPost | undefined {
  const id = postRefsIn(attachments)[0]
  if (!id) return undefined
  if (!live) return { postId: id, available: false }
  return map.get(id) ?? { postId: id, available: false }
}

/** `{ post }` for a message that carries one, nothing for the rest (so a plain message's shape is as it was). */
export function withPost(post: ChatSharedPost | undefined): { post?: ChatSharedPost } {
  return post ? { post } : {}
}
