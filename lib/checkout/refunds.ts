import "server-only"

/**
 * ===========================================================================
 *  A REFUND, RECORDED THE SAME WAY WHEREVER IT WAS MADE
 * ===========================================================================
 * A refund can start in three places: the seller's Refund button
 * (app/api/stripe/refund), the Stripe Dashboard, or Stripe itself for a
 * dispute. Stripe tells us about each with charge.refunded, and the Refund
 * button also calls this directly so the page is right before the webhook
 * lands. Everything here is keyed on what Stripe says, so running it twice,
 * or out of order, gives the same result:
 *
 *   the order rows      `refund_amount_cents` is SET to what Stripe has
 *                       refunded on the line (never added to), and the status
 *                       becomes "refunded"; a partial refund is told apart
 *                       by that amount (lib/orders/refund-state.ts);
 *   the product         leaves the buyer's library once a line is refunded
 *                       in full;
 *   the seller's ledger one debit per Stripe refund id, never two, and only
 *                       for a sale the ledger actually recorded;
 *   the emails          for a refund made outside Storelib (the Dashboard),
 *                       sent once, when the rows first see its refund id.
 *                       The Refund button sends its own.
 *
 * This used to live in the webhook and was skipped whenever the order was
 * already marked refunded, which the Refund button always does first: the
 * product stayed in the library and the seller could cash out money that had
 * gone back. It also read one order per payment, so a basket (several rows
 * on one payment) was never marked at all.
 */

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { allocateRefunds } from "./refund-allocation"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

interface OrderLine {
  id: string
  product_id: string | null
  variant_id: string | null
  buyer_id: string | null
  buyer_email: string | null
  amount_cents: number | null
  status: string | null
  refunded_at?: string | null
  created_at?: string | null
  stripe_refund_id?: string | null
}

export async function syncChargeRefunds(admin: Db, charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return

  const { data: rows } = await admin.from("orders").select("*").eq("stripe_payment_intent_id", paymentIntentId).limit(100)
  const lines = ((rows ?? []) as OrderLine[]).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id))
  if (lines.length === 0) return

  /* The refunds themselves, from Stripe: a charge on a recent API version no
     longer carries its refund list. */
  const list = await stripe.refunds.list({ charge: charge.id, limit: 100 })
  const refunds = list.data.filter((r) => r.status !== "failed" && r.status !== "canceled")
  const perLine = allocateRefunds(
    lines,
    refunds.map((r) => ({ amount: r.amount, orderId: r.metadata?.order_id || null })),
    charge.refunded === true,
  )
  const latest = refunds[0] ?? null
  const now = new Date().toISOString()
  /* Whether this refund is news: the rows remember the last one recorded. */
  const known = new Set(lines.map((l) => l.stripe_refund_id).filter(Boolean))

  for (const line of lines) {
    const refunded = perLine.get(line.id) ?? 0
    if (refunded <= 0) continue
    if (line.status !== "refunded") await admin.from("orders").update({ status: "refunded" }).eq("id", line.id)
    /* Its own update: the refund columns are not in every database, and a
       missing one must not undo the status above. */
    try {
      await admin
        .from("orders")
        .update({
          refund_amount_cents: refunded,
          refunded_at: line.refunded_at || now,
          stripe_refund_id: latest?.id ?? null,
          refund_reason: latest?.reason || "requested_by_customer",
        })
        .eq("id", line.id)
    } catch {
      /* status is recorded */
    }

    if (refunded >= (line.amount_cents || 0) && line.buyer_id && line.product_id) {
      let revoke = admin.from("entitlements").delete().eq("buyer_id", line.buyer_id).eq("product_id", line.product_id)
      revoke = line.variant_id ? revoke.eq("variant_id", line.variant_id) : revoke.is("variant_id", null)
      await revoke
    }
  }

  await debitLedger(admin, { lines, refunds, charge })

  /* A Dashboard refund tells nobody else, so the buyer and the seller hear
     it from here, once. The Refund button names its order and emails itself. */
  if (latest && !known.has(latest.id) && !latest.metadata?.order_id) {
    const creatorId = await creatorOf(admin, lines[0])
    if (creatorId) await refundEmails(admin, creatorId, lines, latest).catch(() => undefined)
  }
}

async function creatorOf(admin: Db, line: OrderLine): Promise<string | null> {
  if (!line.product_id) return null
  const { data } = await admin.from("products").select("creator_id").eq("id", line.product_id).maybeSingle()
  return data?.creator_id ?? null
}

async function debitLedger(admin: Db, s: { lines: OrderLine[]; refunds: Stripe.Refund[]; charge: Stripe.Charge }) {
  const orderIds = s.lines.map((l) => l.id)
  /* Only a sale the ledger recorded can be taken back out of it. */
  const { data: sale } = await admin
    .from("ledger_events")
    .select("creator_id, amount_cents, fee_cents, order_id")
    .in("order_id", orderIds)
    .eq("event_type", "sale")
    .limit(1)
    .maybeSingle()
  if (!sale?.creator_id) return

  for (const refund of [...s.refunds].reverse()) {
    const { data: done } = await admin.from("ledger_events").select("id").eq("stripe_refund_id", refund.id).eq("event_type", "refund").maybeSingle()
    if (done) continue

    /* Stripe returns the platform's fee in proportion (refund_application_fee),
       so the seller gives back the refund less that share of the fee. */
    const saleAmount = Math.max(1, Number(sale.amount_cents) || s.charge.amount)
    const feeBack = Math.round((Number(sale.fee_cents) || 0) * Math.min(1, refund.amount / saleAmount))
    const net = Math.max(0, refund.amount - feeBack)

    const { data: ledger } = await admin.from("seller_ledger").select("*").eq("creator_id", sale.creator_id).maybeSingle()
    if (!ledger) continue
    let remaining = net
    const fromPending = Math.min(remaining, ledger.pending_amount || 0)
    remaining -= fromPending
    const fromAvailable = Math.min(remaining, ledger.available_amount || 0)
    remaining -= fromAvailable

    /* The event first: it is the idempotency key, so a retry that finds it
       does not debit the balance a second time. */
    const { error } = await admin.from("ledger_events").insert({
      creator_id: sale.creator_id,
      event_type: "refund",
      amount_cents: refund.amount,
      net_seller_cents: net,
      fee_cents: feeBack,
      currency: refund.currency || "usd",
      pending_delta: -fromPending,
      available_delta: -fromAvailable,
      order_id: sale.order_id,
      stripe_refund_id: refund.id,
      description: `Refund: $${(refund.amount / 100).toFixed(2)}`,
    })
    if (error) continue
    await admin
      .from("seller_ledger")
      .update({
        pending_amount: (ledger.pending_amount || 0) - fromPending,
        available_amount: (ledger.available_amount || 0) - fromAvailable,
        negative_balance: (ledger.negative_balance || 0) + remaining,
        lifetime_refunds: (ledger.lifetime_refunds || 0) + refund.amount,
      })
      .eq("creator_id", sale.creator_id)

  }
}

async function refundEmails(admin: Db, creatorId: string, lines: OrderLine[], refund: Stripe.Refund) {
  const first = lines[0]
  const { sendRefundEmails, resolveSellerEmail, resolveCreatorIdentity } = await import("@/lib/email")
  const { data: product } = first.product_id
    ? await admin.from("products").select("title").eq("id", first.product_id).maybeSingle()
    : { data: null }
  const identity = await resolveCreatorIdentity(admin, creatorId).catch(() => null)
  await sendRefundEmails({
    buyerEmail: first.buyer_email || "",
    sellerEmail: await resolveSellerEmail(admin, creatorId),
    productTitle: lines.length > 1 ? `${lines.length} products` : product?.title || "Your purchase",
    /* In cents: the sender formats it. This was passed in dollars and
       divided again, so a $20 refund read "$0.20". */
    refundAmount: refund.amount,
    currency: refund.currency || "usd",
    orderId: first.id,
    reason: refund.reason || "requested_by_customer",
    storeName: identity?.fromName || "Storelib",
    orderDate: first.created_at || undefined,
  })
}
