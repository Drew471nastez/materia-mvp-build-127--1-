import "server-only"

/**
 * ===========================================================================
 *  A WEBSITE CHECKOUT'S PAYMENT NEVER OUTLIVES WHAT IT HELD
 * ===========================================================================
 * A Stripe Checkout page expires; a PaymentIntent does not. The website's
 * own checkout (app/checkout/site) pays with PaymentIntents, so a payment
 * left open (a bank's check abandoned, a client secret kept) could be paid
 * after the stock it held went back and after the code's place under its
 * limit ran out. This closes them, from the ten minute cron
 * (app/api/cron/physical):
 *
 *   a cart that ships   a held checkout past its hold (expires_at), paid by
 *                       a PaymentIntent (no Checkout Session): the payment is
 *                       cancelled first, then the stock and the code's place
 *                       go back. One Stripe will not cancel (paid that very
 *                       moment) is left for its webhook.
 *   a cart of downloads a website basket PaymentIntent (metadata site_basket)
 *                       still unpaid after STALE_MINUTES is cancelled and
 *                       its code's place given back.
 *
 * The page never confirms an old one either: a cart that ships makes a new
 * checkout after 25 minutes (app/checkout/site/site-checkout.tsx), and a
 * cart of downloads makes a new PaymentIntent at every Pay.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { releaseCouponHold } from "./coupon-holds"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const STALE_MINUTES = 35
const OPEN: Stripe.PaymentIntent.Status[] = ["requires_payment_method", "requires_confirmation", "requires_action"]

export interface SweepCounts {
  shipped: number
  baskets: number
}

async function cancelled(id: string): Promise<boolean> {
  try {
    return (await stripe.paymentIntents.cancel(id)).status === "canceled"
  } catch {
    try {
      return (await stripe.paymentIntents.retrieve(id)).status === "canceled"
    } catch {
      return false
    }
  }
}

/**
 * `until` (ms since epoch): no new cancel is started past it, so the cron's
 * later steps keep their time (app/api/cron/physical). What is left waits for
 * the next run, ten minutes later; nothing here is lost by stopping.
 */
export async function cancelStaleSitePayments(db: Db, now = Date.now(), limit = 50, until = Number.POSITIVE_INFINITY): Promise<SweepCounts> {
  const out: SweepCounts = { shipped: 0, baskets: 0 }
  const late = () => Date.now() >= until

  /* Carts that ship: the held checkouts past their hold, paid by a PaymentIntent. */
  try {
    const { data, error } = await db
      .from("commerce_checkouts")
      .select("id, stripe_payment_intent_id, coupon_id, coupon_holder")
      .eq("status", "pending")
      .is("stripe_session_id", null)
      .not("stripe_payment_intent_id", "is", null)
      .lt("expires_at", new Date(now).toISOString())
      .limit(limit)
    if (!error && Array.isArray(data)) {
      const { releaseCheckout } = await import("@/lib/physical/checkout-server")
      for (const c of data as { id: string; stripe_payment_intent_id: string; coupon_id: string | null; coupon_holder: string | null }[]) {
        if (late()) break
        if (!(await cancelled(c.stripe_payment_intent_id))) continue
        await releaseCheckout(db, c.id, "expired", "Payment not made in time")
        if (c.coupon_id && c.coupon_holder) await releaseCouponHold(db, c.coupon_id, c.coupon_holder)
        out.shipped++
      }
    }
  } catch (e) {
    console.warn("[site-sweep] held checkouts:", (e as { code?: string })?.code ?? "error")
  }

  /* Carts of downloads: unpaid basket PaymentIntents older than the code's hold. */
  const before = Math.floor(now / 1000) - STALE_MINUTES * 60
  for (const status of OPEN) {
    if (out.baskets >= limit || late()) break
    try {
      const found = await stripe.paymentIntents.search({ query: `metadata['site_basket']:'1' AND status:'${status}' AND created<${before}`, limit: Math.min(50, limit) })
      for (const pi of found.data) {
        if (late()) break
        if (!(await cancelled(pi.id))) continue
        if (pi.metadata?.coupon_id && pi.metadata?.coupon_holder) await releaseCouponHold(db, pi.metadata.coupon_id, pi.metadata.coupon_holder)
        out.baskets++
      }
    } catch (e) {
      /* Search not available on this account, or Stripe busy: the next run tries again. */
      console.warn("[site-sweep] baskets:", (e as { code?: string; type?: string })?.code ?? (e as { type?: string })?.type ?? "error")
    }
  }
  return out
}
