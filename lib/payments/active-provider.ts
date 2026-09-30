import "server-only"

import type { PaymentProviderId } from "./model"

/**
 * Active Storelib Payments processor for all creators.
 * Airwallex code remains in the repo but is not selected for live flows.
 */
export function activePaymentProvider(): PaymentProviderId {
  const forced = (process.env.STORELIB_PAYMENTS_PROVIDER || "stripe").toLowerCase()
  if (forced === "airwallex") return "airwallex"
  return "stripe"
}
