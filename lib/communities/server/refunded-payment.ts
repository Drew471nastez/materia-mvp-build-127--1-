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
import "server-only"
import type { RefundCheck } from "../refund-verdict"
export { regrantVerdict, type RefundCheck, type RegrantVerdict } from "../refund-verdict"


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
