import "server-only"

/**
 * ===========================================================================
 *  RAISING AN EVENT
 * ===========================================================================
 * emit() writes one row in notification_events, the outbox, keyed by the
 * event's key: a Stripe event id, an order id and what happened to it. The
 * same key twice is one row, so a webhook retried by Stripe, a route called
 * twice, or a database trigger and a route raising the same change all end
 * as one event and one set of notifications.
 *
 * It never throws and never makes the caller wait long: an outage of the
 * notification system must not fail a checkout or a webhook. It answers
 * { ok: false } and logs a line instead.
 *
 * With `soon` (the default) the event is processed in after() once the
 * response has gone; the cron every five minutes does it otherwise.
 *
 * Changes the database makes on its own (products, creators, domains,
 * auth.users) raise their events in triggers, in the same transaction as the
 * change (supabase/sql/run-now/40_notification_engine.sql).
 */
import { randomUUID } from "node:crypto"
import { notifyLog, reasonText } from "./log"
import { storeOf, type AdminDb, type NotifyStore } from "./store"
import { DOMAIN_EVENTS, type DomainEvent } from "./types"
/* Imported, not loaded with import(): an import() here gave every route that can emit an event its own copy of the forwarding code's chunks, and `next build` outgrew Vercel's 8 GB. */
import { forwardOutboxSoon } from "@/lib/analytics/destinations/forward-server"

/** The events a store's analytics tools hear (lib/analytics/destinations/forward-server FORWARDED). */
const FORWARDED_EVENTS = new Set(["order.created", "order.refunded", "membership.started"])

/** The current request's id, or null outside a request (a cron's after(), a script, a test). Never throws, never waits long. */
async function requestCorrelationId(): Promise<string | null> {
  try {
    const { currentRequestId } = await import("@/lib/net/log")
    return await currentRequestId()
  } catch {
    return null
  }
}

export type EmitInput = Omit<DomainEvent, "occurredAt" | "id"> & { occurredAt?: string }

/** `fresh` is true only for the call that recorded the event: the same key again answers ok without it. */
export async function emit(event: EmitInput, opts: { db?: AdminDb | NotifyStore; soon?: boolean } = {}): Promise<{ ok: boolean; eventId?: string; fresh?: boolean }> {
  try {
    if (!(DOMAIN_EVENTS as readonly string[]).includes(event.name)) {
      notifyLog("warn", "unknown event not recorded", { event: String(event.name) })
      return { ok: false }
    }
    if (!event.key || typeof event.key !== "string") {
      notifyLog("warn", "event without a key not recorded", { event: event.name })
      return { ok: false }
    }
    const db = opts.db ?? (await import("@/lib/supabase/admin")).createAdminClient()
    const store = storeOf(db)
    const result = await store.insertEvent({
      ...event,
      payload: event.payload ?? {},
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      /* The request that raised it, when there is one (lib/net/request-id.ts): its log lines and the jobs this event starts share one id. */
      correlationId: event.correlationId ?? (await requestCorrelationId()) ?? randomUUID(),
    })
    if (result.status === "unavailable") return { ok: false }
    if (result.status === "inserted") notifyLog("info", "event recorded", { event: event.name, eventId: result.id, correlationId: event.correlationId })
    /* A purchase, a refund or a sign up, once, on to the store's own analytics tools (lib/analytics/destinations, after the response). */
    if (result.status === "inserted" && event.creatorId && FORWARDED_EVENTS.has(event.name) && typeof (db as { from?: unknown }).from === "function") {
      forwardOutboxSoon(db, { name: event.name, key: event.key, creatorId: event.creatorId, payload: (event.payload ?? {}) as Record<string, unknown> })
    }
    if (opts.soon !== false) {
      const { processSoon } = await import("./worker")
      processSoon()
    }
    return { ok: true, eventId: result.id, fresh: result.status === "inserted" }
  } catch (error) {
    notifyLog("warn", "event not recorded", { event: event?.name, error: reasonText(error) })
    return { ok: false }
  }
}
