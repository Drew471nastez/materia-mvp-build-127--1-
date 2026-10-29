"use client"

/**
 * ===========================================================================
 *  SETTINGS, SEND A TEST NOTIFICATION, FROM THE PHONE OR BROWSER
 * ===========================================================================
 * In the app, this phone is registered first and its own state read
 * (lib/push/client.ts registerDeviceAndWait), then POST /api/push/test sends
 * to every device of the account and says what happened. The line shown is
 * the server's answer, with what this phone knows in front when it explains
 * why the phone itself was missed: never allowed, an app build without push,
 * or a token the phone could not get or the server could not save.
 */
import type { PushPermission } from "@/lib/native-push"
import type { PushDeviceState } from "./client"
import type { TestAnswer } from "./test-result"

export interface TestLine {
  ok: boolean
  /** What this phone knows, when it explains a miss. */
  phone: string | null
  /** The server's answer. */
  message: string
}

/** What this phone says about itself, or null when it has nothing to add. Pure, for tests. */
export function phoneLine(platform: "ios" | "android" | null, permission: PushPermission, device: PushDeviceState | null): string | null {
  if (!platform) return null
  if (permission === "unsupported") return "This app build cannot use notifications. Update Storelib from the App Store or Google Play."
  if (permission === "denied") return `Notifications are off for Storelib on this ${platform === "android" ? "phone" : "iPhone"}.`
  if (permission === "prompt") return `This ${platform === "android" ? "phone" : "iPhone"} has not allowed notifications yet.`
  if (device?.error) return device.error + "."
  if (device && !device.token) return "This phone has no push token yet. Close Storelib, open it again, and try once more."
  return null
}

export async function sendTestNotification(): Promise<TestLine> {
  const { inNativeApp, nativePlatform, readPushPermission } = await import("@/lib/native-push")
  let phone: string | null = null
  let headers: Record<string, string> = {}
  if (inNativeApp()) {
    const permission = await readPushPermission()
    const device = permission === "granted" ? await import("./client").then((m) => m.registerDeviceAndWait()).catch(() => null) : null
    phone = phoneLine(nativePlatform(), permission, device)
  }
  try {
    const { createClient } = await import("@/lib/supabase/client")
    const token = (await createClient().auth.getSession()).data.session?.access_token
    if (token) headers = { Authorization: `Bearer ${token}` }
  } catch {
    /* The cookie alone. */
  }
  try {
    const res = await fetch("/api/push/test", { method: "POST", credentials: "include", headers })
    const body = (await res.json().catch(() => null)) as (Partial<TestAnswer> & { error?: string }) | null
    if (!res.ok) {
      const message = res.status === 401 ? "Sign in again, then try once more." : (body?.error ?? `The server answered ${res.status}.`)
      return { ok: false, phone, message }
    }
    return { ok: body?.outcome === "sent" || body?.outcome === "partly", phone, message: body?.message ?? "No answer from the server." }
  } catch (e) {
    return { ok: false, phone, message: `Could not reach Storelib (${e instanceof Error ? e.message : "network"}).` }
  }
}
