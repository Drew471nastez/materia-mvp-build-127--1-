import "server-only"

import { after } from "next/server"
import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { emit } from "@/lib/notify/outbox"
import { postLedger } from "@/lib/payments/ledger"

const PAYOUT_TYPES = new Set([
  "payout.created",
  "payout.paid",
  "payout.failed",
  "payout.updated",
  "payout.canceled",
])

export function isConnectPayoutEvent(type: string): boolean {
  return PAYOUT_TYPES.has(type)
}

/**
 * A payout the wallet deliberately leaves alone (a currency no rate converts
 * to the wallet's). Not a fault: the event is answered 200 and closed. Every
 * other ledger error is thrown, so the webhook answers 500 and Stripe sends
 * the event again; postLedger is keyed `payout:<id>:<outcome>`, so the
 * replay posts once.
 */
export class PayoutLedgerSkip extends Error {
  readonly skip = true
}

export function isPayoutLedgerSkip(e: unknown): boolean {
  return e instanceof PayoutLedgerSkip || (e as { skip?: unknown } | null)?.skip === true
}

/** Connected-account payout lifecycle (Connect webhook destination). */
export async function handleConnectPayoutEvent(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  if (!isConnectPayoutEvent(event.type)) return

  const payout = event.data.object as Stripe.Payout
  const connectedAccountId = typeof event.account === "string" ? event.account : undefined
  if (!connectedAccountId) return

  /* A read that failed is not "no such creator": thrown, so Stripe sends the event again (HIGH-2 / MEDIUM-6). */
  const { data: creator, error: creatorError } = await admin.from("creators").select("id, user_id").eq("stripe_account_id", connectedAccountId).maybeSingle()
  if (creatorError) throw new Error(`payout ${payout.id}: creator not read: ${creatorError.message}`)
  if (!creator) return

  const arrivalDate = payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null
  const destination =
    typeof payout.destination === "string"
      ? payout.destination
      : (payout.destination as { last4?: string } | null)?.last4
        ? `****${(payout.destination as { last4: string }).last4}`
        : null

  {
    const { error: upsertError } = await admin.from("payouts").upsert(
      {
        creator_id: creator.id,
        stripe_payout_id: payout.id,
        amount_cents: payout.amount,
        currency: payout.currency,
        status: payout.status,
        arrival_date: arrivalDate,
        description: payout.description,
        destination,
        method: payout.method,
        failure_code: (payout as { failure_code?: string }).failure_code || null,
        failure_message: (payout as { failure_message?: string }).failure_message || null,
        stripe_created: new Date(payout.created * 1000).toISOString(),
        webhook_received_at: new Date().toISOString(),
      },
      { onConflict: "stripe_payout_id" },
    )
    /* Keyed by the payout, so a replay writes the same row. */
    if (upsertError) throw new Error(`payout ${payout.id} not recorded: ${upsertError.message}`)
  }

  const payoutCreatorId = creator.id as string
  after(async () => (await import("@/lib/notifications/events")).notePayout(payoutCreatorId))

  try {
    /* No wallet row is "nothing to move"; a read that failed is not, and is thrown (Stripe sends it again). */
    const { data: ledger, error: ledgerError } = await admin.from("seller_ledger").select("*").eq("creator_id", creator.id).maybeSingle()
    if (ledgerError) throw new Error(`payout ${payout.id}: wallet not read: ${ledgerError.message}`)
    if (ledger) {
      const { data: cashoutEvent, error: cashoutError } = await admin
        .from("ledger_events")
        .select("amount_cents")
        .eq("creator_id", creator.id)
        .eq("event_type", "cashout_initiated")
        .eq("stripe_payout_id", payout.id)
        .maybeSingle()
      if (cashoutError) throw new Error(`payout ${payout.id}: cash out not read: ${cashoutError.message}`)

      const usdAmount = cashoutEvent?.amount_cents || payout.amount
      const returned = event.type === "payout.failed" || event.type === "payout.canceled"
      const posted =
        event.type === "payout.paid" || returned
          ? await postLedger(admin, {
              creatorId: creator.id,
              key: `payout:${payout.id}:${returned ? "cashout_failed" : "cashout_completed"}`,
              op: returned ? "payout_returned" : "payout_paid",
              amountCents: usdAmount,
              event: {
                event_type: returned ? "cashout_failed" : "cashout_completed",
                amount_cents: usdAmount,
                net_seller_cents: usdAmount,
                currency: "usd",
                stripe_payout_id: payout.id,
                description: returned
                  ? `Cashout ${event.type === "payout.failed" ? "failed" : "canceled"}: $${(usdAmount / 100).toFixed(2)} returned to available`
                  : `Cashout completed: $${(usdAmount / 100).toFixed(2)} arrived at bank`,
              },
            })
          : { unavailable: true as const }

      /*
        Only before the ledger function exists (run-now part 64): a direct write, which is not keyed, so its own
        failure is logged and not retried (a replay would move the money twice).
      */
      if (posted.unavailable) {
        try {
          if (event.type === "payout.paid") {
            await admin
              .from("seller_ledger")
              .update({
                in_transit_amount: Math.max(0, ledger.in_transit_amount - usdAmount),
                lifetime_paid_out: ledger.lifetime_paid_out + usdAmount,
              })
              .eq("creator_id", creator.id)
          } else if (returned) {
            await admin
              .from("seller_ledger")
              .update({
                in_transit_amount: Math.max(0, ledger.in_transit_amount - usdAmount),
                available_amount: ledger.available_amount + usdAmount,
              })
              .eq("creator_id", creator.id)
          }
        } catch (fallbackErr) {
          console.error("[connect payout] ledger fallback write failed", fallbackErr)
        }
      }
    }
  } catch (ledgerPayoutErr) {
    if (isPayoutLedgerSkip(ledgerPayoutErr)) {
      console.warn("[connect payout] ledger left alone:", (ledgerPayoutErr as Error).message)
    } else {
      /* The wallet gates cash out: a missed payout.failed would leave the creator's money stuck in transit. Stripe sends it again. */
      console.error("[connect payout] ledger update failed; answering 500 so Stripe retries", ledgerPayoutErr)
      throw ledgerPayoutErr
    }
  }

  const payoutState =
    event.type === "payout.created" ? "scheduled" : event.type === "payout.paid" ? "sent" : event.type === "payout.failed" ? "failed" : null
  if (payoutState) {
    let first = false
    if (payoutState === "sent") {
      try {
        const { count } = await admin
          .from("payouts")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", creator.id)
          .eq("status", "paid")
          .neq("stripe_payout_id", payout.id)
        first = count === 0
      } catch {
        /* ignore */
      }
    }
    const bank = payout.destination && typeof payout.destination === "object" ? (payout.destination as { bank_name?: string; last4?: string }) : null
    await emit({
      name: `payout.${payoutState}` as "payout.scheduled" | "payout.sent" | "payout.failed",
      key: `payout:${payout.id}:${payoutState}`,
      userId: (creator.user_id as string | null) ?? null,
      creatorId: creator.id,
      entityType: "payout",
      entityId: payout.id,
      correlationId: event.id,
      payload: {
        payoutId: payout.id,
        amountCents: payout.amount,
        currency: payout.currency,
        arrivalDate,
        method: payout.method,
        bankName: bank?.bank_name || null,
        last4: bank?.last4 || null,
        failureCode: (payout as { failure_code?: string }).failure_code || null,
        failureMessage: (payout as { failure_message?: string }).failure_message || null,
        first,
      },
    })
  }
}
