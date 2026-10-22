import "server-only"

/**
 * ===========================================================================
 *  MESSAGES BETWEEN MEMBERS
 * ===========================================================================
 * One conversation per pair of members per community (part 83), the people
 * stored in order (user_a < user_b) so a pair is one row however it started.
 * Written only here, after the same gate every community write passes
 * (requireMember with "chat"), and only while:
 *
 *   the community has chat switched on (the creator's one Chat switch covers
 *     chat spaces and member messages), and
 *   both people are active members who are not banned.
 *
 * The browser listens to realtime for the rows of its own conversations
 * (the policy in part 83 lets only the two members read them) and treats a
 * new row as a signal: it asks this module for the messages, so a name and a
 * picture always come from the server. A deleted message has its body
 * blanked in the same update, so the stream carries nothing.
 *
 * Before part 83 is run the tables are missing: every read answers empty with
 * `ready: false`, and the shell does not draw the chat button at all.
 *
 * ROUND 37 (part 270). Who may message whom follows the admins' Chat
 * settings (everyone, the team only, or off), a block either way, and the
 * other person's own choice (lib/communities/chat-rules.ts dmDecision). A
 * message can carry pictures and files and answer another one, can be
 * edited, and is written once however often its send is retried (client_id).
 * The other person's phone hears it unless they muted the conversation or
 * have it open right now (./chat-push.ts directPushWanted).
 */
import { attachmentLine, dmDecision, dmShortReason, pushPreviewText, type DmVerdict } from "../chat-rules"
import { LENGTHS } from "../limits"
import type { AuthorView, CommunityRow, PostMedia, Role } from "../types"
import type { ChatLine } from "@/components/community/member/view-types"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { cleanText, refused, type Checked } from "./feed"
import { touchMember } from "./activity"
import { pushDirectMessage, pushSoon } from "@/lib/notifications/push-bridge"
import { screenEdit, screenWrite } from "./safety"
import { blockedBetween, chatGate, chatMemberState, chatPrefsFor, loadChatSettings } from "./chat-settings"
import { chatMediaOf, checkChatMedia } from "./chat-media"
import { directPushWanted } from "./chat-push"
import { replyPreviews } from "./chat"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const DM_PAGE = 50
export const INBOX_MAX = 60
const PREVIEW_MAX = 200

const CONVERSATION_COLUMNS = "id, community_id, user_a, user_b, started_by, last_message_at, last_author_id, last_body, a_read_at, b_read_at, created_at"
const MESSAGE_COLUMNS = "id, conversation_id, community_id, author_id, body, status, created_at, edited_at"
/** Part 270's columns too: what it carries, what it answers, the sender's own id. */
const MESSAGE_COLUMNS_270 = `${MESSAGE_COLUMNS}, attachments, reply_to_id, client_id`

export interface ConversationRow {
  id: string
  community_id: string
  user_a: string
  user_b: string
  started_by: string | null
  last_message_at: string | null
  last_author_id: string | null
  last_body: string
  a_read_at: string | null
  b_read_at: string | null
  created_at: string
}

interface DirectMessageRow {
  id: string
  conversation_id: string
  community_id: string
  author_id: string | null
  body: string
  status: "published" | "deleted" | "removed"
  created_at: string
  edited_at: string | null
  attachments?: unknown
  reply_to_id?: string | null
  client_id?: string | null
}

export interface ConversationView {
  id: string
  other: AuthorView | null
  lastBody: string
  lastAt: string | null
  lastFromMe: boolean
  unread: boolean
  /** Round 37: the viewer muted it. */
  muted?: boolean
}

export interface DirectMessageView extends ChatLine {
  conversationId: string
}

/** Who sits on which side of a pair. */
export function pairOf(x: string, y: string): { user_a: string; user_b: string } {
  return x < y ? { user_a: x, user_b: y } : { user_a: y, user_b: x }
}

/** Unread for this person: somebody else wrote after they last looked. */
export function isUnread(c: Pick<ConversationRow, "user_a" | "user_b" | "last_message_at" | "last_author_id" | "a_read_at" | "b_read_at">, userId: string): boolean {
  if (!c.last_message_at || !c.last_author_id || c.last_author_id === userId) return false
  const read = c.user_a === userId ? c.a_read_at : c.b_read_at
  return !read || Date.parse(read) < Date.parse(c.last_message_at)
}

/** The preview a list shows: one line, never more than 200 characters. */
export function previewOf(body: string): string {
  const line = body.replace(/\s+/g, " ").trim()
  return line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 40) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function otherOf(c: Pick<ConversationRow, "user_a" | "user_b">, me: string): string {
  return c.user_a === me ? c.user_b : c.user_a
}

/** A select with part 270's columns, or without them before the part ran. */
async function selectRows<T>(run: (columns: string) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>): Promise<{ data: T | null; error: { code?: string; message?: string } | null }> {
  const first = await run(MESSAGE_COLUMNS_270)
  if (first.error && missing(first.error)) return run(MESSAGE_COLUMNS)
  return first
}

/** Whether member messages can be used here at all: chat on and part 83 run. */
export async function directReady(db: Db, community: Pick<CommunityRow, "id" | "chat_enabled">): Promise<boolean> {
  if (!community.chat_enabled) return false
  try {
    const { error } = await db.from("community_conversations").select("id", { count: "exact", head: true }).eq("community_id", community.id).limit(1)
    return !error
  } catch {
    return false
  }
}

async function activeMember(db: Db, communityId: string, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false
  const { data } = await db.from("community_members").select("status, banned_at").eq("community_id", communityId).eq("user_id", userId).maybeSingle()
  const row = data as { status: string; banned_at: string | null } | null
  return !!row && row.status === "active" && !row.banned_at
}

/**
 * Whether the viewer may write to `otherId` here, by the admins' rule, a
 * block either way and the other person's own choice. The owner counts as
 * the team whatever their member row says. Round 38: the rule can ask for a
 * points level or some days in the community before a member STARTS a
 * conversation (the viewer's own member row says both); answering one the
 * other person started (`replying`) is never held back by them.
 */
async function dmVerdict(db: Db, community: Pick<CommunityRow, "id" | "owner_user_id">, viewer: Viewer, otherId: string, replying: boolean): Promise<DmVerdict & { minLevel: number; minDays: number; gone?: boolean }> {
  const [settings, other, blocked] = await Promise.all([loadChatSettings(db, community.id), chatMemberState(db, community.id, otherId), blockedBetween(db, String(viewer.userId), otherId)])
  const limits = { minLevel: settings.dmMinLevel, minDays: settings.dmMinDays }
  if (!other || !other.active) return { ok: false, reason: "off", error: "That member is no longer in this community.", gone: true, ...limits }
  const otherRole: Role | null = otherId === community.owner_user_id ? "owner" : other.role
  const senderRole: Role | null = viewer.userId === community.owner_user_id ? "owner" : viewer.role
  const d = dmDecision({
    policy: settings.dmPolicy,
    senderId: String(viewer.userId),
    senderRole,
    recipientId: otherId,
    recipientRole: otherRole,
    recipientDms: other.chatDms,
    blocked,
    senderLevel: viewer.member?.level ?? 1,
    senderJoinedAt: viewer.member?.joined_at ?? viewer.member?.created_at ?? null,
    minLevel: settings.dmMinLevel,
    minDays: settings.dmMinDays,
    toStaff: settings.dmToStaff,
    replying,
  })
  return { ...d, ...limits }
}

async function mayMessage(db: Db, community: Pick<CommunityRow, "id" | "owner_user_id">, viewer: Viewer, otherId: string, replying = false): Promise<Checked<true>> {
  const d = await dmVerdict(db, community, viewer, otherId, replying)
  return "error" in d ? { ok: false, error: d.error, status: d.gone ? 404 : 403 } : { ok: true, value: true }
}

/** The other person started this conversation: an answer, not a start. */
function answering(conversation: Pick<ConversationRow, "started_by">, me: string): boolean {
  return !!conversation.started_by && conversation.started_by !== me
}

/**
 * A profile's Message button (round 38): pressable, or greyed with a short
 * reason. A conversation that already exists always opens (to read it), so
 * the button is pressable then whatever the rule says now.
 */
export async function messageButton(db: Db, community: CommunityRow, viewer: Viewer, otherId: string): Promise<{ can: boolean; reason: string | null } | null> {
  if (!viewer.userId || !community.chat_enabled || otherId === viewer.userId || !UUID.test(otherId)) return null
  try {
    const pair = pairOf(viewer.userId, otherId)
    const found = await db.from("community_conversations").select("id, started_by").eq("community_id", community.id).eq("user_a", pair.user_a).eq("user_b", pair.user_b).maybeSingle()
    if (found.error) return missing(found.error) ? null : { can: true, reason: null }
    const existing = found.data as { id: string; started_by: string | null } | null
    if (existing) return { can: true, reason: null }
    const d = await dmVerdict(db, community, viewer, otherId, false)
    if (d.gone) return null
    return "error" in d ? { can: false, reason: dmShortReason(d.reason, d) } : { can: true, reason: null }
  } catch {
    return { can: true, reason: null }
  }
}

/** A conversation of this community that the viewer is in, or null. */
export async function conversationOf(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, conversationId: string): Promise<ConversationRow | null> {
  if (!viewer.userId || !UUID.test(conversationId)) return null
  const { data, error } = await db.from("community_conversations").select(CONVERSATION_COLUMNS).eq("id", conversationId).eq("community_id", community.id).maybeSingle()
  if (error) return null
  const row = data as ConversationRow | null
  if (!row || (row.user_a !== viewer.userId && row.user_b !== viewer.userId)) return null
  return row
}

/** The viewer's conversation with another member, made when there is none yet. */
export async function openConversation(db: Db, community: CommunityRow, viewer: Viewer, otherId: unknown): Promise<Checked<{ id: string; other: AuthorView | null }>> {
  if (!viewer.userId) return { ok: false, error: "Sign in to send a message.", status: 401 }
  if (!community.chat_enabled) return { ok: false, error: "Messages are turned off in this community.", status: 403 }
  if (typeof otherId !== "string" || !UUID.test(otherId)) return { ok: false, error: "That member is not here.", status: 400 }
  if (otherId === viewer.userId) return { ok: false, error: "You cannot message yourself.", status: 400 }
  if (!(await activeMember(db, community.id, otherId))) return { ok: false, error: "That member is no longer in this community.", status: 404 }
  const pair = pairOf(viewer.userId, otherId)
  const found = await db.from("community_conversations").select("id").eq("community_id", community.id).eq("user_a", pair.user_a).eq("user_b", pair.user_b).maybeSingle()
  if (found.error) {
    if (missing(found.error)) return { ok: false, error: "Messages are not set up yet.", status: 503 }
    console.error(`[communities] conversation read: ${reasonOf(found.error)}`)
    return { ok: false, error: "That did not open. Try again.", status: 500 }
  }
  let id = (found.data as { id: string } | null)?.id ?? null
  /* A conversation that already exists opens to read; a new one only when the viewer may write to them. */
  if (!id) {
    const may = await mayMessage(db, community, viewer, otherId)
    if (!may.ok) return refused(may)
    const made = await db.from("community_conversations").insert({ community_id: community.id, ...pair, started_by: viewer.userId }).select("id").single()
    if (made.error) {
      /* Both opened it at the same moment: the other insert won, and its row is the row. */
      const again = await db.from("community_conversations").select("id").eq("community_id", community.id).eq("user_a", pair.user_a).eq("user_b", pair.user_b).maybeSingle()
      id = (again.data as { id: string } | null)?.id ?? null
      if (!id) {
        console.error(`[communities] conversation not made: ${reasonOf(made.error)}`)
        return { ok: false, error: "That did not open. Try again.", status: 500 }
      }
    } else {
      id = (made.data as { id: string }).id
    }
  }
  const other = (await authorViews(db, community.id, [otherId])).get(otherId) ?? null
  return { ok: true, value: { id, other } }
}

/** The viewer's conversations that have a message in them, newest first, and how many are unread. */
export async function listConversations(db: Db, community: CommunityRow, viewer: Viewer): Promise<{ ready: boolean; conversations: ConversationView[]; unread: number }> {
  if (!viewer.userId || !community.chat_enabled) return { ready: false, conversations: [], unread: 0 }
  try {
    const { data, error } = await db
      .from("community_conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("community_id", community.id)
      .or(`user_a.eq.${viewer.userId},user_b.eq.${viewer.userId}`)
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(INBOX_MAX)
    if (error) {
      if (!missing(error)) console.error(`[communities] inbox read: ${reasonOf(error)}`)
      return { ready: !missing(error), conversations: [], unread: 0 }
    }
    const rows = (data as ConversationRow[] | null) ?? []
    const me = viewer.userId
    const [people, prefs] = await Promise.all([authorViews(db, community.id, rows.map((r) => otherOf(r, me))), mutedOf(db, me, "dm", rows.map((r) => r.id))])
    const conversations = rows.map((r) => ({
      id: r.id,
      other: people.get(otherOf(r, me)) ?? null,
      lastBody: r.last_body,
      lastAt: r.last_message_at,
      lastFromMe: r.last_author_id === me,
      unread: isUnread(r, me),
      muted: prefs.has(r.id),
    }))
    return { ready: true, conversations, unread: conversations.filter((c) => c.unread).length }
  } catch (e) {
    console.error(`[communities] inbox read: ${reasonOf(e)}`)
    return { ready: false, conversations: [], unread: 0 }
  }
}

/** Which of these chats the person muted (or set to nothing) right now. */
export async function mutedOf(db: Db, userId: string, chatType: "dm" | "group" | "space", chatIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!chatIds.length) return out
  try {
    const { data, error } = await db.from("community_chat_prefs").select("chat_id, notify, muted_until").eq("user_id", userId).eq("chat_type", chatType).in("chat_id", chatIds.slice(0, 200))
    if (error) return out
    const now = Date.now()
    for (const r of (data as { chat_id: string; notify: string; muted_until: string | null }[] | null) ?? []) if (r.notify === "none" || (r.muted_until && Date.parse(r.muted_until) > now)) out.add(r.chat_id)
  } catch {
    /* Nothing muted. */
  }
  return out
}

/** How many conversations and groups have something unread, for the shell's badge; null when messages are not available here. */
export async function unreadConversations(db: Db, community: CommunityRow, viewer: Viewer): Promise<number | null> {
  if (!viewer.userId || !community.chat_enabled) return null
  const me = viewer.userId
  try {
    const { data, error } = await db
      .from("community_conversations")
      .select("user_a, user_b, last_message_at, last_author_id, a_read_at, b_read_at")
      .eq("community_id", community.id)
      .or(`user_a.eq.${me},user_b.eq.${me}`)
      .not("last_message_at", "is", null)
      .neq("last_author_id", me)
      .order("last_message_at", { ascending: false })
      .limit(INBOX_MAX)
    if (error) return null
    const direct = ((data as ConversationRow[] | null) ?? []).filter((r) => isUnread(r, me)).length
    return direct + (await unreadGroups(db, community.id, me))
  } catch {
    return null
  }
}

/** Groups with a message from somebody else since the member last looked (0 before part 270). */
async function unreadGroups(db: Db, communityId: string, me: string): Promise<number> {
  try {
    const { data, error } = await db.from("community_chat_group_members").select("last_read_at, joined_at, community_chat_groups!inner(last_message_at, last_author_id, archived_at)").eq("user_id", me).eq("community_id", communityId).limit(INBOX_MAX)
    if (error) return 0
    type G = { last_message_at: string | null; last_author_id: string | null; archived_at: string | null }
    return ((data as { last_read_at: string | null; joined_at: string; community_chat_groups: G | G[] }[] | null) ?? []).filter((r) => {
      const g = Array.isArray(r.community_chat_groups) ? r.community_chat_groups[0] : r.community_chat_groups
      if (!g || g.archived_at || !g.last_message_at || g.last_author_id === me) return false
      return Date.parse(g.last_message_at) > Date.parse(r.last_read_at ?? r.joined_at)
    }).length
  } catch {
    return 0
  }
}

async function toViews(db: Db, communityId: string, rows: DirectMessageRow[], me: string): Promise<DirectMessageView[]> {
  const [authors, replies] = await Promise.all([
    authorViews(db, communityId, rows.map((r) => r.author_id)),
    replyPreviews(db, communityId, "community_direct_messages", rows.map((r) => r.reply_to_id ?? null), new Map(rows.map((r) => [r.id, r]))),
  ])
  return rows.map((r) => {
    const live = r.status === "published"
    const mine = r.author_id === me
    return {
      id: r.id,
      conversationId: r.conversation_id,
      authorId: r.author_id,
      author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
      body: live ? r.body : "",
      attachments: live ? chatMediaOf(r.attachments) : [],
      replyTo: r.reply_to_id ? (replies.get(r.reply_to_id) ?? null) : null,
      clientId: r.client_id ?? null,
      mine,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      canEdit: live && mine,
      canDelete: live && mine,
      canModerate: false,
    }
  })
}

/** Messages, oldest first. `before` pages back; `after` catches up after the stream moved; neither is the latest page. */
export async function listDirectMessages(db: Db, conversation: ConversationRow, viewer: Viewer, opts: { before?: unknown; after?: unknown }): Promise<{ messages: DirectMessageView[]; hasMore: boolean; otherReadAt: string | null }> {
  const me = viewer.userId ?? ""
  const otherReadAt = conversation.user_a === me ? conversation.b_read_at : conversation.a_read_at
  try {
    const before = isoOrNull(opts.before)
    const after = isoOrNull(opts.after)
    const base = (c: string) => db.from("community_direct_messages").select(c).eq("conversation_id", conversation.id).eq("status", "published")
    if (after) {
      const { data, error } = await selectRows<DirectMessageRow[]>((c) => base(c).gt("created_at", after).order("created_at", { ascending: true }).limit(DM_PAGE * 2 + 1))
      if (error) return { messages: [], hasMore: false, otherReadAt }
      const rows = data ?? []
      return { messages: await toViews(db, conversation.community_id, rows.slice(0, DM_PAGE * 2), me), hasMore: rows.length > DM_PAGE * 2, otherReadAt }
    }
    const { data, error } = await selectRows<DirectMessageRow[]>((c) => (before ? base(c).lt("created_at", before) : base(c)).order("created_at", { ascending: false }).limit(DM_PAGE + 1))
    if (error) {
      if (!missing(error)) console.error(`[communities] messages read: ${reasonOf(error)}`)
      return { messages: [], hasMore: false, otherReadAt }
    }
    const rows = data ?? []
    return { messages: await toViews(db, conversation.community_id, rows.slice(0, DM_PAGE).reverse(), me), hasMore: rows.length > DM_PAGE, otherReadAt }
  } catch (e) {
    console.error(`[communities] messages read: ${reasonOf(e)}`)
    return { messages: [], hasMore: false, otherReadAt }
  }
}

/** The viewer has seen this conversation up to now. */
export async function markConversationRead(db: Db, conversation: ConversationRow, viewer: Viewer): Promise<void> {
  if (!viewer.userId) return
  const column = conversation.user_a === viewer.userId ? "a_read_at" : "b_read_at"
  try {
    await db.from("community_conversations").update({ [column]: nowIso() }).eq("id", conversation.id)
  } catch (e) {
    console.error(`[communities] conversation read mark: ${reasonOf(e)}`)
  }
}

async function sentBefore(db: Db, conversationId: string, userId: string, clientId: string | null): Promise<DirectMessageRow | null> {
  if (!clientId) return null
  try {
    const { data, error } = await db.from("community_direct_messages").select(MESSAGE_COLUMNS_270).eq("author_id", userId).eq("client_id", clientId).maybeSingle()
    const row = error ? null : ((data as DirectMessageRow | null) ?? null)
    return row && row.conversation_id === conversationId ? row : null
  } catch {
    return null
  }
}

export async function sendDirectMessage(db: Db, community: CommunityRow, viewer: Viewer, conversation: ConversationRow, raw: unknown): Promise<Checked<DirectMessageView> & { code?: string }> {
  if (!viewer.userId) return { ok: false, error: "Sign in to send a message.", status: 401 }
  if (!community.chat_enabled) return { ok: false, error: "Messages are turned off in this community.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const clientId = typeof r.clientId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(r.clientId) ? r.clientId : null
  const again = await sentBefore(db, conversation.id, viewer.userId, clientId)
  if (again) return { ok: true, value: (await toViews(db, community.id, [again], viewer.userId))[0] }
  const gate = await chatGate(db, community, viewer)
  if ("error" in gate) return gate
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  const media = await checkChatMedia(db, community, viewer, r.attachments, gate.settings)
  if (!media.ok) return refused(media)
  const attachments: PostMedia[] = media.value
  if (!body && !attachments.length) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  const other = otherOf(conversation, viewer.userId)
  if (!(await activeMember(db, community.id, other))) return { ok: false, error: "That member is no longer in this community.", status: 403 }
  const may = await mayMessage(db, community, viewer, other, answering(conversation, viewer.userId))
  if (!may.ok) return refused(may)
  let replyTo: string | null = null
  if (typeof r.replyToId === "string" && UUID.test(r.replyToId)) {
    const { data } = await db.from("community_direct_messages").select("id, conversation_id, status").eq("id", r.replyToId).maybeSingle()
    if (data && data.conversation_id === conversation.id && data.status === "published") replyTo = data.id
  }
  const screen = await screenWrite({ db, community, viewer }, "dm", { text: body, media: attachments })
  if (!screen.ok) return refused(screen)
  const plain = { conversation_id: conversation.id, community_id: community.id, author_id: viewer.userId, body }
  const extended = { ...plain, ...(attachments.length ? { attachments } : {}), ...(replyTo ? { reply_to_id: replyTo } : {}), ...(clientId ? { client_id: clientId } : {}) }
  const has270 = attachments.length > 0 || !!replyTo || !!clientId
  let { data, error } = await db
    .from("community_direct_messages")
    .insert(has270 ? extended : plain)
    .select(has270 ? MESSAGE_COLUMNS_270 : MESSAGE_COLUMNS)
    .single()
  if (error && has270 && missing(error)) {
    if (attachments.length) return { ok: false, error: "Pictures and files in messages are not switched on yet. Send the words alone for now.", status: 503 }
    ;({ data, error } = await db.from("community_direct_messages").insert(plain).select(MESSAGE_COLUMNS).single())
  }
  if (error?.code === "23505" && clientId) {
    const first = await sentBefore(db, conversation.id, viewer.userId, clientId)
    if (first) return { ok: true, value: (await toViews(db, community.id, [first], viewer.userId))[0] }
  }
  if (error || !data) {
    console.error(`[communities] message not written: ${reasonOf(error)}`)
    return { ok: false, error: "The message did not send. Try again.", status: missing(error) ? 503 : 500 }
  }
  const row = data as DirectMessageRow
  /* The list's line and order move with it, and the sender has read their own message. */
  const readColumn = conversation.user_a === viewer.userId ? "a_read_at" : "b_read_at"
  const line = body || attachmentLine(attachments) || "Message"
  await Promise.all([
    db
      .from("community_conversations")
      .update({ last_message_at: row.created_at, last_author_id: viewer.userId, last_body: previewOf(line), [readColumn]: row.created_at })
      .eq("id", conversation.id)
      .then(
        () => undefined,
        () => undefined,
      ),
    touchMember(db, community.id, viewer.userId),
  ])
  /*
    The other person's phone, right away (after the response): lib/notifications/push-bridge.ts. A message has no bell row; the push is its notice.
    Round 37: not while they muted the conversation or have it open (their read mark is fresh), and the words only when the admins show previews.
  */
  const senderId = viewer.userId
  const otherReadAt = conversation.user_a === other ? conversation.a_read_at : conversation.b_read_at
  const pushText = pushPreviewText(gate.settings.pushPreviews, body, attachments)
  await pushSoon(async () => {
    if (!(await directPushWanted(db, { conversationId: conversation.id, senderId, recipientId: other, recipientReadAt: otherReadAt }))) return
    await pushDirectMessage(db, { communityId: community.id, communitySlug: community.slug, conversationId: conversation.id, senderId, recipientId: other, text: pushText })
  })
  return { ok: true, value: (await toViews(db, community.id, [row], viewer.userId))[0] }
}

/** The author changes the words of their own message. */
export async function editDirectMessage(db: Db, community: CommunityRow, conversation: ConversationRow, viewer: Viewer, messageId: string, raw: unknown): Promise<Checked<DirectMessageView>> {
  if (!viewer.userId || !UUID.test(messageId)) return { ok: false, error: "That message is gone.", status: 404 }
  const { data: found } = await selectRows<DirectMessageRow>((c) => db.from("community_direct_messages").select(c).eq("id", messageId).eq("conversation_id", conversation.id).maybeSingle())
  if (!found || found.status !== "published") return { ok: false, error: "That message is gone.", status: 404 }
  if (found.author_id !== viewer.userId) return { ok: false, error: "Only the author can edit a message.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  if (!body && !chatMediaOf(found.attachments).length) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  const edited = await screenEdit({ db, community, viewer }, "dm", { text: body, before: found.body })
  if (!edited.ok) return refused(edited)
  const { data, error } = await selectRows<DirectMessageRow>((c) => db.from("community_direct_messages").update({ body, edited_at: nowIso() }).eq("id", messageId).eq("author_id", viewer.userId).select(c).single())
  if (error || !data) return { ok: false, error: "The change did not save. Try again.", status: 500 }
  if (conversation.last_message_at && Date.parse(conversation.last_message_at) === Date.parse(found.created_at)) {
    await db.from("community_conversations").update({ last_body: previewOf(body || "Message") }).eq("id", conversation.id).then(
      () => undefined,
      () => undefined,
    )
  }
  return { ok: true, value: (await toViews(db, community.id, [data], viewer.userId))[0] }
}

/** The author deletes their own message; its words are blanked in the same update. */
export async function deleteDirectMessage(db: Db, conversation: ConversationRow, viewer: Viewer, messageId: string): Promise<Checked<true>> {
  if (!viewer.userId || !UUID.test(messageId)) return { ok: false, error: "That message is gone.", status: 404 }
  const { data } = await db.from("community_direct_messages").select("id, author_id, status, created_at").eq("id", messageId).eq("conversation_id", conversation.id).maybeSingle()
  const row = data as { id: string; author_id: string | null; status: string; created_at: string } | null
  if (!row || row.status !== "published") return { ok: false, error: "That message is gone.", status: 404 }
  if (row.author_id !== viewer.userId) return { ok: false, error: "Only the author can delete a message.", status: 403 }
  let { error } = await db.from("community_direct_messages").update({ status: "deleted", body: "", deleted_at: nowIso(), attachments: [] }).eq("id", messageId).eq("author_id", viewer.userId)
  if (error && missing(error)) ({ error } = await db.from("community_direct_messages").update({ status: "deleted", body: "", deleted_at: nowIso() }).eq("id", messageId).eq("author_id", viewer.userId))
  if (error) return { ok: false, error: "The message was not deleted. Try again.", status: 500 }
  /* When it was the last one, the list's line goes with it. */
  if (conversation.last_message_at && Date.parse(conversation.last_message_at) === Date.parse(row.created_at)) {
    await db.from("community_conversations").update({ last_body: "Message deleted" }).eq("id", conversation.id).then(
      () => undefined,
      () => undefined,
    )
  }
  return { ok: true, value: true }
}

/** The muted state the thread's bell shows. */
export async function conversationPref(db: Db, conversation: ConversationRow, viewer: Viewer) {
  if (!viewer.userId) return { notify: "default" as const, mutedUntil: null }
  return (await chatPrefsFor(db, "dm", conversation.id, [viewer.userId])).get(viewer.userId) ?? { notify: "default" as const, mutedUntil: null }
}
