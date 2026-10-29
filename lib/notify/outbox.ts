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

/** The events a store's analytics tools hear (lib/analytics/destinations/forward-server FORWARDED). */
const FORWARDED_EVENTS = new Set(["order.created", "order.refunded", "membership.started"])

export type EmitInput =Omit<DomainEvent, "occurredAt" | "id"> & { occurredAt?: string }

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
      correlationId: event.correlationId ?? randomUUID(),
    })
    if (result.status === "unavailable") return { ok: false }
    if (result.status === "inserted") notifyLog("info", "event recorded", { event: event.name, eventId: result.id, correlationId: event.correlationId })
    /* A purchase, a refund or a sign up, once, on to the store's own analytics tools (lib/analytics/destinations, after the response). */
    if (result.status === "inserted" && event.creatorId && FORWARDED_EVENTS.has(event.name) && typeof (db as { from?: unknown }).from === "function") {
      const { forwardOutboxSoon } = await import("@/lib/analytics/destinations/forward-server")
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
