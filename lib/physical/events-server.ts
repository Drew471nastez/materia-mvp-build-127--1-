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
    /* The column holds 300 (part 78): a longer message was refused and the entry lost. */
    message: e.message.length > 300 ? `${e.message.slice(0, 299)}…` : e.message,
    detail: e.detail ?? null,
    actor: e.actor ?? "system",
    idempotency_key: e.key ?? null,
  })
  if (error && error.code !== "23505") console.error("[physical] timeline entry failed:", e.kind, error.code)
  /*
    THE SELLER IS TOLD (lib/notify/seller-commerce.ts): a buyer asked to
    return items, cancelled, a parcel ran into a problem on the way, a
    payment failed. Only for an entry written now: a retried webhook or a
    second press finds its key taken (23505) and queues nothing, and the
    job is keyed by the entry, so one thing is one email.
  */
  /* A shipment that could not be delivered: the buyer and the seller are each told (jobs-server queueDeliveryProblem). */
  if (!error && e.creatorId && e.kind === "fulfillment.failed") {
    try {
      const { queueDeliveryProblem } = await import("./jobs-server")
      await queueDeliveryProblem(db, e.checkoutId, e.creatorId, e.message)
    } catch (err) {
      console.error("[physical] delivery problem emails not queued:", err instanceof Error ? err.message : err)
    }
  }
  if (!error && e.creatorId && sellerEmailFor(e.kind, e.actor)) {
    try {
      const { queueSellerEmail } = await import("./jobs-server")
      await queueSellerEmail(db, { checkoutId: e.checkoutId, creatorId: e.creatorId, kind: e.kind, message: e.message, detail: e.detail ?? null, key: e.key ?? null })
    } catch (err) {
      console.error("[physical] seller email not queued:", e.kind, err instanceof Error ? err.message : err)
    }
  }
}

/** Order events the seller gets an email for. A cancellation is told only when the buyer did it. */
export function sellerEmailFor(kind: string, actor: EventActor | undefined): boolean {
  if (kind === "return.requested") return true
  /* A buyer's Cancel order on their order page asks the seller (./buyer-cancel.ts): told at once, so nothing is sent meanwhile. */
  if (kind === "order.cancel_requested") return actor === "buyer"
  if (kind === "order.cancelled") return actor === "buyer"
  return kind === "delivery.exception" || kind === "fulfillment.exception" || kind === "payment.failed"
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
