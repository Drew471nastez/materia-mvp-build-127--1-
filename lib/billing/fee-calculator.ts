import type { SupabaseClient } from "@supabase/supabase-js"

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
}

export interface SubscriptionPlan {
  id: string
  name: string
  fee_percent: number
  fee_fixed_cents: number
}

type SellerPlan = "free" | "growth" | "pro"

// ────────────────────────────────────────────────────────────────
// HARDCODED FEE CONSTANTS — single source of truth
// NEVER read fee_percent from the database; always use these.
// ────────────────────────────────────────────────────────────────

const PLAN_FEE_PERCENT: Record<SellerPlan, number> = {
  free: 0.06,   // 6%
  growth: 0.03, // 3%
  pro: 0.015,   // 1.5%
}

const PLAN_NAMES: Record<SellerPlan, string> = {
  free: "Free",
  growth: "Growth",
  pro: "Professional",
}

// $0.25 fixed fee — ONLY applied when order amount >= $3.00 (300 cents)
const FIXED_FEE_CENTS = 25
const FIXED_FEE_THRESHOLD_CENTS = 300

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
  const percent = PLAN_FEE_PERCENT[sellerPlan] ?? PLAN_FEE_PERCENT.free
  const percentFee = Math.round(unitAmount * percent)
  const fixedFee = unitAmount >= FIXED_FEE_THRESHOLD_CENTS ? FIXED_FEE_CENTS : 0
  const applicationFee = percentFee + fixedFee

  // Clamp: never negative, never exceed total charge
  return Math.max(0, Math.min(applicationFee, unitAmount))
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

  const feePercent = PLAN_FEE_PERCENT[effectivePlan]
  const percentFeeCents = Math.round(amountCents * feePercent)
  const fixedFeeCents = amountCents >= FIXED_FEE_THRESHOLD_CENTS ? FIXED_FEE_CENTS : 0
  const totalFeeCents = percentFeeCents + fixedFeeCents

  // Clamp: never negative, never exceed total charge
  const platformFeeCents = Math.max(0, Math.min(totalFeeCents, amountCents))
  const sellerReceivesCents = amountCents - platformFeeCents

  console.log("[fee-calc] Fee computation:", {
    plan: effectivePlan,
    amountCents,
    feePercent: `${(feePercent * 100).toFixed(2)}%`,
    percentFeeCents,
    fixedFeeCents,
    totalFeeCents,
    platformFeeCents,
    sellerReceivesCents,
  })

  return {
    platformFeeCents,
    feePercent,
    feeFixedCents: fixedFeeCents,
    sellerReceivesCents,
    planId: effectivePlan,
    planName: PLAN_NAMES[effectivePlan],
  }
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
  const feePercent = PLAN_FEE_PERCENT[resolved]
  const feeFixedCents = amountCents >= FIXED_FEE_THRESHOLD_CENTS ? FIXED_FEE_CENTS : 0

  const percentageFeeCents = Math.round(amountCents * feePercent)
  const totalFeeCents = percentageFeeCents + feeFixedCents

  // Clamp: never negative, never exceed total charge
  const platformFeeCents = Math.max(0, Math.min(totalFeeCents, amountCents))
  const sellerReceivesCents = amountCents - platformFeeCents

  return {
    platformFeeCents,
    feePercent,
    feeFixedCents,
    sellerReceivesCents,
    planId: resolved,
    planName: PLAN_NAMES[resolved],
  }
}

// ────────────────────────────────────────────────────────────────
// getFeePreview — UI helper, no DB query
// ────────────────────────────────────────────────────────────────

export function getFeePreview(
  amountCents: number,
  planId: "free" | "growth" | "pro",
): FeeCalculation {
  const resolved = resolveSellerPlan(planId)
  const feePercent = PLAN_FEE_PERCENT[resolved]
  const fixedFee = amountCents >= FIXED_FEE_THRESHOLD_CENTS ? FIXED_FEE_CENTS : 0
  const percentFee = Math.round(amountCents * feePercent)
  const totalFee = percentFee + fixedFee
  const platformFeeCents = Math.max(0, Math.min(totalFee, amountCents))

  return {
    platformFeeCents,
    feePercent,
    feeFixedCents: fixedFee,
    sellerReceivesCents: amountCents - platformFeeCents,
    planId: resolved,
    planName: PLAN_NAMES[resolved],
  }
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
    free: "6% + $0.25 per transaction",
    growth: "3% + $0.25 per transaction",
    pro: "1.5% + $0.25 per transaction",
  }
  return descriptions[planId] || descriptions.free
}
