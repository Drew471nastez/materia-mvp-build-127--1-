import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateStorelibFee, percentageRateFor, UnsupportedFeeCurrencyError, type StorelibFeeResult } from "@/lib/payments/fees/calculate"
import type { StorelibFeeConfig, StorelibProductKind } from "@/lib/payments/fees/types"
import { codeDefaultFeeConfig } from "@/lib/payments/fees/defaults"
import { CURRENCY_FEE_RULES, platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { ratePercentLabel, type StorelibSellerPlan } from "@/lib/payments/fees/config"

export type { StorelibProductKind }

/**
 * WHAT A CHECKOUT IS CHARGING FOR, as the fee needs it. Physical sales have
 * their own card rates (lib/payments/fees/defaults.ts):
 *   "digital"                a download, course, membership, community, tip
 *   "physical"               a product that ships (products.type "physical")
 *   { physicalCents }        a basket with both: how much of the amount is
 *                            physical goods and what ships with them; the
 *                            rest is digital
 */
export type FeeKindSplit = StorelibProductKind | { physicalCents: number }

/** A product row's kind for the fee: "physical" for one that ships, else "digital". */
export function productKindOf(type: string | null | undefined): StorelibProductKind {
  return String(type ?? "").toLowerCase() === "physical" ? "physical" : "digital"
}

/**
 * THE PHYSICAL PART OF A CHARGE, for the fee (lib/physical/checkout-server):
 * the whole total less what the digital lines (a download, course or
 * membership beside shipped goods) cost after their discounts. Delivery, a
 * cash on delivery fee and the tax stay with the physical part.
 */
export function physicalPartCents(lines: readonly { type: string; unitCents: number; quantity: number; discountCents: number }[], totalCents: number): number {
  const digital = lines.filter((l) => productKindOf(l.type) === "digital").reduce((sum, l) => sum + Math.max(0, l.unitCents * l.quantity - l.discountCents), 0)
  return Math.max(0, Math.min(totalCents, totalCents - digital))
}

function splitInput(split: FeeKindSplit | undefined): { productKind?: StorelibProductKind; physicalMinor?: number } {
  if (!split) return { productKind: "digital" }
  if (typeof split === "string") return { productKind: split }
  return { physicalMinor: Math.max(0, Math.floor(Number(split.physicalCents) || 0)) }
}

// ────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────

export interface FeeCalculation {
  platformFeeCents: number
  feePercent: number
  feeFixedCents: number
  sellerReceivesCents: number
  planId: string
  planName: string
  pricingTier?: "standard" | "micro"
  feeRuleVersion?: string
  /** What the fee was worked out for: "mixed" for a basket with both kinds. */
  productKind?: StorelibProductKind | "mixed"
}

export interface SubscriptionPlan {
  id: string
  name: string
  fee_percent: number
  fee_fixed_cents: number
}

type SellerPlan = "free" | "growth" | "pro"

const PLAN_NAMES: Record<SellerPlan, string> = {
  free: "Free",
  growth: "Grow",
  pro: "Pro",
}

/**
 * The fee tier for a plan id: Free pays Free's rate, Grow (id `growth`) the
 * paid rate, and Pro (id `pro`, the engine's "scale" tier) its own, lower one.
 */
export function toStorelibPlan(plan: SellerPlan): StorelibSellerPlan {
  return plan === "pro" ? "scale" : plan === "growth" ? "paid" : "free"
}

function fromStorelibFee(fee: StorelibFeeResult, planId: SellerPlan): FeeCalculation {
  return {
    platformFeeCents: fee.totalStorelibFeeMinor,
    feePercent: fee.percentageRate,
    feeFixedCents: fee.fixedFeeMinor,
    sellerReceivesCents: fee.creatorProceedsMinor,
    planId,
    planName: PLAN_NAMES[planId],
    pricingTier: fee.pricingTier,
    feeRuleVersion: fee.feeRuleVersion,
    productKind: fee.productKind,
  }
}

// ────────────────────────────────────────────────────────────────
// resolveSellerPlan — maps any plan ID string to SellerPlan
// ────────────────────────────────────────────────────────────────

function resolveSellerPlan(planId: string | null | undefined): SellerPlan {
  if (!planId) return "free"
  const normalized = planId.toLowerCase().trim()
  if (normalized === "growth") return "growth"
  if (normalized === "pro" || normalized === "professional") return "pro"
  return "free"
}

// ────────────────────────────────────────────────────────────────
// computeApplicationFee — pure, no DB
//
// The rules live in lib/payments/fees (the active fee version in the
// database, or the code default when there is none). In USD:
//   $4.00 and up  → plan rate for the kind × amount + 25c
//   under $4.00   → small-order rate for the kind × amount, no fixed part
//   Clamped to [0, unitAmount]
//
// Examples (USD), digital:
//   Free  $1.00 (100c) → 11.25% = 11c         → 11c
//   Free  $3.99 (399c) → 11.25% = 45c         → 45c
//   Free  $4.00 (400c) → 5% = 20c + 25c       → 45c
//   Free  $10   (1000c)→ 5% = 50c + 25c       → 75c
//   Grow  $1.00 (100c) → 9.25% = 9c           → 9c
//   Grow  $4.00 (400c) → 3% = 12c + 25c       → 37c
//   Grow  $10   (1000c)→ 3% = 30c + 25c       → 55c
//   Pro   $1.00 (100c) → 7.75% = 8c           → 8c
//   Pro   $4.00 (400c) → 1.5% = 6c + 25c      → 31c
//   Pro   $10   (1000c)→ 1.5% = 15c + 25c     → 40c
// Physical (a product that ships). Under $4.00 it pays the next plan's
// small-order rate: Free physical 9.25%, Grow physical 7.75%, Pro unchanged.
//   Free  $3.00 (300c) → 9.25% = 28c          → 28c
//   Free  $10   (1000c)→ 3% = 30c + 25c       → 55c
//   Grow  $3.00 (300c) → 7.75% = 23c          → 23c
//   Grow  $10   (1000c)→ 1.5% = 15c + 25c     → 40c
//   Pro   $10   (1000c)→ 1.5% = 15c + 25c     → 40c
//   (Grow is the plan id `growth`, the engine's "paid" tier; Pro is the
//   plan id `pro`, the engine's "scale" tier.)
// ────────────────────────────────────────────────────────────────

export function computeApplicationFee({
  unitAmount,
  sellerPlan,
  currency,
  productKind = "digital",
}: {
  unitAmount: number
  sellerPlan: SellerPlan
  currency?: string
  productKind?: FeeKindSplit
}): number {
  return calculateStorelibFee({
    grossMinor: unitAmount,
    currency: (currency || platformChargeCurrencyUpper()).toUpperCase(),
    sellerPlan: toStorelibPlan(sellerPlan),
    ...splitInput(productKind),
  }).totalStorelibFeeMinor
}

// ────────────────────────────────────────────────────────────────
// calculatePlatformFee — fetches creator plan from DB, then
// resolves to hardcoded fees based on plan ID.
//
// @param amountCents  Total charge (product + tip)
// @param creatorId    Creator row ID
// @param admin        The service role client: the plan is a private column (run-now part 63)
// @param split        Digital, physical, or a basket's physical part (FeeKindSplit)
// ────────────────────────────────────────────────────────────────

export async function calculatePlatformFee(
  amountCents: number,
  creatorId: string,
  admin: SupabaseClient,
  currency?: string,
  feeConfig?: StorelibFeeConfig,
  split: FeeKindSplit = "digital",
): Promise<FeeCalculation> {
  let effectivePlan: SellerPlan = "free"

  try {
    // Only need the plan ID and subscription status — we do NOT use
    // fee_percent from the database; we resolve it from the ID.
    const { data: creator, error } = await admin
      .from("creators")
      .select("subscription_plan_id, subscription_status")
      .eq("id", creatorId)
      .single()

    if (error || !creator) {
      console.warn("[fee-calc] Could not fetch creator, defaulting to free:", error?.message)
    } else {
      const rawPlanId = creator.subscription_plan_id
      const status = creator.subscription_status

      // Only honour a paid plan when the subscription is active or trialing
      if (rawPlanId && rawPlanId !== "free" && ["active", "trialing"].includes(status)) {
        effectivePlan = resolveSellerPlan(rawPlanId)
      }
      // Otherwise effectivePlan stays "free"

      console.log("[fee-calc] Creator plan resolution:", {
        creatorId,
        rawPlanId,
        subscriptionStatus: status,
        effectivePlan,
      })
    }
  } catch (err: any) {
    console.error("[fee-calc] Exception fetching creator plan:", err?.message)
  }

  const chargeCurrency = (currency || platformChargeCurrencyUpper()).toUpperCase()
  const fee = calculateStorelibFee(
    {
      grossMinor: amountCents,
      currency: chargeCurrency,
      sellerPlan: toStorelibPlan(effectivePlan),
      ...splitInput(split),
    },
    feeConfig,
  )

  console.log("[fee-calc] Fee computation:", {
    plan: effectivePlan,
    amountCents,
    tier: fee.pricingTier,
    kind: fee.productKind,
    feePercent: `${(fee.percentageRate * 100).toFixed(2)}%`,
    platformFeeCents: fee.totalStorelibFeeMinor,
    sellerReceivesCents: fee.creatorProceedsMinor,
    rule: fee.feeRuleVersion,
  })

  return fromStorelibFee(fee, effectivePlan)
}

// ────────────────────────────────────────────────────────────────
// calculateFeeWithPlan — compute fee for a given plan object.
// Overrides plan.fee_percent with the hardcoded value based on ID.
// ────────────────────────────────────────────────────────────────

export function calculateFeeWithPlan(
  amountCents: number,
  plan: SubscriptionPlan,
  currency?: string,
  split: FeeKindSplit = "digital",
): FeeCalculation {
  const resolved = resolveSellerPlan(plan.id)
  return fromStorelibFee(
    calculateStorelibFee({
      grossMinor: amountCents,
      currency: (currency || platformChargeCurrencyUpper()).toUpperCase(),
      sellerPlan: toStorelibPlan(resolved),
      ...splitInput(split),
    }),
    resolved,
  )
}

export { UnsupportedFeeCurrencyError }

// ────────────────────────────────────────────────────────────────
// getFeePreview — UI helper, no DB query
// ────────────────────────────────────────────────────────────────

export function getFeePreview(
  amountCents: number,
  planId: "free" | "growth" | "pro",
  currency?: string,
  split: FeeKindSplit = "digital",
): FeeCalculation {
  const resolved = resolveSellerPlan(planId)
  return fromStorelibFee(
    calculateStorelibFee({
      grossMinor: amountCents,
      currency: (currency || platformChargeCurrencyUpper()).toUpperCase(),
      sellerPlan: toStorelibPlan(resolved),
      ...splitInput(split),
    }),
    resolved,
  )
}

// ────────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────────

export function formatFeePercent(feePercent: number): string {
  return `${(feePercent * 100).toFixed(feePercent >= 0.01 ? 1 : 2)}%`
}

export function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/*
 * THE FEE AS A PLAN CARD SAYS IT: the rate and the $0.25, nothing more.
 * Orders under $4 pay the micro rate with no $0.25 (above), so a small order
 * never pays more than one at $4. That is a rule of the fee, written out in
 * the help article and the terms; a plan card naming two tiers read as fine
 * print, so the cards say only what almost every sale pays.
 *
 * Written from the code's fee rules (lib/payments/fees/defaults), the same
 * ones checkout falls back to and run-now part 476 activates, never typed:
 * the standard rate for the plan and the kind, and the USD fixed fee.
 */

/** The standard (at $4.00 and up) rate a plan pays on a kind of sale, from the code's fee rules. */
export function standardRateFor(planId: string, kind: StorelibProductKind = "digital"): number {
  return percentageRateFor(codeDefaultFeeConfig(), toStorelibPlan(resolveSellerPlan(planId)), kind, "standard")
}

/** The small-order (under $4.00) rate a plan pays on a kind of sale, from the code's fee rules. */
export function smallOrderRateFor(planId: string, kind: StorelibProductKind = "digital"): number {
  return percentageRateFor(codeDefaultFeeConfig(), toStorelibPlan(resolveSellerPlan(planId)), kind, "micro")
}

/** "$0.25": the fixed part in US dollars, from the USD fee rule. */
export function fixedFeeLabel(): string {
  return `$${(CURRENCY_FEE_RULES.USD.fixedFeeMinor / 100).toFixed(2)}`
}

/** "$4.00": the USD sale under which the small-order rate applies, with no fixed part. */
export function smallOrderThresholdLabel(): string {
  return `$${(CURRENCY_FEE_RULES.USD.microThresholdMinor / 100).toFixed(2)}`
}

/** The kind of sale a plan charges least on at the standard rate: digital when both are the same. */
export function lowestRateKind(planId: string): StorelibProductKind {
  return standardRateFor(planId, "physical") < standardRateFor(planId, "digital") ? "physical" : "digital"
}

/** "5% + $0.25": a plan's rate on one kind of sale, with the fixed part. */
export function cardRateLabel(planId: string, kind: StorelibProductKind = "digital"): string {
  return `${ratePercentLabel(standardRateFor(planId, kind))} + ${fixedFeeLabel()}`
}

/** Whether a plan pays the same rate on digital and physical sales (Pro does). */
export function sameRateForBothKinds(planId: string): boolean {
  return standardRateFor(planId, "digital") === standardRateFor(planId, "physical") && smallOrderRateFor(planId, "digital") === smallOrderRateFor(planId, "physical")
}

/**
 * "5% + $0.25 per sale" for digital (the default), "3% + $0.25 per sale"
 * for physical. Unknown plan ids read as Free.
 */
export function getFeeDescription(planId: string, kind: StorelibProductKind = "digital"): string {
  return `${cardRateLabel(planId, kind)} per sale`
}
