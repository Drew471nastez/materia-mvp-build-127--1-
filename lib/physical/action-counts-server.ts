import "server-only"

/**
 * The counts behind Home's "needs attention" lines (./action-reminders.ts),
 * read from the rows that prove them, all at once: a paid checkout still to
 * send, a pickup not ready, a return nobody answered, a parcel the carrier
 * could not deliver, a dispute still open, stock at its low line. Counts
 * only (`head: true`), plus one id where a single order can be opened
 * directly. Scoped to the one store by creator id, read with the service
 * role the caller came with. Every read fails soft to zero: Home is never
 * held up or broken by one of them.
 */
import { inventoryRows } from "./inventory-server"
import { loadSettings } from "./config-server"
import { NO_ACTIONS, OVERDUE_DAYS, type CommerceActionCounts } from "./action-reminders"

type Db = { from: (table: string) => any }

const OPEN_FULFILLMENT = ["unfulfilled", "processing", "partially_fulfilled"]
const PAID = ["paid", "partially_refunded"]

interface CountRead {
  count: number
  firstId: string | null
}

async function counted(read: () => PromiseLike<{ count: number | null; data?: unknown; error?: unknown }>): Promise<CountRead> {
  try {
    const { count, data, error } = await read()
    if (error) return { count: 0, firstId: null }
    const first = Array.isArray(data) ? (data[0] as { id?: string; checkout_id?: string } | undefined) : undefined
    return { count: count ?? 0, firstId: first?.checkout_id ?? first?.id ?? null }
  } catch {
    return { count: 0, firstId: null }
  }
}

export async function commerceActionCounts(db: Db, creatorId: string, now = Date.now()): Promise<CommerceActionCounts> {
  if (!creatorId) return NO_ACTIONS
  const cutoff = new Date(now - OVERDUE_DAYS * 86_400_000).toISOString()
  /* A checkout still to send: paid, not cancelled, something left to ship. */
  const open = () =>
    db
      .from("commerce_checkouts")
      .select("id", { count: "exact" })
      .eq("creator_id", creatorId)
      .in("status", PAID)
      .is("cancelled_at", null)
      .in("fulfillment_status", OPEN_FULFILLMENT)
      .order("paid_at", { ascending: true })
      .limit(1)

  const [overdue, toFulfill, pickup, returns, delivery, disputes, stock] = await Promise.all([
    /* delivery_method is NOT NULL, default 'ship' (part 160), so `neq` leaves nothing out. */
    counted(() => open().neq("delivery_method", "pickup").lt("paid_at", cutoff)),
    counted(() => open().neq("delivery_method", "pickup").gte("paid_at", cutoff)),
    counted(() => open().eq("delivery_method", "pickup")),
    counted(() => db.from("commerce_returns").select("checkout_id", { count: "exact" }).eq("creator_id", creatorId).eq("status", "requested").order("created_at", { ascending: true }).limit(1)),
    counted(() => db.from("fulfillments").select("checkout_id", { count: "exact" }).eq("creator_id", creatorId).eq("status", "failed").order("created_at", { ascending: true }).limit(1)),
    counted(() => db.from("payment_disputes").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).is("closed_at", null)),
    stockCounts(db, creatorId),
  ])

  /* A line whose count is one opens that order: its first line's id, which Orders' ?order= reads. */
  const single = { overdue, toFulfill, pickupToPrepare: pickup, returnsToReview: returns, deliveryProblems: delivery }
  const checkouts = Object.values(single).filter((r) => r.count === 1 && r.firstId).map((r) => r.firstId as string)
  const lineOf = new Map<string, string>()
  if (checkouts.length) {
    try {
      const { data } = await db.from("orders").select("id, checkout_id").eq("creator_id", creatorId).in("checkout_id", [...new Set(checkouts)]).order("created_at", { ascending: true })
      for (const r of (data ?? []) as { id: string; checkout_id: string }[]) if (!lineOf.has(r.checkout_id)) lineOf.set(r.checkout_id, r.id)
    } catch {
      /* The line still opens the list. */
    }
  }
  const only: NonNullable<CommerceActionCounts["only"]> = {}
  for (const [k, r] of Object.entries(single) as [keyof typeof single, CountRead][]) {
    const id = r.count === 1 && r.firstId ? lineOf.get(r.firstId) : undefined
    if (id) only[k] = id
  }

  return {
    overdue: overdue.count,
    toFulfill: toFulfill.count,
    pickupToPrepare: pickup.count,
    returnsToReview: returns.count,
    deliveryProblems: delivery.count,
    openDisputes: disputes.count,
    lowStock: stock.low,
    outOfStock: stock.out,
    only,
  }
}

/** Tracked items at or under their low stock line, and with none left. Untracked items are never low. */
async function stockCounts(db: Db, creatorId: string): Promise<{ low: number; out: number }> {
  try {
    const settings = await loadSettings(db as never, creatorId)
    const rows = await inventoryRows(db as never, creatorId, settings.lowStockDefault)
    let low = 0
    let out = 0
    for (const r of rows) {
      if (!r.trackInventory) continue
      if (r.available <= 0) out++
      else if (r.available <= r.lowStockThreshold) low++
    }
    return { low, out }
  } catch {
    return { low: 0, out: 0 }
  }
}
