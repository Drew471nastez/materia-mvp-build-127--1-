import "server-only"

/**
 * ===========================================================================
 *  A NEW CHAT MESSAGE ON A PHONE (round 37)
 * ===========================================================================
 * After a message in a group or a channel is written, and after the
 * response has gone (pushSoon), each person who should hear it gets one push
 * through Storelib's push pipeline (lib/notifications/push-bridge.ts pushOne,
 * which sends to the iPhone and Android apps' device tokens and to browsers
 * with push on, honours the person's push switch, their Messages kind,
 * quiet hours and the community's notify level). Before that, the chat's own
 * rules (lib/communities/chat-rules.ts chatPushVerdict):
 *
 *   never the sender
 *   never while that chat is open on one of their screens (a read mark
 *     renewed in the last 45 seconds: the page renews it every 20)
 *   not while they muted the chat, unless it names them or answers them
 *   a channel only for people who asked for every message there, or for a
 *     mention or a reply (those also have a bell row, ./notify.ts)
 *   at most PUSH_BURST pushes per chat per person in PUSH_BURST_SECONDS: a
 *     burst of messages is one or two banners, each replacing the last
 *     (collapseKey per chat), and the rest is on the badge
 *
 * What a banner says: who wrote and where, and the words, or "Photo" for a
 * picture, or "New message" when the admins turned previews off. A tap opens
 * that chat.
 */
import { PUSH_BURST, PUSH_BURST_SECONDS, chatPushVerdict, pushPreviewText, type ChatKind } from "../chat-rules"
import type { NotifyLevel, PostMedia } from "../types"
import { conversationGroup, pushOne, safePushUrl, type PushKind } from "@/lib/notifications/push-bridge"
import { chatPrefsFor } from "./chat-settings"
import { reasonOf, type Db } from "./db"
import { addHits, countHits } from "./safety"

export const CHAT_PUSH_BUCKET = "chat-push"

export interface ChatPushRecipient {
  userId: string
  /** Their read mark for this chat: fresh means they are looking at it. */
  readAt: string | null
  /** The message names them or answers them. */
  addressed: boolean
}

export interface ChatPushInput {
  kind: Exclude<ChatKind, "dm">
  communityId: string
  chatId: string
  /** The group's or the channel's name. */
  chatName: string
  url: string
  senderId: string
  senderName: string
  text: string
  media: readonly PostMedia[]
  previews: boolean
  recipients: ChatPushRecipient[]
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim()
  return t.length <= max ? t : `${t.slice(0, max - 3).trimEnd()}...`
}

/** Whether this person had fewer than PUSH_BURST pushes for this chat in the last seconds; counts this one when so. */
async function underBurst(db: Db, userId: string, chatId: string): Promise<boolean> {
  const subject = `${userId}:${chatId}`
  try {
    const n = await countHits(db, CHAT_PUSH_BUCKET, subject, PUSH_BURST_SECONDS)
    if (n >= PUSH_BURST) return false
    await addHits(db, [{ bucket: CHAT_PUSH_BUCKET, subject }])
  } catch {
    /* No count to read: the push goes. */
  }
  return true
}

/** Sends what should be sent; answers how many pushes went. Never throws. */
export async function pushChatMessage(db: Db, m: ChatPushInput): Promise<number> {
  const url = safePushUrl(m.url)
  if (!url || !m.recipients.length) return 0
  try {
    const ids = m.recipients.map((r) => r.userId).filter((id) => id !== m.senderId)
    if (!ids.length) return 0
    const [prefs, levels] = await Promise.all([
      chatPrefsFor(db, m.kind, m.chatId, ids),
      db
        .from("community_members")
        .select("user_id, status, notify_level")
        .eq("community_id", m.communityId)
        .in("user_id", ids.slice(0, 500))
        .then((r: { data: { user_id: string; status: string; notify_level: NotifyLevel | null }[] | null }) => new Map((r.data ?? []).filter((x) => x.status === "active").map((x) => [x.user_id, x.notify_level]))),
    ])
    const where = m.kind === "space" ? `#${m.chatName}` : m.chatName
    const body = clip(pushPreviewText(m.previews, m.text, m.media), 180)
    let sent = 0
    for (const r of m.recipients) {
      if (!levels.has(r.userId)) continue
      const verdict = chatPushVerdict({ kind: m.kind, senderId: m.senderId, recipientId: r.userId, readAt: r.readAt, pref: prefs.get(r.userId) ?? null, addressed: r.addressed })
      if (verdict !== "push") continue
      if (!(await underBurst(db, r.userId, m.chatId))) continue
      const kind: PushKind = r.addressed ? "mention" : "dm"
      const outcome = await pushOne(db, {
        userId: r.userId,
        kind,
        group: conversationGroup(m.chatId),
        actorId: m.senderId,
        level: levels.get(r.userId) ?? null,
        content: { title: clip(`${m.senderName} in ${where}`, 60), body, url, kind, collapseKey: conversationGroup(m.chatId) },
      })
      if (outcome === "sent") sent++
    }
    return sent
  } catch (e) {
    console.error(`[communities] chat push ${m.chatId}: ${reasonOf(e)}`)
    return 0
  }
}

/** For a direct message: whether the other person should hear it now (mute, an open chat). The push itself is pushDirectMessage. */
export async function directPushWanted(db: Db, m: { conversationId: string; senderId: string; recipientId: string; recipientReadAt: string | null }): Promise<boolean> {
  try {
    const prefs = await chatPrefsFor(db, "dm", m.conversationId, [m.recipientId])
    const verdict = chatPushVerdict({ kind: "dm", senderId: m.senderId, recipientId: m.recipientId, readAt: m.recipientReadAt, pref: prefs.get(m.recipientId) ?? null, addressed: false })
    if (verdict !== "push") return false
    return await underBurst(db, m.recipientId, m.conversationId)
  } catch {
    return true
  }
}
