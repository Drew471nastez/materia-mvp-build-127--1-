import "server-only"

/**
 * ===========================================================================
 *  THE WEBHOOK IS PRIMARY. THIS IS WHAT CATCHES WHAT IT MISSED.
 * ===========================================================================
 * Everything about a seller's payments comes from Stripe through
 * account.updated and capability.updated, and the sync writes what it finds
 * on the creator (can_accept_payments, the requirement lists, the status).
 * Checkout, Home, the editor and the reminders then read that row rather
 * than calling Stripe on a buyer's Pay.
 *
 * Which is fine until a delivery is lost. Stripe retries, and a handler that
 * fails leaves the event unprocessed so the retry runs, but neither helps if
 * the endpoint was unreachable for the whole retry window, if the event was
 * sent before the endpoint existed, or if somebody changed the account in the
 * Stripe dashboard while a deploy was going out. Opening Payouts re-reads a
 * copy older than a minute, so an active seller fixes themselves. A seller
 * who does not open Payouts does not, and a stale row is not a cosmetic
 * problem: checkout could keep taking money for an account Stripe has since
 * restricted, or keep refusing one Stripe has since switched on.
 *
 * So, every hour, the oldest copies are read again from Stripe. Nothing here
 * decides anything: it calls the same sync the webhook calls, which is the
 * one place that reads Stripe and writes the row, so a reconciled account and
 * a webhook-updated account go through exactly the same code. The emails are
 * the webhook's to send, not this sweep's: a run that found nothing new
 * writes nothing and sends nothing.
 *
 *   OLDEST FIRST, A FEW AT A TIME. Each sync is a handful of Stripe calls, so
 *     the sweep takes a small batch inside a budget and leaves the rest for
 *     the next hour. With the batch below, every connected account is
 *     re-read about once a day however many there are.
 *   ONLY ACCOUNTS WORTH ASKING ABOUT. A creator with no connected account has
 *     nothing to reconcile.
 *   A FAILURE IS NOT A VERDICT. Stripe being slow or down leaves the row as
 *     it was (the sync throws rather than clearing anything), and the next
 *     hour tries again.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { syncStripeAccountFull } from "./connect"

/** How old a copy has to be before the sweep bothers: well past the webhook's own retries. */
const STALE_AFTER_MS = 6 * 3600 * 1000
/** At most this many accounts per run, so one hour's sweep stays small and predictable. */
const BATCH = 40

export interface ReconcileResult {
  /** Accounts read again from Stripe. */
  checked: number
  /** Accounts whose cached readiness changed as a result. */
  changed: number
  /** Accounts Stripe could not be asked about this time. */
  failed: number
  /** The sweep ran out of its budget with accounts still stale. */
  more: boolean
}

type Row = { id: string; can_accept_payments: boolean | null; last_stripe_sync_at: string | null }

/**
 * Re-read the connected accounts whose cached state is oldest. Safe to run
 * again and safe to run twice at once: the worst that happens is an account
 * read from Stripe twice.
 */
export async function reconcileStaleAccounts(options: { budgetMs?: number; now?: number } = {}): Promise<ReconcileResult | null> {
  const budgetMs = options.budgetMs ?? 20_000
  const now = options.now ?? Date.now()
  const deadline = now + budgetMs
  const out: ReconcileResult = { checked: 0, changed: 0, failed: 0, more: false }

  const db = createAdminClient()
  const cutoff = new Date(now - STALE_AFTER_MS).toISOString()
  const { data, error } = await db
    .from("creators")
    .select("id, can_accept_payments, last_stripe_sync_at")
    .not("stripe_account_id", "is", null)
    .or(`last_stripe_sync_at.is.null,last_stripe_sync_at.lt.${cutoff}`)
    .order("last_stripe_sync_at", { ascending: true, nullsFirst: true })
    .limit(BATCH)
  /* Before supabase/sql/run-now/84_seller_payment_state.sql there is nothing to sweep. */
  if (error) {
    if (!/column|does not exist|schema cache/i.test(error.message)) console.error("[payments reconcile] read", error.message.slice(0, 160))
    return null
  }
  const rows = (data ?? []) as Row[]

  for (const row of rows) {
    if (Date.now() > deadline) {
      out.more = true
      break
    }
    try {
      const synced = await syncStripeAccountFull(row.id, "system")
      out.checked++
      if (synced.snapshot.canAcceptPayments !== row.can_accept_payments) out.changed++
    } catch (e) {
      out.failed++
      console.error("[payments reconcile] sync", e instanceof Error ? e.message.slice(0, 120) : "unknown")
    }
  }
  return out
}
