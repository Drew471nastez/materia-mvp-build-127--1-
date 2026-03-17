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
  if (permResult.receive !== "granted") {
    console.log("[push] Permission not granted")
    return
  }

  // ── 2. Register with APNs / FCM ───────────────────────────────────────────
  await PushNotifications.register()

  // ── 3. Listeners ──────────────────────────────────────────────────────────

  PushNotifications.addListener("registration", async ({ value: token }) => {
    const platform = Capacitor.getPlatform() as "ios" | "android"
    console.log(`[push] Got ${platform} token: ${token.slice(0, 12)}...`)

    try {
      await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform }),
      })
      console.log("[push] Token registered with backend")
    } catch (err) {
      console.error("[push] Failed to register token with backend", err)
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
}
