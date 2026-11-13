/**
 * Central fee configuration model (code defaults + DB versions share this shape).
 */

/**
 * The fee tiers. "paid" is Pro (plan id `growth`), "scale" is Scale (plan id
 * `pro`, the $99 plan). "paid" keeps its old name because stored fee
 * versions (storelib_fee_rule_versions.config) and the admin tools use it.
 */
export type StorelibSellerPlan = "free" | "paid" | "scale"
export type PricingTier = "standard" | "micro"

export interface CurrencyFeeRuleConfig {
  currency: string
  microThresholdMinor: number
  fixedFeeMinor: number
  enabled: boolean
}

export interface StorelibFeeConfig {
  versionKey: string
  freeStandardRate: number
  freeMicroRate: number
  paidStandardRate: number
  paidMicroRate: number
  /**
   * Scale's rates. Optional: a version stored before Scale had its own rate
   * has none, and the code's rates apply (lib/payments/fees/engine.ts), so
   * Scale is charged its rate whichever version is active.
   */
  scaleStandardRate?: number
  scaleMicroRate?: number
  currencies: CurrencyFeeRuleConfig[]
}

export interface StorelibFeeInput {
  grossMinor: number
  currency: string
  sellerPlan: StorelibSellerPlan
}

export interface StorelibFeeResult {
  grossMinor: number
  currency: string
  plan: StorelibSellerPlan
  pricingTier: PricingTier
  percentageRate: number
  percentageFeeMinor: number
  fixedFeeMinor: number
  totalStorelibFeeMinor: number
  creatorProceedsMinor: number
  feeRuleVersion: string
}
