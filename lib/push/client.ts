"use client"

import { Capacitor } from "@capacitor/core"

/**
 * Initialise push notifications for the native app.
 * Safe to call on every mount — exits immediately on web.
 *
 * Call once after the user is authenticated (e.g. inside AppLayoutWrapper).
 */
export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  // Dynamic import keeps the push plugin out of the web bundle entirely
  const { PushNotifications } = await import("@capacitor/push-notifications")

  // ── 1. Request permission ──────────────────────────────────────────────────
  const permResult = await PushNotifications.requestPermissions()
  console.log("[push] Permission result:", permResult.receive)
  if (permResult.receive !== "granted") {
    console.log("[push] Permission not granted — aborting registration")
    return
  }
  console.log("[push] Permission granted — attaching listeners before register()")

  // ── 2. Listeners (must be attached BEFORE register() so the token event
  //       is not missed on iOS) ───────────────────────────────────────────────
  console.log("[push] Attaching listeners")

  PushNotifications.addListener("registration", async ({ value: token }) => {
    const platform = Capacitor.getPlatform() as "ios" | "android"
    console.log(`[push] Token received — platform: ${platform}, token (first 20 chars): ${token.slice(0, 20)}...`)

    console.log("[push] Calling POST /api/push/register ...")
    try {
      const res = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, platform }),
      })
      const json = await res.json().catch(() => null)
      console.log(`[push] POST /api/push/register → status ${res.status}`, json)
      if (!res.ok) {
        console.error("[push] Backend returned non-OK status:", res.status, json)
      } else {
        console.log("[push] Token successfully registered with backend")
      }
    } catch (err) {
      console.error("[push] Failed to reach /api/push/register:", err)
    }
  })

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] Registration error:", err.error)
  })

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    // App is in foreground — notification is delivered silently
    console.log("[push] Received foreground notification:", notification.title)
  })

  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const { type } = (notification.data ?? {}) as { type?: string }
    console.log("[push] Notification tapped, type:", type)

    if (type === "sale") {
      window.location.href = "/app/sales"
    } else if (type === "payout_available") {
      window.location.href = "/app/payouts"
    }
  })

  // ── 3. Register with APNs / FCM (after listeners are in place) ───────────
  console.log("[push] About to call register()")
  await PushNotifications.register()
}
