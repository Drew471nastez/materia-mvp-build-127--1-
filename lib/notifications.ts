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

export type NotificationKind = "follow" | "offer_received" | "offer_accepted" | "offer_declined" | "message"

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
