import type { Message } from "firebase-admin/messaging"
import admin from "@/lib/firebase/admin"
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

  const sound = payload.sound ?? "cash"
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
                    sound: `${sound}.wav`,
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
        await admin.messaging().send(message)
        console.log(`[push] ✓ Sent to ${platform} ${token.slice(0, 12)}...`)
      } catch (err: any) {
        console.error(`[push] ✗ Failed ${token.slice(0, 12)}... — ${err.code ?? err.message}`)
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
