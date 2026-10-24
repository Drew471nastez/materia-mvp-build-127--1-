/**
 * ===========================================================================
 *  A MESSAGE BETWEEN MEMBERS, IN THE BELL (round BC)
 * ===========================================================================
 * "When someone sends somebody a message it should display as a
 * notification as well, not only in the messages ... not spammy, very
 * regulated." A direct message writes one row in the recipient's
 * `user_notifications` (kind "direct_message", source "communities", part
 * 283), so it is in the bell in communities and on Explore
 * (components/notifications/notification-bell.tsx) and, while unread, in the
 * /app panel too (app/api/notifications/route.ts).
 *
 * ONE ROW PER CONVERSATION. The row's key is the conversation and the
 * recipient (dmNotificationKey), so a second message never adds a second
 * row: it rewrites the one there ("Mara sent you 3 messages", the newest
 * words underneath).
 *
 * THROTTLED. While that row is unread and was raised less than
 * DM_THROTTLE_MS ago, a new message only updates its count and words: the
 * row keeps its time and nothing is pushed. After that, or once the row was
 * read, the next message raises it again (unread, now, at the top) and may
 * push.
 *
 * QUIET WHEN IT SHOULD BE. Never the sender; nothing while the recipient has
 * the conversation open; nothing while they muted it, or set the community
 * to Nothing (dmBellVerdict). Opening the conversation marks the row read
 * (lib/communities/server/direct.ts markConversationRead).
 *
 * Pure, with no server imports, so tests can hold every rule.
 */
import { chatPushVerdict, type ChatPref } from "@/lib/communities/chat-rules"

/** The row's kind in user_notifications (part 283 adds it to the table's check). */
export const DM_NOTIFICATION_KIND = "direct_message"

/** A raised row is not raised again, nor pushed again, for this long while it stays unread. */
export const DM_THROTTLE_MS = 3 * 60_000

const TITLE_MAX = 200
const BODY_MAX = 140

/** One row per conversation per recipient, for good: later messages rewrite it. */
export function dmNotificationKey(conversationId: string, recipientId: string): string {
  return `dm:${conversationId}:${recipientId}`
}

/** "Mara Pop sent you a message", then "Mara Pop sent you 3 messages". The name leads, so the bell sets it in bold. */
export function dmNotificationTitle(senderName: string, count: number): string {
  const name = (senderName || "").replace(/\s+/g, " ").trim() || "A member"
  const n = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1))
  const what = n === 1 ? "a message" : `${n > 99 ? "99+" : n} messages`
  return `${name} sent you ${what}`.slice(0, TITLE_MAX)
}

/** The newest message's words as the row shows them: one short line. */
export function dmNotificationBody(preview: string): string {
  const line = (preview || "").replace(/\s+/g, " ").trim()
  if (!line) return "New message"
  return line.length <= BODY_MAX ? line : `${line.slice(0, BODY_MAX - 3).trimEnd()}...`
}

export type DmBellVerdict = "notify" | "self" | "viewing" | "muted" | "off"

/**
 * Whether this message belongs in the recipient's bell at all. The same
 * rules as the push (chat-rules.ts chatPushVerdict: the sender, an open
 * conversation, a mute) and the community's own level: a member who set it
 * to Nothing hears nothing from it.
 */
export function dmBellVerdict(i: {
  senderId: string
  recipientId: string
  /** The recipient's read mark on the conversation: fresh means it is open on one of their screens. */
  readAt: string | null
  pref: ChatPref | null
  /** community_members.notify_level, or null for the default. */
  level: string | null
  now?: number
}): DmBellVerdict {
  if (!i.senderId || i.senderId === i.recipientId) return "self"
  if (i.level === "none") return "off"
  const v = chatPushVerdict({ kind: "dm", senderId: i.senderId, recipientId: i.recipientId, readAt: i.readAt, pref: i.pref, addressed: false, now: i.now })
  if (v === "push") return "notify"
  if (v === "self") return "self"
  if (v === "viewing") return "viewing"
  return "muted"
}

export interface DmExistingRow {
  read_at: string | null
  created_at: string
}

export interface DmBellPlan {
  /** Write a new row, rewrite the one there. */
  action: "insert" | "update"
  /** Mark it unread and move it to now (the top of the list). */
  raise: boolean
  /** It is news: the push may go. False while a raised row is still unread and fresh. */
  news: boolean
}

/** What one more message does to the conversation's row (see THROTTLED above). */
export function dmBellPlan(existing: DmExistingRow | null, now: number = Date.now()): DmBellPlan {
  if (!existing) return { action: "insert", raise: true, news: true }
  if (existing.read_at) return { action: "update", raise: true, news: true }
  const at = Date.parse(existing.created_at)
  if (Number.isFinite(at) && now - at < DM_THROTTLE_MS) return { action: "update", raise: false, news: false }
  return { action: "update", raise: true, news: true }
}
