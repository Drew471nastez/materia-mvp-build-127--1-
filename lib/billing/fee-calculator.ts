import type { SupabaseClient } from "@supabase/supabase-js"

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

// Plan fee percentages
const PLAN_FEE_PERCENT: Record<SellerPlan, number> = {
  free: 0.06,       // 6%
  growth: 0.03,     // 3%
  pro: 0.015,       // 1.5%
}

// Fixed fee in cents (only applied when unit_amount >= 300 cents / $3.00)
const FIXED_FEE_CENTS = 25
const FIXED_FEE_THRESHOLD_CENTS = 300

/**
 * Pure, reusable fee computation function.
 *
 * Rules:
 *   percent_fee   = round(unitAmount * planPercent)
 *   fixed_fee     = 25 cents  IF unitAmount >= 300 cents ($3.00), else 0
 *   application_fee = percent_fee + fixed_fee
 *   Clamped to [0, unitAmount]
 *
 * Sanity examples:
 *   Free  $1.00 (100c) → 6%=6c, fixed=0    → fee=6c
 *   Free  $3.00 (300c) → 6%=18c, fixed=25c  → fee=43c
 *   Growth $2.99 (299c)→ 3%=9c, fixed=0     → fee=9c
 *   Growth $3.00 (300c)→ 3%=9c, fixed=25c   → fee=34c
 *   Pro   $10.00(1000c)→ 1.5%=15c, fixed=25c→ fee=40c
 */
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

/**
 * Calculate platform fee based on creator's subscription plan.
 * Fetches the creator's plan from the database and computes the fee.
 */
export async function calculatePlatformFee(
  amountCents: number,
  creatorId: string,
  supabase: SupabaseClient
): Promise<FeeCalculation> {
  // Fetch creator's subscription plan
  const { data: creator, error } = await supabase
    .from("creators")
    .select(`
      subscription_plan_id,
      subscription_status,
      subscription_plans (
        id,
        name,
        fee_percent,
        fee_fixed_cents
      )
    `)
    .eq("id", creatorId)
    .single()

  if (error || !creator) {
    console.error("Error fetching creator subscription plan:", error)
    return calculateFeeWithPlan(amountCents, {
      id: "free",
      name: "Free",
      fee_percent: 0.06,
      fee_fixed_cents: FIXED_FEE_CENTS,
    })
  }

  const plan = creator.subscription_plans as unknown as SubscriptionPlan

  const creatorSubscriptionStatus = (creator as any).subscription_status
  if (creatorSubscriptionStatus && !["active", "trialing"].includes(creatorSubscriptionStatus)) {
    return calculateFeeWithPlan(amountCents, {
      id: "free",
      name: "Free",
      fee_percent: 0.06,
      fee_fixed_cents: FIXED_FEE_CENTS,
    })
  }

  if (!plan) {
    return calculateFeeWithPlan(amountCents, {
      id: "free",
      name: "Free",
      fee_percent: 0.06,
      fee_fixed_cents: FIXED_FEE_CENTS,
    })
  }

  return calculateFeeWithPlan(amountCents, plan)
}

/**
 * Calculate fee with a specific plan (helper function).
 * Fixed fee only applies when amountCents >= 300 ($3.00).
 */
export function calculateFeeWithPlan(
  amountCents: number,
  plan: SubscriptionPlan
): FeeCalculation {
  const feePercent = typeof plan.fee_percent === 'number'
    ? plan.fee_percent
    : parseFloat(String(plan.fee_percent))

  const feeFixedCents = amountCents >= FIXED_FEE_THRESHOLD_CENTS ? plan.fee_fixed_cents : 0

  // Calculate percentage fee
  const percentageFeeCents = Math.round(amountCents * feePercent)

  // Total platform fee
  const totalFeeCents = percentageFeeCents + feeFixedCents

  // Clamp: never negative, never exceed total charge
  const platformFeeCents = Math.max(0, Math.min(totalFeeCents, amountCents))

  // Calculate what seller receives
  const sellerReceivesCents = amountCents - platformFeeCents

  return {
    platformFeeCents,
    feePercent,
    feeFixedCents,
    sellerReceivesCents,
    planId: plan.id,
    planName: plan.name,
  }
}

/**
 * Get fee preview for display purposes (without database query).
 * Used in UI to show potential fees for different plans.
 */
export function getFeePreview(
  amountCents: number,
  planId: 'free' | 'growth' | 'pro'
): FeeCalculation {
  const plans: Record<string, SubscriptionPlan> = {
    free: {
      id: 'free',
      name: 'Free',
      fee_percent: 0.06,
      fee_fixed_cents: FIXED_FEE_CENTS,
    },
    growth: {
      id: 'growth',
      name: 'Growth',
      fee_percent: 0.03,
      fee_fixed_cents: FIXED_FEE_CENTS,
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      fee_percent: 0.015,
      fee_fixed_cents: FIXED_FEE_CENTS,
    },
  }

  const plan = plans[planId] || plans.free
  return calculateFeeWithPlan(amountCents, plan)
}

/**
 * Format fee as percentage string for display
 */
export function formatFeePercent(feePercent: number): string {
  return `${(feePercent * 100).toFixed(feePercent >= 0.01 ? 1 : 2)}%`
}

/**
 * Format cents as dollar amount
 */
export function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Get fee description for a plan
 */
export function getFeeDescription(planId: string): string {
  const descriptions: Record<string, string> = {
    free: "6% + $0.25 per transaction (fixed fee on orders $3+)",
    growth: "3% + $0.25 per transaction (fixed fee on orders $3+)",
    pro: "1.5% + $0.25 per transaction (fixed fee on orders $3+)",
  }

  return descriptions[planId] || descriptions.free
}
