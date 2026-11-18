import "server-only"

/**
 * ===========================================================================
 *  THE FEED: SPACES, POSTS, POLLS, SAVED POSTS AND LINK PREVIEWS
 * ===========================================================================
 * Reads page by KEYSET, never by offset, in one of four orders (the sort
 * menu at the end of the chips row, round 7):
 *   Default  pinned posts first (first page only, read on their own, and the
 *            pages after skip them), then the posts with the newest activity
 *            (last_activity_at, id), so a post with a new comment comes back up.
 *   New      newest posts first (created_at, id), pinned ones in their place.
 *   Top      most liked first (reaction_count, created_at, id).
 *   Unread   posts with activity since the member was last active here
 *            (community_members.last_active_at: there is no per post read
 *            table, so that is the cutoff), newest activity first.
 * New and Top walk their own indexes from part 81, so page two hundred costs
 * what page one costs. "latest" and "popular" are still understood (New and
 * Top) for any caller written before the menu.
 *
 * A page of posts is drawn from a fixed number of reads, whatever its size:
 * the posts, their authors (directory.authorViews), what the viewer reacted
 * to, what they saved, and the polls with the viewer's votes. Never a read
 * per post.
 *
 * WHO SEES WHAT. Every space carries an access rule (evaluateAccess); a post
 * in a space the viewer may not see is never answered, in a list, by id, as
 * a saved post or through a member's page. A post whose space was deleted
 * (space_id null) belongs to the whole community.
 *
 * Text is kept as the member typed it (body_text) with an escaped copy as
 * html (body), and drawn from the text, so nothing a member writes is ever
 * put on a page as markup.
 */
import { decodeHtmlEntities } from "@/lib/html-entities"
import { publicUrlProblem, fetchPublic } from "@/lib/api/public-fetch"
import { plainTextToHtml } from "@/lib/rich-text/html"
import { evaluateAccess, isOpenRule, type AccessViewer } from "../access"
import { LENGTHS, MAX_MEDIA_PER_POST, POLL_OPTIONS_MAX, POLL_OPTIONS_MIN, mentionsEveryone } from "../limits"
import { MAX_EMBEDS, MAX_GIFS, embedThumbUrl, giphyUrl, postEmbedFromUrl } from "../post-media"
import { can, meetsRole, type RolePermissions } from "../permissions"
import {
  POST_COLUMNS,
  SPACE_COLUMNS,
  type CommunityRow,
  type FeedPostView,
  type PollView,
  type PostKind,
  type PostMedia,
  type PostRow,
  type SpaceRow,
} from "../types"
import type { LinkPreview, SpaceView } from "@/components/community/member/view-types"
import { FEED_RANK_CANDIDATE_MULT, FEED_RANK_MAX_CANDIDATES, feedRankEnabled, rankPostRows, boostStaff } from "../feed-rank"
import { recordActivity } from "./activity"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { buildFeedRankContext } from "./feed-rank-load"
import { authorViews, displayName } from "./directory"
import { everyoneAllowed, notifyMentions, queueEveryone } from "./mentions"
import { queueNewPost } from "./notify"
import { communityFilesExist } from "./post-files"
import { heldColumns, holdForReview, screenEdit, screenWrite } from "./safety"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const FEED_PAGE = 20
export const PINNED_MAX = 5

/** The four orders of the sort menu, and the two older names New and Top had. */
export type FeedSort = "default" | "new" | "top" | "unread" | "latest" | "popular"
/** What a sort means once its older name is put aside. */
export type FeedOrder = "default" | "new" | "top" | "unread"

export const FEED_SORTS: readonly FeedOrder[] = ["default", "new", "top", "unread"]

/** The sort a request asked for, by any of its names; anything else is Default. */
export function feedSort(value: unknown): FeedOrder {
  if (value === "latest") return "new"
  if (value === "popular") return "top"
  return (FEED_SORTS as readonly unknown[]).includes(value) ? (value as FeedOrder) : "default"
}

/** Whether an order walks the posts by their last activity rather than by when they were written. */
function byActivity(order: FeedOrder): boolean {
  return order === "default" || order === "unread"
}

/**
 * THE OWNER'S CHOICES FOR ADMINS AND MODERATORS (round 13, part 100): every can() here is asked with them, so a
 * switch the owner turned off (moderators may not close comments, say) is off for posts and comments too. Read
 * from the viewer when it carries them; none (an older viewer, a member) is the defaults.
 */
export function permsOf(v: unknown): RolePermissions | null {
  return ((v as { perms?: RolePermissions | null } | null)?.perms ?? null) || null
}

/** What a member is in the eyes of an access rule. */
export function accessOf(v: Viewer): AccessViewer {
  return { role: v.role, active: v.active, tierId: v.tierId, ownedProductIds: v.ownedProductIds, level: v.level }
}

/* ── Spaces ────────────────────────────────────────────────────────────── */

/** A community's spaces in their order, archived ones left out. */
export async function listSpaces(db: Db, communityId: string): Promise<SpaceRow[]> {
  try {
    const { data, error } = await db
      .from("community_spaces")
      .select(SPACE_COLUMNS)
      .eq("community_id", communityId)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) {
      if (!missing(error)) console.error(`[communities] spaces read: ${reasonOf(error)}`)
      return []
    }
    return (data as SpaceRow[] | null) ?? []
  } catch (e) {
    console.error(`[communities] spaces read: ${reasonOf(e)}`)
    return []
  }
}

export function canSeeSpace(space: Pick<SpaceRow, "view_access">, v: AccessViewer): boolean {
  return evaluateAccess(space.view_access, v).ok
}

/** Whether this viewer may start a post (or a chat message) in this space. */
export function canPostIn(space: Pick<SpaceRow, "view_access" | "post_role" | "kind">, v: Viewer, chatEnabled = true): boolean {
  if (!canSeeSpace(space, accessOf(v))) return false
  if (space.kind === "chat") return chatEnabled && can(v.role, "chat", permsOf(v))
  if (space.kind === "announcements" && !can(v.role, "announce", permsOf(v))) return false
  return can(v.role, "post", permsOf(v)) && meetsRole(v.role, space.post_role)
}

/** The spaces this viewer may see, as the shell and the composer draw them. */
export function spaceViews(spaces: SpaceRow[], v: Viewer, community: Pick<CommunityRow, "chat_enabled">, unread: Map<string, number> = new Map()): SpaceView[] {
  const access = accessOf(v)
  return spaces
    .filter((s) => (s.kind !== "chat" || community.chat_enabled) && canSeeSpace(s, access))
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      icon: s.icon,
      kind: s.kind,
      canPost: canPostIn(s, v, community.chat_enabled),
      commentsEnabled: s.comments_enabled,
      unread: unread.get(s.id) ?? 0,
    }))
}

/* ── Cursors ───────────────────────────────────────────────────────────── */

export interface FeedCursor {
  /** created_at of the last post on the page. */
  c: string
  /** Its id. */
  i: string
  /** Its reaction_count, for Popular. */
  r?: number
}

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url")
}

/** A cursor from the address, or null when it is missing or was tampered into nonsense. */
export function decodeCursor(raw: string | null | undefined, sort: FeedSort): FeedCursor | null {
  sort = feedSort(sort)
  if (!raw || raw.length > 400) return null
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>
    const c = typeof v.c === "string" && Number.isFinite(Date.parse(v.c)) ? new Date(v.c).toISOString() : ""
    const i = typeof v.i === "string" && UUID.test(v.i) ? v.i.toLowerCase() : ""
    if (!c || !i) return null
    if (sort === "top") {
      const r = Number(v.r)
      if (!Number.isInteger(r) || r < 0) return null
      return { c, i, r }
    }
    return { c, i }
  } catch {
    return null
  }
}

/**
 * The PostgREST condition for "after this cursor", in the order the sort
 * reads: strictly older on the same keys, the id breaking a tie.
 */
export function keysetCondition(sort: FeedSort, cur: FeedCursor): string {
  const order = feedSort(sort)
  const c = `"${cur.c}"`
  if (order === "top") {
    const r = cur.r ?? 0
    return `reaction_count.lt.${r},and(reaction_count.eq.${r},created_at.lt.${c}),and(reaction_count.eq.${r},created_at.eq.${c},id.lt.${cur.i})`
  }
  /* Default and Unread walk the last activity; the cursor's time is that column's. */
  const col = byActivity(order) ? "last_activity_at" : "created_at"
  return `${col}.lt.${c},and(${col}.eq.${c},id.lt.${cur.i})`
}

/** The cursor that follows a page, from its last post. */
export function cursorAfter(sort: FeedSort, last: Pick<PostRow, "created_at" | "id" | "reaction_count"> & Partial<Pick<PostRow, "last_activity_at">>): string {
  const order = feedSort(sort)
  if (order === "top") return encodeCursor({ c: last.created_at, i: last.id, r: Number(last.reaction_count) || 0 })
  return encodeCursor({ c: byActivity(order) ? (last.last_activity_at ?? last.created_at) : last.created_at, i: last.id })
}

/* ── Turning rows into what a page draws ───────────────────────────────── */

interface Hydration {
  community: Pick<CommunityRow, "id"> & Partial<Pick<CommunityRow, "gamification_enabled">>
  viewer: Viewer
  spaces: SpaceRow[]
  /** A list of cards: the html copy of the words stays out (cards and an opened post draw from bodyText), so a page is smaller. */
  lean?: boolean
}

/** The most comments read for one page of cards, whatever its size: enough for the faces of every post on it. */
export const COMMENTERS_READ = 120
export const COMMENTER_FACES = 3

/**
 * The faces under each card: up to three people who commented most recently
 * on each post, and when the newest comment came. One read for the page (the
 * newest published comments on these posts, bounded), never one per post.
 */
export function commentersByPost(rows: { post_id: string; author_id: string | null; created_at: string }[], faces = COMMENTER_FACES): Map<string, { ids: string[]; last: string }> {
  const out = new Map<string, { ids: string[]; last: string }>()
  for (const r of rows) {
    const entry = out.get(r.post_id) ?? { ids: [], last: r.created_at }
    if (Date.parse(r.created_at) > Date.parse(entry.last)) entry.last = r.created_at
    if (r.author_id && entry.ids.length < faces && !entry.ids.includes(r.author_id)) entry.ids.push(r.author_id)
    out.set(r.post_id, entry)
  }
  return out
}

async function recentComments(db: Db, postIds: string[]): Promise<Map<string, { ids: string[]; last: string }>> {
  if (!postIds.length) return new Map()
  try {
    const { data, error } = await db
      .from("community_feed_comments")
      .select("post_id, author_id, created_at")
      .in("post_id", postIds)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(COMMENTERS_READ)
    if (error) return new Map()
    return commentersByPost((data as { post_id: string; author_id: string | null; created_at: string }[] | null) ?? [])
  } catch {
    return new Map()
  }
}

async function pollsFor(db: Db, postIds: string[], userId: string | null, now = Date.now()): Promise<Map<string, PollView>> {
  const out = new Map<string, PollView>()
  if (!postIds.length) return out
  const { data: polls, error } = await db.from("community_polls").select("id, post_id, question, multiple, closes_at").in("post_id", postIds)
  if (error || !polls?.length) return out
  const pollIds = (polls as { id: string }[]).map((p) => p.id)
  const [{ data: options }, { data: votes }] = await Promise.all([
    db.from("community_poll_options").select("id, poll_id, label, position, vote_count").in("poll_id", pollIds).order("position", { ascending: true }),
    userId ? db.from("community_poll_votes").select("option_id, poll_id").in("poll_id", pollIds).eq("user_id", userId) : Promise.resolve({ data: [] }),
  ])
  const mine = new Set(((votes as { option_id: string }[] | null) ?? []).map((v) => v.option_id))
  for (const p of polls as { id: string; post_id: string; question: string; multiple: boolean; closes_at: string | null }[]) {
    const opts = ((options as { id: string; poll_id: string; label: string; position: number; vote_count: number }[] | null) ?? [])
      .filter((o) => o.poll_id === p.id)
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, label: o.label, voteCount: Number(o.vote_count) || 0, voted: mine.has(o.id) }))
    out.set(p.post_id, {
      id: p.id,
      question: p.question,
      multiple: !!p.multiple,
      closesAt: p.closes_at,
      closed: !!p.closes_at && Date.parse(p.closes_at) <= now,
      totalVotes: opts.reduce((n, o) => n + o.voteCount, 0),
      options: opts,
    })
  }
  return out
}

/** A page of post rows as the feed draws them, in a fixed number of reads. */
export async function hydratePosts(db: Db, rows: PostRow[], h: Hydration): Promise<FeedPostView[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const userId = h.viewer.userId
  const withComments = rows.filter((r) => r.status === "published" && Number(r.comment_count) > 0).map((r) => r.id)
  const [authors, reacted, saved, polls, commented] = await Promise.all([
    authorViews(db, h.community.id, rows.map((r) => r.author_id)),
    userId
      ? db
          .from("community_reactions")
          .select("target_id")
          .eq("target_type", "post")
          .eq("user_id", userId)
          .in("target_id", ids)
          .then((r: { data: { target_id: string }[] | null }) => new Set((r.data ?? []).map((x) => x.target_id)), () => new Set<string>())
      : new Set<string>(),
    userId
      ? db
          .from("community_bookmarks")
          .select("post_id")
          .eq("user_id", userId)
          .in("post_id", ids)
          .then((r: { data: { post_id: string }[] | null }) => new Set((r.data ?? []).map((x) => x.post_id)), () => new Set<string>())
      : new Set<string>(),
    pollsFor(
      db,
      rows.filter((r) => r.kind === "poll").map((r) => r.id),
      userId,
    ).catch(() => new Map<string, PollView>()),
    recentComments(db, withComments),
  ])
  /* The commenters' faces: whoever is not already known as an author, in one more read. */
  const faceIds = [...new Set([...commented.values()].flatMap((c) => c.ids))].filter((id) => !authors.has(id))
  const faces = faceIds.length ? await authorViews(db, h.community.id, faceIds).catch(() => new Map()) : new Map()
  const person = (id: string) => authors.get(id) ?? faces.get(id) ?? null
  const showLevel = h.community.gamification_enabled !== false
  const spaceById = new Map(h.spaces.map((s) => [s.id, s]))
  const moderator = can(h.viewer.role, "moderate_content", permsOf(h.viewer))
  return rows.map((r) => {
    const space = r.space_id ? spaceById.get(r.space_id) : null
    return {
      id: r.id,
      communityId: r.community_id,
      space: space ? { id: space.id, slug: space.slug, name: space.name, icon: space.icon, kind: space.kind } : null,
      kind: r.kind,
      title: r.title,
      body: r.status === "published" && !h.lean ? r.body : "",
      bodyText: r.status === "published" ? r.body_text : "",
      media: r.status === "published" ? (Array.isArray(r.media) ? r.media : []) : [],
      pinned: !!r.pinned,
      featured: !!r.featured,
      locked: !!r.locked,
      status: r.status,
      author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
      reactionCount: Number(r.reaction_count) || 0,
      commentCount: Number(r.comment_count) || 0,
      reacted: (reacted as Set<string>).has(r.id),
      bookmarked: (saved as Set<string>).has(r.id),
      poll: polls.get(r.id) ?? null,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      lastActivityAt: r.last_activity_at,
      canEdit: !!userId && r.author_id === userId && r.status === "published",
      canModerate: moderator,
      recentCommenters: (commented.get(r.id)?.ids ?? [])
        .map((id) => person(id))
        .filter((p): p is NonNullable<ReturnType<typeof person>> => !!p)
        .map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
      lastCommentAt: commented.get(r.id)?.last ?? null,
      showLevel,
    }
  })
}

/* ── Reading the feed ──────────────────────────────────────────────────── */

export interface FeedRequest {
  sort: FeedSort
  cursor?: string | null
  /** One space only (its id), or the whole community. */
  spaceId?: string | null
  limit?: number
}

export interface FeedPage {
  pinned: FeedPostView[]
  posts: FeedPostView[]
  nextCursor: string | null
}

/** The space filter for the whole community: every post except those in spaces this viewer may not see, or in chat spaces. */
function hiddenSpaceIds(spaces: SpaceRow[], v: Viewer): string[] {
  const access = accessOf(v)
  return spaces.filter((s) => s.kind === "chat" || !canSeeSpace(s, access)).map((s) => s.id)
}

/**
 * One page of the feed. The archived spaces' posts stay out of the whole
 * community feed too (they are not in `spaces`, so they count as hidden by
 * the id list only when known; an archived space's id is read here).
 */
/**
 * Where Unread starts: the member's last activity here (a post, a comment, a
 * like: lib/communities/server/activity.ts moves it), else when they joined.
 * There is no per post read table (community_post_reads does not exist), so
 * a post is unread when something happened on it after that moment. Null
 * reads every post as unread.
 */
export function unreadSince(viewer: Pick<Viewer, "member">): string | null {
  const m = viewer.member
  const at = m?.last_active_at || m?.joined_at || null
  return at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : null
}

/**
 * ===========================================================================
 *  THE OWNER'S AND ADMINS' POSTS, A LITTLE HIGHER (round 13)
 * ===========================================================================
 * In Default, a post by the owner or an admin counts as STAFF_BOOST_MS newer
 * than its last activity when its page is put in order. Only inside the page
 * the keyset already read: the pages themselves (and so what Show more
 * brings) are exactly the ones without the boost, so no post is ever skipped
 * or shown twice, and a member's post is never hidden, only passed by a
 * staff post that is at most a few hours older. The name line already says
 * who they are (RoleBadge: Owner, Admin). When COMMUNITY_FEED_RANK is on,
 * Default uses lib/communities/feed-rank.ts instead of boostStaff on hydrate.
 */
export { STAFF_BOOST_MS, boostStaff } from "../feed-rank"

export async function listFeed(db: Db, community: CommunityRow, viewer: Viewer, req: FeedRequest): Promise<FeedPage> {
  const empty: FeedPage = { pinned: [], posts: [], nextCursor: null }
  const order = feedSort(req.sort)
  const limit = Math.max(1, Math.min(40, Math.floor(req.limit ?? FEED_PAGE)))
  try {
    /* Round 39: the spaces and the archived ones at once (scripts/measure-community-member-server.mjs): neither needs the other. */
    const [spaces, archivedRead] = await Promise.all([
      listSpaces(db, community.id),
      req.spaceId ? Promise.resolve(null) : db.from("community_spaces").select("id").eq("community_id", community.id).not("archived_at", "is", null),
    ])
    let hidden: string[] = []
    if (req.spaceId) {
      const space = spaces.find((s) => s.id === req.spaceId)
      if (!space || space.kind === "chat" || !canSeeSpace(space, accessOf(viewer))) return empty
    } else {
      hidden = hiddenSpaceIds(spaces, viewer)
      const archived = archivedRead?.data
      hidden.push(...((archived as { id: string }[] | null) ?? []).map((s) => s.id))
    }
    const scope = (q: Db) => {
      let out = q.eq("community_id", community.id).eq("status", "published")
      if (req.spaceId) out = out.eq("space_id", req.spaceId)
      return out
    }
    const scopeOr = hidden.length ? `space_id.is.null,space_id.not.in.(${hidden.join(",")})` : null

    const cursor = decodeCursor(req.cursor, order)
    /* Only Default lifts the pinned posts to the top; the other orders keep them in their place. */
    /* Round 39: asked beside the page's own read below, not before it: neither needs the other. */
    const pinnedRead = (async (): Promise<PostRow[]> => {
      if (cursor || order !== "default") return []
      let pq = scope(db.from("community_feed_posts").select(POST_COLUMNS)).eq("pinned", true)
      if (scopeOr) pq = pq.or(scopeOr)
      const { data } = await pq.order("created_at", { ascending: false }).limit(PINNED_MAX)
      return (data as PostRow[] | null) ?? []
    })()
    pinnedRead.catch(() => undefined)

    let q = scope(db.from("community_feed_posts").select(POST_COLUMNS))
    if (order === "default") q = q.eq("pinned", false)
    if (order === "unread") {
      const since = unreadSince(viewer)
      if (since) q = q.gt("last_activity_at", since)
    }
    const conditions = [scopeOr ? `or(${scopeOr})` : null, cursor ? `or(${keysetCondition(order, cursor)})` : null].filter(Boolean)
    /* One `or` holding an `and` of the two, so the space filter and the cursor both apply. */
    if (conditions.length === 1) q = q.or(String(conditions[0]).slice(3, -1))
    else if (conditions.length === 2) q = q.or(`and(${conditions.join(",")})`)
    if (order === "top") q = q.order("reaction_count", { ascending: false })
    const rankDefault = order === "default" && feedRankEnabled()
    const candidateCap = rankDefault
      ? Math.min(FEED_RANK_MAX_CANDIDATES, Math.max(limit * FEED_RANK_CANDIDATE_MULT, limit))
      : limit
    const readLimit = candidateCap + 1
    const [{ data, error }, pinnedRows] = await Promise.all([
      q
        .order(byActivity(order) ? "last_activity_at" : "created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(readLimit),
      pinnedRead,
    ])
    if (error) {
      if (!missing(error)) console.error(`[communities] feed read: ${reasonOf(error)}`)
      return empty
    }
    const rows = (data as PostRow[] | null) ?? []
    const candidates = rows.slice(0, candidateCap)
    let page: PostRow[] = candidates.slice(0, limit)
    if (rankDefault && candidates.length) {
      const ctx = await buildFeedRankContext(db, community.id, viewer, candidates, undefined, Date.now(), community.member_count ?? 0)
      page = rankPostRows(candidates, ctx, limit)
    } else if (!rankDefault) {
      page = candidates.slice(0, limit)
    }
    const last = rankDefault ? candidates[candidates.length - 1] : page[page.length - 1]
    const h = { community, viewer, spaces }
    const [pinned, hydrated] = await Promise.all([hydratePosts(db, pinnedRows, { ...h, lean: true }), hydratePosts(db, page, { ...h, lean: true })])
    /* Cursor from the keyset batch before any in-page reorder (boost or rank). */
    const posts = order === "default" && !rankDefault ? boostStaff(hydrated) : hydrated
    const hasMore = rows.length > candidateCap
    return { pinned, posts, nextCursor: hasMore && last ? cursorAfter(order, last) : null }
  } catch (e) {
    console.error(`[communities] feed read: ${reasonOf(e)}`)
    return empty
  }
}

/** A post row in this community that this viewer may see, or null. Moderators also see a removed one. */
export async function visiblePostRow(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, postId: string, spaces?: SpaceRow[]): Promise<{ row: PostRow; spaces: SpaceRow[] } | null> {
  if (!UUID.test(postId)) return null
  const { data, error } = await db.from("community_feed_posts").select(POST_COLUMNS).eq("id", postId).eq("community_id", community.id).maybeSingle()
  if (error || !data) return null
  const row = data as PostRow
  if (row.status === "deleted") return null
  if (row.status === "removed" && !can(viewer.role, "moderate_content", permsOf(viewer))) return null
  const all = spaces ?? (await listSpaces(db, community.id))
  if (row.space_id) {
    const space = all.find((s) => s.id === row.space_id)
    /* An archived space's posts are kept, out of sight. */
    if (!space || !canSeeSpace(space, accessOf(viewer))) return null
  }
  return { row, spaces: all }
}

/**
 * A POST ANYBODY MAY READ (round 13): published, in a space with no access
 * rule (or none), in a community the caller already found public and free
 * (post-seo.ts publicPost decides that from the same rows). For the signed
 * out reader and a search engine on the post's own page: read only.
 */
export async function publicPostRow(db: Db, community: Pick<CommunityRow, "id">, postId: string): Promise<{ row: PostRow; spaces: SpaceRow[] } | null> {
  if (!UUID.test(postId)) return null
  const { data, error } = await db.from("community_feed_posts").select(POST_COLUMNS).eq("id", postId).eq("community_id", community.id).maybeSingle()
  if (error || !data) return null
  const row = data as PostRow
  if (row.status !== "published") return null
  const spaces = await listSpaces(db, community.id)
  if (row.space_id) {
    const space = spaces.find((s) => s.id === row.space_id)
    if (!space || space.kind === "chat" || !isOpenRule(space.view_access)) return null
  }
  return { row, spaces }
}

/** The public post as a page draws it, for a reader who is not a member (read only: nothing of theirs is read). */
export async function getPublicPostView(db: Db, community: CommunityRow, viewer: Viewer, postId: string): Promise<FeedPostView | null> {
  try {
    const found = await publicPostRow(db, community, postId)
    if (!found) return null
    const [view] = await hydratePosts(db, [found.row], { community, viewer: { ...viewer, role: null, active: false }, spaces: found.spaces })
    return view ? { ...view, canEdit: false, canModerate: false } : null
  } catch (e) {
    console.error(`[communities] public post ${postId}: ${reasonOf(e)}`)
    return null
  }
}

export async function getPostView(db: Db, community: CommunityRow, viewer: Viewer, postId: string): Promise<FeedPostView | null> {
  try {
    const found = await visiblePostRow(db, community, viewer, postId)
    if (!found) return null
    const [view] = await hydratePosts(db, [found.row], { community, viewer, spaces: found.spaces })
    return view ?? null
  } catch (e) {
    console.error(`[communities] post ${postId}: ${reasonOf(e)}`)
    return null
  }
}

/* ── Writing posts ─────────────────────────────────────────────────────── */

/** Text as typed: line breaks kept, control characters and runs of blank lines gone. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max + 1)
}

function storageHost(): string | null {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/** A picture's address, only an https one on the project's own storage or Storelib. */
export function ownImageUrl(value: unknown, host: string | null = storageHost()): string | null {
  if (typeof value !== "string" || value.length > 1000) return null
  try {
    const u = new URL(value)
    if (u.protocol !== "https:") return null
    const h = u.hostname.toLowerCase()
    const own = h === "storelib.com" || h.endsWith(".storelib.com") || (host ? h === host : h.endsWith(".supabase.co"))
    return own ? u.toString() : null
  } catch {
    return null
  }
}

/** An address for a link card: http or https, public, no credentials. */
export function linkUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null
  const v = value.trim()
  if (publicUrlProblem(v)) return null
  try {
    return new URL(v).toString()
  } catch {
    return null
  }
}

function httpsImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null
  try {
    const u = new URL(value)
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null
  } catch {
    return null
  }
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; status?: number }

/** A refusal passed on as another kind's refusal (the same words and status). */
export function refused<T>(c: { ok: boolean; error?: string; status?: number }, status?: number): Checked<T> {
  return { ok: false, error: (c as { error?: string }).error ?? "Something went wrong.", status: status ?? (c as { status?: number }).status }
}

/**
 * The media a client sent, in the shapes PostMedia allows. Files and videos
 * are only references here; createPost checks they belong to this person and
 * this community before they are kept. Every address is checked against the
 * one place it may come from (lib/communities/post-media.ts): pictures from
 * Storelib's storage, GIFs from Giphy, videos by address from YouTube or
 * Vimeo and nothing else, so a post never makes a member's browser load
 * somebody else's page or script.
 */
export function checkMedia(raw: unknown): Checked<PostMedia[]> {
  const list = Array.isArray(raw) ? raw : []
  if (list.length > MAX_MEDIA_PER_POST * 2) return { ok: false, error: `Up to ${MAX_MEDIA_PER_POST} pictures and files in one post.` }
  const out: PostMedia[] = []
  let links = 0
  let gifs = 0
  let embeds = 0
  const dims = (m: Record<string, unknown>) => {
    const w = Number(m.w)
    const h = Number(m.h)
    return { ...(Number.isFinite(w) && w > 0 && w <= 20000 ? { w: Math.round(w) } : {}), ...(Number.isFinite(h) && h > 0 && h <= 20000 ? { h: Math.round(h) } : {}) }
  }
  for (const item of list) {
    const m = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
    if (m.type === "image") {
      const url = ownImageUrl(m.url)
      if (!url) return { ok: false, error: "That picture could not be added. Upload it again." }
      out.push({ type: "image", url, ...dims(m) })
    } else if (m.type === "link") {
      const url = linkUrl(m.url)
      if (!url) return { ok: false, error: "That link cannot be added." }
      if (++links > 1) return { ok: false, error: "One link card per post." }
      const title = typeof m.title === "string" ? m.title.replace(/\s+/g, " ").trim().slice(0, 200) : ""
      const image = httpsImage(m.image)
      out.push({ type: "link", url, ...(title ? { title } : {}), ...(image ? { image } : {}) })
    } else if (m.type === "file") {
      if (typeof m.assetId !== "string" || !UUID.test(m.assetId)) return { ok: false, error: "That file could not be added. Upload it again." }
      const name = typeof m.name === "string" ? m.name.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 200) : ""
      const size = Number(m.size)
      out.push({ type: "file", assetId: m.assetId.toLowerCase(), name: name || "File", ...(Number.isFinite(size) && size > 0 ? { size: Math.round(size) } : {}), ...(m.store === "community" ? { store: "community" as const } : {}) })
    } else if (m.type === "video") {
      if (typeof m.videoId !== "string" || !UUID.test(m.videoId)) return { ok: false, error: "That video could not be added." }
      const poster = m.poster === undefined || m.poster === null ? null : ownImageUrl(m.poster)
      if (m.poster && !poster) return { ok: false, error: "That video could not be added." }
      out.push({ type: "video", videoId: m.videoId.toLowerCase(), ...(poster ? { poster } : {}), ...dims(m) })
    } else if (m.type === "embed") {
      const ref = postEmbedFromUrl(m.url)
      if (!ref || (m.provider !== undefined && m.provider !== ref.provider)) return { ok: false, error: "Only YouTube, Vimeo and Loom videos can be added by link." }
      if (++embeds > MAX_EMBEDS) return { ok: false, error: `Up to ${MAX_EMBEDS} videos by link in one post.` }
      const thumb = ref.thumb ?? embedThumbUrl(m.thumb) ?? undefined
      const title = typeof m.title === "string" ? m.title.replace(/\s+/g, " ").trim().slice(0, 200) : ""
      out.push({ type: "embed", provider: ref.provider, id: ref.id, url: ref.url, ...(ref.hash ? { hash: ref.hash } : {}), ...(thumb ? { thumb } : {}), ...(title ? { title } : {}) })
    } else if (m.type === "gif") {
      const url = giphyUrl(m.url)
      const still = giphyUrl(m.still)
      if (!url || !still) return { ok: false, error: "That GIF could not be added." }
      if (++gifs > MAX_GIFS) return { ok: false, error: `Up to ${MAX_GIFS} GIFs in one post.` }
      const title = typeof m.title === "string" ? m.title.replace(/\s+/g, " ").trim().slice(0, 120) : ""
      out.push({ type: "gif", url, still, ...dims(m), ...(title ? { title } : {}) })
    }
  }
  if (out.length > MAX_MEDIA_PER_POST) return { ok: false, error: `Up to ${MAX_MEDIA_PER_POST} pictures and files in one post.` }
  return { ok: true, value: out }
}

export interface PollInput {
  question: string
  options: string[]
  multiple: boolean
  closesAt: string | null
}

export function checkPoll(raw: unknown, now = Date.now()): Checked<PollInput | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  const r = (typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const question = cleanText(r.question, LENGTHS.pollQuestion.max).replace(/\s+/g, " ")
  if (!question) return { ok: false, error: "Ask a question for the poll." }
  if (question.length > LENGTHS.pollQuestion.max) return { ok: false, error: "Keep the question under 200 characters." }
  const seen = new Set<string>()
  const options: string[] = []
  for (const o of Array.isArray(r.options) ? r.options : []) {
    const label = cleanText(o, LENGTHS.pollOption.max).replace(/\s+/g, " ")
    if (!label) continue
    if (label.length > LENGTHS.pollOption.max) return { ok: false, error: "Keep each choice under 100 characters." }
    if (seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    options.push(label)
  }
  if (options.length < POLL_OPTIONS_MIN) return { ok: false, error: "Give the poll at least two choices." }
  if (options.length > POLL_OPTIONS_MAX) return { ok: false, error: `Up to ${POLL_OPTIONS_MAX} choices.` }
  let closesAt: string | null = null
  if (r.closesAt) {
    const t = Date.parse(String(r.closesAt))
    if (!Number.isFinite(t) || t <= now) return { ok: false, error: "Choose a closing time in the future." }
    closesAt = new Date(t).toISOString()
  }
  return { ok: true, value: { question, options, multiple: r.multiple === true, closesAt } }
}

export interface PostInput {
  spaceId: string | null
  title: string
  body: string
  media: PostMedia[]
  poll: PollInput | null
}

/** A post body from a client, checked for shape and length. Who may post where is createPost's. */
export function checkPostInput(raw: unknown): Checked<PostInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const spaceId = typeof r.spaceId === "string" && UUID.test(r.spaceId) ? r.spaceId : null
  const title = cleanText(r.title, LENGTHS.postTitle.max).replace(/\s+/g, " ")
  if (title.length > LENGTHS.postTitle.max) return { ok: false, error: "Keep the title under 200 characters." }
  const body = cleanText(r.body, LENGTHS.postBody.max)
  if (body.length > LENGTHS.postBody.max) return { ok: false, error: "Keep the post under 20,000 characters." }
  /* A post is a title and its words, whatever else it carries (round 7). */
  if (!title) return { ok: false, error: "Give the post a title." }
  if (!body) return { ok: false, error: "Write something in the post." }
  const media = checkMedia(r.media)
  if (!media.ok) return refused(media)
  const poll = checkPoll(r.poll)
  if (!poll.ok) return refused(poll)
  return { ok: true, value: { spaceId, title, body, media: media.value, poll: poll.value } }
}

/** The kind a post in this space is: an announcement in Announcements, a resource in a resources space. */
export function kindFor(space: Pick<SpaceRow, "kind">, hasPoll: boolean): PostKind {
  if (space.kind === "announcements") return "announcement"
  if (hasPoll) return "poll"
  if (space.kind === "resources") return "resource"
  return "post"
}

/** The file and video references a post may keep: the poster's own uploads, for this community. Also a scheduled post's, when it is saved (scheduled-posts.ts, round 27). */
export async function ownedMedia(db: Db, community: CommunityRow, viewer: Viewer, media: PostMedia[], kept: PostMedia[] = []): Promise<Checked<PostMedia[]>> {
  /* What the post already had stays as it is: it was checked when it was added. */
  const had = new Set(kept.map((m) => (m.type === "file" ? `f:${m.assetId}` : m.type === "video" ? `v:${m.videoId}` : "")).filter(Boolean))
  const fresh = media.filter((m) => !((m.type === "file" && had.has(`f:${m.assetId}`)) || (m.type === "video" && had.has(`v:${m.videoId}`))))
  /* A member's own file, in the community's folder: it must be there, under their id, and keeps the name it was checked with. */
  const mine = fresh.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file" && m.store === "community")
  let named = new Map<string, string>()
  if (mine.length) {
    /* The same size and content checks the upload's complete step runs, at the poster's own limit (staff may send more). */
    const staff = viewer.active && meetsRole(viewer.role, "moderator")
    const found = await communityFilesExist(db, community, String(viewer.userId), mine.map((f) => ({ fileId: f.assetId, name: f.name })), { staff })
    if (!found.ok) return refused(found, 400)
    named = found.value
  }
  media = media.map((m) => (m.type === "file" && m.store === "community" && named.has(m.assetId) ? { ...m, name: named.get(m.assetId)! } : m))
  const files = fresh.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file" && m.store !== "community")
  const videos = fresh.filter((m): m is Extract<PostMedia, { type: "video" }> => m.type === "video")
  if (files.length) {
    const { data: products } = await db.from("products").select("id").eq("community_id", community.id)
    const productIds = ((products as { id: string }[] | null) ?? []).map((p) => p.id)
    const { data: assets } = productIds.length
      ? await db
          .from("digital_assets")
          .select("id, product_id, uploaded_by")
          .in(
            "id",
            files.map((f) => f.assetId),
          )
          .in("product_id", productIds)
          .eq("uploaded_by", viewer.userId)
      : { data: [] }
    const ok = new Set(((assets as { id: string }[] | null) ?? []).map((a) => a.id))
    if (files.some((f) => !ok.has(f.assetId))) return { ok: false, error: "That file could not be added. Upload it again." }
  }
  if (videos.length) {
    const { data: rows } = await db
      .from("media_videos")
      .select("id, status, community_id")
      .in(
        "id",
        videos.map((v) => v.videoId),
      )
      .eq("community_id", community.id)
    const ok = new Set(((rows as { id: string; status: string }[] | null) ?? []).filter((r) => r.status === "ready").map((r) => r.id))
    if (videos.some((v) => !ok.has(v.videoId))) return { ok: false, error: "That video is not ready yet. Try again in a minute." }
  }
  return { ok: true, value: media }
}

export interface WriteContext {
  db: Db
  community: CommunityRow
  viewer: Viewer
}

/**
 * A new post, poll included. The space must be this community's, visible to
 * the poster and open to their role; an announcement needs announce and
 * @everyone needs mention_everyone. Mentions are told now, everyone later
 * (a job).
 */
/** How far back a post with the same words counts as this one sent again. */
const SAME_POST_WINDOW_MS = 10 * 60_000

async function samePostJustNow(
  db: WriteContext["db"],
  k: { communityId: string; spaceId: string; authorId: string; title: string | null; bodyText: string },
): Promise<PostRow | null> {
  try {
    const since = new Date(Date.now() - SAME_POST_WINDOW_MS).toISOString()
    const { data } = await db
      .from("community_feed_posts")
      .select(POST_COLUMNS)
      .eq("community_id", k.communityId)
      .eq("author_id", k.authorId)
      .eq("space_id", k.spaceId)
      .eq("status", "published")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5)
    const rows = (Array.isArray(data) ? data : []) as PostRow[]
    return (
      rows.find(
        (r) =>
          r.community_id === k.communityId &&
          r.author_id === k.authorId &&
          r.space_id === k.spaceId &&
          r.status === "published" &&
          !r.deleted_at &&
          (r.title || null) === k.title &&
          (r.body_text ?? "") === k.bodyText &&
          Date.parse(String(r.created_at)) >= Date.now() - SAME_POST_WINDOW_MS,
      ) ?? null
    )
  } catch {
    /* Not knowing is not a reason to refuse a post. */
    return null
  }
}

export async function createPost(w: WriteContext, input: PostInput): Promise<Checked<FeedPostView>> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: false, error: "Sign in to post.", status: 401 }
  const spaces = await listSpaces(db, community.id)
  const space = input.spaceId
    ? spaces.find((s) => s.id === input.spaceId)
    : (spaces.find((s) => s.kind === "feed" && canPostIn(s, viewer)) ?? null)
  if (!space || space.kind === "chat") return { ok: false, error: "Choose a space to post in.", status: 400 }
  if (!canPostIn(space, viewer, community.chat_enabled)) {
    return { ok: false, error: space.kind === "announcements" ? "Only admins post announcements." : "You cannot post in this space.", status: 403 }
  }
  const text = `${input.title}\n${input.body}`
  if (mentionsEveryone(text) && !everyoneAllowed(text, viewer.role, permsOf(viewer))) return { ok: false, error: "Only admins can mention everyone.", status: 403 }
  const owned = await ownedMedia(db, community, viewer, input.media)
  if (!owned.ok) return refused(owned, 400)
  const screen = await screenWrite(w, "post", { text, media: input.media })
  if (!screen.ok) return refused(screen)

  const kind = kindFor(space, !!input.poll)
  const now = nowIso()

  /* THE SAME POST AGAIN IS THE FIRST ONE. A member whose Post timed out on a bad connection (components/community/member/
     api.ts gives up after a while; the server may well have written it) presses Post again, and a double tap does the same.
     Identical words from the same member in the same space a moment ago is that, not a new post: answer with the one
     already written. Checked again here on the row itself, whatever the query returned. */
  const again = await samePostJustNow(db, { communityId: community.id, spaceId: space.id, authorId: viewer.userId, title: input.title || null, bodyText: input.body })
  if (again) {
    const [view] = await hydratePosts(db, [again], { community, viewer, spaces })
    if (view) return { ok: true, value: view }
  }

  const { data: row, error } = await db
    .from("community_feed_posts")
    .insert({
      community_id: community.id,
      space_id: space.id,
      author_id: viewer.userId,
      kind,
      title: input.title || null,
      body: plainTextToHtml(input.body),
      body_text: input.body,
      media: owned.value,
      last_activity_at: now,
      ...heldColumns(screen, "post"),
    })
    .select(POST_COLUMNS)
    .single()
  if (error || !row) {
    console.error(`[communities] post not written: ${reasonOf(error)}`)
    return { ok: false, error: "The post did not go up. Try again.", status: missing(error) ? 503 : 500 }
  }
  const post = row as PostRow

  if (input.poll) {
    const { data: poll, error: pollError } = await db
      .from("community_polls")
      .insert({ post_id: post.id, community_id: community.id, question: input.poll.question, multiple: input.poll.multiple, closes_at: input.poll.closesAt })
      .select("id")
      .single()
    const optionsError = poll
      ? (await db.from("community_poll_options").insert(input.poll.options.map((label, position) => ({ poll_id: poll.id, label, position })))).error
      : pollError
    if (!poll || optionsError) {
      /* Half a poll is worse than none: the post goes too, and the member tries again. */
      await db.from("community_feed_posts").delete().eq("id", post.id)
      console.error(`[communities] poll not written: ${reasonOf(pollError ?? optionsError)}`)
      return { ok: false, error: "The poll did not go up. Try again.", status: 500 }
    }
  }

  if (screen.hold.length) return holdForReview(w, { type: "post", id: post.id, text }, screen, async () => (await hydratePosts(db, [{ ...post, status: "published" }], { community, viewer, spaces }))[0])
  await recordActivity(db, { communityId: community.id, userId: viewer.userId, kind: "post", targetType: "post", targetId: post.id })
  const [author] = (await authorViews(db, community.id, [viewer.userId])).values()
  await notifyMentions(db, {
    communityId: community.id,
    communitySlug: community.slug,
    communityName: community.name,
    actorId: viewer.userId,
    actorName: author?.name ?? "A member",
    targetType: "post",
    targetId: post.id,
    postId: post.id,
    text,
  })
  if (kind === "announcement" || mentionsEveryone(text)) {
    await queueEveryone(db, { communityId: community.id, postId: post.id, actorId: viewer.userId, reason: kind === "announcement" ? "announcement" : "everyone" })
  } else {
    /* Members at Everything or the default level hear about it on their phones (notify.ts queueNewPost). */
    await queueNewPost(db, { communityId: community.id, postId: post.id, actorId: viewer.userId })
  }
  const [view] = await hydratePosts(db, [post], { community, viewer, spaces })
  return { ok: true, value: view }
}

/**
 * ===========================================================================
 *  EDITING A POLL (round 13)
 * ===========================================================================
 * Edit post opens the same composer as a new post, poll included, so an edit
 * may add a poll, take it off, or change it. Once somebody has voted, the
 * question and the choices are what they voted on: they stay, and only when
 * it ends may change. `keep` is what a poll already ending is sent back with
 * when the member did not touch its end ("closesAt": "keep").
 */
export const POLL_VOTED = "People have voted, so the question and the choices stay as they are."

export type PollEdit = { kind: "same" } | { kind: "remove" } | { kind: "set"; poll: PollInput; keepCloses: boolean }

/** What an edit asks of the post's poll: nothing (left out), to take it off (null), or this poll. */
export function pollEditOf(raw: Record<string, unknown>, now = Date.now()): Checked<PollEdit> {
  if (!("poll" in raw) || raw.poll === undefined) return { ok: true, value: { kind: "same" } }
  if (raw.poll === null || raw.poll === false) return { ok: true, value: { kind: "remove" } }
  const r = (typeof raw.poll === "object" ? raw.poll : {}) as Record<string, unknown>
  const keepCloses = r.closesAt === "keep"
  const checked = checkPoll(keepCloses ? { ...r, closesAt: null } : r, now)
  if (!checked.ok) return refused(checked, 400)
  return { ok: true, value: { kind: "set", poll: checked.value!, keepCloses } }
}

/** Whether a voted poll would change what was voted on: its question or its choices, in order. */
export function pollChoicesChanged(before: { question: string; options: { label: string }[] }, after: Pick<PollInput, "question" | "options">): boolean {
  if (before.question.trim() !== after.question.trim()) return true
  const a = before.options.map((o) => o.label.trim())
  const b = after.options.map((o) => o.trim())
  return a.length !== b.length || a.some((x, i) => x !== b[i])
}

async function writePollEdit(db: Db, community: CommunityRow, postId: string, edit: PollEdit, userId: string | null): Promise<Checked<true>> {
  if (edit.kind === "same") return { ok: true, value: true }
  const have = (await pollsFor(db, [postId], userId)).get(postId) ?? null
  if (edit.kind === "remove") {
    if (!have) return { ok: true, value: true }
    const { error } = await db.from("community_polls").delete().eq("id", have.id).eq("post_id", postId)
    return error ? { ok: false, error: "The poll was not taken off. Try again.", status: 500 } : { ok: true, value: true }
  }
  const p = edit.poll
  if (!have) {
    const { data: poll, error } = await db.from("community_polls").insert({ post_id: postId, community_id: community.id, question: p.question, multiple: p.multiple, closes_at: p.closesAt }).select("id").single()
    const optionsError = poll ? (await db.from("community_poll_options").insert(p.options.map((label, position) => ({ poll_id: poll.id, label, position })))).error : error
    if (!poll || optionsError) {
      if (poll) await db.from("community_polls").delete().eq("id", poll.id)
      return { ok: false, error: "The poll did not save. Try again.", status: 500 }
    }
    return { ok: true, value: true }
  }
  const closes = edit.keepCloses ? have.closesAt : p.closesAt
  if (have.totalVotes > 0) {
    if (pollChoicesChanged(have, p) || p.multiple !== have.multiple) return { ok: false, error: POLL_VOTED, status: 409 }
    if (closes === have.closesAt) return { ok: true, value: true }
    const { error } = await db.from("community_polls").update({ closes_at: closes }).eq("id", have.id)
    return error ? { ok: false, error: "The poll did not save. Try again.", status: 500 } : { ok: true, value: true }
  }
  const { error } = await db.from("community_polls").update({ question: p.question, multiple: p.multiple, closes_at: closes }).eq("id", have.id)
  if (error) return { ok: false, error: "The poll did not save. Try again.", status: 500 }
  if (pollChoicesChanged(have, p)) {
    const gone = await db.from("community_poll_options").delete().eq("poll_id", have.id)
    const added = gone.error ? gone : await db.from("community_poll_options").insert(p.options.map((label, position) => ({ poll_id: have.id, label, position })))
    if (added.error) return { ok: false, error: "The poll did not save. Try again.", status: 500 }
  }
  return { ok: true, value: true }
}

/**
 * The author edits their own post: title, text, media (added, taken off,
 * reordered), the poll (POLL above) and, round 13, the space it is in: any
 * feed space this member may post in, like a new post.
 */
export async function updatePost(w: WriteContext, postId: string, raw: unknown): Promise<Checked<FeedPostView>> {
  const { db, community, viewer } = w
  const found = await visiblePostRow(db, community, viewer, postId)
  if (!found || found.row.status !== "published") return { ok: false, error: "That post is gone.", status: 404 }
  if (found.row.author_id !== viewer.userId) return { ok: false, error: "Only the author can edit a post.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const title = cleanText(r.title ?? found.row.title ?? "", LENGTHS.postTitle.max).replace(/\s+/g, " ")
  const body = cleanText(r.body ?? found.row.body_text, LENGTHS.postBody.max)
  if (title.length > LENGTHS.postTitle.max) return { ok: false, error: "Keep the title under 200 characters.", status: 400 }
  if (body.length > LENGTHS.postBody.max) return { ok: false, error: "Keep the post under 20,000 characters.", status: 400 }
  if (!title) return { ok: false, error: "Give the post a title.", status: 400 }
  if (!body) return { ok: false, error: "Write something in the post.", status: 400 }
  let media = found.row.media
  if (r.media !== undefined) {
    const checked = checkMedia(r.media)
    if (!checked.ok) return refused(checked, 400)
    const owned = await ownedMedia(db, community, viewer, checked.value, Array.isArray(found.row.media) ? found.row.media : [])
    if (!owned.ok) return refused(owned, 400)
    media = owned.value
  }
  /* Moved to another space: one this member may post in, never a chat. */
  let spaceId = found.row.space_id
  let space = spaceId ? (found.spaces.find((s) => s.id === spaceId) ?? null) : null
  if (typeof r.spaceId === "string" && r.spaceId !== found.row.space_id) {
    const next = UUID.test(r.spaceId) ? found.spaces.find((s) => s.id === r.spaceId) : undefined
    if (!next || next.kind === "chat" || !canPostIn(next, viewer, community.chat_enabled)) return { ok: false, error: "You cannot post in that space.", status: 403 }
    spaceId = next.id
    space = next
  }
  const pollEdit = pollEditOf(r)
  if (!pollEdit.ok) return refused(pollEdit, 400)
  const text = `${title}\n${body}`
  if (mentionsEveryone(text) && !mentionsEveryone(`${found.row.title ?? ""}\n${found.row.body_text}`) && !everyoneAllowed(text, viewer.role, permsOf(viewer))) {
    return { ok: false, error: "Only admins can mention everyone.", status: 403 }
  }
  const edited = await screenEdit(w, "post", { text, media, before: `${found.row.title ?? ""}\n${found.row.body_text}`, beforeMedia: found.row.media })
  if (!edited.ok) return refused(edited)
  const polled = await writePollEdit(db, community, postId, pollEdit.value, viewer.userId)
  if (!polled.ok) return refused(polled)
  /* The kind follows the space and the poll, only when either changed (a post kept where it was keeps its kind). */
  const moved = spaceId !== found.row.space_id
  let kind = found.row.kind
  if (space && (moved || pollEdit.value.kind !== "same")) {
    const hasPoll = pollEdit.value.kind === "set" || (pollEdit.value.kind === "same" && (await pollsFor(db, [postId], null)).has(postId))
    kind = kindFor(space, hasPoll)
  }
  const { data, error } = await db
    .from("community_feed_posts")
    .update({ title: title || null, body: plainTextToHtml(body), body_text: body, media, space_id: spaceId, kind, edited_at: nowIso() })
    .eq("id", postId)
    .eq("community_id", community.id)
    .eq("author_id", viewer.userId)
    .select(POST_COLUMNS)
    .single()
  if (error || !data) return { ok: false, error: "The change did not save. Try again.", status: 500 }
  const [author] = (await authorViews(db, community.id, [viewer.userId])).values()
  await notifyMentions(db, {
    communityId: community.id,
    communitySlug: community.slug,
    communityName: community.name,
    actorId: String(viewer.userId),
    actorName: author?.name ?? "A member",
    targetType: "post",
    targetId: postId,
    postId,
    text,
  })
  const [view] = await hydratePosts(db, [data as PostRow], { community, viewer, spaces: found.spaces })
  return { ok: true, value: view }
}

/** The author deletes their own post. The row stays (status deleted) so its comments and reports keep their target. */
export async function deletePost(w: WriteContext, postId: string): Promise<Checked<true>> {
  const { db, community, viewer } = w
  const found = await visiblePostRow(db, community, viewer, postId)
  if (!found || found.row.status !== "published") return { ok: false, error: "That post is gone.", status: 404 }
  if (found.row.author_id !== viewer.userId) return { ok: false, error: "Only the author can delete a post.", status: 403 }
  const { error } = await db
    .from("community_feed_posts")
    .update({ status: "deleted", deleted_at: nowIso(), pinned: false })
    .eq("id", postId)
    .eq("community_id", community.id)
    .eq("author_id", viewer.userId)
  if (error) return { ok: false, error: "The post was not deleted. Try again.", status: 500 }
  return { ok: true, value: true }
}

/* ── Polls ─────────────────────────────────────────────────────────────── */

const VOTE_ERRORS: Record<string, string> = {
  not_found: "That poll is gone.",
  closed: "This poll has closed.",
  too_many: "Choose one answer.",
  bad_option: "That choice is not in this poll.",
}

export async function castVote(w: WriteContext, pollId: string, optionIds: unknown): Promise<Checked<PollView>> {
  const { db, community, viewer } = w
  if (!UUID.test(pollId)) return { ok: false, error: VOTE_ERRORS.not_found, status: 404 }
  const ids = [...new Set((Array.isArray(optionIds) ? optionIds : []).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, POLL_OPTIONS_MAX)
  const { data: poll } = await db.from("community_polls").select("id, post_id, community_id").eq("id", pollId).maybeSingle()
  if (!poll || poll.community_id !== community.id) return { ok: false, error: VOTE_ERRORS.not_found, status: 404 }
  const found = await visiblePostRow(db, community, viewer, poll.post_id)
  if (!found || found.row.status !== "published") return { ok: false, error: VOTE_ERRORS.not_found, status: 404 }
  const { data, error } = await db.rpc("community_cast_vote", { p_poll: pollId, p_user: viewer.userId, p_options: ids })
  if (error) return { ok: false, error: missing(error) ? "Polls are not set up yet." : "The vote did not count. Try again.", status: missing(error) ? 503 : 500 }
  if (data !== "ok") return { ok: false, error: VOTE_ERRORS[String(data)] ?? "The vote did not count.", status: data === "not_found" ? 404 : 409 }
  const view = (await pollsFor(db, [poll.post_id], viewer.userId)).get(poll.post_id)
  if (!view) return { ok: false, error: VOTE_ERRORS.not_found, status: 404 }
  return { ok: true, value: view }
}

/* ── Saved posts ───────────────────────────────────────────────────────── */

export async function setBookmark(w: WriteContext, postId: string, on: boolean): Promise<Checked<boolean>> {
  const { db, community, viewer } = w
  if (!on) {
    await db.from("community_bookmarks").delete().eq("user_id", viewer.userId).eq("post_id", postId).eq("community_id", community.id)
    return { ok: true, value: false }
  }
  const found = await visiblePostRow(db, community, viewer, postId)
  if (!found || found.row.status !== "published") return { ok: false, error: "That post is gone.", status: 404 }
  const { error } = await db.from("community_bookmarks").upsert({ user_id: viewer.userId, post_id: postId, community_id: community.id }, { onConflict: "user_id,post_id", ignoreDuplicates: true })
  if (error) return { ok: false, error: missing(error) ? "Saving is not set up yet." : "The post was not saved. Try again.", status: missing(error) ? 503 : 500 }
  return { ok: true, value: true }
}

/** The viewer's saved posts here, newest saved first, on (created_at, post_id). */
export async function listSaved(db: Db, community: CommunityRow, viewer: Viewer, cursor: string | null): Promise<{ posts: FeedPostView[]; nextCursor: string | null }> {
  const none = { posts: [], nextCursor: null }
  if (!viewer.userId) return none
  try {
    let q = db.from("community_bookmarks").select("post_id, created_at").eq("user_id", viewer.userId).eq("community_id", community.id)
    const cur = decodeCursor(cursor, "latest")
    if (cur) q = q.or(`created_at.lt."${cur.c}",and(created_at.eq."${cur.c}",post_id.lt.${cur.i})`)
    const { data, error } = await q.order("created_at", { ascending: false }).order("post_id", { ascending: false }).limit(FEED_PAGE + 1)
    if (error) return none
    const marks = (data as { post_id: string; created_at: string }[] | null) ?? []
    const page = marks.slice(0, FEED_PAGE)
    if (!page.length) return none
    const spaces = await listSpaces(db, community.id)
    const access = accessOf(viewer)
    const visible = new Set(spaces.filter((s) => canSeeSpace(s, access)).map((s) => s.id))
    const { data: rows } = await db
      .from("community_feed_posts")
      .select(POST_COLUMNS)
      .eq("community_id", community.id)
      .eq("status", "published")
      .in(
        "id",
        page.map((m) => m.post_id),
      )
    const byId = new Map(((rows as PostRow[] | null) ?? []).filter((r) => !r.space_id || visible.has(r.space_id)).map((r) => [r.id, r]))
    const ordered = page.map((m) => byId.get(m.post_id)).filter((r): r is PostRow => !!r)
    const last = page[page.length - 1]
    return {
      posts: await hydratePosts(db, ordered, { community, viewer, spaces, lean: true }),
      nextCursor: marks.length > FEED_PAGE ? encodeCursor({ c: last.created_at, i: last.post_id }) : null,
    }
  } catch (e) {
    console.error(`[communities] saved read: ${reasonOf(e)}`)
    return none
  }
}

/* ── Link previews ─────────────────────────────────────────────────────── */

export const PREVIEW_MAX_BYTES = 512 * 1024
export const PREVIEW_TIMEOUT_MS = 4000

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const a = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, "i").exec(html)
    const b = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${k}["']`, "i").exec(html)
    const v = (a?.[1] ?? b?.[1] ?? "").trim()
    if (v) return decodeHtmlEntities(v).replace(/\s+/g, " ").trim()
  }
  return null
}

/** A page's title, picture and site name from its head, the way a chat app reads a link. */
export function parsePreview(html: string, pageUrl: string): LinkPreview {
  const head = html.slice(0, 200_000)
  const title = metaContent(head, ["og:title", "twitter:title"]) ?? (/<title[^>]*>([^<]{1,300})<\/title>/i.exec(head)?.[1] ? decodeHtmlEntities(/<title[^>]*>([^<]{1,300})<\/title>/i.exec(head)![1]).replace(/\s+/g, " ").trim() : null)
  const rawImage = metaContent(head, ["og:image:secure_url", "og:image", "twitter:image"])
  let image: string | null = null
  if (rawImage) {
    try {
      image = httpsImage(new URL(rawImage, pageUrl).toString())
    } catch {
      image = null
    }
  }
  let site = metaContent(head, ["og:site_name"])
  if (!site) {
    try {
      site = new URL(pageUrl).hostname.replace(/^www\./, "")
    } catch {
      site = null
    }
  }
  const description = metaContent(head, ["og:description", "twitter:description", "description"])
  return { url: pageUrl, title: title ? title.slice(0, 200) : null, image, site: site ? site.slice(0, 80) : null, description: description ? description.slice(0, 300) : null }
}

/**
 * A link's card, fetched from the server so the member's browser never asks
 * a stranger's site: public addresses only (lib/api/public-fetch checks the
 * address on connecting and on every redirect), at most 512 KB, four seconds.
 * Null when there is nothing to show.
 */
export async function fetchLinkPreview(raw: string): Promise<LinkPreview | null> {
  const url = linkUrl(raw)
  if (!url) return null
  try {
    const res = await fetchPublic(url, { maxBytes: PREVIEW_MAX_BYTES, timeoutMs: PREVIEW_TIMEOUT_MS, maxRedirects: 3 })
    if (!res.ok) return { url, title: null, image: null, site: new URL(url).hostname.replace(/^www\./, "") }
    const type = res.headers.get("content-type") || ""
    if (!/text\/html|application\/xhtml/i.test(type)) return { url, title: null, image: null, site: new URL(url).hostname.replace(/^www\./, "") }
    return parsePreview(await res.text(), url)
  } catch {
    return null
  }
}

/** The name a post's author goes by, for a notification line. */
export { displayName }

/* ── For the member routes ─────────────────────────────────────────────── */

/**
 * The signed in person's id, Supabase Auth itself as before (lib/auth/route-user requestUserId, `fresh`),
 * or null. null also when Supabase Auth could not say (round rel2-auth):
 * requireMember and the routes that refuse on null answer through
 * signedOutOrRetry, so that is a 503 Try again, never "sign_in".
 */
export async function sessionUserId(): Promise<string | null> {
  const { requestUserId } = await import("@/lib/auth/route-user")
  return requestUserId()
}

/** A request's JSON body, or {} when there is none or it is not JSON. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const v = await request.json()
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const NO_STORE = { "Cache-Control": "no-store" } as const

/** The rateLimit() subject for a member: their user id. */
export function memberSubject(userId: string): string {
  return `user:${userId}`
}
