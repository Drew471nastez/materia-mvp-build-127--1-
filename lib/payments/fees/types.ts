/**
 * Central fee configuration model (code defaults + DB versions share this shape).
 */

export type StorelibSellerPlan = "free" | "paid"
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
