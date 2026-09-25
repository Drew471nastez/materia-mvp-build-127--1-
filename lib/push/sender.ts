import type { Message } from "firebase-admin/messaging"
import admin from "@/lib/firebase/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import webpush from "web-push"
import { vapidKeys } from "./web-vapid"

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
  /** iOS: filename without extension (e.g. "cash"). Android: channel sound name. Defaults to "default". */
  sound?: string
}

/** Where a click on a browser notification goes, from what it is about. */
function pageFor(data: Record<string, string> | undefined): string {
  if (data?.type === "sale" && data.orderId) return `/app/orders?order=${encodeURIComponent(data.orderId)}`
  if (data?.type === "payout_available") return "/app/payouts"
  return "/app"
}

/**
 * A browser (platform "web", the token is its subscription's JSON), through
 * Web Push signed with lib/push/web-vapid. "gone" when the browser has
 * dropped the subscription, so the row can go.
 */
async function sendToBrowser(token: string, payload: PushPayload): Promise<"sent" | "gone" | "failed"> {
  const keys = vapidKeys()
  if (!keys) return "failed"
  let subscription: webpush.PushSubscription
  try {
    subscription = JSON.parse(token)
  } catch {
    return "gone"
  }
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: payload.title, body: payload.body, url: pageFor(payload.data), tag: payload.data?.orderId ?? payload.data?.type }),
      { vapidDetails: keys, TTL: 60 * 60 * 24 },
    )
    return "sent"
  } catch (err: any) {
    const status = Number(err?.statusCode)
    if (status === 404 || status === 410) return "gone"
    console.error(`[push] ✗ Failed to send to a browser — ${status || err?.message}`)
    return "failed"
  }
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

  const sound = payload.sound ?? "default"
  const invalidIds: string[] = []

  await Promise.all(
    tokens.map(async ({ id, token, platform }: { id: string; token: string; platform: string }) => {
      if (platform === "web") {
        const result = await sendToBrowser(token, payload)
        if (result === "gone") invalidIds.push(id)
        return
      }
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
        await admin.messaging().send(message)
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
