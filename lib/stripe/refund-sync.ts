import "server-only"

import type Stripe from "stripe"
import { sendRefundEmails } from "@/lib/email"
import { allocateRefund, feeShare, refundedSoFar, type RefundLine } from "./refund-allocation"

/**
 * ===========================================================================
 *  A STRIPE REFUND, WRITTEN BACK TO THE ORDERS AND THE SELLER'S BALANCE
 * ===========================================================================
 * Called from the webhook on `charge.refunded`, which Stripe sends for every
 * refund of a charge, whoever made it: the Orders page (app/api/stripe/
 * refund) or somebody in the Stripe dashboard.
 *
 * WHAT THIS REPLACED, AND WHY. The handler looked the order up with
 * `.maybeSingle()` on the PaymentIntent and skipped it if it was already
 * marked refunded. Two things followed:
 *
 *   - A basket is several rows under one PaymentIntent, so the lookup
 *     errored and a basket refunded in the dashboard was never recorded at
 *     all: not on the order, not on the seller's balance.
 *   - The Orders page marks its row refunded the moment Stripe accepts the
 *     refund, before this event arrives, so the handler found it already
 *     refunded and skipped the balance too. The balance on Payouts never
 *     went down for a refund made from Storelib.
 *
 * And the refund email was handed dollars where it formats cents, so a
 * dashboard refund of $10 was emailed as $0.10.
 *
 * NOW every refund of the charge is taken in turn (a second partial refund
 * sends the event again with both), split across the rows it belongs to
 * (lib/stripe/refund-allocation.ts), and applied to each row ONCE: a
 * `ledger_events` row keyed by the refund and the order is the record that
 * it has been, written whether or not the seller has a ledger yet, so a
 * retried or repeated event changes nothing.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

interface OrderRow extends RefundLine {
  product_id: string | null
  buyer_id: string | null
  variant_id: string | null
  buyer_email?: string | null
  customer_email?: string | null
  created_at?: string | null
  stripe_refund_id?: string | null
}

export interface RefundSyncResult {
  applied: number
  skipped: number
}

async function refundsOf(stripe: Stripe, charge: Stripe.Charge): Promise<Stripe.Refund[]> {
  /* Stripe stopped including `charge.refunds` by default; ask when it is missing. */
  const inline = charge.refunds?.data
  const list = inline && inline.length > 0 ? inline : (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data
  return list
    .filter((r) => r.status === "succeeded" || r.status === "pending")
    .sort((a, b) => a.created - b.created)
}

async function alreadyApplied(db: Db, refundId: string, orderId: string): Promise<boolean> {
  const { data } = await db
    .from("ledger_events")
    .select("id")
    .eq("stripe_refund_id", refundId)
    .eq("order_id", orderId)
    .eq("event_type", "refund")
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

async function creatorOf(db: Db, productId: string | null): Promise<string | null> {
  if (!productId) return null
  const { data } = await db.from("products").select("creator_id").eq("id", productId).maybeSingle()
  return (data?.creator_id as string) ?? null
}

/** The row's own record: refunded, how much in all, and by which refund. */
async function markRow(db: Db, row: OrderRow, refund: Stripe.Refund, cents: number, startedHere: boolean, before: number) {
  await db.from("orders").update({ status: "refunded" }).eq("id", row.id)
  /* A refund from the Orders page writes its own amount. */
  if (startedHere) return
  const total = Math.min(Math.max(0, row.amount_cents || 0), before + cents)
  try {
    await db
      .from("orders")
      .update({
        refunded_at: new Date((refund.created || Date.now() / 1000) * 1000).toISOString(),
        refund_reason: refund.reason || "requested_by_customer",
        refund_amount_cents: total,
        stripe_refund_id: refund.id,
      })
      .eq("id", row.id)
  } catch {
    /* Older databases have no refund columns; the status above is enough. */
  }
}

/** A full refund takes the product back out of the buyer's library; a partial one does not. */
async function revokeIfFull(db: Db, row: OrderRow, cents: number, before: number) {
  if (!row.buyer_id || !row.product_id) return
  if (before + cents < Math.max(0, row.amount_cents || 0)) return
  try {
    let q = db.from("entitlements").delete().eq("buyer_id", row.buyer_id).eq("product_id", row.product_id)
    q = row.variant_id ? q.eq("variant_id", row.variant_id) : q.is("variant_id", null)
    await q
  } catch (e) {
    console.error("[refund-sync] entitlement revoke failed:", e instanceof Error ? e.message : e)
  }
}

/**
 * The seller's balance gives back what they received for this part: the
 * refund less its share of the platform fee, taken from pending first, then
 * available, and anything left as a negative balance.
 *
 * THE EVENT ROW IS WRITTEN FIRST, and it is written whether or not the
 * seller has a ledger yet, because it is also the record that this refund
 * has been applied to this row (alreadyApplied). Written last, a failure
 * between the balance and the event would let a retried webhook take the
 * money off twice; written first, the worst a failure can do is leave the
 * balance short of one refund, which the error log names.
 */
async function applyToLedger(db: Db, row: OrderRow, refund: Stripe.Refund, cents: number, currency: string): Promise<boolean> {
  const creatorId = await creatorOf(db, row.product_id)
  if (!creatorId) return false

  const { data: sale } = await db
    .from("ledger_events")
    .select("fee_cents")
    .eq("order_id", row.id)
    .eq("event_type", "sale")
    .limit(1)
  const fee = feeShare(Number(sale?.[0]?.fee_cents) || 0, row.amount_cents || 0, cents)
  const net = Math.max(0, cents - fee)

  const { data: ledger } = await db.from("seller_ledger").select("*").eq("creator_id", creatorId).maybeSingle()
  let fromPending = 0
  let fromAvailable = 0
  let remaining = 0
  if (ledger && net > 0) {
    remaining = net
    fromPending = Math.min(remaining, Math.max(0, ledger.pending_amount || 0))
    remaining -= fromPending
    fromAvailable = Math.min(remaining, Math.max(0, ledger.available_amount || 0))
    remaining -= fromAvailable
  }

  const { error: eventError } = await db.from("ledger_events").insert({
    creator_id: creatorId,
    event_type: "refund",
    amount_cents: cents,
    net_seller_cents: net,
    fee_cents: fee,
    currency,
    pending_delta: -fromPending,
    available_delta: -fromAvailable,
    order_id: row.id,
    stripe_refund_id: refund.id,
    description: `Refund: $${(cents / 100).toFixed(2)}`,
  })
  if (eventError) throw new Error(`refund event not recorded: ${eventError.message}`)

  if (ledger && net > 0) {
    const { error: ledgerError } = await db
      .from("seller_ledger")
      .update({
        pending_amount: (ledger.pending_amount || 0) - fromPending,
        available_amount: (ledger.available_amount || 0) - fromAvailable,
        negative_balance: (ledger.negative_balance || 0) + remaining,
        lifetime_refunds: (ledger.lifetime_refunds || 0) + cents,
      })
      .eq("creator_id", creatorId)
    if (ledgerError) console.error("[refund-sync] balance not reduced for refund", refund.id, "order", row.id, ledgerError.message)
  }
  return true
}

export async function syncChargeRefund(db: Db, stripe: Stripe, charge: Stripe.Charge): Promise<RefundSyncResult> {
  const result: RefundSyncResult = { applied: 0, skipped: 0 }
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return result

  const { data: found, error } = await db.from("orders").select("*").eq("stripe_payment_intent_id", paymentIntentId)
  if (error) throw new Error(`orders read failed: ${error.message}`)
  const rows = ((found ?? []) as OrderRow[]).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id))
  if (rows.length === 0) return result

  const currency = charge.currency || "usd"

  for (const refund of await refundsOf(stripe, charge)) {
    const named = typeof refund.metadata?.order_id === "string" ? refund.metadata.order_id : null
    const shares = allocateRefund(rows, refund.amount, named)
    const touched: Array<{ row: OrderRow; cents: number }> = []

    for (const share of shares) {
      const row = rows.find((r) => r.id === share.id)
      if (!row) continue
      if (await alreadyApplied(db, refund.id, row.id)) {
        result.skipped++
        continue
      }
      /*
        The Orders page tags its refunds with the creator and the row
        (app/api/stripe/refund) and records the amount on the row itself.
        That is read from the refund, not from the row, because this event
        can arrive before the page has finished writing it.
      */
      const startedHere = named === row.id && typeof refund.metadata?.creator_id === "string"
      const before = startedHere ? 0 : refundedSoFar(row)
      try {
        await applyToLedger(db, row, refund, share.cents, currency)
      } catch (e) {
        /* Nothing recorded, so nothing marks it applied: the retry will. */
        console.error("[refund-sync] refund not applied:", refund.id, row.id, e instanceof Error ? e.message : e)
        continue
      }
      await markRow(db, row, refund, share.cents, startedHere, before)
      await revokeIfFull(db, row, share.cents, before)
      if (!startedHere) touched.push({ row, cents: share.cents })
      /* Later refunds of the same charge see what this one gave back. */
      row.status = "refunded"
      row.refund_amount_cents = Math.min(Math.max(0, row.amount_cents || 0), before + share.cents)
      result.applied++
    }

    /* One email per refund, for a refund Storelib did not start (the Orders
       page sends its own). In cents: sendRefundEmails formats them. */
    if (touched.length > 0) {
      try {
        await emailRefund(db, touched, refund, currency)
      } catch (e) {
        console.error("[refund-sync] refund email failed:", e instanceof Error ? e.message : e)
      }
    }
  }
  return result
}

async function emailRefund(db: Db, touched: Array<{ row: OrderRow; cents: number }>, refund: Stripe.Refund, currency: string) {
  const first = touched[0].row
  const { data: product } = await db
    .from("products")
    .select("title, creator:creators(display_name, username, user_id)")
    .eq("id", first.product_id)
    .maybeSingle()
  const creator = (product as any)?.creator
  let sellerEmail: string | undefined
  if (creator?.user_id) {
    const { data: profile } = await db.from("profiles").select("email").eq("id", creator.user_id).maybeSingle()
    sellerEmail = profile?.email || undefined
  }
  const title = touched.length === 1 ? (product as any)?.title || "Your purchase" : `${touched.length} items`
  await sendRefundEmails({
    buyerEmail: first.buyer_email || first.customer_email || undefined,
    sellerEmail,
    productTitle: title,
    refundAmount: touched.reduce((n, t) => n + t.cents, 0),
    currency,
    orderId: first.id,
    reason: refund.reason || "requested_by_customer",
    storeName: creator?.display_name || creator?.username || "Storelib",
    orderDate: first.created_at || undefined,
  })
}
