/**
 * ===========================================================================
 *  AIRWALLEX, AS A PAST PROVIDER
 * ===========================================================================
 * Storelib takes payments through Stripe only. Some orders were paid through
 * Airwallex before that, and keep `provider = "airwallex"` (and the payment's
 * id in `provider_payment_id`, run-now part 76). Those rows are history: they
 * count in Orders, Analytics, receipts and exports like any other sale, but
 * nothing here can call Airwallex any more, so they offer no Refund. The
 * creator refunds them in their own Airwallex account.
 *
 * Pure: safe in the browser and on the server.
 */

export const PAST_PROVIDER_LABEL = "Airwallex"

/** What the order page says where Refund would be. */
export const PAST_PROVIDER_REFUND_NOTE = "Refund this order in your Airwallex account."

/** An order line paid through Airwallex before it was removed. */
export function paidThroughAirwallex(row: { provider?: string | null } | null | undefined): boolean {
  return typeof row?.provider === "string" && row.provider.trim().toLowerCase() === "airwallex"
}
