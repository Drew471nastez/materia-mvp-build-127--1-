import "server-only"

/**
 * ===========================================================================
 *  WHAT AN AIRWALLEX EVENT CHANGES IN STORELIB
 * ===========================================================================
 * The webhook route (app/api/payments/airwallex/webhook) verifies the
 * signature and hands the event here, once per event id
 * (payment_webhook_events). Nothing is taken from the event's payload but
 * the ids: each handler asks Airwallex for the resource as it is NOW and
 * acts on that. Events arrive late, twice and out of order; a fresh read is
 * right whichever one it was.
 *
 *   account.*, rfi.*          the account re-read; a change of lifecycle is
 *                             logged and announced to the creator
 *   payment_intent.succeeded  the order is made (the same once-only path the
 *                             buyer's return takes)
 *   payment_dispute.*         the order is marked disputed, or given back
 *                             its status when the dispute is won or reversed
 *   refund.*                  the fee record notes a refund that settled or
 *                             failed
 *   payout.transfer.*         the payout's row follows its status
 *   funds_split.failed        logged: the creator's share did not arrive
 *
 * Answers "done" or "ignored". Throws when Airwallex or the database could
 * not be reached, so the route answers 500 and Airwallex delivers again.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { emit } from "@/lib/notify/outbox"
import { fulfilAirwallexIntent } from "@/lib/checkout/fulfil-payment"
import { markPaymentDisputed, restorePaymentAfterWonDispute } from "@/lib/stripe/dispute-orders"
import { familyOf, type AirwallexEvent } from "./webhook"
import { accountByProviderId, audit } from "../store"
import { factsOf, syncAccount } from "../service"
import { markFeeRecord } from "../checkout"
import { readLifecycle } from "../model"

export async function handleAirwallexEvent(e: AirwallexEvent, opts: { baseUrl: string }): Promise<"done" | "ignored"> {
  switch (familyOf(e.name)) {
    case "account":
    case "rfi":
      return onAccount(e)
    case "payment":
      return onPayment(e, opts)
    case "dispute":
      return onDispute(e)
    case "refund":
      return onRefund(e)
    case "payout":
      return onPayout(e)
    case "split":
      return onSplit(e)
    default:
      return "ignored"
  }
}

function idOf(o: Record<string, unknown> | null, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o?.[k]
    if (typeof v === "string" && v) return v
  }
  return null
}

/* ── The account ──────────────────────────────────────────────────────── */

async function onAccount(e: AirwallexEvent): Promise<"done" | "ignored"> {
  const accountId = e.accountId ?? idOf(e.object, "account_id", "id")
  if (!accountId?.startsWith("acct_")) return "ignored"
  const row = await accountByProviderId(accountId)
  if (!row) return "ignored"
  const before = readLifecycle(row.lifecycle_status)
  const now = await syncAccount(row.creator_id, "webhook")
  const after = readLifecycle(now?.lifecycle_status)
  if (after !== before) await announce(row.creator_id, accountId, after, factsOf(now).hasPayoutDestination, e.id)
  return "done"
}

/**
 * The creator hears about a change once per change: the notification
 * engine's key is the account and the state it reached, so a repeated or
 * late event does not send it again.
 */
async function announce(creatorId: string, accountId: string, lifecycle: string, hasPayoutAccount: boolean, eventId: string): Promise<void> {
  const payload = { provider: "airwallex", payoutAccount: hasPayoutAccount }
  const base = { creatorId, entityType: "payment_setup" as const, entityId: creatorId, payload, correlationId: eventId }
  if (lifecycle === "ACTIVE") await emit({ ...base, name: "payment_setup.completed", key: `awx:${accountId}:active` })
  else if (lifecycle === "ACTION_REQUIRED") await emit({ ...base, name: "payment_setup.action_required", key: `awx:${accountId}:action:${eventId}` })
  else if (lifecycle === "SUSPENDED" || lifecycle === "CLOSED") await emit({ ...base, name: "payment_setup.failed", key: `awx:${accountId}:${lifecycle.toLowerCase()}` })
}

/* ── Payments ─────────────────────────────────────────────────────────── */

async function onPayment(e: AirwallexEvent, opts: { baseUrl: string }): Promise<"done" | "ignored"> {
  if (e.name !== "payment_intent.succeeded") return "ignored"
  const intentId = idOf(e.object, "id")
  if (!intentId?.startsWith("int_")) return "ignored"
  const result = await fulfilAirwallexIntent(createAdminClient(), intentId, { baseUrl: opts.baseUrl })
  if (result.ok) return "done"
  /* Airwallex could not be read: try again. Not a checkout, or not paid: nothing to do. */
  if (result.status >= 500) throw new Error(`fulfilment ${result.status}`)
  return "ignored"
}

async function onDispute(e: AirwallexEvent): Promise<"done" | "ignored"> {
  const intentId = idOf(e.object, "payment_intent_id")
  if (!intentId?.startsWith("int_")) return "ignored"
  const db = createAdminClient()
  if (e.name === "payment_dispute.won" || e.name === "payment_dispute.reversed") {
    await restorePaymentAfterWonDispute(db, intentId, "provider_payment_id")
    await markFeeRecord(intentId, { status: "succeeded" })
  } else if (e.name === "payment_dispute.accepted" || e.name === "payment_dispute.lost" || e.name === "payment_dispute.requires_response" || e.name === "payment_dispute.pending_decision" || e.name === "payment_dispute.challenged") {
    await markPaymentDisputed(db, intentId, "provider_payment_id")
    await markFeeRecord(intentId, { status: "disputed" })
  } else {
    return "ignored"
  }
  await audit({ creatorId: null, kind: e.name.slice(0, 60), ref: intentId, actor: "webhook" })
  return "done"
}

async function onRefund(e: AirwallexEvent): Promise<"done" | "ignored"> {
  const intentId = idOf(e.object, "payment_intent_id")
  if (!intentId?.startsWith("int_")) return "ignored"
  if (e.name === "refund.failed") {
    await audit({ creatorId: null, kind: "refund.failed", ref: idOf(e.object, "id") ?? intentId, actor: "webhook" })
    return "done"
  }
  return "ignored"
}

/* ── Payouts ──────────────────────────────────────────────────────────── */

async function onPayout(e: AirwallexEvent): Promise<"done" | "ignored"> {
  const transferId = idOf(e.object, "id")
  if (!transferId) return "ignored"
  const status = (idOf(e.object, "status") ?? e.name.replace(/^payout\.transfer\./, "")).toUpperCase().slice(0, 60)
  const db = createAdminClient()
  const { data } = await db.from("payment_payouts").select("id, creator_id, status").eq("provider", "airwallex").eq("provider_transfer_id", transferId).maybeSingle()
  const row = data as { id: string; creator_id: string; status: string } | null
  if (!row) return "ignored"
  if (row.status === status) return "done"
  await db.from("payment_payouts").update({ status, updated_at: new Date().toISOString() }).eq("id", row.id)
  await audit({ creatorId: row.creator_id, kind: "payout.status", from: row.status, to: status, ref: transferId, actor: "webhook" })
  const payload = { provider: "airwallex" }
  if (status === "PAID") await emit({ name: "payout.sent", key: `awx:payout:${transferId}:paid`, creatorId: row.creator_id, entityType: "payout", entityId: row.id, payload, correlationId: e.id })
  if (status === "FAILED") await emit({ name: "payout.failed", key: `awx:payout:${transferId}:failed`, creatorId: row.creator_id, entityType: "payout", entityId: row.id, payload, correlationId: e.id })
  return "done"
}

async function onSplit(e: AirwallexEvent): Promise<"done" | "ignored"> {
  if (e.name !== "funds_split.failed") return "ignored"
  const intentId = idOf(e.object, "source_id")
  console.error("[payments] a funds split failed", intentId ?? "unknown")
  await audit({ creatorId: null, kind: "funds_split.failed", ref: intentId, actor: "webhook" })
  return "done"
}
