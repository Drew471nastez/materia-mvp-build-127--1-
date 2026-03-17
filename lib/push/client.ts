"use client"

import { Capacitor } from "@capacitor/core"

/**
 * Initialise push notifications for the native app.
 * Safe to call on every mount — exits immediately on web.
 *
 * Call once after the user is authenticated (e.g. inside AppLayoutWrapper).
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

  // ── 2. Listeners (must be attached BEFORE register() so the token event
  //       is not missed on iOS) ───────────────────────────────────────────────
  console.log("[push] Attaching listeners now...")

  PushNotifications.addListener("registration", async ({ value: token }) => {
    // ── IMMEDIATELY log that the callback fired ──────────────────────────────
    console.log("[push] *** registration callback FIRED *** — this confirms iOS APNs returned a token")
    const platform = Capacitor.getPlatform() as "ios" | "android"
    console.log(`[push] Token received — platform: ${platform}, token (first 20 chars): ${token.slice(0, 20)}...`)

    // ── Log immediately before the network call ──────────────────────────────
    console.log("[push] About to fetch POST /api/push/register — token length:", token.length)
    try {
      const res = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, platform }),
      })
      // ── Log the full response (status + body) ────────────────────────────
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
      // ── Log the full thrown error ────────────────────────────────────────
      console.error("[push] EXCEPTION while calling /api/push/register:", err)
      if (err instanceof Error) {
        console.error("[push]   name:", err.name)
        console.error("[push]   message:", err.message)
        console.error("[push]   stack:", err.stack)
      }
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
    const { type } = (notification.data ?? {}) as { type?: string }
    console.log("[push] Notification tapped, type:", type)

    if (type === "sale") {
      window.location.href = "/app/sales"
    } else if (type === "payout_available") {
      window.location.href = "/app/payouts"
    }
  })

  // ── Log that all listeners are attached before register() is called ────────
  console.log("[push] All listeners attached — calling PushNotifications.register() now")

  // ── 3. Register with APNs / FCM (after listeners are in place) ───────────
  await PushNotifications.register()
  // Note: on iOS the 'registration' event fires asynchronously after register()
  // returns — the token will arrive via the listener above, not here.
  console.log("[push] PushNotifications.register() call returned (token will arrive via listener)")
}
