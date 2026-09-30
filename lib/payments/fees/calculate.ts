import {
  FEE_RULE_VERSION,
  FREE_FIXED_FEE_USD_CENTS,
  FREE_MICRO_RATE,
  FREE_STANDARD_RATE,
  MICRO_TRANSACTION_THRESHOLD_USD_CENTS,
  PAID_FIXED_FEE_USD_CENTS,
  PAID_MICRO_RATE,
  PAID_STANDARD_RATE,
  type PricingTier,
  type StorelibSellerPlan,
} from "./config"

export interface StorelibFeeInput {
  /** Gross charge in smallest currency unit (checkout currently prices in USD cents). */
  grossMinor: number
  /** ISO currency code for persistence; fee math uses grossMinor as authoritative. */
  currency: string
  sellerPlan: StorelibSellerPlan
  /** When set, threshold/fixed fee use this USD-cent equivalent of gross (for non-USD later). */
  grossUsdCents?: number
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

function resolveUsdCents(input: StorelibFeeInput): number {
  if (typeof input.grossUsdCents === "number" && input.grossUsdCents >= 0) return input.grossUsdCents
  const cur = input.currency.toUpperCase()
  if (cur === "USD") return input.grossMinor
  /* Checkout is USD today; without a deterministic FX table we treat minor as USD for fee tiers. */
  return input.grossMinor
}

export function calculateStorelibFee(input: StorelibFeeInput): StorelibFeeResult {
  const gross = Math.max(0, Math.floor(input.grossMinor))
  const usdCents = resolveUsdCents(input)
  const micro = usdCents < MICRO_TRANSACTION_THRESHOLD_USD_CENTS
  const plan = input.sellerPlan

  const percentageRate = micro
    ? plan === "paid"
      ? PAID_MICRO_RATE
      : FREE_MICRO_RATE
    : plan === "paid"
      ? PAID_STANDARD_RATE
      : FREE_STANDARD_RATE

  const fixedFeeMinor =
    micro ? 0 : plan === "paid" ? PAID_FIXED_FEE_USD_CENTS : FREE_FIXED_FEE_USD_CENTS

  const percentageFeeMinor = Math.round(gross * percentageRate)
  const totalStorelibFeeMinor = Math.max(0, Math.min(gross, percentageFeeMinor + fixedFeeMinor))
  const creatorProceedsMinor = gross - totalStorelibFeeMinor

  return {
    grossMinor: gross,
    currency: input.currency.toUpperCase(),
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
