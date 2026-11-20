/**
 * Central Storelib platform fee configuration (USD basis for thresholds).
 * Rates are decimals (0.05 = 5%). Prefer {@link codeDefaultFeeConfig} / DB active config for full rules;
 * these are kept equal to it (tests/fees-free-plan.test.ts holds them together).
 */

export { CODE_FEE_RULE_VERSION as FEE_RULE_VERSION } from "./defaults"
export type { StorelibSellerPlan, PricingTier, StorelibProductKind } from "./types"
import {
  CODE_FREE_PHYSICAL_MICRO_RATE,
  CODE_FREE_PHYSICAL_STANDARD_RATE,
  CODE_PAID_PHYSICAL_MICRO_RATE,
  CODE_PAID_PHYSICAL_STANDARD_RATE,
  CODE_SCALE_PHYSICAL_MICRO_RATE,
  CODE_SCALE_PHYSICAL_STANDARD_RATE,
} from "./defaults"

export const FREE_STANDARD_RATE = 0.05
export const FREE_MICRO_RATE = 0.1125
export const PAID_STANDARD_RATE = 0.03
export const PAID_MICRO_RATE = 0.0925
/** Scale (plan id `pro`): its own rate since wave 13. */
export const SCALE_STANDARD_RATE = 0.015
export const SCALE_MICRO_RATE = 0.0775

/**
 * PHYSICAL SALES (a product that ships), each plus the fixed fee at the
 * threshold and up: Free 3%, Grow (paid tier) 1.5%, Pro (scale tier) 1.5%.
 * Under the threshold a physical sale pays the NEXT plan's small-order rate:
 * Free physical is PAID_MICRO_RATE (9.25%), Grow physical is
 * SCALE_MICRO_RATE (7.75%), Pro physical is unchanged (7.75%). Digital
 * sales keep the rates above. Kept equal to lib/payments/fees/defaults.ts.
 */
export const FREE_PHYSICAL_STANDARD_RATE = CODE_FREE_PHYSICAL_STANDARD_RATE
export const FREE_PHYSICAL_MICRO_RATE = CODE_FREE_PHYSICAL_MICRO_RATE
export const PAID_PHYSICAL_STANDARD_RATE = CODE_PAID_PHYSICAL_STANDARD_RATE
export const PAID_PHYSICAL_MICRO_RATE = CODE_PAID_PHYSICAL_MICRO_RATE
export const SCALE_PHYSICAL_STANDARD_RATE = CODE_SCALE_PHYSICAL_STANDARD_RATE
export const SCALE_PHYSICAL_MICRO_RATE = CODE_SCALE_PHYSICAL_MICRO_RATE

/** A rate as people read it: 0.05 is "5%", 0.1125 is "11.25%". For copy that names the fee, so the words come from the same number checkout charges. */
export function ratePercentLabel(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`
}
