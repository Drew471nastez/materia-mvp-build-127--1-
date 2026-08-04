import type { Message } from "firebase-admin/messaging"
import { getFirebaseAdmin } from "@/lib/firebase/admin"
import { createAdminClient } from "@/lib/supabase/admin"

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
  /** iOS: filename without extension (e.g. "cash"). Android: channel sound name. Defaults to "default". */
  sound?: string
}

/**
 * Send a push notification to all registered devices for a user.
 * Automatically removes invalid/expired tokens.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  // Checked before the query: with no credentials there is nothing to send to,
  // and reading every device token first only to throw them away is a round
  // trip to say so. getFirebaseAdmin has already logged which variable is
  // missing.
  const firebase = getFirebaseAdmin()
  if (!firebase) return

  const supabase = createAdminClient()

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("id, token, platform")
    .eq("user_id", userId)

  if (error) {
    console.error("[push] Failed to fetch tokens:", error.message)
    return
  }

  if (!tokens || tokens.length === 0) {
    console.log(`[push] No tokens for user ${userId}`)
    return
  }

  const sound = payload.sound ?? "default"
  const invalidIds: string[] = []

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
                payload: {
                  aps: {
                    sound: sound === "default" ? "default" : `${sound}.wav`,
                    badge: 1,
                  },
                },
              },
            }
          : {
              android: {
                notification: {
                  sound: sound,
                  channelId: "default",
                },
              },
            }),
      }

      try {
        await firebase.messaging().send(message)
        console.log(`[push] ✓ Sent to ${platform} device`)
      } catch (err: any) {
        console.error(`[push] ✗ Failed to send to ${platform} device — ${err.code ?? err.message}`)
        if (
          err.code === "messaging/invalid-registration-token" ||
          err.code === "messaging/registration-token-not-registered"
        ) {
          invalidIds.push(id)
        }
      }
    })
  )

  if (invalidIds.length > 0) {
    await supabase.from("push_tokens").delete().in("id", invalidIds)
    console.log(`[push] Removed ${invalidIds.length} invalid token(s)`)
  }
}
