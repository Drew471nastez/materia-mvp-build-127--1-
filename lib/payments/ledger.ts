import "server-only"

/**
 * ===========================================================================
 *  EVERY CHANGE TO A SELLER'S BALANCE, IN ONE PLACE, ONCE
 * ===========================================================================
 * The balance on Payouts (seller_ledger) and its history (ledger_events) used
 * to be changed by reading the row, adding in JavaScript and writing it back.
 * Two sales landing together lost one of them, and Stripe delivering
 * payout.paid twice counted the payout twice.
 *
 * postLedger() hands the change to public.ledger_post (run-now part 64),
 * which locks the seller's row, writes the history row under `key` and moves
 * the balance by the same amounts, all or nothing. A key that was already
 * written changes nothing and answers `applied: false`.
 *
 * Until part 64 has run the function is missing: the answer is
 * `{ unavailable: true }` and the caller does what it did before.
 *
 *   sale                   pending += amount, after paying off a negative balance
 *   credit_available       available += amount, after paying off a negative balance (a dispute won)
 *   debit_pending_first    a refund of a sale still on hold: pending, then available, the rest negative
 *   debit_available_first  a refund of a released sale, a dispute: available, then pending, the rest negative
 *   payout_paid            in_transit -= amount, lifetime paid out += amount
 *   payout_returned        in_transit -= amount, available += amount (a payout failed or cancelled)
 *   record                 the history row alone
 */

export type LedgerOp =
  | "sale"
  | "credit_available"
  | "debit_pending_first"
  | "debit_available_first"
  | "payout_paid"
  | "payout_returned"
  | "record"

export interface LedgerEvent {
  event_type: "sale" | "refund" | "hold_release" | "cashout_initiated" | "cashout_completed" | "cashout_failed" | "dispute_created" | "dispute_closed" | "adjustment"
  amount_cents?: number
  net_seller_cents?: number
  fee_cents?: number
  currency?: string
  order_id?: string | null
  stripe_payout_id?: string | null
  stripe_refund_id?: string | null
  stripe_dispute_id?: string | null
  hold_until?: string | null
  description?: string
  metadata?: Record<string, unknown>
  add_lifetime_earnings?: number
  add_lifetime_fees?: number
  add_lifetime_refunds?: number
}

export type LedgerResult =
  | { unavailable: true }
  | { unavailable: false; applied: boolean; pending_delta?: number; available_delta?: number; in_transit_delta?: number; negative_delta?: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { rpc?: (fn: string, args: Record<string, unknown>) => any }

/** PostgREST's "no such function" and Postgres's own. */
function missingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = String(error?.code ?? "")
  return code === "PGRST202" || code === "42883" || /could not find the function/i.test(String(error?.message ?? ""))
}

export async function postLedger(
  db: Db,
  change: { creatorId: string; key: string; op: LedgerOp; amountCents: number; event: LedgerEvent },
): Promise<LedgerResult> {
  const amount = Math.max(0, Math.round(change.amountCents || 0))
  if (typeof db.rpc !== "function") return { unavailable: true }
  const { data, error } = await db.rpc("ledger_post", {
    p_creator: change.creatorId,
    p_key: change.key,
    p_op: change.op,
    p_amount: amount,
    p_event: change.event,
  })
  if (error) {
    if (missingFunction(error)) return { unavailable: true }
    throw new Error(`ledger ${change.op} ${change.key} not recorded: ${error.message}`)
  }
  /* A client that answers nothing is not the database's function (it always answers an object). */
  if (!data || typeof data !== "object") return { unavailable: true }
  const out = data as { applied?: boolean; pending_delta?: number; available_delta?: number; in_transit_delta?: number; negative_delta?: number }
  return { unavailable: false, applied: out.applied === true, pending_delta: out.pending_delta, available_delta: out.available_delta, in_transit_delta: out.in_transit_delta, negative_delta: out.negative_delta }
}

/** Every sale whose hold has ended, released in the database (ledger_release_due). null until part 64 has run. */
export async function releaseDueHolds(db: Db): Promise<Array<{ creator_id: string; released: number; to_available: number; events: number }> | null> {
  if (typeof db.rpc !== "function") return null
  const { data, error } = await db.rpc("ledger_release_due", {})
  if (error) {
    if (missingFunction(error)) return null
    throw new Error(`holds not released: ${error.message}`)
  }
  if (!Array.isArray(data)) return null
  return data as Array<{ creator_id: string; released: number; to_available: number; events: number }>
}

/* ── Stripe events handled once ──────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tables = { from: (table: string) => any }

/** Whether the webhook already finished this Stripe event. A read that fails is "no": the handlers are idempotent on their own. */
export async function stripeEventHandled(db: Tables, eventId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("stripe_webhook_events").select("processed_at").eq("event_id", eventId).maybeSingle()
    if (error) return false
    return !!data?.processed_at
  } catch {
    return false
  }
}

/** The webhook's outcome for one event: finished, or failed with what went wrong so the next delivery tries again. */
export async function noteStripeEvent(db: Tables, e: { id: string; type: string; account?: string | null; ok: boolean; error?: string | null }) {
  try {
    const { data } = await db.from("stripe_webhook_events").select("attempts").eq("event_id", e.id).maybeSingle()
    const attempts = ((data?.attempts as number | undefined) ?? 0) + 1
    await db.from("stripe_webhook_events").upsert(
      {
        event_id: e.id,
        type: e.type,
        account: e.account ?? null,
        attempts,
        processed_at: e.ok ? new Date().toISOString() : null,
        last_error: e.ok ? null : String(e.error ?? "failed").slice(0, 500),
      },
      { onConflict: "event_id" },
    )
  } catch {
    /* A record that could not be written costs a repeat delivery, which every handler survives. */
  }
}
