/**
 * ===========================================================================
 *  A REFUNDED PAYMENT NEVER OPENS ANYTHING AGAIN (round AY)
 * ===========================================================================
 * A paid program or module of a community is one row per person
 * (community_program_access, community_module_access). A full refund marks
 * that row revoked (app/api/stripe/webhook settleChargeRefund). A Checkout
 * Session stays payment_status "paid" at Stripe after its charge is refunded,
 * so sending that same session to the sheet's confirm again (or Stripe
 * delivering its checkout.session.completed again) used to clear revoked_at:
 * the buyer had the money back and the program open.
 *
 * A revoked row is opened again only by a purchase that is not refunded:
 *   the same session or payment as the revoked row   refused, no Stripe call
 *   another payment                                   asked of Stripe; refused
 *                                                     when its charge is
 *                                                     refunded in full, "try
 *                                                     again" when Stripe
 *                                                     cannot say
 * A partial refund never revokes anything and is not looked at here.
 */

/** true: refunded in full. false: not. null: Stripe could not say. */
export type RefundCheck = (paymentIntentId: string) => Promise<boolean | null>

export type RegrantVerdict = "allow" | "refunded" | "unknown"

/** Whether a revoked row may be opened again by this purchase. */
export async function regrantVerdict(
  revoked: { checkout_session_id?: string | null; payment_intent_id?: string | null },
  purchase: { checkoutSessionId?: string | null; paymentIntentId?: string | null },
  check?: RefundCheck,
): Promise<RegrantVerdict> {
  if (purchase.checkoutSessionId && revoked.checkout_session_id === purchase.checkoutSessionId) return "refunded"
  if (purchase.paymentIntentId && revoked.payment_intent_id === purchase.paymentIntentId) return "refunded"
  if (!purchase.paymentIntentId || !check) return "allow"
  let answer: boolean | null
  try {
    answer = await check(purchase.paymentIntentId)
  } catch {
    answer = null
  }
  if (answer === true) return "refunded"
  if (answer === null) return "unknown"
  return "allow"
}

/** The PaymentIntent's charge, read from Stripe: refunded in full or not. */
export const stripeRefundCheck: RefundCheck = async (paymentIntentId) => {
  try {
    const { stripe } = await import("@/lib/stripe")
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] })
    const charge = pi.latest_charge
    if (!charge || typeof charge === "string") return null
    return charge.refunded === true
  } catch {
    return null
  }
}
