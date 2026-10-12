/**
 * Explicit per-currency Storelib fee thresholds and fixed fees.
 * Minor units only. No FX conversion at fee time — every selling currency is configured.
 *
 * USD basis: micro threshold = $4.00 (400 cents), fixed = $0.25 (25 cents).
 * Other currencies use the same economic equivalents (documented at config time).
 */

import { decimalsOf } from "@/lib/payments/money"

export interface CurrencyFeeRule {
  /** ISO 4217 */
  currency: string
  /** Gross below this (in minor units) uses micro tier. At or above uses standard + fixed. */
  microThresholdMinor: number
  /** Standard-tier fixed platform fee in this currency's minor units. Zero-decimal: whole units. */
  fixedFeeMinor: number
}

/**
 * Storelib checkout / charge currencies. If a currency is not listed, checkout must fail fee calculation.
 * (Extend this table when enabling a new charge currency — never guess.)
 */
export const CURRENCY_FEE_RULES: Record<string, CurrencyFeeRule> = {
  USD: { currency: "USD", microThresholdMinor: 400, fixedFeeMinor: 25 },
  /** ~$4.00 / ~$0.25 at 4.6 RON/USD (platform listing convention). */
  RON: { currency: "RON", microThresholdMinor: 1840, fixedFeeMinor: 115 },
  /** ~$4.00 / ~$0.25 at 0.92 EUR/USD */
  EUR: { currency: "EUR", microThresholdMinor: 368, fixedFeeMinor: 23 },
  GBP: { currency: "GBP", microThresholdMinor: 316, fixedFeeMinor: 20 },
  CAD: { currency: "CAD", microThresholdMinor: 544, fixedFeeMinor: 34 },
  AUD: { currency: "AUD", microThresholdMinor: 600, fixedFeeMinor: 38 },
  /** Zero-decimal — thresholds in whole yen */
  JPY: { currency: "JPY", microThresholdMinor: 600, fixedFeeMinor: 40 },
}

export class UnsupportedFeeCurrencyError extends Error {
  readonly currency: string
  constructor(currency: string) {
    super(`Payments are not configured for currency ${currency}.`)
    this.name = "UnsupportedFeeCurrencyError"
    this.currency = currency
  }
}

export function feeRuleForCurrency(currency: string): CurrencyFeeRule {
  const key = currency.trim().toUpperCase()
  const rule = CURRENCY_FEE_RULES[key]
  if (!rule) throw new UnsupportedFeeCurrencyError(key)
  const d = decimalsOf(key)
  if (d === 0) {
    if (!Number.isInteger(rule.microThresholdMinor) || !Number.isInteger(rule.fixedFeeMinor)) {
      throw new Error(`Invalid zero-decimal fee rule for ${key}`)
    }
  }
  return rule
}

export function normalizeChargeCurrency(currency: string): string {
  return currency.trim().toUpperCase()
}

/** Charge currency from platform checkout (lowercase ISO). */
export function platformChargeCurrency(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_PLATFORM_CURRENCY || "ron").toLowerCase()
  return fromEnv === "usd" ? "usd" : "ron"
}

/**
 * WHAT A STORE'S OWN CHECKOUT CHARGES IN: the store's currency
 * (creators.payout_currency, lib/store/currency), the one its products are
 * priced in and its website shows. A store priced in euros was shown €25 on
 * its website and then charged 25 in the platform's currency at checkout.
 * Stripe takes a destination charge in any of these and settles it to the
 * seller's own currency. A store currency with no fee rule above (CHF, SEK,
 * NOK, NZD today: adding one is a new fee rule version, supabase/sql run-now)
 * falls back to the platform's, as every checkout did before. Lowercase, as Stripe
 * wants it.
 *
 * The store's own checkouts only (its website's basket and its physical
 * checkout). Creator pages and communities stay in the platform's currency.
 */
export function storeChargeCurrency(storeCurrency: unknown): string {
  const code = typeof storeCurrency === "string" ? storeCurrency.trim().toUpperCase() : ""
  return /^[A-Z]{3}$/.test(code) && CURRENCY_FEE_RULES[code] ? code.toLowerCase() : platformChargeCurrency()
}

export function platformChargeCurrencyUpper(): string {
  return normalizeChargeCurrency(platformChargeCurrency())
}
