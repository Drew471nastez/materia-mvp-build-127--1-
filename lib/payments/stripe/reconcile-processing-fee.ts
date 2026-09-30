import "server-only"

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"

export interface StripeProcessingFeeFacts {
  balanceTransactionId: string
  grossMinor: number
  currency: string
  stripeProcessingFeeMinor: number
  applicationFeeMinor: number | null
  storelibNetMarginMinor: number | null
}

/**
 * Reads Stripe's reported processing fee from the balance transaction on a charge.
 * Never estimates — returns null if Stripe has not reported a fee yet.
 */
export async function processingFeeFromChargeId(chargeId: string): Promise<StripeProcessingFeeFacts | null> {
  if (!chargeId?.startsWith("ch_")) return null
  try {
    const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] })
    const bt = charge.balance_transaction
    if (!bt || typeof bt === "string") return null
    const balance = bt as Stripe.BalanceTransaction
    if (typeof balance.fee !== "number") return null

    const applicationFeeMinor =
      typeof charge.application_fee_amount === "number" ? charge.application_fee_amount : null

    const storelibNetMarginMinor =
      applicationFeeMinor !== null ? applicationFeeMinor - balance.fee : null

    return {
      balanceTransactionId: balance.id,
      grossMinor: balance.amount,
      currency: (balance.currency || charge.currency || "usd").toUpperCase(),
      stripeProcessingFeeMinor: balance.fee,
      applicationFeeMinor,
      storelibNetMarginMinor,
    }
  } catch {
    return null
  }
}

export async function persistOrderStripeEconomics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orderId: string,
  facts: StripeProcessingFeeFacts,
): Promise<void> {
  await admin
    .from("orders")
    .update({
      stripe_balance_transaction_id: facts.balanceTransactionId,
      stripe_processing_fee_cents: facts.stripeProcessingFeeMinor,
      storelib_net_margin_cents: facts.storelibNetMarginMinor,
    })
    .eq("id", orderId)
}
