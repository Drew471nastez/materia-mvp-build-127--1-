"use client"

/**
 * ===========================================================================
 *  NOTIFICATIONS ON THIS BROWSER, FROM THE BROWSER'S SIDE
 * ===========================================================================
 * The switch in Settings, Privacy. On asks the browser's own permission,
 * registers public/storelib-push-sw.js, subscribes with the server's public
 * key (app/api/push/web) and saves the subscription; off unsubscribes and
 * forgets it. What the switch shows is read each time, not remembered: the
 * permission, a live subscription under the server's current key, and the
 * server holding it.
 *
 * "Could not turn notifications on" came from the server refusing to save
 * (lib/push/web-subscriptions has why). Around it, what could also go wrong
 * and now says what it is rather than one sentence for everything:
 *
 *   the worker     found by its script, not by `getRegistration(url)`,
 *                  which answers with whatever worker controls "/"; and
 *                  waited for by its own state with a ceiling, not by
 *                  `serviceWorker.ready`, which never settles when the
 *                  worker fails to activate
 *   the key        a subscription made under another key is dropped and
 *                  made again (InvalidStateError included)
 *   the push service  AbortError, which is what Brave gives with push
 *                  messaging off in its settings
 *   the permission  blocked in the browser's settings, or the question
 *                  closed without an answer
 *
 * Not offered in the native apps, which have their own push, nor where the
 * browser has no Push API: Safari on an iPhone says so in its own words.
 */

export type WebPushState = "unsupported" | "iphone" | "blocked" | "on" | "off"

export type WebPushProblem = "dismissed" | "blocked" | "unsupported" | "worker" | "push_service" | "network" | "signed_out" | "server"

/** A failure with the words for the person, and which kind it is. */
export class WebPushError extends Error {
  constructor(public problem: WebPushProblem, message: string) {
    super(message)
    this.name = "WebPushError"
  }
}

const WORKER = "/storelib-push-sw.js"
/** How long a new worker may take to start before the switch says so. */
const WORKER_WAIT_MS = 10_000

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

/** Safari on an iPhone or iPad: it has `navigator.standalone` and, outside a Home Screen app, no Push API. */
function iPhoneSafari(): boolean {
  return typeof navigator !== "undefined" && "standalone" in navigator && !("PushManager" in window)
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const all = await navigator.serviceWorker.getRegistrations()
    return (
      all.find((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL.endsWith(WORKER))) ?? null
    )
  } catch {
    return null
  }
}

/** Resolves once this registration has an active worker, or throws after WORKER_WAIT_MS. */
function activated(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return Promise.resolve()
  const worker = reg.installing ?? reg.waiting
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new WebPushError("worker", "The browser took too long to start notifications. Reload the page and try again.")),
      WORKER_WAIT_MS,
    )
    const done = () => {
      window.clearTimeout(timer)
      resolve()
    }
    if (!worker) {
      done()
      return
    }
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated" || reg.active) done()
      else if (worker.state === "redundant") {
        window.clearTimeout(timer)
        reject(new WebPushError("worker", "The browser stopped Storelib's notification worker. Reload the page and try again."))
      }
    })
  })
}

function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Whether a subscription was made under this public key. */
export function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!current) return false
  const have = new Uint8Array(current)
  return have.length === wanted.length && have.every((b, i) => b === wanted[i])
}

/** The browser's permission question, promise or callback (older Safari). */
function askPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    const answer = Notification.requestPermission(resolve)
    if (answer && typeof answer.then === "function") answer.then(resolve, () => resolve(Notification.permission))
  })
}

async function publicKey(endpoint?: string): Promise<{ publicKey: string; saved: boolean | null }> {
  const url = endpoint ? `/api/push/web?endpoint=${encodeURIComponent(endpoint)}` : "/api/push/web"
  const res = await fetch(url, { cache: "no-store" }).catch(() => null)
  if (!res) throw new WebPushError("network", "Could not reach Storelib. Check your connection and try again.")
  const data = (await res.json().catch(() => null)) as { publicKey?: string; saved?: boolean | null; error?: string } | null
  if (!res.ok || !data?.publicKey) {
    throw new WebPushError("server", data?.error || "Storelib could not start notifications right now. Try again in a moment.")
  }
  return { publicKey: data.publicKey, saved: typeof data.saved === "boolean" ? data.saved : null }
}

async function save(sub: PushSubscription): Promise<void> {
  const res = await fetch("/api/push/web", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  }).catch(() => null)
  if (!res) throw new WebPushError("network", "Could not reach Storelib. Check your connection and try again.")
  if (res.ok) return
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (res.status === 401) throw new WebPushError("signed_out", data?.error || "Your session ended. Sign in again to turn this on.")
  throw new WebPushError("server", data?.error || "Storelib could not save this browser. Try again in a moment.")
}

/**
 * What the switch shows, from the browser and the server. A subscription the
 * server has lost (or never got) is saved again here, quietly, when it can
 * be; otherwise the switch reads off, which is the truth.
 */
export async function readWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return iPhoneSafari() ? "iphone" : "unsupported"
  if (Notification.permission === "denied") return "blocked"
  if (Notification.permission !== "granted") return "off"
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null
  if (!sub) return "off"
  try {
    const server = await publicKey(sub.endpoint)
    if (!sameKey(sub.options?.applicationServerKey, keyBytes(server.publicKey))) return "off"
    if (server.saved === false) {
      await save(sub)
    }
    return "on"
  } catch (e) {
    /* Could not ask: the browser's own answer stands. A refused save is off. */
    return e instanceof WebPushError && e.problem === "network" ? "on" : "off"
  }
}

/** Turns it on. Resolves to what the switch should now show, or throws a WebPushError with words for the person. */
export async function enableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return iPhoneSafari() ? "iphone" : "unsupported"
  const permission = await askPermission()
  if (permission === "denied") return "blocked"
  if (permission !== "granted") {
    throw new WebPushError("dismissed", "The browser's question was closed without an answer. Turn this on again and choose Allow.")
  }

  const { publicKey: key } = await publicKey()
  const wanted = keyBytes(key)

  let reg = await registration()
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register(WORKER, { scope: "/" })
    } catch {
      throw new WebPushError("worker", "This browser would not start Storelib's notification worker. Check that it is not in a private window, then try again.")
    }
  }
  await activated(reg)

  let sub = await reg.pushManager.getSubscription().catch(() => null)
  if (sub && !sameKey(sub.options?.applicationServerKey, wanted)) {
    /* Made under another key: it cannot be pushed to with this one. */
    await sub.unsubscribe().catch(() => undefined)
    sub = null
  }
  if (!sub) {
    const subscribe = () => reg!.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted as BufferSource })
    try {
      sub = await subscribe()
    } catch (e) {
      const name = (e as { name?: string } | null)?.name
      if (name === "InvalidStateError") {
        /* An old subscription under another key the browser would not show us: drop it and ask again. */
        const stale = await reg.pushManager.getSubscription().catch(() => null)
        await stale?.unsubscribe().catch(() => undefined)
        try {
          sub = await subscribe()
        } catch {
          throw new WebPushError("push_service", "The browser kept an old notification setting. Reload the page and try again.")
        }
      } else if (name === "NotAllowedError") {
        return Notification.permission === "denied" ? "blocked" : "off"
      } else if (name === "AbortError") {
        throw new WebPushError(
          "push_service",
          "This browser's push service refused. Some browsers, Brave among them, need push messaging turned on in their own settings first.",
        )
      } else {
        throw new WebPushError("push_service", "This browser could not subscribe to notifications. Try again in a moment.")
      }
    }
  }

  await save(sub)
  return "on"
}

/** Turns it off: this browser stops receiving them, and the server forgets it. */
export async function disableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return iPhoneSafari() ? "iphone" : "unsupported"
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null
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
