/**
 * Central Storelib platform fee configuration (USD basis for thresholds).
 * Rates are decimals (0.06 = 6%). Prefer {@link codeDefaultFeeConfig} / DB active config for full rules.
 */

export { CODE_FEE_RULE_VERSION as FEE_RULE_VERSION } from "./defaults"
export type { StorelibSellerPlan, PricingTier } from "./types"

export const FREE_STANDARD_RATE = 0.06
export const FREE_MICRO_RATE = 0.1225
export const PAID_STANDARD_RATE = 0.03
export const PAID_MICRO_RATE = 0.0925
