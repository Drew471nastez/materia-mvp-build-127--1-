import "server-only"

/**
 * Each refund of a line on its own day (./refund-dates): the seller's ledger
 * keeps one `refund` row per refund and line (lib/stripe/refund-sync), with
 * its own time, where the order row keeps only the total and the last date.
 *
 *   withRefundHistory   puts `refund_history` on the refunded rows read
 *   refundedOrderIds    the orders with a refund dated inside the periods,
 *                       so an order whose LAST refund is outside them is
 *                       still read for the one inside (report-read
 *                       refundedEarlier)
 *
 * Read only, scoped to the creator. A database without the ledger answers
 * nothing, and every refund stays on its row's date, as before.
 */

import { refundHistoryOf, type LedgerRefund } from "./refund-dates"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any }
type Span = { start: number; end: number }

type RefundRow = { id: string; status?: string | null; amount_cents?: number | null; refund_amount_cents?: number | null; refunded_at?: string | null; currency?: string | null }

/** The row's refunded money, the rule the reports use (reports lineMoney). */
function refundedOf(row: RefundRow): number {
  if (row.status !== "refunded") return 0
  const gross = Math.max(0, row.amount_cents || 0)
  const recorded = row.refund_amount_cents
  return typeof recorded === "number" && recorded > 0 ? Math.min(recorded, gross) : gross
}

/* A database without the ledger yet (before run-now part 64's table): nothing to say, every refund stays on its row's date. */
const missingLedger = (e: unknown) => (e as { code?: string })?.code === "42P01" || /ledger_events.*does not exist|does not exist.*ledger_events/i.test((e as Error)?.message ?? "")

const CHUNK = 100
/** The most ledger rows read for one question. */
const CEILING = 20_000

export async function withRefundHistory<T extends RefundRow>(admin: Admin, creatorId: string, rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.filter((r) => refundedOf(r) > 0).map((r) => r.id))]
  if (ids.length === 0) return rows
  const byOrder = new Map<string, LedgerRefund[]>()
  try {
    let read = 0
    for (let i = 0; i < ids.length && read < CEILING; i += CHUNK) {
      const { data, error } = await admin
        .from("ledger_events")
        .select("order_id, amount_cents, currency, created_at")
        .eq("creator_id", creatorId)
        .eq("event_type", "refund")
        .in("order_id", ids.slice(i, i + CHUNK))
        .limit(5000)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      for (const r of (data ?? []) as Array<LedgerRefund & { order_id: string | null }>) {
        if (!r.order_id) continue
        read++
        const list = byOrder.get(r.order_id) ?? []
        list.push(r)
        byOrder.set(r.order_id, list)
      }
    }
  } catch (error) {
    if (!missingLedger(error)) console.warn("[analytics] refund dates from the ledger not read:", (error as Error).message)
    return rows
  }
  return rows.map((r) => {
    const ledger = byOrder.get(r.id)
    if (!ledger) return r
    const history = refundHistoryOf(r, refundedOf(r), ledger)
    return history ? { ...r, refund_history: history } : r
  })
}

/** Orders of this creator with a refund on the ledger dated inside any of the periods. */
export async function refundedOrderIds(admin: Admin, creatorId: string, spans: Span[]): Promise<string[]> {
  const out = new Set<string>()
  try {
    for (const s of spans) {
      if (!(s.end > s.start)) continue
      const { data, error } = await admin
        .from("ledger_events")
        .select("order_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "refund")
        .gte("created_at", new Date(s.start).toISOString())
        .lt("created_at", new Date(s.end).toISOString())
        .limit(5000)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      for (const r of (data ?? []) as Array<{ order_id: string | null }>) if (r.order_id) out.add(r.order_id)
    }
  } catch (error) {
    if (!missingLedger(error)) console.warn("[analytics] refunds on the ledger not read:", (error as Error).message)
  }
  return [...out]
}
