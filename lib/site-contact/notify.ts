/**
 * ===========================================================================
 *  A MESSAGE FROM A WEBSITE, IN THE CREATOR'S BELL
 * ===========================================================================
 * The third place a contact message reaches its creator, after their inbox
 * by email and Emails, Messages in /app: a row in the notifications panel
 * (components/app/notifications-modal.tsx), which reads seller_notifications
 * for the signed in user. One row per message, the way a review gets one
 * (app/api/reviews):
 *
 *   type         "update", a value the table's check has always allowed
 *   title        "New message from Ana on maralind.storelib.com"
 *   message      what they called it, or the start of what they wrote, on
 *                one line: the creator's own visitor writing to them, shown
 *                to the creator only (the panel reads by the creator's user)
 *   action_url   the message in Emails, Messages
 *   metadata     the panel's word for it ("Messages") and the message id
 *
 * No kind: the notification engine (lib/notifications) leaves rows without
 * one alone, so it never retires this as a rule's row. The creator and the
 * user it is for are read from the creators table by the creator's id, never
 * from the request. Best effort: a failure here never stops the message.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface MessageNotice {
  creatorId: string
  messageId: string | null
  name: string
  email: string
  subject: string
  message: string
  site: string | null
}

/** One line, at most `max` characters, cut at a word where it can be. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** The row the panel shows, for one message. Pure, so the words are tested. */
export function messageNoticeRow(n: MessageNotice, userId: string): Record<string, unknown> {
  const who = oneLine(n.name || n.email, 80)
  const title = oneLine(n.site ? `New message from ${who} on ${n.site}` : `New message from ${who}`, 200)
  return {
    creator_id: n.creatorId,
    user_id: userId,
    type: "update",
    title,
    message: oneLine(n.subject || n.message, 140),
    action_url: n.messageId ? `/app/emails?tab=messages&message=${encodeURIComponent(n.messageId)}` : "/app/emails?tab=messages",
    metadata: { area: "Messages", message_id: n.messageId, site: n.site },
  }
}

export async function notifyCreatorOfMessage(db: Db, n: MessageNotice): Promise<boolean> {
  try {
    const { data } = await db.from("creators").select("user_id").eq("id", n.creatorId).maybeSingle()
    const userId = (data as { user_id?: string | null } | null)?.user_id
    if (!userId) return false
    const { error } = await db.from("seller_notifications").insert(messageNoticeRow(n, userId))
    if (error) {
      console.warn(`[contact] the notification was not written (${typeof error.code === "string" && error.code ? error.code : "error"})`)
      return false
    }
    return true
  } catch {
    console.warn("[contact] writing the notification threw")
    return false
  }
}
