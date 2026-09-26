import "server-only"

/**
 * ===========================================================================
 *  A MAILGUN WEBHOOK DELIVERY, CHECKED, ONCE
 * ===========================================================================
 * The route (app/api/webhooks/mailgun) passes the parsed body here with its
 * signing keys and its store. In order:
 *
 *   1. No signing key configured: refused (401). Fails closed.
 *   2. The signature, an HMAC-SHA256 of timestamp + token, compared in
 *      constant time: refused (401) when it does not match.
 *   3. The timestamp within five minutes of now, either way: a captured
 *      delivery replayed later is refused (401).
 *   4. The event id (the token when there is none) recorded in
 *      mailgun_webhook_events. Seen before: answered 200 and nothing is done
 *      again, so Mailgun's retries are harmless.
 *   5. The route's own handling for campaign and list subscribers (legacy),
 *      then the engine's (tracking.ts recordProviderEvent).
 *
 * Before part 40 has run there is no table to record the id in; the event
 * is handled as before, without the dedupe, rather than dropped.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { notifyLog } from "./log"
import type { NotifyStore } from "./store"
import { recordProviderEvent, type ProviderEvent, type TrackingResult } from "./tracking"

export const WINDOW_MS = 5 * 60_000

export interface WebhookDeps {
  signingKeys: readonly string[]
  now?: () => number
  store: NotifyStore | null
  /** The campaign and subscriber handling the route has always done. */
  legacy?: (eventData: Record<string, unknown>) => Promise<void>
}

export interface WebhookAnswer {
  status: number
  body: Record<string, unknown>
  tracking?: TrackingResult | null
}

export function verifyMailgunSignature(signature: unknown, keys: readonly string[]): boolean {
  if (!signature || typeof signature !== "object") return false
  const { timestamp, token, signature: given } = signature as Record<string, unknown>
  if (timestamp == null || typeof token !== "string" || typeof given !== "string" || !token || given.length !== 64) return false
  const presented = Buffer.from(given, "utf8")
  let ok = false
  for (const key of keys) {
    if (!key) continue
    const digest = createHmac("sha256", key).update(String(timestamp) + token).digest("hex")
    if (timingSafeEqual(Buffer.from(digest, "utf8"), presented)) ok = true
  }
  return ok
}

export function freshEnough(timestamp: unknown, now: number): boolean {
  const seconds = typeof timestamp === "number" ? timestamp : typeof timestamp === "string" ? Number(timestamp) : NaN
  if (!Number.isFinite(seconds)) return false
  return Math.abs(now - seconds * 1000) <= WINDOW_MS
}

const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

export function providerEventOf(eventData: Record<string, unknown>): ProviderEvent {
  const vars = (eventData["user-variables"] ?? {}) as Record<string, unknown>
  const message = (eventData.message ?? {}) as { headers?: Record<string, unknown> }
  const status = (eventData["delivery-status"] ?? {}) as Record<string, unknown>
  const ts = typeof eventData.timestamp === "number" ? eventData.timestamp : Number(eventData.timestamp)
  return {
    event: s(eventData.event) ?? "",
    severity: s(eventData.severity),
    recipient: s(eventData.recipient)?.toLowerCase().trim() ?? null,
    deliveryId: s(vars.delivery_id),
    messageId: s(message.headers?.["message-id"]),
    at: Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
    reason: s(eventData.reason) ?? s(status.message),
  }
}

export async function handleMailgunWebhook(body: unknown, deps: WebhookDeps): Promise<WebhookAnswer> {
  const now = (deps.now ?? Date.now)()
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const signature = b.signature as Record<string, unknown> | undefined
  if (deps.signingKeys.filter(Boolean).length === 0) return { status: 401, body: { error: "Unauthorized" } }
  if (!verifyMailgunSignature(signature, deps.signingKeys)) return { status: 401, body: { error: "Invalid signature" } }
  if (!freshEnough(signature?.timestamp, now)) return { status: 401, body: { error: "Stale request" } }

  const eventData = ((b["event-data"] as Record<string, unknown> | undefined) ?? b) as Record<string, unknown>
  const ev = providerEventOf(eventData)
  const dedupeId = s(eventData.id) ?? `token:${String(signature?.token)}`

  if (deps.store) {
    const seen = await deps.store.markWebhookSeen(dedupeId, ev.event).catch(() => "unavailable" as const)
    if (seen === "seen") return { status: 200, body: { received: true, duplicate: true } }
  }

  if (deps.legacy) {
    try {
      await deps.legacy(eventData)
    } catch {
      notifyLog("warn", "webhook legacy handling failed", { event: ev.event })
    }
  }

  let tracking: TrackingResult | null = null
  if (deps.store && ev.event) {
    try {
      tracking = await recordProviderEvent(deps.store, ev)
    } catch {
      notifyLog("warn", "webhook tracking failed", { event: ev.event })
    }
  }
  return { status: 200, body: { received: true }, tracking }
}
