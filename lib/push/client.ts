"use client"

import { navigateInApp } from "@/lib/native-bridge"
import { appRouter } from "@/lib/navigation/app-router-handle"
import { Capacitor } from "@capacitor/core"
import { pushTapTarget } from "./tap"

/**
 * Initialise push notifications for the native app.
 * Safe to call on every mount: exits immediately on web.
 *
 * Call once after the user is authenticated (e.g. inside AppLayoutWrapper).
 *
 * Only reads. The iOS and Android prompt is asked on the first launch after
 * an install (components/platform/notifications-ask.tsx) and from Settings,
 * Notifications. Here the permission is only read: if it was already given,
 * the device is registered (a new token after a reinstall reaches us).
 *
 * iOS token flow:
 *   1. Capacitor registers with APNs  → 'registration' event fires with raw APNs hex token
 *   2. AppDelegate hands APNs token to Firebase Messaging
 *   3. Firebase exchanges APNs token for FCM registration token
 *   4. AppDelegate keeps it, and gives it to the page (window.__storelibFcmToken,
 *      the 'fcmTokenReady' event, and on the page's own ask)
 *   5. registerDevice sends it to /api/push/register for whoever is signed in
 *
 * Android token flow:
 *   @capacitor/push-notifications already returns the FCM token via the 'registration' event.
 */
export async function initPushNotifications(): Promise<void> {
  // ── 0. Entry point log: confirms the function was actually called ─────────
  console.log("[push] initPushNotifications() called: platform:", Capacitor.getPlatform(), "isNative:", Capacitor.isNativePlatform())

  if (!Capacitor.isNativePlatform()) {
    console.log("[push] Not a native platform: skipping push setup")
    return
  }

  // Dynamic import keeps the push plugin out of the web bundle entirely
  const { PushNotifications } = await import("@capacitor/push-notifications")
  console.log("[push] PushNotifications plugin loaded")

  // ── 1. Read the permission; asking is Settings' job (lib/native-push.ts) ─
  const permResult = await PushNotifications.checkPermissions()
  console.log("[push] Permission state:", permResult.receive)
  if (permResult.receive !== "granted") {
    console.log("[push] Not granted yet; waiting for the person to turn push on in Settings")
    return
  }
  await registerDevice()
}

/* Listeners and register(), once per app launch. */
let listening = false
/* The newest token this phone has, and who it was last sent for, so a second sign in on the same launch gets it too and nothing is sent twice. */
let knownToken: string | null = null
let sentAs: string | null = null

async function sessionUser(): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client")
    const { data } = await createClient().auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

/** Sends the phone's token for whoever is signed in now. Never twice for the same person and token. */
async function sendToken(token: string, platform: "ios" | "android"): Promise<void> {
  knownToken = token
  const user = await sessionUser()
  if (!user) return
  const key = `${user}:${token}`
  if (sentAs === key) return
  sentAs = key
  try {
    const res = await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, platform }),
    })
    if (!res.ok) {
      /* Asked again on the next launch, sign in or token. */
      sentAs = null
      console.error("[push] /api/push/register answered", res.status)
    }
  } catch (err) {
    sentAs = null
    console.error("[push] could not reach /api/push/register:", err instanceof Error ? err.message : err)
  }
}

/**
 * Registers this phone for whoever is signed in: after a permission that was
 * already given (above), right after the person allowed it, and again on
 * every sign in (components/native-push-init.tsx), so the token always
 * belongs to the account using the phone.
 *
 * iOS: the FCM token comes from AppDelegate, which keeps it. It is read from
 * window.__storelibFcmToken, asked for (window.webkit.messageHandlers.
 * storelibPush), and heard as the fcmTokenReady event, because Firebase
 * hands it over at launch, before the page is there to listen. Android: the
 * plugin's registration event carries the FCM token.
 */
export async function registerDevice(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  /* A yes before signing in has nobody to belong to yet; NativePushInit registers on sign in. */
  if (!(await sessionUser())) return
  const platform = Capacitor.getPlatform() as "ios" | "android"
  if (knownToken) void sendToken(knownToken, platform)
  if (listening) {
    if (platform === "ios") askNativeForToken()
    return
  }
  listening = true
  const { PushNotifications } = await import("@capacitor/push-notifications")

  PushNotifications.addListener("registration", ({ value: token }) => {
    /* On iOS this is the raw APNs token, which Firebase cannot send to; the FCM token arrives as fcmTokenReady. */
    if (platform === "android") void sendToken(token, platform)
  })

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] registration was refused:", err.error)
  })

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    // App is in foreground: notification is delivered silently
    console.log("[push] Received foreground notification:", notification.title)
  })

  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const data = (notification.data ?? {}) as Record<string, unknown>
    /*
      lib/push/tap.ts: a sale, a payout, a page inside /app, or a community or
      inbox notification's own page anywhere on storelib.com (a post, an
      event, a conversation). Opened in this WebView, never another host.
      On a cold start this can fire while /native-start is still deciding
      where to go; the mark tells it a tap already chose, so it does not send
      the person somewhere else a moment later.
    */
    const to = pushTapTarget(data)
    if (!to) return
    ;(window as unknown as { __storelibPushTap?: string }).__storelibPushTap = to
    /* With the app open, through the router like a link (no white page load); on a cold start, before the router is up, as a page load. */
    if (!navigateInApp(to, appRouter())) window.location.href = to
  })

  if (platform === "ios") {
    /* Every token, not only the first: Firebase can hand over a fresh one at any time. */
    window.addEventListener("fcmTokenReady", (event) => {
      const fcmToken = (event as CustomEvent<string>).detail
      if (typeof fcmToken === "string" && fcmToken) void sendToken(fcmToken, platform)
    })
    const kept = (window as unknown as { __storelibFcmToken?: unknown }).__storelibFcmToken
    if (typeof kept === "string" && kept) void sendToken(kept, platform)
    askNativeForToken()
  }

  /*
    THE ANDROID CHANNEL EVERY PUSH NAMES. lib/push/sender sends to the channel
    "default", and nothing made it, so Android 8 and up put every push in
    Firebase's fallback channel: shown in the tray with no banner, the first
    sale of the day easy to miss. Made here at importance 4 (a banner and a
    sound), from the web layer so it ships with a deploy, not a store release.
    Making a channel that exists changes nothing, and Android keeps whatever
    the person set for it.
  */
  if (platform === "android") {
    await PushNotifications.createChannel({ id: "default", name: "Notifications", importance: 4, visibility: 0, vibration: true }).catch((err) => {
      console.error("[push] channel not made:", err instanceof Error ? err.message : err)
    })
  }

  /* Listeners first, so the token event is never missed. */
  await PushNotifications.register()
}

/** Asks the app for the FCM token it keeps (AppDelegate StorelibPush); an older app build without it is simply not asked. */
function askNativeForToken(): void {
  try {
    const handler = (window as unknown as { webkit?: { messageHandlers?: { storelibPush?: { postMessage: (m: unknown) => void } } } }).webkit?.messageHandlers?.storelibPush
    handler?.postMessage({ action: "token" })
  } catch {
    /* not this app build */
  }
}
