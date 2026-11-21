/**
 * Pure payment simulation — no Stripe, no DB, no money movement.
 */

import { calculateStorelibFeeWithConfig } from "./engine"
import type { StorelibFeeConfig, StorelibFeeResult, StorelibProductKind, StorelibSellerPlan } from "./types"

export type SimulationKind = "one_time" | "subscription"
export type RefundScenario = "none" | "full" | "partial"

export interface PaymentSimulationInput {
  sellerPlan: StorelibSellerPlan
  grossMinor: number
  currency: string
  /** Digital (the default) or physical: physical sales have their own rates. */
  productKind?: StorelibProductKind
  kind: SimulationKind
  refund: RefundScenario
  partialRefundMinor?: number
  config: StorelibFeeConfig
  /** Known Stripe processing fee from a real order (optional). */
  knownStripeProcessingFeeMinor?: number | null
}

export interface PaymentSimulationResult {
  simulationOnly: true
  fee: StorelibFeeResult
  grossCustomerPaymentMinor: number
  storelibMarginMinor: number | null
  stripeProcessingFeeLabel: string
  stripeProcessingFeeMinor: number | null
  creatorProceedsBeforeProcessorMinor: number
  refundScenario: RefundScenario
  kind: SimulationKind
}

export function simulatePayment(input: PaymentSimulationInput): PaymentSimulationResult {
  const fee = calculateStorelibFeeWithConfig(
    { grossMinor: input.grossMinor, currency: input.currency, sellerPlan: input.sellerPlan, productKind: input.productKind },
    input.config,
  )

  let gross = fee.grossMinor
  if (input.refund === "full") gross = 0
  if (input.refund === "partial") {
    const partial = Math.max(0, Math.min(gross, Math.floor(input.partialRefundMinor ?? 0)))
    gross = gross - partial
  }

  const stripeKnown =
    input.knownStripeProcessingFeeMinor != null && Number.isFinite(input.knownStripeProcessingFeeMinor)
      ? Math.max(0, Math.floor(input.knownStripeProcessingFeeMinor))
      : null

  const storelibMarginMinor = stripeKnown != null ? fee.totalStorelibFeeMinor - stripeKnown : null

  return {
    simulationOnly: true,
    fee,
    grossCustomerPaymentMinor: input.refund === "none" ? fee.grossMinor : gross,
    creatorProceedsBeforeProcessorMinor: fee.creatorProceedsMinor,
    stripeProcessingFeeMinor: stripeKnown,
    stripeProcessingFeeLabel: stripeKnown != null ? "From recorded transaction" : "Not available in simulation",
    storelibMarginMinor,
    refundScenario: input.refund,
    kind: input.kind,
  }
}

export interface BatchSimulationRow {
  priceMinor: number
  tier: string
  storelibFeeMinor: number
  creatorProceedsMinor: number
  effectiveStorelibPercent: number
  flags: string[]
}

export function batchSimulate(params: {
  startMinor: number
  endMinor: number
  incrementMinor: number
  currency: string
  sellerPlan: StorelibSellerPlan
  productKind?: StorelibProductKind
  config: StorelibFeeConfig
  safetyEffectivePercent?: number
}): BatchSimulationRow[] {
  const start = Math.max(0, Math.floor(params.startMinor))
  const end = Math.max(start, Math.floor(params.endMinor))
  const step = Math.max(1, Math.floor(params.incrementMinor))
  const safety = params.safetyEffectivePercent ?? 0.5
  const rows: BatchSimulationRow[] = []
  let prevFee: number | null = null

  for (let price = start; price <= end; price += step) {
    const fee = calculateStorelibFeeWithConfig(
      { grossMinor: price, currency: params.currency, sellerPlan: params.sellerPlan, productKind: params.productKind },
      params.config,
    )
    const effective = price > 0 ? fee.totalStorelibFeeMinor / price : 0
    const flags: string[] = []
    if (prevFee != null && fee.totalStorelibFeeMinor - prevFee > Math.max(5, Math.round(price * 0.05))) {
      flags.push("fee_jump")
    }
    if (fee.creatorProceedsMinor <= 0) flags.push("creator_proceeds_zero")
    if (effective > safety) flags.push("high_effective_fee")
    prevFee = fee.totalStorelibFeeMinor
    rows.push({
      priceMinor: price,
      tier: fee.pricingTier,
      storelibFeeMinor: fee.totalStorelibFeeMinor,
      creatorProceedsMinor: fee.creatorProceedsMinor,
      effectiveStorelibPercent: effective,
      flags,
    })
  }
  return rows
}
