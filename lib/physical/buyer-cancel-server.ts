import "server-only"

/**
 * ===========================================================================
 *  THE BUYER CANCELS AN ORDER THAT HASN'T SHIPPED
 * ===========================================================================
 * Cancel order on the buyer's page (app/checkout/physical/order/[token]),
 * under the rules of ./buyer-cancel.ts: the shop lets buyers cancel
 * (Settings › Checkout), and the order is still Unfulfilled (paid, not
 * marked in progress, nothing sent or refunded).
 *
 * "now": the money goes back first, every paid line in full, the way the
 * Orders page refunds it (a destination charge reversed from the seller,
 * one refund per line whatever retries, applied to the order, the seller's
 * balance and the seller's inbox by the code Stripe's charge.refunded runs,
 * lib/stripe/refund-sync.ts). A line paid through Airwallex before it was
 * removed has nothing here to refund it, so the request goes to the shop. Then
 * the order is cancelled with the shop's own Cancel order (./orders-server
 * cancelOrder): stock back on sale, cash on delivery voided, the buyer's
 * Order cancelled email, and the seller's email that the buyer cancelled.
 * Then the order catches up with its refund (noteRefund): its timeline and
 * the buyer's refund email. A refund Stripe is still confirming is finished
 * by its webhook, which restates the order and emails then.
 *
 * Nothing refunded and a refund refused: nothing changes, and the request is
 * passed to the shop instead, so the buyer is never left with an order that
 * reads cancelled while their money is stuck. "ask" orders (sent to a
 * partner already, a download inside, cash already collected) are always
 * asked.
 */
import type { Db } from "./auth"
import { addOrderEvent } from "./events-server"
import { buyerCancelState, cancelMode, cleanCancelReason } from "./buyer-cancel"
import { cancelEvents, cancelOrder, loadOrder, noteRefund, requestBuyerCancel, type PhysicalOrder } from "./orders-server"

/** One paid line of the order, as much of it as is still to give back. */
export interface LineToRefund {
  orderId: string
  productId: string | null
  creatorId: string
  amountCents: number
  alreadyRefundedCents: number
  provider: string | null
  stripePaymentIntentId: string | null
  providerPaymentId: string | null
  currency: string | null
}

export type LineRefund = { ok: true; refundId: string; pending: boolean } | { ok: false; error: string }

export type BuyerCancelOutcome =
  | { ok: true; order: PhysicalOrder; done: "cancelled" | "requested"; refundedCents: number; pending: boolean }
  | { ok: false; error: string; status?: number }

/** The reason a refund made by the buyer's Cancel order carries, from the store's list (lib/store/reasons). */
export const CANCEL_REFUND_REASON = "cancelled"

/**
 * Money back for one line: Stripe (the charge is the platform's, the
 * seller's transfer is reversed). Never on a script's say:
 * the caller checked the order may be cancelled.
 */
export async function refundLine(db: Db, l: LineToRefund): Promise<LineRefund> {
  const amount = Math.max(0, Math.round(l.amountCents - l.alreadyRefundedCents))
  if (amount <= 0) return { ok: true, refundId: "", pending: false }
  try {
    if (!l.stripePaymentIntentId) return { ok: false, error: "no payment to refund" }
    const { stripe } = await import("@/lib/stripe")
    /* No creator_id in its metadata: the sync below (and charge.refunded) writes the row, the seller's balance and the seller's email, as for a refund the Orders page did not start. */
    const refund = await stripe.refunds.create(
      { payment_intent: l.stripePaymentIntentId, amount, reverse_transfer: true, reason: "requested_by_customer", metadata: { order_id: l.orderId, product_id: l.productId ?? "", refund_reason: CANCEL_REFUND_REASON, cancelled_by: "buyer" } },
      { idempotencyKey: `storelib-buyer-cancel:${l.orderId}:${l.alreadyRefundedCents}:${amount}` },
    )
    if (refund.status === "failed" || refund.status === "canceled") return { ok: false, error: `refund ${refund.status}` }
    if (refund.status === "succeeded") {
      try {
        const { syncChargeRefund } = await import("@/lib/stripe/refund-sync")
        const pi = await stripe.paymentIntents.retrieve(l.stripePaymentIntentId, { expand: ["latest_charge"] })
        const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null
        if (charge) await syncChargeRefund(db as never, stripe, charge as never)
      } catch (e) {
        console.error("[buyer-cancel] applying the refund now failed; charge.refunded will:", e instanceof Error ? e.message : e)
      }
    }
    return { ok: true, refundId: refund.id, pending: refund.status !== "succeeded" }
  } catch (e) {
    console.error("[buyer-cancel] refund failed for line", l.orderId, e instanceof Error ? e.message : e)
    return { ok: false, error: "refund failed" }
  }
}

/** The lines money was taken for, with what is left of each to give back. */
async function paidLines(db: Db, order: PhysicalOrder): Promise<LineToRefund[]> {
  const { data } = await db.from("orders").select("id, product_id, status, amount_cents, refund_amount_cents, provider, stripe_payment_intent_id, provider_payment_id, currency").eq("checkout_id", order.id)
  return ((data ?? []) as Record<string, any>[]) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter((r) => (r.status === "completed" || r.status === "refunded") && r.provider !== "cod" && r.provider !== "free" && Number(r.amount_cents) - Number(r.refund_amount_cents ?? 0) > 0)
    .map((r) => ({
      orderId: String(r.id),
      productId: typeof r.product_id === "string" ? r.product_id : null,
      creatorId: order.creatorId,
      amountCents: Number(r.amount_cents) || 0,
      alreadyRefundedCents: r.status === "refunded" ? Number(r.refund_amount_cents ?? 0) || 0 : 0,
      provider: typeof r.provider === "string" ? r.provider : null,
      stripePaymentIntentId: typeof r.stripe_payment_intent_id === "string" ? r.stripe_payment_intent_id : null,
      providerPaymentId: typeof r.provider_payment_id === "string" ? r.provider_payment_id : null,
      currency: typeof r.currency === "string" ? r.currency : order.currency,
    }))
}

/**
 * Cancel order, pressed by the buyer: cancelled and refunded now, or asked
 * of the shop (see above). A second press finds the order cancelled, or the
 * request already made, and does nothing again.
 */
export async function buyerCancelOrder(db: Db, receiptToken: string, input: { reason: unknown; enabled: boolean }, deps: { refund?: typeof refundLine } = {}): Promise<BuyerCancelOutcome> {
  const order = await loadOrder(db, { receiptToken })
  if (!order || !order.creatorId) return { ok: false, error: "Order not found.", status: 404 }
  const events = await cancelEvents(db, order.id)
  const state = buyerCancelState({ ...order, events }, input.enabled)
  if (state === "cancelled") return { ok: true, order, done: "cancelled", refundedCents: order.refundedCents, pending: false }
  const ask = async (): Promise<BuyerCancelOutcome> => {
    const r = await requestBuyerCancel(db, receiptToken, input)
    if (r.ok === false) return { ok: false, error: r.error, status: r.status }
    return { ok: true, order: r.order, done: "requested", refundedCents: 0, pending: false }
  }
  if (state !== "can_request" || cancelMode({ lines: order.lines, events }) === "ask" || order.payment === "cod_collected") return ask()

  const refund = deps.refund ?? refundLine
  let refunded = 0
  let pending = false
  let refused = 0
  for (const line of await paidLines(db, order)) {
    const r = await refund(db, line)
    if (!r.ok) {
      refused++
      /* The first refund refused: nothing has changed, so the shop is asked instead. */
      if (refunded === 0 && !pending) return ask()
      continue
    }
    refunded += line.amountCents - line.alreadyRefundedCents
    pending = pending || r.pending
  }

  const reason = cleanCancelReason(input.reason)
  const cancelled = await cancelOrder(db, order.creatorId, order.id, reason, "buyer")
  if (cancelled.ok === false) return cancelled
  if (refused > 0) {
    await addOrderEvent(db, { checkoutId: order.id, creatorId: order.creatorId, kind: "payment.refund_incomplete", message: "The buyer cancelled this order and part of the refund didn't go through. Refund the rest from the order.", actor: "system", key: `buyer_cancel_refund_incomplete:${order.id}` })
  }
  /* The order, its timeline and the buyer's refund email catch up with what was refunded now; a refund still being confirmed is caught up by its webhook. */
  const fresh = refunded > 0 && !pending ? await noteRefund(db, order.creatorId, order.id, null) : cancelled
  const now = fresh.ok ? fresh.order : cancelled.order
  return { ok: true, order: now, done: "cancelled", refundedCents: refunded, pending }
}
