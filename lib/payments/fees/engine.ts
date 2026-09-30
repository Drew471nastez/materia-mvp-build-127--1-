import { decimalsOf } from "@/lib/payments/money"

import { codeDefaultFeeConfig } from "./defaults"
import { normalizeChargeCurrency, UnsupportedFeeCurrencyError } from "./currency-rules"
import type { StorelibFeeConfig, StorelibFeeInput, StorelibFeeResult } from "./types"

export { UnsupportedFeeCurrencyError } from "./currency-rules"

function ruleForCurrency(config: StorelibFeeConfig, currency: string) {
  const key = normalizeChargeCurrency(currency)
  const row = config.currencies.find((c) => c.currency === key && c.enabled)
  if (!row) throw new UnsupportedFeeCurrencyError(key)
  const d = decimalsOf(key)
  if (d === 0) {
    if (!Number.isInteger(row.microThresholdMinor) || !Number.isInteger(row.fixedFeeMinor)) {
      throw new Error(`Invalid zero-decimal fee rule for ${key}`)
    }
  }
  return row
}

export function calculateStorelibFeeWithConfig(input: StorelibFeeInput, config: StorelibFeeConfig = codeDefaultFeeConfig()): StorelibFeeResult {
  const gross = Math.max(0, Math.floor(input.grossMinor))
  const currency = normalizeChargeCurrency(input.currency)
  const rule = ruleForCurrency(config, currency)
  const micro = gross < rule.microThresholdMinor
  const plan = input.sellerPlan

  const percentageRate = micro
    ? plan === "paid"
      ? config.paidMicroRate
      : config.freeMicroRate
    : plan === "paid"
      ? config.paidStandardRate
      : config.freeStandardRate

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
    feeRuleVersion: config.versionKey,
  }
}
