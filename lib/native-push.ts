"use client"

/**
 * ===========================================================================
 *  ASKING THE PHONE FOR PERMISSION TO NOTIFY
 * ===========================================================================
 * The Storelib app (Capacitor) can only show a notification once iOS or
 * Android said yes. The system asks that question once per install, and a
 * "Don't Allow" can only be undone in the phone's own settings. The app asks
 * it on the first launch after every install, signed in or not
 * (components/platform/notifications-ask.tsx), and Settings, Notifications
 * asks or opens the phone's settings from a tap. Never on the web: a browser
 * has its own notifications, under Privacy.
 *
 *   readPushPermission()   what the phone says now, without asking
 *   askPushPermission()    asks (the system prompt), then registers the
 *                          device when the answer is yes
 *
 * "unsupported" is everything that is not the app: a browser, a server
 * render, an app build without the plugin. Nothing is called there.
 */

import { openAppSettings } from "@/lib/native-permissions"

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported"

type CapacitorLike = { isNativePlatform?: () => boolean; getPlatform?: () => string }

/** Whether this is the Storelib app, not a browser. */
export function inNativeApp(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor
  try {
    return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true
  } catch {
    return false
  }
}

/** "ios", "android", or null off the app: which phone settings to point to. */
export function nativePlatform(): "ios" | "android" | null {
  if (!inNativeApp()) return null
  const p = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor?.getPlatform?.()
  return p === "ios" || p === "android" ? p : null
}

/** The plugin's state words as ours. Android 13's "prompt-with-rationale" is still a question to ask. */
export function permissionFrom(receive: unknown): PushPermission {
  if (receive === "granted") return "granted"
  if (receive === "denied") return "denied"
  if (receive === "prompt" || receive === "prompt-with-rationale") return "prompt"
  return "unsupported"
}

async function plugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications")
  return PushNotifications
}

/** What the phone says now. Never shows a prompt. */
export async function readPushPermission(): Promise<PushPermission> {
  if (!inNativeApp()) return "unsupported"
  try {
    return permissionFrom((await (await plugin()).checkPermissions()).receive)
  } catch {
    return "unsupported"
  }
}

/**
 * Asks the phone. iOS shows its prompt once per install, Android 13 and
 * later the same. A yes registers this device for pushes at once when
 * someone is signed in (lib/push/client.ts registerDevice), so the next
 * notification already arrives; otherwise it registers on sign in.
 */
export async function askPushPermission(): Promise<PushPermission> {
  if (!inNativeApp()) return "unsupported"
  try {
    const answer = permissionFrom((await (await plugin()).requestPermissions()).receive)
    if (answer === "granted") {
      const { registerDevice } = await import("@/lib/push/client")
      await registerDevice().catch(() => undefined)
    }
    return answer
  } catch {
    return "unsupported"
  }
}

/**
 * Opens Storelib's page in the phone's own Settings, the only place a "Don't
 * Allow" can be undone. The one way to get there, shared with the camera and
 * the library (lib/native-permissions.ts openAppSettings).
 */
export function openPhoneSettings(): boolean {
  return openAppSettings()
}

/** Where to allow notifications again after a no, in the phone's own words. */
export function phoneSettingsPath(platform: "ios" | "android" | null): string {
  if (platform === "android") return "Settings, Apps, Storelib, Notifications"
  return "Settings, Notifications, Storelib"
}
