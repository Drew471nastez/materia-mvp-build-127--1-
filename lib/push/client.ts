"use client"

import { Capacitor } from "@capacitor/core"
import { pushTapTarget } from "./tap"

/**
 * Initialise push notifications for the native app.
 * Safe to call on every mount — exits immediately on web.
 *
 * Call once after the user is authenticated (e.g. inside AppLayoutWrapper).
 *
 * iOS token flow:
 *   1. Capacitor registers with APNs  → 'registration' event fires with raw APNs hex token
 *   2. AppDelegate hands APNs token to Firebase Messaging
 *   3. Firebase exchanges APNs token for FCM registration token
 *   4. AppDelegate (MessagingDelegate) dispatches 'fcmTokenReady' CustomEvent to the web view
 *   5. This function receives the FCM token and POSTs it to /api/push/register
 *
 * Android token flow:
 *   @capacitor/push-notifications already returns the FCM token via the 'registration' event.
 */
export async function initPushNotifications(): Promise<void> {
  // ── 0. Entry point log — confirms the function was actually called ─────────
  console.log("[push] initPushNotifications() called — platform:", Capacitor.getPlatform(), "isNative:", Capacitor.isNativePlatform())

  if (!Capacitor.isNativePlatform()) {
    console.log("[push] Not a native platform — skipping push setup")
    return
  }

  // Dynamic import keeps the push plugin out of the web bundle entirely
  const { PushNotifications } = await import("@capacitor/push-notifications")
  console.log("[push] PushNotifications plugin loaded")

  // ── 1. Request permission ──────────────────────────────────────────────────
  const permResult = await PushNotifications.requestPermissions()
  console.log("[push] Permission result:", permResult.receive)
  if (permResult.receive !== "granted") {
    console.log("[push] Permission not granted — aborting registration")
    return
  }
  console.log("[push] Permission granted — attaching listeners before register()")

  const platform = Capacitor.getPlatform() as "ios" | "android"

  // ── Helper: send a token to the backend ───────────────────────────────────
  async function registerToken(token: string): Promise<void> {
    console.log("[push] Sending FCM token to backend ...")
    try {
      const res = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, platform }),
      })
      let json: unknown = null
      try {
        json = await res.json()
      } catch (parseErr) {
        console.warn("[push] Could not parse response body as JSON:", parseErr)
      }
      console.log(`[push] POST /api/push/register → HTTP ${res.status} ${res.statusText}`, json)
      if (!res.ok) {
        console.error("[push] Backend returned non-OK status:", res.status, json)
      } else {
        console.log("[push] Token successfully registered with backend")
      }
    } catch (err) {
      console.error("[push] EXCEPTION while calling /api/push/register:", err)
      if (err instanceof Error) {
        console.error("[push]   name:", err.name)
        console.error("[push]   message:", err.message)
        console.error("[push]   stack:", err.stack)
      }
    }
  }

  // ── 2. Listeners (must be attached BEFORE register() so the token event
  //       is not missed on iOS) ───────────────────────────────────────────────
  console.log("[push] Attaching listeners now...")

  PushNotifications.addListener("registration", ({ value: token }) => {
    console.log("[push] *** registration callback FIRED *** — this confirms APNs/FCM returned a token")

    if (platform === "ios") {
      // On iOS @capacitor/push-notifications returns the raw APNs device token (hex string).
      // Firebase Admin requires an FCM registration token, so we must NOT send this to the
      // backend. The FCM token arrives separately via the 'fcmTokenReady' window event
      // dispatched by AppDelegate's MessagingDelegate callback.
      console.log(`[push] APNs token received (not sent to backend — waiting for FCM token)`)
    } else {
      // On Android @capacitor/push-notifications returns the FCM registration token directly.
      console.log(`[push] FCM token received`)
      registerToken(token)
    }
  })

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] *** registrationError callback FIRED *** — APNs/FCM rejected registration:", err.error)
  })

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    // App is in foreground — notification is delivered silently
    console.log("[push] Received foreground notification:", notification.title)
  })

  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const data = (notification.data ?? {}) as Record<string, unknown>
    console.log("[push] Notification tapped, type:", data.type)
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
    window.location.href = to
  })

  // ── 3. On iOS: listen for the FCM token dispatched from native AppDelegate ─
  if (platform === "ios") {
    window.addEventListener(
      "fcmTokenReady",
      (event) => {
        const fcmToken = (event as CustomEvent<string>).detail
        console.log(`[push] FCM token received`)
        registerToken(fcmToken)
      },
      { once: true },
    )
    console.log("[push] iOS: registered 'fcmTokenReady' window event listener for FCM token")

    // Signal native to fetch + dispatch the FCM token
    window.dispatchEvent(new CustomEvent("pushPermissionGranted"))
    console.log("[push] iOS: dispatched pushPermissionGranted to native")
  }

  // ── Log that all listeners are attached before register() is called ────────
  console.log("[push] All listeners attached — calling PushNotifications.register() now")

  // ── 4. Register with APNs / FCM (after listeners are in place) ───────────
  await PushNotifications.register()
  // Note: on iOS the 'registration' event fires asynchronously after register()
  // returns — the token will arrive via the listener above, not here.
  console.log("[push] PushNotifications.register() call returned (token will arrive via listener)")
}
