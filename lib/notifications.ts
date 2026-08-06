import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Writing a notification, from anywhere on the server.
 *
 * Every call site is a feature that already succeeded — a follow, a message,
 * an answered offer — so this helper must never turn that success into a
 * failure. Errors are logged and swallowed: if the notifications table does
 * not exist yet (migration not run), the feature simply ships without its
 * notification. Self-notifications are skipped here rather than at every call
 * site, because "don't tell me about my own actions" is a property of the
 * concept, not of any one route.
 *
 * Inserts go through the admin client on purpose: the table has no RLS insert
 * policy, so trusted server code is the only writer.
 */

/**
 * `like` and `trending` were added with social activity push. They are feed
 * rows only — the PUSH for them is batched hours later by
 * lib/push/activity-db.ts, and these are what the notifications tab shows when
 * the digest is tapped. A feed row per like is fine; a banner per like is not.
 *
 * The database has a CHECK constraint listing these, so adding a kind here
 * without adding it in supabase/sql/RUN_ACTIVITY_PUSH.sql produces an insert
 * that fails at runtime and is swallowed below. Both, or neither.
 */
export type NotificationKind =
  | "follow"
  | "offer_received"
  | "offer_accepted"
  | "offer_declined"
  | "message"
  | "like"
  | "trending"

export async function createNotification(
  admin: SupabaseClient,
  input: {
    userId: string
    kind: NotificationKind
    actorId: string
    listingId?: string | null
    conversationId?: string | null
  },
): Promise<void> {
  if (!input.userId || input.userId === input.actorId) return
  try {
    // One unread notification per conversation, not one per message.
    //
    // A message notification is "somebody wrote to you", and that fact does not
    // become truer the fourth time. Sending five lines in a row produced five
    // rows here, so a two-minute exchange buried the follows and the offers —
    // the things you actually needed to be told — under a transcript of a
    // conversation you were already reading. Every chat app collapses this; the
    // unread badge is what carries the count.
    //
    // Scoped to `message` and to UNREAD rows: once you have seen the old one it
    // has done its job, and the next message is news again. Reading the row you
    // would be duplicating is one indexed lookup on a partial index that already
    // exists for the badge.
    if (input.kind === "message" && input.conversationId) {
      const { data: already } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", input.userId)
        .eq("kind", "message")
        .eq("conversation_id", input.conversationId)
        .is("read_at", null)
        .limit(1)
        .maybeSingle()
      if (already) {
        // Moved to the top of the feed rather than left where it was. The row
        // is about the conversation, and the conversation just moved.
        await admin
          .from("notifications")
          .update({ created_at: new Date().toISOString(), actor_id: input.actorId })
          .eq("id", already.id)
        return
      }
    }

    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      kind: input.kind,
      actor_id: input.actorId,
      listing_id: input.listingId ?? null,
      conversation_id: input.conversationId ?? null,
    })
    if (error) console.error("[notifications] insert failed:", error.message)
  } catch (e: any) {
    console.error("[notifications] insert failed:", e?.message || e)
  }
}
