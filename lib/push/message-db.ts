import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendPushToUser } from "@/lib/push/sender"
import {
  notifyNewMessage as decide,
  type MessagePushDb,
  type NewMessageInput,
  type NotifyOutcome,
} from "@/lib/push/message-notification"

/**
 * The database half of chat push, and the one place that knows about Supabase.
 *
 * message-notification.ts holds every decision and takes this as an argument,
 * which is what lets the decisions be tested without a database. This file is
 * the boring half: six queries, each of which degrades rather than throws.
 *
 * DEGRADING IS THE POINT. A deploy is live the moment it builds and the
 * migration is run by hand afterwards, so there is always a window where the
 * code is ahead of the schema. In that window every function here answers with
 * the permissive default — everyone opted in, nothing already claimed — so the
 * worst case is a duplicate notification rather than no notifications at all,
 * and the log says which column was missing.
 */

function isMissingRelation(message?: string | null): boolean {
  const m = (message ?? "").toLowerCase()
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  )
}

export function messagePushDb(): MessagePushDb {
  const admin = createAdminClient()

  return {
    async claimMessage(messageId, recipientId) {
      const { error } = await admin
        .from("message_push_log")
        .insert({ message_id: messageId, recipient_id: recipientId })

      if (!error) return true

      // 23505 — somebody already claimed it. This is the mechanism working, not
      // a failure: exactly one caller gets past here for a given message.
      if (error.code === "23505") return false

      if (isMissingRelation(error.message)) {
        // RUN_MESSAGE_PUSH.sql has not been run. Sending is the lesser evil —
        // a duplicate banner beats silence — but it is worth being loud about.
        console.error(
          "[push] message_push_log is missing — chat pushes are NOT deduplicated. Run supabase/sql/RUN_MESSAGE_PUSH.sql",
        )
        return true
      }

      console.error("[push] claim failed:", error.code ?? error.message)
      // An unknown database fault is not evidence of a duplicate. Send.
      return true
    },

    async prefsFor(userId) {
      const { data, error } = await admin
        .from("profiles")
        .select("push_messages_enabled, push_preview_enabled")
        .eq("id", userId)
        .maybeSingle()

      // Columns absent, row absent, or the read failed: the default is on, with
      // previews. Nobody is silenced by a migration that has not run.
      if (error || !data) return { enabled: true, preview: true }
      return {
        enabled: data.push_messages_enabled !== false,
        preview: data.push_preview_enabled !== false,
      }
    },

    async nameOf(userId) {
      const { data } = await admin
        .from("profiles")
        .select("display_name, username")
        .eq("id", userId)
        .maybeSingle()
      return data?.display_name?.trim() || data?.username?.trim() || null
    },

    async unreadInConversation(conversationId, recipientId) {
      const { count, error } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", recipientId)
        .is("read_at", null)
      // A count we could not take must not become "0", which would say
      // "1 message" when there are nine. 1 means "at least this one", which is
      // true by construction — we are here because a message was inserted.
      if (error) return 1
      return count ?? 1
    },

    /**
     * ── THE NUMBER ON THE APP ICON ────────────────────────────────────────
     *
     * This used to be:
     *
     *     from("messages").neq("sender_id", recipientId).is("read_at", null)
     *
     * with NO restriction to the recipient's own conversations — and through
     * the admin client, so RLS was not there to add one. It counted every
     * unread message on the platform written by anybody other than this person.
     *
     * That is why every user's icon showed the same four-figure number: it was
     * not their unread count, it was Storelib's. It also meant the badge leaked
     * total message volume across the whole site to every phone that had the
     * app installed.
     *
     * Scoped now to the conversations this person is actually in. Two queries
     * rather than a join, because the join depends on a foreign key being named
     * the way PostgREST expects, and a badge is not worth a query that breaks
     * silently when it is not.
     */
    async unreadTotal(recipientId) {
      const { data: convos, error: convoErr } = await admin
        .from("conversations")
        .select("id")
        .or(`buyer_id.eq.${recipientId},seller_id.eq.${recipientId}`)
        // A person with more open conversations than this has a badge that
        // reads "lots" either way. Bounded so the id list below cannot grow
        // into a request too long to send.
        .limit(500)

      if (convoErr || !convos?.length) return 0

      const { count, error } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convos.map((c) => c.id))
        .neq("sender_id", recipientId)
        .is("read_at", null)
      if (error) return 0
      return count ?? 0
    },

    /**
     * When the app was last in front of this person.
     *
     * `profiles.last_seen_at` is written by the presence beacon in the layout,
     * which only pings while the tab is VISIBLE — so a recent value means the
     * app is open and in front of them, not merely installed.
     *
     * Null on any failure, and null means "send". A push nobody needed is a far
     * cheaper mistake than a message nobody hears about.
     */
    async lastSeenAt(userId) {
      const { data, error } = await admin
        .from("profiles")
        .select("last_seen_at")
        .eq("id", userId)
        .maybeSingle()
      if (error || !data?.last_seen_at) return null
      const t = new Date(data.last_seen_at as string)
      return Number.isNaN(t.getTime()) ? null : t
    },

    async isMessageRead(messageId) {
      const { data, error } = await admin
        .from("messages")
        .select("read_at")
        .eq("id", messageId)
        .maybeSingle()
      // Unknown means send. Suppressing on a failed read would drop
      // notifications for a reason nobody could see.
      if (error || !data) return false
      return data.read_at !== null
    },
  }
}

/**
 * Run the whole thing for one inserted message, and log one line about it.
 *
 * The log is deliberately a single structured line rather than a running
 * commentary: this is on the `after()` path of every message in the app, and
 * five lines per message is a bill rather than an aid. Ids, counts and the
 * outcome — never a token, never the message text, never a profile field.
 */
export async function runMessagePush(input: NewMessageInput): Promise<NotifyOutcome> {
  const outcome = await decide(input, messagePushDb(), sendPushToUser)

  const base =
    `[push:message] msg=${input.messageId} convo=${input.conversationId} ` +
    `to=${input.recipientId} kind=${input.kind}`

  if (!outcome.sent) {
    console.log(`${base} result=skipped reason=${outcome.reason}`)
    return outcome
  }

  const d = outcome.delivery
  console.log(
    `${base} result=sent grouped=${(outcome.push?.data.unreadCount ?? "1") !== "1"} ` +
      `badge=${outcome.push?.badge ?? 0} devices=${d?.attempted ?? 0} ` +
      `ok=${d?.sent ?? 0} invalid=${d?.invalid ?? 0} retryable=${d?.failed ?? 0}`,
  )
  return outcome
}
