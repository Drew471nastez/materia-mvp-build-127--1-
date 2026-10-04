import "server-only"

/**
 * ===========================================================================
 *  COMMENTS: ONE LEVEL OF REPLIES
 * ===========================================================================
 * A comment answers a post; a reply answers a comment. A reply to a reply is
 * kept under the top level comment it belongs to (its parent's parent), so a
 * thread is never more than one step deep and always reads top to bottom.
 *
 * Read a page of top level comments oldest first on (created_at, id), then
 * every reply to that page in one read. A deleted or removed comment that
 * has replies stays as "Deleted" / "Removed" so the replies keep their
 * place; one with none is left out.
 *
 * Writing one tells the post's author (comment) and, for a reply, the
 * comment's author (reply), then everyone mentioned, each once.
 */
import { LENGTHS, mentionsEveryone } from "../limits"
import { can } from "../permissions"
import { COMMENT_COLUMNS, type CommentRow, type CommentView, type CommunityRow, type PostRow } from "../types"
import { recordActivity } from "./activity"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { cleanText, refused, visiblePostRow, type Checked, type WriteContext } from "./feed"
import { notifyMentions, snippet } from "./mentions"
import { notifyMember } from "./notify"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const COMMENT_PAGE = 30
export const REPLIES_MAX = 300

export interface CommentCursor {
  c: string
  i: string
}

export function encodeCommentCursor(c: CommentCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url")
}

export function decodeCommentCursor(raw: string | null | undefined): CommentCursor | null {
  if (!raw || raw.length > 300) return null
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>
    const c = typeof v.c === "string" && Number.isFinite(Date.parse(v.c)) ? new Date(v.c).toISOString() : ""
    const i = typeof v.i === "string" && UUID.test(v.i) ? v.i.toLowerCase() : ""
    return c && i ? { c, i } : null
  } catch {
    return null
  }
}

/**
 * Rows into the thread a page draws: top level comments in order, each with
 * its replies in order. A gone comment keeps its place only while it has
 * replies; a gone reply is left out.
 */
export function buildThread(
  parents: CommentRow[],
  replies: CommentRow[],
  opts: { viewerId: string | null; moderator: boolean; authors: Map<string, CommentView["author"]>; reacted: Set<string> },
): CommentView[] {
  const view = (r: CommentRow, children: CommentView[]): CommentView => {
    const gone = r.status !== "published"
    return {
      id: r.id,
      postId: r.post_id,
      parentId: r.parent_id,
      body: gone ? (r.status === "removed" ? "Removed by a moderator" : "Deleted") : r.body,
      status: r.status,
      deleted: gone,
      author: gone || !r.author_id ? null : (opts.authors.get(r.author_id) ?? null),
      reactionCount: gone ? 0 : Number(r.reaction_count) || 0,
      reacted: !gone && opts.reacted.has(r.id),
      createdAt: r.created_at,
      editedAt: r.edited_at,
      replies: children,
      canEdit: !gone && !!opts.viewerId && r.author_id === opts.viewerId,
      canModerate: !gone && opts.moderator,
    }
  }
  const byParent = new Map<string, CommentRow[]>()
  for (const r of replies) {
    if (r.status !== "published" || !r.parent_id) continue
    const list = byParent.get(r.parent_id) ?? []
    list.push(r)
    byParent.set(r.parent_id, list)
  }
  const sortRows = (a: CommentRow, b: CommentRow) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  const out: CommentView[] = []
  for (const p of parents) {
    const kids = (byParent.get(p.id) ?? []).sort(sortRows).map((r) => view(r, []))
    if (p.status !== "published" && kids.length === 0) continue
    out.push(view(p, kids))
  }
  return out
}

async function threadFor(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, parents: CommentRow[]): Promise<CommentView[]> {
  if (!parents.length) return []
  const { data: replyRows } = await db
    .from("community_feed_comments")
    .select(COMMENT_COLUMNS)
    .in(
      "parent_id",
      parents.map((p) => p.id),
    )
    .order("created_at", { ascending: true })
    .limit(REPLIES_MAX)
  const replies = (replyRows as CommentRow[] | null) ?? []
  const all = [...parents, ...replies]
  const [authors, reacted] = await Promise.all([
    authorViews(
      db,
      community.id,
      all.map((r) => r.author_id),
    ),
    viewer.userId
      ? db
          .from("community_reactions")
          .select("target_id")
          .eq("target_type", "comment")
          .eq("user_id", viewer.userId)
          .in(
            "target_id",
            all.map((r) => r.id),
          )
          .then((r: { data: { target_id: string }[] | null }) => new Set((r.data ?? []).map((x) => x.target_id)), () => new Set<string>())
      : new Set<string>(),
  ])
  return buildThread(parents, replies, { viewerId: viewer.userId, moderator: can(viewer.role, "moderate_content"), authors, reacted: reacted as Set<string> })
}

export interface CommentsPage {
  comments: CommentView[]
  nextCursor: string | null
  /** First page only: whether the post's space takes comments (an opened post over the feed reads it here). */
  commentsEnabled?: boolean
  /** First page only: the viewer's own name and picture, for the comment box. */
  me?: { name: string; avatarUrl: string | null } | null
}

/** A page of a post's comments, oldest first, with their replies. */
export async function listComments(db: Db, community: CommunityRow, viewer: Viewer, postId: string, cursor: string | null): Promise<Checked<CommentsPage>> {
  const found = await visiblePostRow(db, community, viewer, postId)
  if (!found) return { ok: false, error: "That post is gone.", status: 404 }
  const first = !cursor
  const space = found.row.space_id ? found.spaces.find((s) => s.id === found.row.space_id) : null
  const extra = async () => {
    if (!first) return {}
    const me = viewer.userId ? ((await authorViews(db, community.id, [viewer.userId]).catch(() => new Map())).get(viewer.userId) ?? null) : null
    return { commentsEnabled: space ? space.comments_enabled : true, me: me ? { name: me.name, avatarUrl: me.avatarUrl } : null }
  }
  try {
    let q = db.from("community_feed_comments").select(COMMENT_COLUMNS).eq("post_id", postId).eq("community_id", community.id).is("parent_id", null)
    const cur = decodeCommentCursor(cursor)
    if (cur) q = q.or(`created_at.gt."${cur.c}",and(created_at.eq."${cur.c}",id.gt.${cur.i})`)
    const { data, error } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(COMMENT_PAGE + 1)
    if (error) {
      if (!missing(error)) console.error(`[communities] comments read: ${reasonOf(error)}`)
      return { ok: true, value: { comments: [], nextCursor: null } }
    }
    const rows = (data as CommentRow[] | null) ?? []
    const page = rows.slice(0, COMMENT_PAGE)
    const last = page[page.length - 1]
    const [comments, more] = await Promise.all([threadFor(db, community, viewer, page), extra()])
    return {
      ok: true,
      value: {
        comments,
        nextCursor: rows.length > COMMENT_PAGE && last ? encodeCommentCursor({ c: last.created_at, i: last.id }) : null,
        ...more,
      },
    }
  } catch (e) {
    console.error(`[communities] comments read: ${reasonOf(e)}`)
    return { ok: true, value: { comments: [], nextCursor: null } }
  }
}

/**
 * ONE COMMENT, FOR A POST OPEN ON SOMEBODY ELSE'S SCREEN (round 10). The
 * live channel only says a comment's id (realtime.ts); the browser reads the
 * comment here, through the same gate as a page of them: it must be this
 * community's, under a post the member may see, and still published. A
 * reply comes with parentId set to its top level comment, no replies of its
 * own, and the viewer's like read for it.
 */
export async function getCommentView(db: Db, community: CommunityRow, viewer: Viewer, commentId: string): Promise<CommentView | null> {
  if (!UUID.test(commentId)) return null
  const { data } = await db.from("community_feed_comments").select(COMMENT_COLUMNS).eq("id", commentId).eq("community_id", community.id).maybeSingle()
  const row = (data as CommentRow | null) ?? null
  if (!row || row.status !== "published") return null
  const found = await visiblePostRow(db, community, viewer, row.post_id)
  if (!found || found.row.status !== "published") return null
  const [authors, reacted] = await Promise.all([
    authorViews(db, community.id, row.author_id ? [row.author_id] : []),
    viewer.userId
      ? db
          .from("community_reactions")
          .select("target_id")
          .eq("target_type", "comment")
          .eq("user_id", viewer.userId)
          .eq("target_id", row.id)
          .then((r: { data: { target_id: string }[] | null }) => new Set((r.data ?? []).map((x) => x.target_id)), () => new Set<string>())
      : new Set<string>(),
  ])
  const [view] = buildThread([{ ...row, parent_id: null }], [], { viewerId: viewer.userId, moderator: can(viewer.role, "moderate_content"), authors, reacted: reacted as Set<string> })
  return view ? { ...view, parentId: row.parent_id } : null
}

/** Whether a new comment may go under this post: published, comments on in its space, not locked (moderators may still). */
export function commentsOpen(post: Pick<PostRow, "status" | "locked">, spaceCommentsEnabled: boolean, viewer: Pick<Viewer, "role">): string | null {
  if (post.status !== "published") return "That post is gone."
  if (!spaceCommentsEnabled) return "Comments are off in this space."
  if (post.locked && !can(viewer.role, "lock")) return "Comments are closed on this post."
  return null
}

export async function createComment(w: WriteContext, postId: string, raw: unknown): Promise<Checked<CommentView>> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: false, error: "Sign in to comment.", status: 401 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.commentBody.max)
  if (!body) return { ok: false, error: "Write a comment first.", status: 400 }
  if (body.length > LENGTHS.commentBody.max) return { ok: false, error: "Keep the comment under 5,000 characters.", status: 400 }
  if (mentionsEveryone(body) && !can(viewer.role, "mention_everyone")) return { ok: false, error: "Only admins can mention everyone.", status: 403 }

  const found = await visiblePostRow(db, community, viewer, postId)
  if (!found) return { ok: false, error: "That post is gone.", status: 404 }
  const space = found.row.space_id ? found.spaces.find((s) => s.id === found.row.space_id) : null
  const closed = commentsOpen(found.row, space ? space.comments_enabled : true, viewer)
  if (closed) return { ok: false, error: closed, status: 403 }

  let parent: CommentRow | null = null
  if (typeof r.parentId === "string" && UUID.test(r.parentId)) {
    const { data } = await db.from("community_feed_comments").select(COMMENT_COLUMNS).eq("id", r.parentId).eq("post_id", postId).maybeSingle()
    parent = (data as CommentRow | null) ?? null
    if (!parent) return { ok: false, error: "That comment is gone.", status: 404 }
  }
  /* One reply level: a reply to a reply is kept under the top level comment. */
  const topId = parent ? (parent.parent_id ?? parent.id) : null

  const { data, error } = await db
    .from("community_feed_comments")
    .insert({ post_id: postId, community_id: community.id, parent_id: topId, author_id: viewer.userId, body })
    .select(COMMENT_COLUMNS)
    .single()
  if (error || !data) {
    console.error(`[communities] comment not written: ${reasonOf(error)}`)
    return { ok: false, error: "The comment did not go up. Try again.", status: missing(error) ? 503 : 500 }
  }
  const row = data as CommentRow
  await recordActivity(db, { communityId: community.id, userId: viewer.userId, kind: "comment", targetType: "comment", targetId: row.id })

  const authors = await authorViews(db, community.id, [viewer.userId])
  const actorName = authors.get(viewer.userId)?.name ?? "A member"
  const url = `/community/${community.slug}/post/${postId}#c-${row.id}`
  const told: string[] = []
  if (parent?.author_id && parent.status === "published") {
    const outcome = await notifyMember(db, {
      userId: parent.author_id,
      communityId: community.id,
      kind: "reply",
      actorId: viewer.userId,
      target: { type: "comment", id: row.id },
      title: `${actorName} replied to your comment`,
      body: snippet(body),
      url,
      dedupeKey: `reply:${row.id}:${parent.author_id}`,
    })
    if (outcome !== "skipped") told.push(parent.author_id)
  }
  if (found.row.author_id && !told.includes(found.row.author_id)) {
    await notifyMember(db, {
      userId: found.row.author_id,
      communityId: community.id,
      kind: "comment",
      actorId: viewer.userId,
      target: { type: "comment", id: row.id },
      title: `${actorName} commented on your post`,
      body: snippet(body),
      url,
      dedupeKey: `comment:${row.id}:${found.row.author_id}`,
    })
    told.push(found.row.author_id)
  }
  await notifyMentions(db, {
    communityId: community.id,
    communitySlug: community.slug,
    communityName: community.name,
    actorId: viewer.userId,
    actorName,
    targetType: "comment",
    targetId: row.id,
    postId,
    text: body,
    skip: told,
  })
  const [view] = buildThread([{ ...row, parent_id: null }], [], { viewerId: viewer.userId, moderator: can(viewer.role, "moderate_content"), authors, reacted: new Set() })
  return { ok: true, value: { ...view, parentId: topId } }
}

async function ownComment(w: WriteContext, commentId: string): Promise<Checked<CommentRow>> {
  const { db, community, viewer } = w
  if (!UUID.test(commentId)) return { ok: false, error: "That comment is gone.", status: 404 }
  const { data } = await db.from("community_feed_comments").select(COMMENT_COLUMNS).eq("id", commentId).eq("community_id", community.id).maybeSingle()
  const row = (data as CommentRow | null) ?? null
  if (!row || row.status !== "published") return { ok: false, error: "That comment is gone.", status: 404 }
  if (row.author_id !== viewer.userId) return { ok: false, error: "Only the author can change a comment.", status: 403 }
  const found = await visiblePostRow(db, community, viewer, row.post_id)
  if (!found) return { ok: false, error: "That comment is gone.", status: 404 }
  return { ok: true, value: row }
}

export async function updateComment(w: WriteContext, commentId: string, raw: unknown): Promise<Checked<CommentView>> {
  const own = await ownComment(w, commentId)
  if (!own.ok) return refused(own)
  const ownRow = (own as { value: CommentRow }).value
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.commentBody.max)
  if (!body) return { ok: false, error: "Write a comment first.", status: 400 }
  if (body.length > LENGTHS.commentBody.max) return { ok: false, error: "Keep the comment under 5,000 characters.", status: 400 }
  if (mentionsEveryone(body) && !mentionsEveryone(ownRow.body) && !can(w.viewer.role, "mention_everyone")) return { ok: false, error: "Only admins can mention everyone.", status: 403 }
  const { data, error } = await w.db
    .from("community_feed_comments")
    .update({ body, edited_at: nowIso() })
    .eq("id", commentId)
    .eq("author_id", w.viewer.userId)
    .select(COMMENT_COLUMNS)
    .single()
  if (error || !data) return { ok: false, error: "The change did not save. Try again.", status: 500 }
  const row = data as CommentRow
  const authors = await authorViews(w.db, w.community.id, [w.viewer.userId])
  await notifyMentions(w.db, {
    communityId: w.community.id,
    communitySlug: w.community.slug,
    communityName: w.community.name,
    actorId: String(w.viewer.userId),
    actorName: authors.get(String(w.viewer.userId))?.name ?? "A member",
    targetType: "comment",
    targetId: row.id,
    postId: row.post_id,
    text: body,
  })
  const [view] = buildThread([{ ...row, parent_id: null }], [], { viewerId: w.viewer.userId, moderator: can(w.viewer.role, "moderate_content"), authors, reacted: new Set() })
  return { ok: true, value: { ...view, parentId: row.parent_id } }
}

/** The author deletes their comment: its words go, the row stays so its replies keep their place. */
export async function deleteComment(w: WriteContext, commentId: string): Promise<Checked<true>> {
  const own = await ownComment(w, commentId)
  if (!own.ok) return refused(own)
  const { error } = await w.db
    .from("community_feed_comments")
    .update({ status: "deleted", deleted_at: nowIso(), body: "" })
    .eq("id", commentId)
    .eq("author_id", w.viewer.userId)
  if (error) return { ok: false, error: "The comment was not deleted. Try again.", status: 500 }
  return { ok: true, value: true }
}
