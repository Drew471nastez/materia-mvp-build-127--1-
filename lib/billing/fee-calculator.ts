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

/**
 * Calculate platform fee based on creator's subscription plan
 *
 * @param amountCents - Total transaction amount in cents
 * @param creatorId - Creator's ID
 * @param supabase - Supabase client (can be service role or user client)
 * @returns Fee calculation breakdown
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
    // Fall back to free plan defaults if there's an error
    return calculateFeeWithPlan(amountCents, {
      id: "free",
      name: "Free",
      fee_percent: 0.06, // 6%
      fee_fixed_cents: 25, // $0.25
    })
  }

  const plan = creator.subscription_plans as unknown as SubscriptionPlan

  const creatorSubscriptionStatus = (creator as any).subscription_status
  if (creatorSubscriptionStatus && !["active", "trialing"].includes(creatorSubscriptionStatus)) {
    return calculateFeeWithPlan(amountCents, {
      id: "free",
      name: "Free",
      fee_percent: 0.06,
      fee_fixed_cents: 25,
    })
  }

  if (!plan) {
    // No plan found, use free plan defaults
    return calculateFeeWithPlan(amountCents, {
      id: "free",
      name: "Free",
      fee_percent: 0.06,
      fee_fixed_cents: 25,
    })
  }

  return calculateFeeWithPlan(amountCents, plan)
}

/**
 * Calculate fee with a specific plan (helper function)
 *
 * @param amountCents - Total transaction amount in cents
 * @param plan - Subscription plan details
 * @returns Fee calculation breakdown
 */
export function calculateFeeWithPlan(
  amountCents: number,
  plan: SubscriptionPlan
): FeeCalculation {
  const feePercent = typeof plan.fee_percent === 'number'
    ? plan.fee_percent
    : parseFloat(String(plan.fee_percent))

  const feeFixedCents = plan.fee_fixed_cents

  // Calculate percentage fee
  const percentageFeeCents = Math.round(amountCents * feePercent)

  // Total platform fee
  const totalFeeCents = percentageFeeCents + feeFixedCents

  // Ensure seller receives at least $0.50 (50 cents) minimum
  const minimumSellerReceives = 50
  const cappedFeeCents = Math.min(totalFeeCents, amountCents - minimumSellerReceives)

  // Final fee (capped if necessary)
  const platformFeeCents = Math.max(0, cappedFeeCents)

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
 * Get fee preview for display purposes (without database query)
 * Used in UI to show potential fees for different plans
 *
 * @param amountCents - Transaction amount
 * @param planId - Plan ID ('free', 'growth', 'pro')
 * @returns Fee calculation
 */
export function getFeePreview(
  amountCents: number,
  planId: 'free' | 'growth' | 'pro'
): FeeCalculation {
  const plans: Record<string, SubscriptionPlan> = {
    free: {
      id: 'free',
      name: 'Free',
      fee_percent: 0.06, // 6%
      fee_fixed_cents: 25, // $0.25
    },
    growth: {
      id: 'growth',
      name: 'Growth',
      fee_percent: 0.03, // 3%
      fee_fixed_cents: 25, // $0.25
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      fee_percent: 0.015, // 1.5%
      fee_fixed_cents: 25, // $0.25
    },
  }

  const plan = plans[planId] || plans.free
  return calculateFeeWithPlan(amountCents, plan)
}

/**
 * Format fee as percentage string for display
 * @param feePercent - Fee as decimal (e.g., 0.06)
 * @returns Formatted string (e.g., "6%")
 */
export function formatFeePercent(feePercent: number): string {
  return `${(feePercent * 100).toFixed(feePercent >= 0.01 ? 1 : 2)}%`
}

/**
 * Format cents as dollar amount
 * @param cents - Amount in cents
 * @returns Formatted dollar string (e.g., "$1.50")
 */
export function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Get fee description for a plan
 * @param planId - Plan ID
 * @returns Human-readable fee description
 */
export function getFeeDescription(planId: string): string {
  const descriptions: Record<string, string> = {
    free: "6% + $0.25 per transaction",
    growth: "3% + $0.25 per transaction",
    pro: "1.5% + $0.25 per transaction",
  }

  return descriptions[planId] || descriptions.free
}
