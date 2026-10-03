import "server-only"

import type { Db } from "./auth"

/**
 * The order's timeline: an append only row per thing that happened (paid,
 * stock reserved, shipped, delivered, return opened, refund, note). Keyed
 * when the thing must be told once, so a webhook retried or a button
 * pressed twice leaves one entry.
 */

export type EventActor = "creator" | "buyer" | "system" | "webhook" | "admin"

export async function addOrderEvent(
  db: Db,
  e: { checkoutId: string; creatorId: string | null; kind: string; message: string; detail?: Record<string, unknown> | null; actor?: EventActor; key?: string | null },
): Promise<void> {
  const { error } = await db.from("commerce_order_events").insert({
    checkout_id: e.checkoutId,
    creator_id: e.creatorId,
    kind: e.kind,
    message: e.message.slice(0, 500),
    detail: e.detail ?? null,
    actor: e.actor ?? "system",
    idempotency_key: e.key ?? null,
  })
  if (error && error.code !== "23505") console.error("[physical] timeline entry failed:", e.kind, error.code)
}

export interface OrderEvent {
  id: number
  kind: string
  message: string
  actor: EventActor
  createdAt: string
  detail: Record<string, unknown> | null
}

export async function orderEvents(db: Db, checkoutId: string): Promise<OrderEvent[]> {
  const { data } = await db
    .from("commerce_order_events")
    .select("id, kind, message, actor, created_at, detail")
    .eq("checkout_id", checkoutId)
    .order("created_at", { ascending: false })
    .limit(200)
  return ((data ?? []) as { id: number; kind: string; message: string | null; actor: EventActor; created_at: string; detail: Record<string, unknown> | null }[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    message: r.message ?? "",
    actor: r.actor,
    createdAt: r.created_at,
    detail: r.detail,
  }))
}
