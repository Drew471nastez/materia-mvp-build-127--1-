import "server-only"

/**
 * ===========================================================================
 *  A MESSAGE BETWEEN MEMBERS, WRITTEN TO THE RECIPIENT'S BELL (round BC)
 * ===========================================================================
 * The rules are lib/notifications/dm-notify-shared.ts; this reads what they
 * need and writes the one row per conversation. Called after the response
 * (sendDirectMessage's pushSoon), so a send never waits on it, and it never
 * throws.
 *
 * Before part 284 the table refuses the kind (its check) and before part 85
 * there is no table: both answer "unavailable" and the message is told the
 * way it always was, by the push alone.
 */
import { missing, nowIso, reasonOf, type Db } from "./db"
import { chatPrefsFor } from "./chat-settings"
import {
  DM_NOTIFICATION_KIND,
  dmBellPlan,
  dmBellVerdict,
  dmNotificationBody,
  dmNotificationKey,
  dmNotificationTitle,
  type DmExistingRow,
} from "@/lib/notifications/dm-notify-shared"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DirectNoteInput {
  communityId: string
  communitySlug: string
  conversationId: string
  senderId: string
  recipientId: string
  /** The recipient's read mark when the message was sent. */
  recipientReadAt: string | null
  /** What the row says under the title: the words, "Photo", or "New message" when the admins hide previews. */
  preview: string
  now?: number
}

/**
 * news         a row was written or raised: the push may go
 * quiet        the row was only updated (throttled), or the recipient should
 *              not hear it (viewing, muted, Nothing): no push either
 * unavailable  no bell for messages yet (part 284 not run): push as before
 */
export type DirectNoteOutcome = "news" | "quiet" | "unavailable"

/** The table is missing, or its check does not take the kind yet. */
function notReady(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (missing(error) || error.code === "23514")
}

/** The sender's messages the recipient has not read yet, this one included. At least one. */
async function unreadFromSender(db: Db, conversationId: string, senderId: string, since: string | null): Promise<number> {
  try {
    let q = db.from("community_direct_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("author_id", senderId).eq("status", "published")
    if (since) q = q.gt("created_at", since)
    const { count, error } = await q
    return error ? 1 : Math.max(1, count ?? 1)
  } catch {
    return 1
  }
}

export async function noteDirectMessage(db: Db, m: DirectNoteInput): Promise<DirectNoteOutcome> {
  if (!UUID.test(m.recipientId) || !UUID.test(m.senderId) || !UUID.test(m.conversationId)) return "quiet"
  if (m.senderId === m.recipientId) return "quiet"
  const now = m.now ?? Date.now()
  try {
    const key = dmNotificationKey(m.conversationId, m.recipientId)
    const [member, prefs, sender, found] = await Promise.all([
      db.from("community_members").select("status, notify_level").eq("community_id", m.communityId).eq("user_id", m.recipientId).maybeSingle(),
      chatPrefsFor(db, "dm", m.conversationId, [m.recipientId]),
      db.from("profiles").select("display_name, username").eq("id", m.senderId).maybeSingle(),
      db.from("user_notifications").select("id, read_at, created_at").eq("dedupe_key", key).eq("user_id", m.recipientId).maybeSingle(),
    ])
    if (notReady(found.error)) return "unavailable"
    const r = member.data as { status: string; notify_level: string | null } | null
    if (!r || r.status !== "active") return "quiet"
    const verdict = dmBellVerdict({ senderId: m.senderId, recipientId: m.recipientId, readAt: m.recipientReadAt, pref: prefs.get(m.recipientId) ?? null, level: r.notify_level, now })
    if (verdict !== "notify") return "quiet"

    const s = sender.data as { display_name: string | null; username: string | null } | null
    const name = (s?.display_name || s?.username || "A member").trim()
    const count = await unreadFromSender(db, m.conversationId, m.senderId, m.recipientReadAt)
    const content = {
      actor_id: m.senderId,
      title: dmNotificationTitle(name, count),
      body: dmNotificationBody(m.preview),
      url: `/community/${m.communitySlug}?dm=${m.senderId}`,
    }
    const existing = found.error ? null : ((found.data as DmExistingRow | null) ?? null)
    let plan = dmBellPlan(existing, now)
    if (plan.action === "insert") {
      const { data, error } = await db
        .from("user_notifications")
        .upsert({ user_id: m.recipientId, kind: DM_NOTIFICATION_KIND, source: "communities", ...content, dedupe_key: key }, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id")
      if (notReady(error)) return "unavailable"
      if (error) throw error
      if (Array.isArray(data) && data.length > 0) return "news"
      /* Another message got there first: it raised the row a moment ago, so this one only updates it. */
      plan = { action: "update", raise: false, news: false }
    }
    const raise = plan.raise ? { read_at: null, created_at: new Date(now).toISOString() } : {}
    const { error } = await db.from("user_notifications").update({ ...content, ...raise }).eq("dedupe_key", key).eq("user_id", m.recipientId)
    if (notReady(error)) return "unavailable"
    if (error) throw error
    return plan.news ? "news" : "quiet"
  } catch (e) {
    console.error(`[communities] message bell ${m.conversationId}: ${reasonOf(e)}`)
    return "unavailable"
  }
}

/** The conversation was opened: its row in this person's bell is read. Never throws; nothing to do before part 284. */
export async function readDirectNote(db: Db, conversationId: string, userId: string): Promise<void> {
  if (!UUID.test(conversationId) || !UUID.test(userId)) return
  try {
    const { error } = await db.from("user_notifications").update({ read_at: nowIso() }).eq("dedupe_key", dmNotificationKey(conversationId, userId)).eq("user_id", userId).is("read_at", null)
    if (error && !missing(error)) console.error(`[communities] message bell read: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] message bell read: ${reasonOf(e)}`)
  }
}
