/** The pure half of lib/communities/server/refunded-payment.ts: whether a revoked row may be opened again. Imports nothing, so tests run it directly. */
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
