import "server-only"

/**
 * ===========================================================================
 *  A PAYMENT THAT ARRIVED OVER THE LIMIT IS REFUNDED, NOT FULFILLED
 * ===========================================================================
 * Every payment for a limited download held its copy when it started
 * (./sales-limit.ts), so this should not happen. It still can: a payment
 * confirmed long after its hold lapsed, while the last copies went to
 * others, or a seller who lowered the limit under copies already promised.
 * Then the order is written (it is a record of money taken) but not
 * fulfilled: no library entry, no download email. The money goes straight
 * back, the way the Orders page refunds (app/api/stripe/refund): the whole
 * of the line, the seller's transfer reversed, one refund per order whatever
 * retries, and the refund is applied to the order, the seller's balance and
 * the buyer's inbox by the same code the charge.refunded webhook runs
 * (lib/stripe/refund-sync.ts). The order's reason reads "sold_out".
 *
 * If Stripe cannot be reached the error goes up, so the webhook answers 500
 * and Stripe sends the event again; the order is found then and the refund
 * tried again under the same key.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { syncChargeRefund } from "@/lib/stripe/refund-sync"

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The reason written on an order refunded because the product had sold out. */
export const SOLD_OUT_REASON = "sold_out"

export interface OverLimitOrder {
  orderId: string
  productId: string
  creatorId: string | null
  /** What this order was charged, all of which goes back. */
  amountCents: number
  provider: "stripe" | "free" | string
  /** Stripe's PaymentIntent. */
  paymentId: string | null
}

export type SoldOutRefund = { refunded: true; refundId: string; pending: boolean } | { refunded: false; reason: string }

export async function refundOverLimit(db: Db, o: OverLimitOrder): Promise<SoldOutRefund> {
  const amount = Math.max(0, Math.round(o.amountCents))
  /* The reason first, on its own: a retried event that finds this order knows it still owes a refund (owesSoldOutRefund). */
  await markOrder(db, o.orderId, null)
  /* Nothing was paid (a free order): nothing to give back, and the order is not fulfilled. */
  if (amount <= 0 || !o.paymentId || o.provider === "free") {
    await markOrder(db, o.orderId, amount)
    return { refunded: false, reason: "nothing paid" }
  }

  /* Stripe: a destination charge, so its refund is the platform's and the transfer comes back from the seller (reverse_transfer), as on the Orders page. */
  const refund = await stripe.refunds.create(
    {
      payment_intent: o.paymentId,
      amount,
      reverse_transfer: true,
      reason: "requested_by_customer",
      /* No creator_id: the webhook's sync then treats it as a refund Storelib did not start from the Orders page, writes the row and emails the buyer. */
      metadata: { order_id: o.orderId, product_id: o.productId, refund_reason: SOLD_OUT_REASON },
    },
    { idempotencyKey: `storelib-sold-out:${o.orderId}` },
  )
  if (refund.status === "failed" || refund.status === "canceled") {
    console.error("[sold-out] refund refused for order", o.orderId, refund.status)
    return { refunded: false, reason: `refund ${refund.status}` }
  }
  if (refund.status === "succeeded") {
    /* Applied now rather than when charge.refunded arrives; the same code, so once either way. */
    try {
      const pi = await stripe.paymentIntents.retrieve(o.paymentId, { expand: ["latest_charge"] })
      const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null
      if (charge) await syncChargeRefund(db, stripe, charge)
    } catch (e) {
      console.error("[sold-out] applying the refund now failed; charge.refunded will:", e instanceof Error ? e.message : e)
    }
  }
  await markOrder(db, o.orderId, amount)
  return { refunded: true, refundId: refund.id, pending: refund.status !== "succeeded" }
}

/** Marks an order as written over the limit the moment it exists, so a refund that does not happen now is found and made by the next try. */
export async function markSoldOut(db: Db, orderId: string): Promise<void> {
  await markOrder(db, orderId, null)
}

/** Whether an order was written over the limit and its refund has not been made yet: its reason says sold out and it still reads paid. */
export async function owesSoldOutRefund(db: Db, orderId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("orders").select("status, refund_reason").eq("id", orderId).maybeSingle()
    if (error || !data) return false
    return data.refund_reason === SOLD_OUT_REASON && data.status === "completed"
  } catch {
    return false
  }
}

/** The order says why; with an amount (a refund applied here, not by the sync) it is marked refunded too. Its own writes: an older database without the refund columns keeps the status alone. */
async function markOrder(db: Db, orderId: string, amountCents: number | null) {
  try {
    if (amountCents !== null) await db.from("orders").update({ status: "refunded" }).eq("id", orderId)
    await db
      .from("orders")
      .update({
        refund_reason: SOLD_OUT_REASON,
        ...(amountCents !== null ? { refunded_at: new Date().toISOString(), refund_amount_cents: amountCents } : {}),
      })
      .eq("id", orderId)
  } catch {
    /* the refund itself is what matters */
  }
}
