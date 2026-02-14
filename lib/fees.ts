import "server-only"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface FeeCalculation {
  fee_percent: number
  fee_fixed_cents: number
  fee_total_cents: number
  seller_net_cents: number
  plan_used: string
}

// Fixed fee only applied when order amount >= 300 cents ($3.00)
const FIXED_FEE_CENTS = 25
const FIXED_FEE_THRESHOLD_CENTS = 300

/**
 * Calculate platform application fee for a given order.
 * Uses the seller's CURRENT plan from Supabase at time of charge.
 *
 * Fee rules:
 *   Free:         6%   + $0.25 (fixed only if price >= $3.00)
 *   Growth:       3%   + $0.25 (fixed only if price >= $3.00)
 *   Professional: 1.5% + $0.25 (fixed only if price >= $3.00)
 *
 * If not active on paid tier, defaults to Free fees.
 */
export async function calculatePlatformFee(
  creatorId: string,
  orderAmountCents: number
): Promise<FeeCalculation> {
  // Default to free plan fees
  let feePercent = 0.06
  let planUsed = "free"

  try {
    // Get the seller's current subscription info
    const { data: creator } = await supabaseAdmin
      .from("creators")
      .select("subscription_plan_id, subscription_status")
      .eq("id", creatorId)
      .single()

    if (creator) {
      const planId = creator.subscription_plan_id || "free"
      const status = creator.subscription_status

      // Only apply paid plan fees if subscription is active
      if (status === "active" && planId !== "free") {
        const { data: plan } = await supabaseAdmin
          .from("subscription_plans")
          .select("fee_percent, fee_fixed_cents, id")
          .eq("id", planId)
          .eq("is_active", true)
          .single()

        if (plan) {
          feePercent = plan.fee_percent
          planUsed = plan.id
        }
      }
    }
  } catch (error) {
    console.error("[fees] Error fetching seller plan, defaulting to free:", error)
  }

  const percentFee = Math.round(orderAmountCents * feePercent)
  const feeFixedCents = orderAmountCents >= FIXED_FEE_THRESHOLD_CENTS ? FIXED_FEE_CENTS : 0
  const feeTotalCents = Math.max(0, Math.min(percentFee + feeFixedCents, orderAmountCents))
  const sellerNetCents = orderAmountCents - feeTotalCents

  return {
    fee_percent: feePercent,
    fee_fixed_cents: feeFixedCents,
    fee_total_cents: feeTotalCents,
    seller_net_cents: Math.max(0, sellerNetCents),
    plan_used: planUsed,
  }
}
