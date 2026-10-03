/**
 * Central Storelib platform fee configuration (USD basis for thresholds).
 * Rates are decimals (0.05 = 5%). Prefer {@link codeDefaultFeeConfig} / DB active config for full rules;
 * these four are kept equal to it (tests/fees-free-plan.test.ts holds them together).
 */

export { CODE_FEE_RULE_VERSION as FEE_RULE_VERSION } from "./defaults"
export type { StorelibSellerPlan, PricingTier } from "./types"

export const FREE_STANDARD_RATE = 0.05
export const FREE_MICRO_RATE = 0.1125
export const PAID_STANDARD_RATE = 0.03
export const PAID_MICRO_RATE = 0.0925

/** A rate as people read it: 0.05 is "5%", 0.1125 is "11.25%". For copy that names the fee, so the words come from the same number checkout charges. */
export function ratePercentLabel(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`
}
