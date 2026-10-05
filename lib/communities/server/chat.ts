import "server-only"

/**
 * ===========================================================================
 *  CHAT SPACES
 * ===========================================================================
 * Messages are written here, by the server, after the same checks as every
 * other write; a member's browser only LISTENS. Supabase realtime streams
 * new and changed rows of community_messages to members the policy in part
 * 81 lets read the space (public.community_can_read_space), and the page
 * then asks this module for the messages with their authors, so a name and a
 * picture always come from here, never from the stream.
 *
 * A removed or deleted message has its body blanked in the same update
 * (FOUNDATION 10): the stream carries the row, and the words must not travel
 * with it.
 *
 * Unread counts come from community_space_reads, one row per member per
 * space, moved forward when they look at the space.
 */
import { LENGTHS } from "../limits"
import { can } from "../permissions"
import { MESSAGE_COLUMNS, type CommunityRow, type MessageRow, type SpaceRow } from "../types"
import type { ChatMessageView } from "@/components/community/member/view-types"
import { audit } from "./audit"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { accessOf, canPostIn, canSeeSpace, cleanText, listSpaces, refused, type Checked, type WriteContext } from "./feed"
import { touchMember } from "./activity"
import { screenEdit, screenWrite } from "./safety"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CHAT_PAGE = 50
/** Unread counts are worked out for at most this many chat spaces. */
export const UNREAD_SPACES_MAX = 10

/** A chat space of this community this viewer may read, or null. */
export async function chatSpace(db: Db, community: CommunityRow, viewer: Viewer, spaceId: string): Promise<SpaceRow | null> {
  if (!UUID.test(spaceId) || !community.chat_enabled) return null
  const spaces = await listSpaces(db, community.id)
  const space = spaces.find((s) => s.id === spaceId)
  if (!space || space.kind !== "chat" || !canSeeSpace(space, accessOf(viewer))) return null
  return space
}

async function toViews(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, rows: MessageRow[]): Promise<ChatMessageView[]> {
  const authors = await authorViews(
    db,
    community.id,
    rows.map((r) => r.author_id),
  )
  const moderator = can(viewer.role, "moderate_content", viewer.perms)
  return rows.map((r) => ({
    id: r.id,
    spaceId: r.space_id,
    body: r.status === "published" ? r.body : "",
    status: r.status,
    author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
    replyToId: r.reply_to_id,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    canEdit: r.status === "published" && !!viewer.userId && r.author_id === viewer.userId,
    canModerate: r.status === "published" && moderator,
  }))
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 40) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/**
 * Messages, oldest first in the answer. `before` pages back through history
 * (the newest CHAT_PAGE older than it); `after` catches up after the stream
 * said something changed (everything newer, oldest first). Neither: the
 * latest page.
 */
export async function listMessages(
  db: Db,
  community: CommunityRow,
  viewer: Viewer,
  space: SpaceRow,
  opts: { before?: unknown; after?: unknown; ids?: string[] },
): Promise<{ messages: ChatMessageView[]; hasMore: boolean }> {
  try {
    const before = isoOrNull(opts.before)
    const after = isoOrNull(opts.after)
    let q = db.from("community_messages").select(MESSAGE_COLUMNS).eq("space_id", space.id).eq("community_id", community.id).eq("status", "published")
    if (opts.ids?.length) {
      q = q.in("id", opts.ids.filter((id) => UUID.test(id)).slice(0, 50))
      const { data } = await q.order("created_at", { ascending: true })
      return { messages: await toViews(db, community, viewer, (data as MessageRow[] | null) ?? []), hasMore: false }
    }
    if (after) {
      const { data, error } = await q.gt("created_at", after).order("created_at", { ascending: true }).limit(CHAT_PAGE * 2 + 1)
      if (error) return { messages: [], hasMore: false }
      const rows = (data as MessageRow[] | null) ?? []
      return { messages: await toViews(db, community, viewer, rows.slice(0, CHAT_PAGE * 2)), hasMore: rows.length > CHAT_PAGE * 2 }
    }
    if (before) q = q.lt("created_at", before)
    const { data, error } = await q.order("created_at", { ascending: false }).limit(CHAT_PAGE + 1)
    if (error) {
      if (!missing(error)) console.error(`[communities] chat read: ${reasonOf(error)}`)
      return { messages: [], hasMore: false }
    }
    const rows = (data as MessageRow[] | null) ?? []
    return { messages: await toViews(db, community, viewer, rows.slice(0, CHAT_PAGE).reverse()), hasMore: rows.length > CHAT_PAGE }
  } catch (e) {
    console.error(`[communities] chat read: ${reasonOf(e)}`)
    return { messages: [], hasMore: false }
  }
}

export async function postMessage(w: WriteContext, space: SpaceRow, raw: unknown): Promise<Checked<ChatMessageView>> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: false, error: "Sign in to chat.", status: 401 }
  if (!canPostIn(space, viewer, community.chat_enabled)) return { ok: false, error: "You cannot send messages here.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  if (!body) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  let replyTo: string | null = null
  if (typeof r.replyToId === "string" && UUID.test(r.replyToId)) {
    const { data } = await db.from("community_messages").select("id, space_id, status").eq("id", r.replyToId).maybeSingle()
    if (data && data.space_id === space.id && data.status === "published") replyTo = data.id
  }
  const screen = await screenWrite(w, "message", { text: body })
  if (!screen.ok) return refused(screen)
  const { data, error } = await db
    .from("community_messages")
    .insert({ community_id: community.id, space_id: space.id, author_id: viewer.userId, body, reply_to_id: replyTo })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error || !data) {
    console.error(`[communities] message not written: ${reasonOf(error)}`)
    return { ok: false, error: "The message did not send. Try again.", status: missing(error) ? 503 : 500 }
  }
  /* Their own message is read, and they were active just now. */
  await Promise.all([markRead(db, viewer.userId, space.id), touchMember(db, community.id, viewer.userId)])
  const [view] = await toViews(db, community, viewer, [data as MessageRow])
  return { ok: true, value: view }
}

async function messageInCommunity(db: Db, community: CommunityRow, viewer: Viewer, messageId: string): Promise<{ row: MessageRow; space: SpaceRow } | null> {
  if (!UUID.test(messageId)) return null
  const { data } = await db.from("community_messages").select(MESSAGE_COLUMNS).eq("id", messageId).eq("community_id", community.id).maybeSingle()
  const row = (data as MessageRow | null) ?? null
  if (!row || row.status !== "published") return null
  const space = await chatSpace(db, community, viewer, row.space_id)
  return space ? { row, space } : null
}

export async function editMessage(w: WriteContext, messageId: string, raw: unknown): Promise<Checked<ChatMessageView>> {
  const found = await messageInCommunity(w.db, w.community, w.viewer, messageId)
  if (!found) return { ok: false, error: "That message is gone.", status: 404 }
  if (found.row.author_id !== w.viewer.userId) return { ok: false, error: "Only the author can edit a message.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  if (!body) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  const edited = await screenEdit(w, "message", { text: body, before: found.row.body })
  if (!edited.ok) return refused(edited)
  const { data, error } = await w.db
    .from("community_messages")
    .update({ body, edited_at: nowIso() })
    .eq("id", messageId)
    .eq("author_id", w.viewer.userId)
    .select(MESSAGE_COLUMNS)
    .single()
  if (error || !data) return { ok: false, error: "The change did not save. Try again.", status: 500 }
  const [view] = await toViews(w.db, w.community, w.viewer, [data as MessageRow])
  return { ok: true, value: view }
}

/**
 * The author deletes their message, or a moderator removes somebody's. The
 * body is blanked in the same update, so the realtime row carries nothing.
 */
export async function deleteMessage(w: WriteContext, messageId: string, reason?: string | null): Promise<Checked<true>> {
  const found = await messageInCommunity(w.db, w.community, w.viewer, messageId)
  if (!found) return { ok: false, error: "That message is gone.", status: 404 }
  const own = found.row.author_id === w.viewer.userId
  if (!own && !can(w.viewer.role, "moderate_content", w.viewer.perms)) return { ok: false, error: "Only the author can delete a message.", status: 403 }
  const patch = own ? { status: "deleted", body: "", deleted_at: nowIso() } : { status: "removed", body: "", deleted_at: nowIso() }
  const { error } = await w.db.from("community_messages").update(patch).eq("id", messageId).eq("community_id", w.community.id)
  if (error) return { ok: false, error: "The message was not deleted. Try again.", status: 500 }
  if (!own) {
    await audit(w.db, {
      communityId: w.community.id,
      actorId: w.viewer.userId,
      actorKind: "member",
      action: "message.removed",
      targetType: "message",
      targetId: messageId,
      targetLabel: found.row.body.slice(0, 120),
      reason: reason ?? null,
      detail: { spaceId: found.space.id, authorId: found.row.author_id },
    })
  }
  return { ok: true, value: true }
}

/** The member has seen this space up to now. */
export async function markRead(db: Db, userId: string, spaceId: string): Promise<void> {
  try {
    const { error } = await db.from("community_space_reads").upsert({ user_id: userId, space_id: spaceId, last_read_at: nowIso() }, { onConflict: "user_id,space_id" })
    if (error && !missing(error)) console.error(`[communities] read mark: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] read mark: ${reasonOf(e)}`)
  }
}

/**
 * Messages from others since the member last looked, per chat space (since
 * they joined when they never have). Counted on the server's index, at most
 * UNREAD_SPACES_MAX spaces, so a shell with many chats is still a few reads.
 */
export async function unreadCounts(db: Db, viewer: Viewer, spaceIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = spaceIds.filter((id) => UUID.test(id)).slice(0, UNREAD_SPACES_MAX)
  if (!viewer.userId || !ids.length) return out
  try {
    const { data } = await db.from("community_space_reads").select("space_id, last_read_at").eq("user_id", viewer.userId).in("space_id", ids)
    const seen = new Map(((data as { space_id: string; last_read_at: string }[] | null) ?? []).map((r) => [r.space_id, r.last_read_at]))
    const since = viewer.member?.joined_at ?? viewer.member?.created_at ?? nowIso()
    const counts = await Promise.all(
      ids.map((id) =>
        db
          .from("community_messages")
          .select("id", { count: "exact", head: true })
          .eq("space_id", id)
          .eq("status", "published")
          .neq("author_id", viewer.userId)
          .gt("created_at", seen.get(id) ?? since)
          .then((r: { count: number | null }) => r.count ?? 0, () => 0),
      ),
    )
    ids.forEach((id, i) => out.set(id, counts[i]))
  } catch (e) {
    console.error(`[communities] unread counts: ${reasonOf(e)}`)
  }
  return out
}
