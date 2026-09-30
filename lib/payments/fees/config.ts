/**
 * Central Storelib platform fee configuration (USD basis for thresholds).
 * All rates are decimals (0.06 = 6%). Amounts in integer USD cents unless noted.
 */

export const FREE_STANDARD_RATE = 0.06
/** 12.25% — continuous with 6% + $0.25 at exactly $4.00 */
export const FREE_MICRO_RATE = 0.1225

/** Paid Storelib plan (Growth / Pro) */
export const PAID_STANDARD_RATE = 0.03
/** 9.25% — continuous with 3% + $0.25 at exactly $4.00 */
export const PAID_MICRO_RATE = 0.0925

export const FEE_RULE_VERSION = "2026-03-storelib-v2-per-currency"

export type StorelibSellerPlan = "free" | "paid"
export type PricingTier = "standard" | "micro"
