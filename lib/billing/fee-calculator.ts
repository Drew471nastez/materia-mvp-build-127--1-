import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateStorelibFee, type StorelibFeeResult } from "@/lib/payments/fees/calculate"
import type { StorelibSellerPlan } from "@/lib/payments/fees/config"

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
// Rules:
//   percent_fee    = round(unitAmount × planPercent)
//   fixed_fee      = 25c IF unitAmount >= 300c ($3.00), else 0
//   application_fee = percent_fee + fixed_fee
//   Clamped to [0, unitAmount]
//
// Examples:
//   Free  $1.00 (100c) → 6%=6c,  fixed=0   → 6c
//   Free  $3.00 (300c) → 6%=18c, fixed=25c  → 43c
//   Free  $10   (1000c)→ 6%=60c, fixed=25c  → 85c
//   Growth $1   (100c) → 3%=3c,  fixed=0    → 3c
//   Growth $3   (300c) → 3%=9c,  fixed=25c  → 34c
//   Growth $10  (1000c)→ 3%=30c, fixed=25c  → 55c
//   Pro   $1    (100c) → 1.5%=2c, fixed=0   → 2c
//   Pro   $3    (300c) → 1.5%=5c, fixed=25c → 30c
//   Pro   $10   (1000c)→ 1.5%=15c,fixed=25c → 40c
// ────────────────────────────────────────────────────────────────

export function computeApplicationFee({
  unitAmount,
  sellerPlan,
}: {
  unitAmount: number
  sellerPlan: SellerPlan
}): number {
  return calculateStorelibFee({
    grossMinor: unitAmount,
    currency: "USD",
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

  const fee = calculateStorelibFee({
    grossMinor: amountCents,
    currency: "USD",
    sellerPlan: toStorelibPlan(effectivePlan),
  })

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
): FeeCalculation {
  // ALWAYS use hardcoded fee percent based on plan ID
  const resolved = resolveSellerPlan(plan.id)
  return fromStorelibFee(
    calculateStorelibFee({
      grossMinor: amountCents,
      currency: "USD",
      sellerPlan: toStorelibPlan(resolved),
    }),
    resolved,
  )
}

// ────────────────────────────────────────────────────────────────
// getFeePreview — UI helper, no DB query
// ────────────────────────────────────────────────────────────────

export function getFeePreview(
  amountCents: number,
  planId: "free" | "growth" | "pro",
): FeeCalculation {
  const resolved = resolveSellerPlan(planId)
  return fromStorelibFee(
    calculateStorelibFee({
      grossMinor: amountCents,
      currency: "USD",
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
    free: "6% + $0.25 per sale ($4+); 12.25% under $4",
    growth: "3% + $0.25 per sale ($4+); 9.25% under $4",
    pro: "3% + $0.25 per sale ($4+); 9.25% under $4",
  }
  return descriptions[planId] || descriptions.free
}
