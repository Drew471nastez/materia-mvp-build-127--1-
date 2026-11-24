import "server-only"
import { CROSS_BORDER_REGION, settlementCountriesFrom, settlesInSellerCountry } from "./payout-regions"

/**
 * Storelib Payments → Stripe Connect (Express, platform-created accounts).
 *
 * Charge model: destination charges on the platform PaymentIntent with
 * `transfer_data.destination` + `application_fee_amount` (see checkout route).
 * Merchant of record for the buyer: the platform; funds split to the connected
 * account; Stripe processing fees typically on the connected account balance
 * per Express defaults; refunds/disputes handled on the platform PI with
 * transfer reversal semantics Stripe applies for destination charges.
 *
 * Account type: Express (existing production accounts). Embedded Connect
 * components (account onboarding, management, balances, payouts) avoid sending
 * creators to full Stripe Dashboard for day-to-day tasks. No OAuth /
 * STRIPE_CONNECT_CLIENT_ID required.
 *
 * Payouts: manual schedule enforced server-side (Storelib cash-out model).
 */

export type StripeConnectEnv = "sandbox" | "production"

export function stripeConnectEnv(): StripeConnectEnv {
  const key = process.env.STRIPE_SECRET_KEY ?? ""
  return key.includes("_test_") ? "sandbox" : "production"
}

export function stripePublishableKey(): string | null {
  const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  return k || null
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && stripePublishableKey())
}

/** Capabilities Storelib actually uses (marketplace card checkout + transfers). */
export const STRIPE_REQUESTED_CAPABILITIES = ["card_payments", "transfers"] as const

/**
 * The countries outside Stripe's cross-border region the owner has opened
 * (lib/payments/stripe/payout-regions, the settlement path): turned on in the
 * Stripe Dashboard first, then listed here, e.g. "AU,NZ,JP,HK,SG,AE".
 * Unset, none are open and setup says so before anything is opened.
 */
export function settlementCountries(): string[] {
  return settlementCountriesFrom(process.env.STRIPE_SETTLEMENT_COUNTRIES)
}

/**
 * A sale for a seller whose account is in this country must be made
 * on_behalf_of it (the settlement path). For checkout, without a Stripe call:
 * the platform's country from STRIPE_PLATFORM_COUNTRY, and when that is
 * unset, any opened country outside the cross-border region.
 */
export function sellerSettles(accountCountry: string | null | undefined): boolean {
  const opened = settlementCountries()
  if (!opened.length || !accountCountry) return false
  const platform = (process.env.STRIPE_PLATFORM_COUNTRY ?? "").trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(platform)) return settlesInSellerCountry(platform, accountCountry, opened)
  const c = accountCountry.trim().toUpperCase()
  return opened.includes(c) && !CROSS_BORDER_REGION.has(c)
}
