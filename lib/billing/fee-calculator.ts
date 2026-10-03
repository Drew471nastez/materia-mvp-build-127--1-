import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateStorelibFee, UnsupportedFeeCurrencyError, type StorelibFeeResult } from "@/lib/payments/fees/calculate"
import type { StorelibFeeConfig } from "@/lib/payments/fees/types"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { FREE_MICRO_RATE, FREE_STANDARD_RATE, PAID_MICRO_RATE, PAID_STANDARD_RATE, ratePercentLabel, type StorelibSellerPlan } from "@/lib/payments/fees/config"

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
  growth: "Growth",
  pro: "Professional",
}

function toStorelibPlan(plan: SellerPlan): StorelibSellerPlan {
  return plan === "free" ? "free" : "paid"
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
//   $4.00 and up  → plan rate × amount + 25c
//   under $4.00   → small-order rate × amount, no fixed part
//   Clamped to [0, unitAmount]
//
// Examples (USD):
//   Free  $1.00 (100c) → 11.25% = 11c         → 11c
//   Free  $3.99 (399c) → 11.25% = 45c         → 45c
//   Free  $4.00 (400c) → 5% = 20c + 25c       → 45c
//   Free  $10   (1000c)→ 5% = 50c + 25c       → 75c
//   Pro   $1.00 (100c) → 9.25% = 9c           → 9c
//   Pro   $4.00 (400c) → 3% = 12c + 25c       → 37c
//   Pro   $10   (1000c)→ 3% = 30c + 25c       → 55c
//   (Growth is an old plan id and is charged as Pro.)
// ────────────────────────────────────────────────────────────────

export function computeApplicationFee({
  unitAmount,
  sellerPlan,
  currency,
}: {
  unitAmount: number
  sellerPlan: SellerPlan
  currency?: string
}): number {
  return calculateStorelibFee({
    grossMinor: unitAmount,
    currency: (currency || platformChargeCurrencyUpper()).toUpperCase(),
    sellerPlan: toStorelibPlan(sellerPlan),
  }).totalStorelibFeeMinor
}

// ────────────────────────────────────────────────────────────────
// calculatePlatformFee — fetches creator plan from DB, then
// resolves to hardcoded fees based on plan ID.
//
// @param amountCents  Total charge (product + tip)
// @param creatorId    Creator row ID
// @param admin        The service role client: the plan is a private column (run-now part 63)
// ────────────────────────────────────────────────────────────────

export async function calculatePlatformFee(
  amountCents: number,
  creatorId: string,
  admin: SupabaseClient,
  currency?: string,
  feeConfig?: StorelibFeeConfig,
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
    },
    feeConfig,
  )

  console.log("[fee-calc] Fee computation:", {
    plan: effectivePlan,
    amountCents,
    tier: fee.pricingTier,
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
): FeeCalculation {
  const resolved = resolveSellerPlan(plan.id)
  return fromStorelibFee(
    calculateStorelibFee({
      grossMinor: amountCents,
      currency: (currency || platformChargeCurrencyUpper()).toUpperCase(),
      sellerPlan: toStorelibPlan(resolved),
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
): FeeCalculation {
  const resolved = resolveSellerPlan(planId)
  return fromStorelibFee(
    calculateStorelibFee({
      grossMinor: amountCents,
      currency: (currency || platformChargeCurrencyUpper()).toUpperCase(),
      sellerPlan: toStorelibPlan(resolved),
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

export function getFeeDescription(planId: string): string {
  const descriptions: Record<string, string> = {
    free: `${ratePercentLabel(FREE_STANDARD_RATE)} + $0.25 per sale ($4+); ${ratePercentLabel(FREE_MICRO_RATE)} under $4`,
    growth: `${ratePercentLabel(PAID_STANDARD_RATE)} + $0.25 per sale ($4+); ${ratePercentLabel(PAID_MICRO_RATE)} under $4`,
    pro: `${ratePercentLabel(PAID_STANDARD_RATE)} + $0.25 per sale ($4+); ${ratePercentLabel(PAID_MICRO_RATE)} under $4`,
  }
  return descriptions[planId] || descriptions.free
}
