import {
  FEE_RULE_VERSION,
  FREE_MICRO_RATE,
  FREE_STANDARD_RATE,
  PAID_MICRO_RATE,
  PAID_STANDARD_RATE,
  type PricingTier,
  type StorelibSellerPlan,
} from "./config"
import { feeRuleForCurrency, normalizeChargeCurrency, UnsupportedFeeCurrencyError } from "./currency-rules"

export { UnsupportedFeeCurrencyError } from "./currency-rules"

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

export function calculateStorelibFee(input: StorelibFeeInput): StorelibFeeResult {
  const gross = Math.max(0, Math.floor(input.grossMinor))
  const currency = normalizeChargeCurrency(input.currency)
  const rule = feeRuleForCurrency(currency)
  const micro = gross < rule.microThresholdMinor
  const plan = input.sellerPlan

  const percentageRate = micro
    ? plan === "paid"
      ? PAID_MICRO_RATE
      : FREE_MICRO_RATE
    : plan === "paid"
      ? PAID_STANDARD_RATE
      : FREE_STANDARD_RATE

  const fixedFeeMinor = micro ? 0 : rule.fixedFeeMinor

  const percentageFeeMinor = Math.round(gross * percentageRate)
  const totalStorelibFeeMinor = Math.max(0, Math.min(gross, percentageFeeMinor + fixedFeeMinor))
  const creatorProceedsMinor = gross - totalStorelibFeeMinor

  return {
    grossMinor: gross,
    currency,
    plan,
    pricingTier: micro ? "micro" : "standard",
    percentageRate,
    percentageFeeMinor,
    fixedFeeMinor,
    totalStorelibFeeMinor,
    creatorProceedsMinor,
    feeRuleVersion: FEE_RULE_VERSION,
  }
}
