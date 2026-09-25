"use client"

/**
 * ===========================================================================
 *  NOTIFICATIONS ON THIS BROWSER, FROM THE BROWSER'S SIDE
 * ===========================================================================
 * The switch in Settings, Privacy. On asks the browser's own permission,
 * registers public/storelib-push-sw.js, subscribes with the server's public
 * key (app/api/push/web) and saves the subscription; off unsubscribes and
 * forgets it. What the switch shows is read from the browser each time, not
 * remembered: permission and a live subscription are the truth.
 *
 * Not offered in the native apps, which have their own push, nor where the
 * browser has no Push API (an iPhone's Safari outside a Home Screen app).
 */

export type WebPushState = "unsupported" | "blocked" | "on" | "off"

const WORKER = "/storelib-push-sw.js"

function isNative(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("capacitor")
}

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !isNative() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const found = await navigator.serviceWorker.getRegistration(WORKER)
  return found ?? null
}

export async function readWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "blocked"
  if (Notification.permission !== "granted") return "off"
  try {
    const reg = await registration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    return sub ? "on" : "off"
  } catch {
    return "off"
  }
}

function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Turns it on. Resolves to what the switch should now show, or throws with words for the person. */
export async function enableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return "unsupported"
  const permission = await Notification.requestPermission()
  if (permission === "denied") return "blocked"
  if (permission !== "granted") return "off"

  const keyRes = await fetch("/api/push/web", { cache: "no-store" }).catch(() => null)
  const keyData = keyRes && keyRes.ok ? ((await keyRes.json().catch(() => null)) as { publicKey?: string } | null) : null
  if (!keyData?.publicKey) throw new Error("Notifications could not be turned on right now. Try again in a moment.")

  const reg = (await registration()) ?? (await navigator.serviceWorker.register(WORKER, { scope: "/" }))
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (sub) {
    /* A subscription made under another key cannot be pushed to with this one. */
    const current = sub.options?.applicationServerKey
    const wanted = keyBytes(keyData.publicKey)
    const same = current && new Uint8Array(current).every((b, i) => b === wanted[i]) && new Uint8Array(current).length === wanted.length
    if (!same) {
      await sub.unsubscribe().catch(() => undefined)
      sub = null
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(keyData.publicKey) as BufferSource })

  const res = await fetch("/api/push/web", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  }).catch(() => null)
  if (!res || !res.ok) {
    const data = res ? await res.json().catch(() => null) : null
    throw new Error((data && typeof data.error === "string" && data.error) || "Could not reach Storelib. Check your connection and try again.")
  }
  return "on"
}

/** Turns it off: this browser stops receiving them, and the server forgets it. */
export async function disableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return "unsupported"
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => undefined)
    await fetch("/api/push/web", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined)
  }
  return Notification.permission === "denied" ? "blocked" : "off"
}
