import "server-only"

/**
 * ===========================================================================
 *  ORDERS PAID AND STILL NOT SHIPPED, TOLD ONCE A DAY
 * ===========================================================================
 * Run by the physical cron (app/api/cron/physical). Once a day, at
 * NOTICE_HOUR_UTC, every store with a paid order that ships and has waited
 * past OVERDUE_DAYS gets one event, keyed by the store and the day, so
 * however many runs see it that hour it is one event, and the engine plans
 * one ORDERS_WAITING_TO_SHIP from it (lib/notify/workflows/physical.ts).
 * The engine reads the store again just before it sends (conditions.ts
 * orders_still_waiting), keeps a day's cooldown, and follows the person's
 * own settings (Sales, in Settings › Notifications).
 *
 * Home says the same thing all day long (components/app/home/attention-
 * list.tsx); this is for the seller who is not looking at Home.
 */
import { OVERDUE_DAYS } from "./action-reminders"

type Db = { from: (table: string) => any }

/** 14:00 UTC: morning in the Americas, afternoon in Europe, evening in Asia. */
export const NOTICE_HOUR_UTC = 14

/** The stores to tell today: one entry per store, with its owner's user id. */
export async function storesWithOrdersWaiting(db: Db, now = Date.now()): Promise<{ creatorId: string; userId: string; count: number }[]> {
  const cutoff = new Date(now - OVERDUE_DAYS * 86_400_000).toISOString()
  const { data, error } = await db
    .from("commerce_checkouts")
    .select("creator_id")
    .in("status", ["paid", "partially_refunded"])
    .is("cancelled_at", null)
    .in("fulfillment_status", ["unfulfilled", "processing", "partially_fulfilled"])
    .lt("paid_at", cutoff)
    .limit(5000)
  if (error || !data) return []
  const counts = new Map<string, number>()
  for (const r of data as { creator_id: string | null }[]) if (r.creator_id) counts.set(r.creator_id, (counts.get(r.creator_id) ?? 0) + 1)
  if (counts.size === 0) return []
  const ids = [...counts.keys()]
  const owners = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows } = await db.from("creators").select("id, user_id").in("id", ids.slice(i, i + 200))
    for (const c of (rows ?? []) as { id: string; user_id: string | null }[]) if (c.user_id) owners.set(c.id, c.user_id)
  }
  return ids.filter((id) => owners.has(id)).map((id) => ({ creatorId: id, userId: owners.get(id)!, count: counts.get(id)! }))
}

/**
 * During NOTICE_HOUR_UTC, one event per store with orders waiting. Outside
 * it, nothing is read. Never throws: a run that fails here is retried by
 * the next run in the same hour, and the day's key makes that safe.
 */
export async function noteOrdersWaiting(db: Db, now = Date.now()): Promise<{ stores: number; raised: number }> {
  if (new Date(now).getUTCHours() !== NOTICE_HOUR_UTC) return { stores: 0, raised: 0 }
  try {
    const stores = await storesWithOrdersWaiting(db, now)
    if (stores.length === 0) return { stores: 0, raised: 0 }
    const { emit } = await import("@/lib/notify/outbox")
    const day = new Date(now).toISOString().slice(0, 10)
    let raised = 0
    for (const s of stores) {
      const out = await emit(
        {
          name: "physical.orders_waiting",
          key: `physical.orders_waiting:${s.creatorId}:${day}`,
          userId: s.userId,
          creatorId: s.creatorId,
          entityType: "creator",
          entityId: s.creatorId,
          payload: { day, count: s.count },
        },
        { db: db as never },
      )
      if (out.ok) raised++
    }
    return { stores: stores.length, raised }
  } catch (e) {
    console.error("[orders-waiting]", e instanceof Error ? e.message : e)
    return { stores: 0, raised: 0 }
  }
}
