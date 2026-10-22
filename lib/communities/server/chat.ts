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
 *
 * ROUND 37 (the owner: "Telegram like, attachments, rules, notifications").
 * A message now also carries pictures, GIFs and files (./chat-media.ts), a
 * reply shows the line it answers, and the sender's own id for the message
 * (client_id, part 270) makes a retried send one message. Before a member
 * writes: the chat gate (./chat-settings.ts chatGate: chat on, no chat ban
 * or mute, the chat rules accepted), who may post in the channel (its
 * post_role, as the Spaces editor sets it) and the channel's own slow mode.
 * After: @mentions and the person answered are told (a bell row and a push,
 * ./notify.ts), and people who asked for every message of the channel get a
 * push (./chat-push.ts). Before part 270 every read and write works as it
 * did, without the new columns.
 */
import { channelPostOf, levelLetsPost, slowModeOfSpace, slowModeWait, waitText, attachmentLine } from "../chat-rules"
import { LENGTHS, extractMentions } from "../limits"
import { can, meetsRole, ROLE_RANK } from "../permissions"
import { MESSAGE_COLUMNS, type CommunityRow, type MessageRow, type Role, type SpaceRow } from "../types"
import { memberOf } from "./membership"
import type { ChatMessageView, ChatReplyPreview } from "@/components/community/member/view-types"
import { audit } from "./audit"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { accessOf, canPostIn, canSeeSpace, cleanText, listSpaces, permsOf, refused, type Checked, type WriteContext } from "./feed"
import { touchMember } from "./activity"
import { screenEdit, screenWrite } from "./safety"
import { chatGate, everyMessageListeners } from "./chat-settings"
import { chatMediaOf, checkChatMedia } from "./chat-media"
import { pushChatMessage } from "./chat-push"
import { resolveMentions, snippet } from "./mentions"
import { notifyMember } from "./notify"
import { pushSoon } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CHAT_PAGE = 50
/** Unread counts are worked out for at most this many chat spaces. */
export const UNREAD_SPACES_MAX = 10

const WITH_CLIENT = `${MESSAGE_COLUMNS}, client_id`

type Row = MessageRow & { client_id?: string | null }

/** A select of messages with part 270's client_id, or without it before the part ran. */
async function selectRows<T>(run: (columns: string) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>): Promise<{ data: T | null; error: { code?: string; message?: string } | null }> {
  const first = await run(WITH_CLIENT)
  if (first.error && missing(first.error)) return run(MESSAGE_COLUMNS)
  return first
}

/** A chat space of this community this viewer may read, or null. */
export async function chatSpace(db: Db, community: CommunityRow, viewer: Viewer, spaceId: string): Promise<SpaceRow | null> {
  if (!UUID.test(spaceId) || !community.chat_enabled) return null
  const spaces = await listSpaces(db, community.id)
  const space = spaces.find((s) => s.id === spaceId)
  if (!space || space.kind !== "chat" || !canSeeSpace(space, accessOf(viewer))) return null
  return space
}

/** What a reply shows of what it answers, for a page of messages: one read. */
export async function replyPreviews(db: Db, communityId: string, table: string, ids: (string | null | undefined)[], extra: Map<string, { author_id: string | null; body: string; status: string; attachments?: unknown }> = new Map()): Promise<Map<string, ChatReplyPreview>> {
  const out = new Map<string, ChatReplyPreview>()
  const want = [...new Set(ids.filter((id): id is string => !!id && UUID.test(id)))].slice(0, 100)
  if (!want.length) return out
  const rows = new Map(extra)
  const unknown = want.filter((id) => !rows.has(id))
  if (unknown.length) {
    try {
      const { data } = await db.from(table).select("id, author_id, body, status, attachments").in("id", unknown)
      for (const r of (data as { id: string; author_id: string | null; body: string; status: string; attachments?: unknown }[] | null) ?? []) rows.set(r.id, r)
    } catch {
      /* Replies drawn without what they answer. */
    }
  }
  const authors = await authorViews(db, communityId, [...rows.values()].map((r) => r.author_id))
  for (const id of want) {
    const r = rows.get(id)
    if (!r) continue
    const text = r.status !== "published" ? "Message deleted" : snippet(r.body, 90) || attachmentLine(chatMediaOf(r.attachments)) || "Message"
    out.set(id, { id, authorName: r.author_id ? (authors.get(r.author_id)?.name ?? "Member") : "Former member", text })
  }
  return out
}

/** Which of these messages the viewer liked. */
async function likedBy(db: Db, viewerId: string | null, ids: string[]): Promise<Set<string>> {
  if (!viewerId || !ids.length) return new Set()
  try {
    const { data } = await db.from("community_reactions").select("target_id").eq("target_type", "message").eq("user_id", viewerId).in("target_id", ids)
    return new Set(((data as { target_id: string }[] | null) ?? []).map((r) => r.target_id))
  } catch {
    return new Set()
  }
}

async function toViews(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, rows: Row[]): Promise<ChatMessageView[]> {
  const [authors, replies, liked] = await Promise.all([
    authorViews(
      db,
      community.id,
      rows.map((r) => r.author_id),
    ),
    replyPreviews(db, community.id, "community_messages", rows.map((r) => r.reply_to_id), new Map(rows.map((r) => [r.id, r]))),
    likedBy(db, viewer.userId, rows.map((r) => r.id)),
  ])
  const moderator = can(viewer.role, "moderate_content", viewer.perms)
  return rows.map((r) => {
    const mine = !!viewer.userId && r.author_id === viewer.userId
    const live = r.status === "published"
    return {
      id: r.id,
      spaceId: r.space_id,
      body: live ? r.body : "",
      status: r.status as ChatMessageView["status"],
      authorId: r.author_id,
      author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
      mine,
      attachments: live ? chatMediaOf(r.attachments) : [],
      replyToId: r.reply_to_id,
      replyTo: r.reply_to_id ? (replies.get(r.reply_to_id) ?? null) : null,
      clientId: r.client_id ?? null,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      reactionCount: r.reaction_count ?? 0,
      reacted: liked.has(r.id),
      canEdit: live && mine,
      canDelete: live && mine,
      canModerate: live && moderator,
    }
  })
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
    const base = (columns: string) => db.from("community_messages").select(columns).eq("space_id", space.id).eq("community_id", community.id).eq("status", "published")
    if (opts.ids?.length) {
      const ids = opts.ids.filter((id) => UUID.test(id)).slice(0, 50)
      const { data } = await selectRows<Row[]>((c) => base(c).in("id", ids).order("created_at", { ascending: true }))
      return { messages: await toViews(db, community, viewer, data ?? []), hasMore: false }
    }
    if (after) {
      const { data, error } = await selectRows<Row[]>((c) => base(c).gt("created_at", after).order("created_at", { ascending: true }).limit(CHAT_PAGE * 2 + 1))
      if (error) return { messages: [], hasMore: false }
      const rows = data ?? []
      return { messages: await toViews(db, community, viewer, rows.slice(0, CHAT_PAGE * 2)), hasMore: rows.length > CHAT_PAGE * 2 }
    }
    const { data, error } = await selectRows<Row[]>((c) => (before ? base(c).lt("created_at", before) : base(c)).order("created_at", { ascending: false }).limit(CHAT_PAGE + 1))
    if (error) {
      if (!missing(error)) console.error(`[communities] chat read: ${reasonOf(error)}`)
      return { messages: [], hasMore: false }
    }
    const rows = data ?? []
    return { messages: await toViews(db, community, viewer, rows.slice(0, CHAT_PAGE).reverse()), hasMore: rows.length > CHAT_PAGE }
  } catch (e) {
    console.error(`[communities] chat read: ${reasonOf(e)}`)
    return { messages: [], hasMore: false }
  }
}

/**
 * A channel's own rules beside its post_role: its slow mode (part 270), the
 * points level a member needs to post and its pinned message (part 272).
 * Each is "none" before its part ran.
 */
export async function channelFacts(db: Db, spaceId: string): Promise<{ slowMode: number; minLevel: number; pinnedId: string | null }> {
  const none = { slowMode: 0, minLevel: 0, pinnedId: null }
  try {
    let { data, error } = await db.from("community_spaces").select("slow_mode_seconds, post_min_level, pinned_message_id").eq("id", spaceId).maybeSingle()
    if (error && missing(error)) ({ data, error } = await db.from("community_spaces").select("slow_mode_seconds").eq("id", spaceId).maybeSingle())
    if (error || !data) return none
    const row = data as { slow_mode_seconds?: unknown; post_min_level?: unknown; pinned_message_id?: string | null }
    return { slowMode: slowModeOfSpace(row.slow_mode_seconds), minLevel: channelPostOf("member", row.post_min_level).minLevel, pinnedId: row.pinned_message_id ?? null }
  } catch {
    return none
  }
}

/** The member's last message in this channel, for its slow mode. */
async function lastMineAt(db: Db, spaceId: string, userId: string): Promise<number | null> {
  const { data } = await db.from("community_messages").select("created_at").eq("space_id", spaceId).eq("author_id", userId).order("created_at", { ascending: false }).limit(1)
  const at = (data as { created_at: string }[] | null)?.[0]?.created_at
  return at ? Date.parse(at) : null
}

/** A channel's pinned message as one line (round 38), or null when there is none or it was taken down. */
export async function pinnedLine(db: Db, communityId: string, spaceId: string, messageId: string | null): Promise<{ id: string; authorName: string; text: string } | null> {
  if (!messageId || !UUID.test(messageId)) return null
  try {
    const { data } = await db.from("community_messages").select("id, space_id, author_id, body, status, attachments").eq("id", messageId).eq("community_id", communityId).maybeSingle()
    const row = data as { id: string; space_id: string; author_id: string | null; body: string; status: string; attachments?: unknown } | null
    if (!row || row.space_id !== spaceId || row.status !== "published") return null
    const author = row.author_id ? (await authorViews(db, communityId, [row.author_id])).get(row.author_id) : null
    return { id: row.id, authorName: author?.name ?? "Member", text: snippet(row.body, 140) || attachmentLine(chatMediaOf(row.attachments)) || "Message" }
  } catch {
    return null
  }
}

/** A message this sender already wrote under this client id (a retried send), or null. */
async function sentBefore(db: Db, userId: string, clientId: string | null): Promise<Row | null> {
  if (!clientId) return null
  try {
    const { data, error } = await db.from("community_messages").select(WITH_CLIENT).eq("author_id", userId).eq("client_id", clientId).maybeSingle()
    return error ? null : ((data as Row | null) ?? null)
  } catch {
    return null
  }
}

export async function postMessage(w: WriteContext, space: SpaceRow, raw: unknown): Promise<Checked<ChatMessageView> & { code?: string }> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: false, error: "Sign in to chat.", status: 401 }
  if (!canPostIn(space, viewer, community.chat_enabled)) return { ok: false, error: "You cannot send messages here.", status: 403 }
  /* Who may post in this channel, as Spaces sets it: everyone, or the team only. */
  if (space.post_role && !meetsRole(viewer.role, space.post_role)) return { ok: false, error: "Only the community's team can post in this channel.", status: 403 }
  const gate = await chatGate(db, community, viewer)
  if ("error" in gate) return gate
  /* Round 38: a channel can ask for a points level before a member posts (the team always may). */
  const facts = await channelFacts(db, space.id)
  if (!levelLetsPost(viewer.role, viewer.member?.level ?? 1, facts.minLevel)) return { ok: false, error: `Members from level ${facts.minLevel} can post in this channel.`, status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const clientId = typeof r.clientId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(r.clientId) ? r.clientId : null
  const again = await sentBefore(db, viewer.userId, clientId)
  if (again && again.space_id === space.id) return { ok: true, value: (await toViews(db, community, viewer, [again]))[0] }
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  const media = await checkChatMedia(db, community, viewer, r.attachments, gate.settings)
  if (!media.ok) return refused(media)
  const attachments = media.value
  if (!body && !attachments.length) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  /* The channel's own slow mode, for members (the team is never slowed). */
  const team = viewer.role ? ROLE_RANK[viewer.role] >= ROLE_RANK.moderator : false
  if (!team) {
    const slow = facts.slowMode
    const wait = slow ? slowModeWait(await lastMineAt(db, space.id, viewer.userId), slow) : 0
    if (wait > 0) return { ok: false, error: `Slow mode is on: one message every ${waitText(slow)}. Try again in ${waitText(wait)}.`, status: 429 }
  }
  let replyTo: { id: string; author_id: string | null } | null = null
  if (typeof r.replyToId === "string" && UUID.test(r.replyToId)) {
    const { data } = await db.from("community_messages").select("id, space_id, status, author_id").eq("id", r.replyToId).maybeSingle()
    if (data && data.space_id === space.id && data.status === "published") replyTo = { id: data.id, author_id: data.author_id }
  }
  const screen = await screenWrite(w, "message", { text: body, media: attachments })
  if (!screen.ok) return refused(screen)
  const row = { community_id: community.id, space_id: space.id, author_id: viewer.userId, body, reply_to_id: replyTo?.id ?? null, ...(attachments.length ? { attachments } : {}) }
  let { data, error } = await db
    .from("community_messages")
    .insert(clientId ? { ...row, client_id: clientId } : row)
    .select(clientId ? WITH_CLIENT : MESSAGE_COLUMNS)
    .single()
  /* Before part 270 there is no client_id: written without it. */
  if (error && clientId && missing(error)) ({ data, error } = await db.from("community_messages").insert(row).select(MESSAGE_COLUMNS).single())
  /* The same send twice at once: the first one's row is the row. */
  if (error?.code === "23505" && clientId) {
    const first = await sentBefore(db, viewer.userId, clientId)
    if (first) return { ok: true, value: (await toViews(db, community, viewer, [first]))[0] }
  }
  if (error || !data) {
    console.error(`[communities] message not written: ${reasonOf(error)}`)
    return { ok: false, error: "The message did not send. Try again.", status: missing(error) ? 503 : 500 }
  }
  const written = data as Row
  /* Their own message is read, and they were active just now. */
  await Promise.all([markRead(db, viewer.userId, space.id), touchMember(db, community.id, viewer.userId)])
  const [view] = await toViews(db, community, viewer, [written])
  await tellAboutMessage(w, space, written, view, replyTo?.author_id ?? null, gate.settings.pushPreviews)
  return { ok: true, value: view }
}

/**
 * After a message: the people it names and the person it answers get a bell
 * row (and through it a push); everyone who asked for every message of the
 * channel gets a push. Never throws, never holds up the answer for long.
 */
async function tellAboutMessage(w: WriteContext, space: SpaceRow, row: Row, view: ChatMessageView, answeredId: string | null, previews: boolean): Promise<void> {
  const { db, community, viewer } = w
  const senderId = String(viewer.userId)
  const senderName = view.author?.name ?? "A member"
  const url = `/community/${community.slug}/space/${space.slug}?m=${row.id}`
  const told = new Set<string>([senderId])
  try {
    const names = extractMentions(row.body)
    const named = names.length ? await resolveMentions(db, community.id, names) : new Map<string, string>()
    const line = snippet(row.body) || attachmentLine(chatMediaOf(row.attachments)) || "Message"
    for (const userId of new Set(named.values())) {
      if (told.has(userId)) continue
      told.add(userId)
      await notifyMember(db, { userId, communityId: community.id, kind: "mention", actorId: senderId, target: { type: "message", id: row.id }, title: `${senderName} mentioned you in #${space.name}`, body: line, url, dedupeKey: `mention:message:${row.id}:${userId}` })
    }
    if (answeredId && !told.has(answeredId)) {
      told.add(answeredId)
      await notifyMember(db, { userId: answeredId, communityId: community.id, kind: "reply", actorId: senderId, target: { type: "message", id: row.id }, title: `${senderName} replied to you in #${space.name}`, body: line, url, dedupeKey: `reply:message:${row.id}:${answeredId}` })
    }
  } catch (e) {
    console.error(`[communities] chat mentions: ${reasonOf(e)}`)
  }
  const media = chatMediaOf(row.attachments)
  await pushSoon(async () => {
    const listeners = (await everyMessageListeners(db, space.id)).filter((id) => !told.has(id))
    if (!listeners.length) return
    const { data } = await db.from("community_space_reads").select("user_id, last_read_at").eq("space_id", space.id).in("user_id", listeners)
    const reads = new Map(((data as { user_id: string; last_read_at: string }[] | null) ?? []).map((r) => [r.user_id, r.last_read_at]))
    await pushChatMessage(db, { kind: "space", communityId: community.id, chatId: space.id, chatName: space.name, url, senderId, senderName, text: row.body, media, previews, recipients: listeners.map((userId) => ({ userId, readAt: reads.get(userId) ?? null, addressed: false })) })
  })
}

async function messageInCommunity(db: Db, community: CommunityRow, viewer: Viewer, messageId: string): Promise<{ row: Row; space: SpaceRow } | null> {
  if (!UUID.test(messageId)) return null
  const { data } = await selectRows<Row>((c) => db.from("community_messages").select(c).eq("id", messageId).eq("community_id", community.id).maybeSingle())
  const row = data ?? null
  if (!row || row.status !== "published") return null
  const space = await chatSpace(db, community, viewer, row.space_id)
  return space ? { row, space } : null
}

/** A message by id for the stream's UPDATE (an edit), as the page draws it. */
export async function oneMessage(db: Db, community: CommunityRow, viewer: Viewer, messageId: string): Promise<ChatMessageView | null> {
  const found = await messageInCommunity(db, community, viewer, messageId)
  return found ? (await toViews(db, community, viewer, [found.row]))[0] : null
}

export async function editMessage(w: WriteContext, messageId: string, raw: unknown): Promise<Checked<ChatMessageView>> {
  const found = await messageInCommunity(w.db, w.community, w.viewer, messageId)
  if (!found) return { ok: false, error: "That message is gone.", status: 404 }
  if (found.row.author_id !== w.viewer.userId) return { ok: false, error: "Only the author can edit a message.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  if (!body && !chatMediaOf(found.row.attachments).length) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  const edited = await screenEdit(w, "message", { text: body, before: found.row.body })
  if (!edited.ok) return refused(edited)
  const { data, error } = await selectRows<Row>((c) =>
    w.db
      .from("community_messages")
      .update({ body, edited_at: nowIso() })
      .eq("id", messageId)
      .eq("author_id", w.viewer.userId)
      .select(c)
      .single(),
  )
  if (error || !data) return { ok: false, error: "The change did not save. Try again.", status: 500 }
  const [view] = await toViews(w.db, w.community, w.viewer, [data])
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
  /*
    NOT ABOVE ONE'S OWN RANK (round 27 review): a moderator removes a member's message, never an admin's or the owner's,
    the same rule a post or a comment already follows (moderation.ts actOnContent).
  */
  if (!own && found.row.author_id) {
    const author = found.row.author_id
    const authorRole: Role | null = author === w.community.owner_user_id ? "owner" : await memberOf(w.db, w.community.id, author).then((m) => (m && m.status === "active" ? m.role : null)).catch(() => null)
    if (authorRole && w.viewer.role && ROLE_RANK[authorRole] >= ROLE_RANK[w.viewer.role]) return { ok: false, error: "You cannot remove a message from someone at or above your role.", status: 403 }
  }
  const patch = own ? { status: "deleted", body: "", deleted_at: nowIso(), attachments: [] } : { status: "removed", body: "", deleted_at: nowIso(), attachments: [] }
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

/** Whether this viewer may post in this channel (the composer, or a line saying why not). */
export function canWriteIn(space: SpaceRow, viewer: Viewer, chatEnabled: boolean): boolean {
  return canPostIn(space, viewer, chatEnabled) && (!space.post_role || meetsRole(viewer.role, space.post_role)) && can(viewer.role, "chat", permsOf(viewer))
}
