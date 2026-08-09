import type { Message } from "firebase-admin/messaging"
import { getFirebaseAdmin } from "@/lib/firebase/admin"
import { createAdminClient } from "@/lib/supabase/admin"

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
  /** iOS: filename without extension (e.g. "cash"). Android: channel sound name. Defaults to "default". */
  sound?: string
  /**
   * The app icon's number. Previously hard-coded to 1 for every push, which is
   * not a badge — it is a dot that says "something". Pass the real unread total
   * and it says how much. Omitted leaves the badge alone rather than setting it
   * to anything, which matters because a sale push must not overwrite a message
   * count with 1.
   */
  badge?: number
  /**
   * iOS `thread-id` / Android notification tag. Notifications sharing one of
   * these are stacked together by the system. Per CONVERSATION, so two people
   * writing at once produce two stacks rather than one pile.
   */
  threadId?: string
  /**
   * iOS `apns-collapse-id` / Android `collapseKey`. Where `threadId` groups,
   * this REPLACES: a second notification with the same key takes the place of
   * the first rather than joining it. That is what turns five messages in ten
   * seconds into one banner that keeps changing instead of five banners.
   *
   * APNs limits this header to 64 bytes and rejects the whole request above
   * that, so it is truncated at the point of use rather than trusted.
   */
  collapseId?: string
}

/** What actually happened, for the caller's log line. */
export interface PushResult {
  /** Devices the provider accepted. */
  sent: number
  /** Tokens the provider rejected as dead. Deleted. */
  invalid: number
  /** Everything else — a provider hiccup, a timeout. Worth retrying, not pruned. */
  failed: number
  /** Devices attempted. `sent + invalid + failed`. */
  attempted: number
}

/**
 * Send a push notification to all registered devices for a user.
 * Automatically removes invalid/expired tokens.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  // Checked before the query: with no credentials there is nothing to send to,
  // and reading every device token first only to throw them away is a round
  // trip to say so. getFirebaseAdmin has already logged which variable is
  // missing.
  const empty: PushResult = { sent: 0, invalid: 0, failed: 0, attempted: 0 }
  const firebase = getFirebaseAdmin()
  if (!firebase) return empty

  const supabase = createAdminClient()

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("id, token, platform")
    .eq("user_id", userId)

  if (error) {
    console.error("[push] Failed to fetch tokens:", error.message)
    return empty
  }

  if (!tokens || tokens.length === 0) {
    console.log(`[push] No tokens for user ${userId}`)
    return empty
  }

  const sound = payload.sound ?? "default"
  const invalidIds: string[] = []
  let sent = 0
  let failed = 0
  // APNs rejects a collapse id over 64 bytes, and rejects the REQUEST rather
  // than the header — so an over-long id is not a lost grouping, it is a lost
  // notification. Cut here, once, rather than trusting every caller.
  const collapseId = payload.collapseId ? payload.collapseId.slice(0, 64) : undefined

  await Promise.all(
    tokens.map(async ({ id, token, platform }: { id: string; token: string; platform: string }) => {
      const message: Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data ?? {},
        ...(platform === "ios"
          ? {
              apns: {
                headers: {
                  ...(collapseId ? { "apns-collapse-id": collapseId } : {}),
                  // ── WHY THE NOTIFICATIONS WERE LATE ────────────────────────
                  // Without an explicit priority, a push can be treated as
                  // deferrable and held until the device next wakes for some
                  // other reason — which is minutes, not seconds, and is
                  // exactly the "arrives late" complaint.
                  //
                  // 10 means deliver immediately. It is the correct value for
                  // anything that shows a banner; 5 is for background work that
                  // genuinely can wait, and this is never that.
                  "apns-priority": "10",
                  // Required by APNs since iOS 13 for anything that displays.
                  // FCM usually infers it; saying it removes the guess.
                  "apns-push-type": "alert",
                },
                payload: {
                  aps: {
                    sound: sound === "default" ? "default" : `${sound}.wav`,
                    // Only when the caller said so. Writing 1 unconditionally —
                    // which this did — means every sale push resets a message
                    // badge of 7 to 1, and every message push does the same to
                    // itself.
                    ...(typeof payload.badge === "number" ? { badge: payload.badge } : {}),
                    ...(payload.threadId ? { "thread-id": payload.threadId } : {}),
                  },
                },
              },
            }
          : {
              ...(collapseId ? { collapseKey: collapseId } : {}),
              android: {
                ...(collapseId ? { collapseKey: collapseId } : {}),
                // FCM's default for Android is "normal", which is explicitly a
                // BATCHED tier: the message waits for the next time the device
                // is awake, and on a phone in someone's pocket that is measured
                // in minutes. "high" wakes the device now, which is what a
                // message from another person is for.
                priority: "high",
                notification: {
                  sound: sound,
                  channelId: "default",
                  ...(payload.threadId ? { tag: payload.threadId } : {}),
                  ...(typeof payload.badge === "number" ? { notificationCount: payload.badge } : {}),
                },
              },
            }),
      }

      // Every device is sent to independently and every failure is caught
      // here, inside the map. One dead token must not stop the same person's
      // other phone from ringing — which is what a rejection escaping into the
      // Promise.all would do.
      try {
        await firebase.messaging().send(message)
        sent++
      } catch (err: any) {
        const code = err?.code ?? err?.message ?? "unknown"
        // The two codes that mean the token is gone for good — the app was
        // deleted, or the token was reissued. Anything else (a timeout, a 503)
        // is the provider having a moment and the token is still good.
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidIds.push(id)
        } else {
          failed++
        }
        // The code and the platform, never the token.
        console.error(`[push] send failed platform=${platform} code=${code}`)
      }
    })
  )

  if (invalidIds.length > 0) {
    await supabase.from("push_tokens").delete().in("id", invalidIds)
  }

  return { sent, invalid: invalidIds.length, failed, attempted: tokens.length }
}
