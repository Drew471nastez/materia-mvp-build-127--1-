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
 */
import { LENGTHS } from "../limits"
import type { AuthorView, CommunityRow } from "../types"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { cleanText, type Checked } from "./feed"
import { touchMember } from "./activity"
import { pushDirectMessage, pushSoon } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const DM_PAGE = 50
export const INBOX_MAX = 60
const PREVIEW_MAX = 200

const CONVERSATION_COLUMNS = "id, community_id, user_a, user_b, started_by, last_message_at, last_author_id, last_body, a_read_at, b_read_at, created_at"
const MESSAGE_COLUMNS = "id, conversation_id, community_id, author_id, body, status, created_at, edited_at"

interface ConversationRow {
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
}

export interface ConversationView {
  id: string
  other: AuthorView | null
  lastBody: string
  lastAt: string | null
  lastFromMe: boolean
  unread: boolean
}

export interface DirectMessageView {
  id: string
  conversationId: string
  body: string
  mine: boolean
  createdAt: string
  editedAt: string | null
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
  if (!id) {
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
    const people = await authorViews(db, community.id, rows.map((r) => otherOf(r, me)))
    const conversations = rows.map((r) => ({
      id: r.id,
      other: people.get(otherOf(r, me)) ?? null,
      lastBody: r.last_body,
      lastAt: r.last_message_at,
      lastFromMe: r.last_author_id === me,
      unread: isUnread(r, me),
    }))
    return { ready: true, conversations, unread: conversations.filter((c) => c.unread).length }
  } catch (e) {
    console.error(`[communities] inbox read: ${reasonOf(e)}`)
    return { ready: false, conversations: [], unread: 0 }
  }
}

/** How many conversations have something unread, for the shell's badge; null when messages are not available here. */
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
    return ((data as ConversationRow[] | null) ?? []).filter((r) => isUnread(r, me)).length
  } catch {
    return null
  }
}

function toViews(rows: DirectMessageRow[], me: string): DirectMessageView[] {
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    body: r.status === "published" ? r.body : "",
    mine: r.author_id === me,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  }))
}

/** Messages, oldest first. `before` pages back; `after` catches up after the stream moved; neither is the latest page. */
export async function listDirectMessages(db: Db, conversation: ConversationRow, viewer: Viewer, opts: { before?: unknown; after?: unknown }): Promise<{ messages: DirectMessageView[]; hasMore: boolean }> {
  const me = viewer.userId ?? ""
  try {
    const before = isoOrNull(opts.before)
    const after = isoOrNull(opts.after)
    let q = db.from("community_direct_messages").select(MESSAGE_COLUMNS).eq("conversation_id", conversation.id).eq("status", "published")
    if (after) {
      const { data, error } = await q.gt("created_at", after).order("created_at", { ascending: true }).limit(DM_PAGE * 2 + 1)
      if (error) return { messages: [], hasMore: false }
      const rows = (data as DirectMessageRow[] | null) ?? []
      return { messages: toViews(rows.slice(0, DM_PAGE * 2), me), hasMore: rows.length > DM_PAGE * 2 }
    }
    if (before) q = q.lt("created_at", before)
    const { data, error } = await q.order("created_at", { ascending: false }).limit(DM_PAGE + 1)
    if (error) {
      if (!missing(error)) console.error(`[communities] messages read: ${reasonOf(error)}`)
      return { messages: [], hasMore: false }
    }
    const rows = (data as DirectMessageRow[] | null) ?? []
    return { messages: toViews(rows.slice(0, DM_PAGE).reverse(), me), hasMore: rows.length > DM_PAGE }
  } catch (e) {
    console.error(`[communities] messages read: ${reasonOf(e)}`)
    return { messages: [], hasMore: false }
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

export async function sendDirectMessage(db: Db, community: CommunityRow, viewer: Viewer, conversation: ConversationRow, raw: unknown): Promise<Checked<DirectMessageView>> {
  if (!viewer.userId) return { ok: false, error: "Sign in to send a message.", status: 401 }
  if (!community.chat_enabled) return { ok: false, error: "Messages are turned off in this community.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  if (!body) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  const other = otherOf(conversation, viewer.userId)
  if (!(await activeMember(db, community.id, other))) return { ok: false, error: "That member is no longer in this community.", status: 403 }
  const { data, error } = await db
    .from("community_direct_messages")
    .insert({ conversation_id: conversation.id, community_id: community.id, author_id: viewer.userId, body })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error || !data) {
    console.error(`[communities] message not written: ${reasonOf(error)}`)
    return { ok: false, error: "The message did not send. Try again.", status: missing(error) ? 503 : 500 }
  }
  const row = data as DirectMessageRow
  /* The list's line and order move with it, and the sender has read their own message. */
  const readColumn = conversation.user_a === viewer.userId ? "a_read_at" : "b_read_at"
  await Promise.all([
    db
      .from("community_conversations")
      .update({ last_message_at: row.created_at, last_author_id: viewer.userId, last_body: previewOf(body), [readColumn]: row.created_at })
      .eq("id", conversation.id)
      .then(
        () => undefined,
        () => undefined,
      ),
    touchMember(db, community.id, viewer.userId),
  ])
  /* The other person's phone, right away (after the response): lib/notifications/push-bridge.ts. A message has no bell row; the push is its notice. */
  const senderId = viewer.userId
  await pushSoon(() => pushDirectMessage(db, { communityId: community.id, communitySlug: community.slug, conversationId: conversation.id, senderId, recipientId: other, text: body }))
  return { ok: true, value: toViews([row], viewer.userId)[0] }
}

/** The author deletes their own message; its words are blanked in the same update. */
export async function deleteDirectMessage(db: Db, conversation: ConversationRow, viewer: Viewer, messageId: string): Promise<Checked<true>> {
  if (!viewer.userId || !UUID.test(messageId)) return { ok: false, error: "That message is gone.", status: 404 }
  const { data } = await db.from("community_direct_messages").select("id, author_id, status, created_at").eq("id", messageId).eq("conversation_id", conversation.id).maybeSingle()
  const row = data as { id: string; author_id: string | null; status: string; created_at: string } | null
  if (!row || row.status !== "published") return { ok: false, error: "That message is gone.", status: 404 }
  if (row.author_id !== viewer.userId) return { ok: false, error: "Only the author can delete a message.", status: 403 }
  const { error } = await db.from("community_direct_messages").update({ status: "deleted", body: "", deleted_at: nowIso() }).eq("id", messageId).eq("author_id", viewer.userId)
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
