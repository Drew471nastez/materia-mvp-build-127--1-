import { refundableCents } from "./views/common"

/**
 * ===========================================================================
 *  WHETHER AN ADMIN REFUND MAY GO AHEAD, DECIDED WITHOUT STRIPE
 * ===========================================================================
 * Pure, so the suite can run every branch. The route reads the order, asks
 * this, and only then talks to Stripe.
 *
 * THE CONFIRMATION IS THE AMOUNT. The dialog shows what will go back to the
 * buyer, and the request has to carry that same number of cents. If the
 * order has changed since the dialog opened (the creator refunded part of it
 * from their own Orders page, a webhook marked it disputed) the numbers no
 * longer match and nothing is refunded. A checkbox cannot do that; an echo
 * of the figure the person read can.
 *
 * THE IDEMPOTENCY KEY IS THE CREATOR'S. app/api/stripe/refund keys its
 * refunds `storelib-refund:<order>:<already refunded>:<amount>`. Using the
 * same shape here means the creator refunding and the admin refunding the
 * same remainder at the same moment make ONE refund at Stripe, not two.
 */

export type RefundableOrder = {
  id: string
  status: string | null
  amount_cents: number | null
  refund_amount_cents: number | null
  stripe_payment_intent_id: string | null
}

export type RefundPlan =
  | { ok: true; amount: number; already: number; idempotencyKey: string; total: number }
  | { ok: false; status: number; error: string }

export function planRefund(order: RefundableOrder | null, confirm: unknown): RefundPlan {
  if (!order) return { ok: false, status: 404, error: "No order has that id." }
  if (order.status !== "completed" && order.status !== "refunded") {
    return { ok: false, status: 400, error: `This order is ${order.status || "pending"}. Only a paid order can be refunded.` }
  }
  if (!order.stripe_payment_intent_id) {
    return { ok: false, status: 400, error: "This order was not paid through Stripe, so there is nothing to refund there." }
  }
  const amount = refundableCents(order)
  if (amount <= 0) return { ok: false, status: 400, error: "This order has already been refunded in full." }
  if (typeof confirm !== "number" || confirm !== amount) {
    return {
      ok: false,
      status: 409,
      error: "The amount changed since this was opened. Nothing was refunded. Open the order again and confirm the new amount.",
    }
  }
  const already = order.status === "refunded" ? Math.max(0, order.refund_amount_cents ?? 0) : 0
  const total = Math.min(order.amount_cents ?? 0, already + amount)
  return { ok: true, amount, already, total, idempotencyKey: `storelib-refund:${order.id}:${already}:${amount}` }
}
