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

/**
 * What is sold: a download, course, membership, community or tip is
 * "digital"; a product that ships (products.type "physical") is "physical".
 * Physical sales pay a lower card rate on Free and Grow
 * (lib/payments/fees/defaults.ts).
 */
export type StorelibProductKind = "digital" | "physical"

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
  /**
   * The rates for a physical sale (pricing round: physical card rates).
   * Optional for the same reason as Scale's: a version stored before
   * physical sales had their own rates has none, and the code's physical
   * rates apply to that part of a sale (lib/payments/fees/engine.ts), never
   * the digital ones and never a crash.
   */
  freePhysicalStandardRate?: number
  freePhysicalMicroRate?: number
  paidPhysicalStandardRate?: number
  paidPhysicalMicroRate?: number
  scalePhysicalStandardRate?: number
  scalePhysicalMicroRate?: number
  currencies: CurrencyFeeRuleConfig[]
}

export interface StorelibFeeInput {
  grossMinor: number
  currency: string
  sellerPlan: StorelibSellerPlan
  /** What is sold. Defaults to "digital", the rate every sale paid before physical rates existed. */
  productKind?: StorelibProductKind
  /**
   * A basket with both kinds: how much of `grossMinor` is physical goods
   * (and what ships with them). Overrides `productKind` when given. The
   * basket is one charge, so its tier (and its one fixed fee) is decided by
   * the whole gross, and each part pays its own kind's percentage.
   */
  physicalMinor?: number
}

export interface StorelibFeeResult {
  grossMinor: number
  currency: string
  plan: StorelibSellerPlan
  pricingTier: PricingTier
  /** "mixed" for a basket with both kinds. */
  productKind: StorelibProductKind | "mixed"
  /** The part of the gross charged at the physical rate. */
  physicalMinor: number
  /** The rate charged: the kind's own, or for a mixed basket the two weighted by their parts. */
  percentageRate: number
  percentageFeeMinor: number
  fixedFeeMinor: number
  totalStorelibFeeMinor: number
  creatorProceedsMinor: number
  feeRuleVersion: string
}
