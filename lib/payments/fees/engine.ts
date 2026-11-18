import { decimalsOf } from "@/lib/payments/money"

import { codeDefaultFeeConfig, CODE_SCALE_MICRO_RATE, CODE_SCALE_STANDARD_RATE } from "./defaults"
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

  /* Scale's rate from the version when it has one, else the code's (a version stored before Scale had its own rate). */
  const scaleOk = (r: number | undefined): r is number => typeof r === "number" && Number.isFinite(r) && r >= 0 && r < 1
  const percentageRate =
    plan === "scale"
      ? micro
        ? scaleOk(config.scaleMicroRate) ? config.scaleMicroRate : CODE_SCALE_MICRO_RATE
        : scaleOk(config.scaleStandardRate) ? config.scaleStandardRate : CODE_SCALE_STANDARD_RATE
      : micro
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
