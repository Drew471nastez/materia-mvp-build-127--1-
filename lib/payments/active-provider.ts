import "server-only"

import type { PaymentProviderId } from "./model"

/**
 * Active Storelib Payments processor for all creators.
 * Airwallex code remains in the repo but is not selected for live flows.
 */
export function activePaymentProvider(): PaymentProviderId {
  /* Stripe is the only live Storelib Payments processor. Airwallex remains inert code. */
  return "stripe"
}
