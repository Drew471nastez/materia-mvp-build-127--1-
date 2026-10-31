import type { Message } from "firebase-admin/messaging"
import { getFirebaseAdmin } from "@/lib/firebase/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import webpush from "web-push"
import { vapidKeys } from "./web-vapid"
import { endpointOf, forgetOnAccount, readKept, tokenOf } from "./web-subscriptions"
import { bodyOn, devicesFor, titleOn, type TokenRow } from "./recipients"
import { businessGroup, listBusinesses } from "@/lib/businesses/server"
import { inboxTapTarget } from "./tap"
import { groupIds } from "@/lib/businesses/rules"

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
  /** iOS: filename without extension (e.g. "cash"). Android: channel sound name. Defaults to "default". */
  sound?: string
  /**
   * Pushes with the same key replace each other on the device instead of
   * stacking: the newest message of one conversation, the newest summary of
   * one community (lib/notifications/push-bridge.ts). At most 64 bytes.
   */
  collapseKey?: string
}

/** Where a click on a browser notification goes, from what it is about. */
function pageFor(data: Record<string, string> | undefined): string {
  if (data?.type === "sale" && data.orderId) return `/app/orders?order=${encodeURIComponent(data.orderId)}`
  if (data?.type === "payout_available") return "/app/payouts"
  /* A notification from lib/notifications: its own page, always inside /app. */
  if (data?.type === "notification" && typeof data.url === "string" && /^\/app(?:[/?#]|$)/.test(data.url) && !data.url.includes("//")) return data.url
  /* A community or inbox notification (lib/notifications/push-bridge.ts): its own page, any path on storelib.com. */
  const inbox = data?.type === "inbox" ? inboxTapTarget(data.url) : null
  if (inbox) return inbox
  return "/app"
}

/**
 * How long a browser's push service may take to answer one send. Without it
 * a push service that accepted the connection and never answered held the
 * send (and the notify worker's batch, and Settings' test notification)
 * until the function's own limit. web-push ends the request at this and the
 * send counts as failed.
 */
export const WEB_PUSH_TIMEOUT_MS = 8_000

/** The options every Web Push send is made with. */
export function webPushOptions(keys: NonNullable<ReturnType<typeof vapidKeys>>, timeoutMs = WEB_PUSH_TIMEOUT_MS): webpush.RequestOptions {
  return { vapidDetails: keys, TTL: 60 * 60 * 24, timeout: timeoutMs }
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
      JSON.stringify({ title: payload.title, body: payload.body, url: pageFor(payload.data), tag: payload.collapseKey ?? (payload.data?.type === "inbox" ? payload.data.url : undefined) ?? payload.data?.orderId ?? payload.data?.kind ?? payload.data?.type }),
      webPushOptions(keys),
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
 * What one send did, device by device, so a caller that has someone waiting
 * (Settings, Send a test notification: app/api/push/test) can say exactly
 * what happened. Every other caller ignores it.
 *
 *   devices        phones and browsers it tried: registered rows plus the
 *                  browsers kept on the account
 *   sent           how many the provider accepted (FCM for phones, the
 *                  browser's push service for browsers)
 *   failures       one per device the provider refused, in its own words
 *   removed        tokens the provider said are gone, deleted from push_tokens
 *   phonesSkipped  phones not tried because FIREBASE_* is not set on the server
 *   error          the tokens could not be read at all
 */
export interface PushResult {
  devices: number
  sent: number
  failures: { platform: string; error: string }[]
  removed: number
  phonesSkipped: number
  error?: string
}

/** FCM's words for a token that will never take a message again: the row goes. */
export const GONE_TOKEN_CODES: ReadonlySet<string> = new Set(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"])

/**
 * Send a push notification to all registered devices for a user.
 * Automatically removes invalid/expired tokens.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { devices: 0, sent: 0, failures: [], removed: 0, phonesSkipped: 0 }
  const supabase = createAdminClient()

  /*
    Every device of the login, not only this account's (./recipients): a
    phone that has another business of the same login open still gets this
    business's sale, its title saying which business it is. An account on
    its own, or a group that cannot be read, is this account alone.
  */
  const accounts = await businessGroup(userId).then((g) => groupIds(g, userId)).catch(() => [userId])
  const { data: rows, error } = await supabase
    .from("push_tokens")
    .select("id, token, platform, user_id")
    .in("user_id", accounts)

  if (error) {
    console.error("[push] Failed to fetch tokens:", error.message)
    result.error = `push_tokens could not be read: ${error.message}`
    return result
  }
  const tokens = devicesFor((rows ?? []) as TokenRow[], userId)
  const businessName = tokens.some((t) => t.user_id !== userId)
    ? await listBusinesses(userId).then((all) => all.find((b) => b.current)?.name ?? null).catch(() => null)
    : null

  /* Browsers kept on the account while push_tokens could not take them
     (lib/push/web-subscriptions), each once. */
  const inTable = new Set((tokens ?? []).filter((t: { platform: string }) => t.platform === "web").map((t: { token: string }) => endpointOf(t.token)))
  const kept = (await readKept(supabase, userId)).filter((s) => !inTable.has(s.endpoint))
  const goneKept: string[] = []
  result.devices += kept.length
  await Promise.all(
    kept.map(async (s) => {
      const r = await sendToBrowser(tokenOf(s), payload)
      if (r === "gone") goneKept.push(s.endpoint)
      if (r === "sent") result.sent++
      else result.failures.push({ platform: "web", error: r === "gone" ? "the browser dropped this subscription" : "the browser's push service refused it" })
    }),
  )
  if (goneKept.length > 0) await forgetOnAccount(supabase, userId, goneKept).catch(() => undefined)
  result.removed += goneKept.length

  if (!tokens || tokens.length === 0) {
    if (kept.length === 0) console.log(`[push] No devices or browsers to send to (user ${userId.slice(0, 8)})`)
    return result
  }
  result.devices += tokens.length

  const sound = payload.sound ?? "default"
  const invalidIds: string[] = []

  /*
    THE APP, BEFORE ITS FIRST MESSAGE. "[push] Failed to send to ios device
    — app/no-app" was every phone, every time: lib/firebase/admin became
    initialised on first use (getFirebaseAdmin) and this file kept calling
    admin.messaging() on the default app, which nothing had created. Asked
    for here; without the three FIREBASE_* variables it is null, and phones
    are skipped after the one line getFirebaseAdmin writes.
  */
  const firebase = tokens.some((t) => t.platform !== "web") ? getFirebaseAdmin() : null

  await Promise.all(
    tokens.map(async (device) => {
      const { id, token, platform } = device
      /* On a device that is on another business of the login, the title says which business this is; a setup notification says it under the title. */
      const title = titleOn(device, userId, payload.title, businessName, payload.data)
      const body = bodyOn(device, userId, payload.body, businessName, payload.data)
      if (platform === "web") {
        const r = await sendToBrowser(token, { ...payload, title, body })
        if (r === "gone") invalidIds.push(id)
        if (r === "sent") result.sent++
        else result.failures.push({ platform, error: r === "gone" ? "the browser dropped this subscription" : "the browser's push service refused it" })
        return
      }
      /* Said on every send, not only once per instance: a sale that reached no phone because of this is worth a line each time. */
      if (!firebase) {
        result.phonesSkipped++
        console.error(`[push] ✗ ${platform} device skipped: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY is missing or refused`)
        return
      }
      const collapse = payload.collapseKey ? payload.collapseKey.slice(0, 64) : undefined
      const message: Message = {
        token,
        notification: {
          title,
          body,
        },
        data: payload.data ?? {},
        ...(platform === "ios"
          ? {
              apns: {
                ...(collapse ? { headers: { "apns-collapse-id": collapse } } : {}),
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
                ...(collapse ? { collapseKey: collapse } : {}),
                notification: {
                  sound: sound,
                  channelId: "default",
                  ...(collapse ? { tag: collapse } : {}),
                },
              },
            }),
      }

      try {
        await firebase.messaging().send(message)
        result.sent++
        console.log(`[push] ✓ Sent to ${platform} device`)
      } catch (err: any) {
        const code = typeof err?.code === "string" ? err.code : ""
        const words = [code, typeof err?.message === "string" ? err.message : ""].filter(Boolean).join(": ").slice(0, 300) || "unknown error"
        console.error(`[push] ✗ Failed to send to ${platform} device — ${words}`)
        result.failures.push({ platform, error: words })
        if (GONE_TOKEN_CODES.has(code)) invalidIds.push(id)
      }
    })
  )

  if (invalidIds.length > 0) {
    await supabase.from("push_tokens").delete().in("id", invalidIds)
    result.removed += invalidIds.length
    console.log(`[push] Removed ${invalidIds.length} invalid token(s)`)
  }
  return result
}
