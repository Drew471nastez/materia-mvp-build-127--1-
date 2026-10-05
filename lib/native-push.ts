"use client"

/**
 * ===========================================================================
 *  ASKING THE PHONE FOR PERMISSION TO NOTIFY
 * ===========================================================================
 * The Storelib app (Capacitor) can only show a notification once iOS or
 * Android said yes. That question is asked ONCE by the system, and a "Don't
 * Allow" can only be undone in the phone's own settings, so it is asked at
 * the one moment it makes sense: the person turned push on in Settings,
 * Notifications (components/account/notification-settings.tsx), with their
 * own tap. Never on launch (lib/push/client.ts only reads the answer), and
 * never on the web: a browser has its own notifications, under Privacy.
 *
 *   readPushPermission()   what the phone says now, without asking
 *   askPushPermission()    asks (the system prompt), then registers the
 *                          device when the answer is yes
 *
 * "unsupported" is everything that is not the app: a browser, a server
 * render, an app build without the plugin. Nothing is called there.
 */

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
 * Asks the phone. Call it only from the person's own tap: iOS shows its
 * prompt once in the app's life, Android 13 and later the same. A yes
 * registers this device for pushes at once (lib/push/client.ts
 * registerDevice), so the next notification already arrives.
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

/** Where to allow notifications again after a no, in the phone's own words. */
export function phoneSettingsPath(platform: "ios" | "android" | null): string {
  if (platform === "android") return "Settings, Apps, Storelib, Notifications"
  return "Settings, Notifications, Storelib"
}
