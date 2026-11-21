import { decimalsOf } from "@/lib/payments/money"

import {
  codeDefaultFeeConfig,
  CODE_FREE_PHYSICAL_MICRO_RATE,
  CODE_FREE_PHYSICAL_STANDARD_RATE,
  CODE_PAID_PHYSICAL_MICRO_RATE,
  CODE_PAID_PHYSICAL_STANDARD_RATE,
  CODE_SCALE_MICRO_RATE,
  CODE_SCALE_PHYSICAL_MICRO_RATE,
  CODE_SCALE_PHYSICAL_STANDARD_RATE,
  CODE_SCALE_STANDARD_RATE,
} from "./defaults"
import { normalizeChargeCurrency, UnsupportedFeeCurrencyError } from "./currency-rules"
import type { PricingTier, StorelibFeeConfig, StorelibFeeInput, StorelibFeeResult, StorelibProductKind, StorelibSellerPlan } from "./types"

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

/** A stored rate this engine will charge: a number from 0 up to, not including, 1. */
const rateOk = (r: unknown): r is number => typeof r === "number" && Number.isFinite(r) && r >= 0 && r < 1

/** The code's physical rates, for a stored version written before physical sales had their own. */
const CODE_PHYSICAL: Record<StorelibSellerPlan, { standard: number; micro: number }> = {
  free: { standard: CODE_FREE_PHYSICAL_STANDARD_RATE, micro: CODE_FREE_PHYSICAL_MICRO_RATE },
  paid: { standard: CODE_PAID_PHYSICAL_STANDARD_RATE, micro: CODE_PAID_PHYSICAL_MICRO_RATE },
  scale: { standard: CODE_SCALE_PHYSICAL_STANDARD_RATE, micro: CODE_SCALE_PHYSICAL_MICRO_RATE },
}

/**
 * The percentage a plan pays on one kind of sale, in one tier. Digital reads
 * the version's own rates (Scale's from the code when the version has none,
 * as before). Physical reads the version's physical rates, each one from the
 * code when the version has none or a broken one: a version stored before
 * physical rates existed charges physical sales the code's physical rates,
 * never its digital ones, and never throws.
 */
export function percentageRateFor(config: StorelibFeeConfig, plan: StorelibSellerPlan, kind: StorelibProductKind, tier: PricingTier): number {
  const micro = tier === "micro"
  if (kind === "physical") {
    const stored =
      plan === "scale"
        ? micro ? config.scalePhysicalMicroRate : config.scalePhysicalStandardRate
        : plan === "paid"
          ? micro ? config.paidPhysicalMicroRate : config.paidPhysicalStandardRate
          : micro ? config.freePhysicalMicroRate : config.freePhysicalStandardRate
    return rateOk(stored) ? stored : micro ? CODE_PHYSICAL[plan].micro : CODE_PHYSICAL[plan].standard
  }
  /* Scale's rate from the version when it has one, else the code's (a version stored before Scale had its own rate). */
  if (plan === "scale") {
    return micro
      ? rateOk(config.scaleMicroRate) ? config.scaleMicroRate : CODE_SCALE_MICRO_RATE
      : rateOk(config.scaleStandardRate) ? config.scaleStandardRate : CODE_SCALE_STANDARD_RATE
  }
  return micro
    ? plan === "paid" ? config.paidMicroRate : config.freeMicroRate
    : plan === "paid" ? config.paidStandardRate : config.freeStandardRate
}

export function calculateStorelibFeeWithConfig(input: StorelibFeeInput, config: StorelibFeeConfig = codeDefaultFeeConfig()): StorelibFeeResult {
  const gross = Math.max(0, Math.floor(input.grossMinor))
  const currency = normalizeChargeCurrency(input.currency)
  const rule = ruleForCurrency(config, currency)
  const micro = gross < rule.microThresholdMinor
  const tier: PricingTier = micro ? "micro" : "standard"
  const plan = input.sellerPlan

  /*
    Which part of the gross is physical. A whole sale of one kind is all one
    or the other; a basket says its physical part. The basket is one charge,
    so its tier and its one fixed fee are decided by the whole gross, and
    each part pays its own kind's percentage, rounded once for the charge.
    A sale of one kind is worked out exactly as before.
  */
  const requested = input.physicalMinor != null && Number.isFinite(input.physicalMinor) ? Math.floor(input.physicalMinor) : input.productKind === "physical" ? gross : 0
  const physicalMinor = Math.max(0, Math.min(gross, requested))
  const digitalMinor = gross - physicalMinor
  const productKind: StorelibFeeResult["productKind"] = physicalMinor === 0 ? (input.productKind === "physical" && gross === 0 ? "physical" : "digital") : digitalMinor === 0 ? "physical" : "mixed"

  const digitalRate = percentageRateFor(config, plan, "digital", tier)
  const physicalRate = percentageRateFor(config, plan, "physical", tier)
  const percentageRate =
    productKind === "physical" ? physicalRate : productKind === "digital" ? digitalRate : (digitalMinor * digitalRate + physicalMinor * physicalRate) / gross

  const fixedFeeMinor = micro ? 0 : rule.fixedFeeMinor
  const percentageFeeMinor = Math.round(digitalMinor * digitalRate + physicalMinor * physicalRate)
  const totalStorelibFeeMinor = Math.max(0, Math.min(gross, percentageFeeMinor + fixedFeeMinor))
  const creatorProceedsMinor = gross - totalStorelibFeeMinor

  return {
    grossMinor: gross,
    currency,
    plan,
    pricingTier: tier,
    productKind,
    physicalMinor,
    percentageRate,
    percentageFeeMinor,
    fixedFeeMinor,
    totalStorelibFeeMinor,
    creatorProceedsMinor,
    feeRuleVersion: config.versionKey,
  }
}
