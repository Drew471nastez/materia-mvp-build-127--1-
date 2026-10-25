/**
 * What lib/checkout/fulfil-payment needs from a paid checkout: the few facts
 * of the payment, read back from Stripe (never from the browser's word).
 */
export interface PaidCheckout {
  provider: "stripe"
  paymentId: string
  amountMinor: number
  currency: string
  metadata: Record<string, string>
  receiptEmail: string | null
  /** When the payment was made, seconds since 1970. */
  createdSeconds: number
  facts: {
    paymentMethod: string
    cardBrand: string | null
    cardLast4: string | null
    paypalEmail: string | null
    applicationFeeCents: number | null
    transferId: string | null
    destinationPaymentId: string | null
    /** Stripe's charge, for its processing fee (lib/payments/stripe/reconcile-processing-fee). */
    chargeId?: string | null
  }
}
