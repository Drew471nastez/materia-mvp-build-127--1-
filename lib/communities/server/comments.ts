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
 *
 * WHAT A COMMENT CARRIES (round 12): pictures, a GIF and a video by link
 * (YouTube, Vimeo, Loom) under its words, kept in `media` (run-now part 96).
 * Through the same checks as a post's media (feed.ts checkMedia), then only
 * what lib/communities/post-media.ts allows a comment, and every picture must
 * be the commenter's own upload for this community, still there, in their own
 * folder of the picture bucket. Files are refused (round 11 had them); one
 * already kept on a comment still shows and downloads.
 * Until part 96 has run, comments read and write as before and one that
 * carries something is refused with a sentence.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { storedObjectSize } from "@/lib/storage/upload-guard"
import { LENGTHS, mentionsEveryone } from "../limits"
import { can, type RolePermissions } from "../permissions"
import { COMMENT_MEDIA_TYPES, MAX_COMMENT_EMBEDS, MAX_COMMENT_GIFS, MAX_COMMENT_MEDIA, PICTURE_BUCKET, memberPictureFolder, picturePathOf } from "../post-media"
import { COMMENT_COLUMNS, type CommentRow, type CommentView, type CommunityRow, type PostMedia, type PostRow } from "../types"
import { recordActivity } from "./activity"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db, type DbError } from "./db"
import { authorViews } from "./directory"
import { checkMedia, cleanText, permsOf, publicPostRow, refused, visiblePostRow, type Checked, type WriteContext } from "./feed"
import { notifyMentions, snippet } from "./mentions"
import { heldColumns, holdForReview, screenEdit, screenWrite } from "./safety"
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

/*
  THE MEDIA COLUMN MAY NOT BE THERE YET. Every read and write asks for
  `media` with the rest; when the database says it has no such column (part
  96 not run: Postgres 42703 on a read, PostgREST PGRST204 on a write) it is
  asked again without it, and that answer is remembered for a few minutes so
  the next requests do not pay twice. A failed request changed nothing
  (PostgREST runs each in a transaction), so asking again is safe.
*/
const MEDIA_COLUMNS = `${COMMENT_COLUMNS}, media`
const MEDIA_RECHECK_MS = 5 * 60_000
let mediaColumn: { there: boolean; at: number } | null = null

export function noMediaColumn(error: unknown): boolean {
  const e = (error ?? null) as { code?: string; message?: string } | null
  return !!e && (e.code === "42703" || e.code === "PGRST204") && /\bmedia\b/.test(String(e.message ?? ""))
}

function columnsNow(): string {
  return mediaColumn && !mediaColumn.there && Date.now() - mediaColumn.at < MEDIA_RECHECK_MS ? COMMENT_COLUMNS : MEDIA_COLUMNS
}

/** What a read hands back, as far as this module looks at it. */
export type CommentAnswer = { data: unknown; error: unknown }

/** Runs a read (or a write that reads back) with the media column, and again without it when the database has none. */
export async function withCommentColumns(run: (columns: string) => PromiseLike<CommentAnswer>): Promise<CommentAnswer> {
  const columns = columnsNow()
  const first = await run(columns)
  if (columns !== MEDIA_COLUMNS) return first
  if (noMediaColumn(first.error)) {
    mediaColumn = { there: false, at: Date.now() }
    return run(COMMENT_COLUMNS)
  }
  if (!first.error) mediaColumn = { there: true, at: Date.now() }
  return first
}

/** Whether comments can carry pictures, GIFs and videos here (part 96 has run): null until a read has found out. */
export function commentMediaReady(): boolean | null {
  return mediaColumn ? mediaColumn.there : null
}

/** For the probes and the suite: forget what was learnt about the column. */
export function resetMediaColumn(): void {
  mediaColumn = null
}

function storageHost(): string | null {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * What a comment may carry, checked (round 12): the shapes and hosts a
 * post's media must have (checkMedia), only the kinds a comment takes
 * (pictures, one GIF, one video by link), four at most, and every picture
 * the commenter's own upload for this community that is still there. A
 * file is refused outright: comments no longer carry files (a comment that
 * already has one keeps showing it).
 */
export async function checkCommentMedia(db: Db, community: Pick<CommunityRow, "id" | "creator_id">, viewer: Pick<Viewer, "userId" | "role">, raw: unknown): Promise<Checked<PostMedia[]>> {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "That could not be added to the comment.", status: 400 }
  if (!raw.length) return { ok: true, value: [] }
  if (raw.some((m) => !!m && typeof m === "object" && (m as { type?: unknown }).type === "file")) return { ok: false, error: COMMENT_FILES_REFUSED, status: 400 }
  if (raw.length > MAX_COMMENT_MEDIA) return { ok: false, error: `Up to ${MAX_COMMENT_MEDIA} pictures, GIFs or videos in a comment.`, status: 400 }
  const checked = checkMedia(raw)
  if (!checked.ok) return refused(checked, 400)
  const media = checked.value
  /* checkMedia leaves out a kind it does not know; a comment says so instead. */
  if (media.length !== raw.length || media.some((m) => !COMMENT_MEDIA_TYPES.includes(m.type))) return { ok: false, error: "A comment can carry pictures, a GIF and a video link.", status: 400 }
  if (media.filter((m) => m.type === "gif").length > MAX_COMMENT_GIFS) return { ok: false, error: "One GIF per comment.", status: 400 }
  if (media.filter((m) => m.type === "embed").length > MAX_COMMENT_EMBEDS) return { ok: false, error: "One video link per comment.", status: 400 }
  const pictures = media.filter((m): m is Extract<PostMedia, { type: "image" }> => m.type === "image")
  if (pictures.length === 0) return { ok: true, value: media }
  if (!viewer.userId || !can(viewer.role, "upload", permsOf(viewer))) return { ok: false, error: "You cannot add pictures here.", status: 403 }
  /* A picture: on this project's storage, in the commenter's own folder for this community, and there. */
  const host = storageHost()
  const folder = memberPictureFolder(viewer.userId, community.id)
  const paths: string[] = []
  for (const p of pictures) {
    const h = new URL(p.url).hostname.toLowerCase()
    const path = picturePathOf(p.url)
    if (!(host ? h === host : h.endsWith(".supabase.co")) || !path || !path.startsWith(folder) || path.slice(folder.length).includes("/")) {
      return { ok: false, error: "That picture could not be added. Upload it again.", status: 400 }
    }
    paths.push(path)
  }
  const sizes = await Promise.all(paths.map((path) => storedObjectSize(db as SupabaseClient, PICTURE_BUCKET, path).catch(() => null)))
  if (sizes.some((size) => size === null)) return { ok: false, error: "That picture could not be added. Upload it again.", status: 400 }
  return { ok: true, value: media }
}

/** What a comment carrying a file is told (round 12). */
export const COMMENT_FILES_REFUSED = "Files can't be added to comments. Share it in a post instead."

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
      ...(!gone && Array.isArray(r.media) && r.media.length ? { media: r.media } : {}),
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
  const { data: replyRows } = await withCommentColumns((columns) =>
    db
      .from("community_feed_comments")
      .select(columns)
      .in(
        "parent_id",
        parents.map((p) => p.id),
      )
      .order("created_at", { ascending: true })
      .limit(REPLIES_MAX),
  )
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
  return buildThread(parents, replies, { viewerId: viewer.userId, moderator: can(viewer.role, "moderate_content", permsOf(viewer)), authors, reacted: reacted as Set<string> })
}

export interface CommentsPage {
  comments: CommentView[]
  nextCursor: string | null
  /** First page only: whether the post's space takes comments (an opened post over the feed reads it here). */
  commentsEnabled?: boolean
  /** First page only: the viewer's own name and picture, for the comment box. */
  me?: { name: string; avatarUrl: string | null } | null
  /**
   * First page only (round 13): false when the database has no media column for comments yet (run-now part 96):
   * the box then offers words only, and staff see a note saying what to run.
   */
  mediaReady?: boolean
}

/**
 * A page of a post's comments, oldest first, with their replies. `publicRead`
 * (round 13): the post's own page for a reader who is not a member, read only,
 * when the post is public (feed.ts publicPostRow; the page has already asked
 * post-seo publicPost of the community).
 */
export async function listComments(db: Db, community: CommunityRow, viewer: Viewer, postId: string, cursor: string | null, opts: { publicRead?: boolean } = {}): Promise<Checked<CommentsPage>> {
  const found = opts.publicRead ? await publicPostRow(db, community, postId) : await visiblePostRow(db, community, viewer, postId)
  if (!found) return { ok: false, error: "That post is gone.", status: 404 }
  const first = !cursor
  const space = found.row.space_id ? found.spaces.find((s) => s.id === found.row.space_id) : null
  const extra = async () => {
    if (!first) return {}
    const me = viewer.userId ? ((await authorViews(db, community.id, [viewer.userId]).catch(() => new Map())).get(viewer.userId) ?? null) : null
    return { commentsEnabled: space ? space.comments_enabled : true, me: me ? { name: me.name, avatarUrl: me.avatarUrl } : null }
  }
  try {
    const cur = decodeCommentCursor(cursor)
    const { data, error } = await withCommentColumns((columns) => {
      let q = db.from("community_feed_comments").select(columns).eq("post_id", postId).eq("community_id", community.id).is("parent_id", null)
      if (cur) q = q.or(`created_at.gt."${cur.c}",and(created_at.eq."${cur.c}",id.gt.${cur.i})`)
      return q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(COMMENT_PAGE + 1)
    })
    if (error) {
      if (!missing(error as DbError | null)) console.error(`[communities] comments read: ${reasonOf(error)}`)
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
        ...(first ? { mediaReady: commentMediaReady() !== false } : {}),
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
  const { data } = await withCommentColumns((columns) => db.from("community_feed_comments").select(columns).eq("id", commentId).eq("community_id", community.id).maybeSingle())
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
  const [view] = buildThread([{ ...row, parent_id: null }], [], { viewerId: viewer.userId, moderator: can(viewer.role, "moderate_content", permsOf(viewer)), authors, reacted: reacted as Set<string> })
  return view ? { ...view, parentId: row.parent_id } : null
}

/** Whether a new comment may go under this post: published, comments on in its space, not locked (moderators may still). */
export function commentsOpen(post: Pick<PostRow, "status" | "locked">, spaceCommentsEnabled: boolean, viewer: Pick<Viewer, "role"> & { perms?: RolePermissions | null }): string | null {
  if (post.status !== "published") return "That post is gone."
  if (!spaceCommentsEnabled) return "Comments are off in this space."
  if (post.locked && !can(viewer.role, "lock", permsOf(viewer))) return "Comments are closed on this post."
  return null
}

/** What a notification says for a comment with no words: what it carries. */
export function mediaLine(media: PostMedia[]): string {
  if (media.some((m) => m.type === "gif")) return "Sent a GIF"
  const pictures = media.filter((m) => m.type === "image").length
  if (pictures) return pictures === 1 ? "Sent a picture" : `Sent ${pictures} pictures`
  if (media.some((m) => m.type === "embed")) return "Sent a video"
  return media.length ? (media.length === 1 ? "Sent a file" : `Sent ${media.length} files`) : ""
}

export async function createComment(w: WriteContext, postId: string, raw: unknown): Promise<Checked<CommentView>> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: false, error: "Sign in to comment.", status: 401 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.commentBody.max)
  const hasMedia = Array.isArray(r.media) && r.media.length > 0
  /* Words, or something under them (a GIF on its own is a whole answer). */
  if (!body && !hasMedia) return { ok: false, error: "Write a comment first.", status: 400 }
  if (body.length > LENGTHS.commentBody.max) return { ok: false, error: "Keep the comment under 5,000 characters.", status: 400 }
  if (mentionsEveryone(body) && !can(viewer.role, "mention_everyone", permsOf(viewer))) return { ok: false, error: "Only admins can mention everyone.", status: 403 }

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

  const media = await checkCommentMedia(db, community, viewer, r.media)
  if (!media.ok) return refused(media)
  const carried = (media as { value: PostMedia[] }).value
  const screen = await screenWrite(w, "comment", { text: body, media: carried })
  if (!screen.ok) return refused(screen)
  const { data, error } = await withCommentColumns((columns) =>
    db
      .from("community_feed_comments")
      .insert({ post_id: postId, community_id: community.id, parent_id: topId, author_id: viewer.userId, body, ...(carried.length ? { media: carried } : {}), ...heldColumns(screen, "comment") })
      .select(columns)
      .single(),
  )
  /* Part 96 not run: the words alone went up above (asked again without the column); something to carry cannot. */
  if (carried.length && noMediaColumn(error)) return { ok: false, error: "Pictures and videos in comments are not switched on yet. Send the words alone for now.", status: 503 }
  if (error || !data) {
    console.error(`[communities] comment not written: ${reasonOf(error)}`)
    return { ok: false, error: "The comment did not go up. Try again.", status: missing(error as DbError | null) ? 503 : 500 }
  }
  const row = data as CommentRow
  if (screen.hold.length) return holdForReview(w, { type: "comment", id: row.id, text: body }, screen, async () => ({ ...buildThread([{ ...row, status: "published", parent_id: null }], [], { viewerId: viewer.userId, moderator: false, authors: await authorViews(db, community.id, [viewer.userId]), reacted: new Set() })[0], parentId: topId }))
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
      body: snippet(body || mediaLine(carried)),
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
      body: snippet(body || mediaLine(carried)),
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
  const [view] = buildThread([{ ...row, parent_id: null }], [], { viewerId: viewer.userId, moderator: can(viewer.role, "moderate_content", permsOf(viewer)), authors, reacted: new Set() })
  return { ok: true, value: { ...view, parentId: topId } }
}

async function ownComment(w: WriteContext, commentId: string): Promise<Checked<CommentRow>> {
  const { db, community, viewer } = w
  if (!UUID.test(commentId)) return { ok: false, error: "That comment is gone.", status: 404 }
  const { data } = await withCommentColumns((columns) => db.from("community_feed_comments").select(columns).eq("id", commentId).eq("community_id", community.id).maybeSingle())
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
  /* What it carries stays as it is; a comment that carries something may lose its words. */
  if (!body && !(Array.isArray(ownRow.media) && ownRow.media.length)) return { ok: false, error: "Write a comment first.", status: 400 }
  if (body.length > LENGTHS.commentBody.max) return { ok: false, error: "Keep the comment under 5,000 characters.", status: 400 }
  if (mentionsEveryone(body) && !mentionsEveryone(ownRow.body) && !can(w.viewer.role, "mention_everyone", permsOf(w.viewer))) return { ok: false, error: "Only admins can mention everyone.", status: 403 }
  const edited = await screenEdit(w, "comment", { text: body, before: ownRow.body })
  if (!edited.ok) return refused(edited)
  const { data, error } = await withCommentColumns((columns) =>
    w.db
      .from("community_feed_comments")
      .update({ body, edited_at: nowIso() })
      .eq("id", commentId)
      .eq("author_id", w.viewer.userId)
      .select(columns)
      .single(),
  )
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
  const [view] = buildThread([{ ...row, parent_id: null }], [], { viewerId: w.viewer.userId, moderator: can(w.viewer.role, "moderate_content", permsOf(w.viewer)), authors, reacted: new Set() })
  return { ok: true, value: { ...view, parentId: row.parent_id } }
}

/** The author deletes their comment: its words go, the row stays so its replies keep their place. Answers the post it was under (the live channel's). */
export async function deleteComment(w: WriteContext, commentId: string): Promise<Checked<{ postId: string }>> {
  const own = await ownComment(w, commentId)
  if (!own.ok) return refused(own)
  const postId = (own as { value: CommentRow }).value.post_id
  const { error } = await w.db
    .from("community_feed_comments")
    .update({ status: "deleted", deleted_at: nowIso(), body: "" })
    .eq("id", commentId)
    .eq("author_id", w.viewer.userId)
  if (error) return { ok: false, error: "The comment was not deleted. Try again.", status: 500 }
  return { ok: true, value: { postId } }
}
