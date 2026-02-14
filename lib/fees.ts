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

// ── HARDCODED fee constants — single source of truth ──
// NEVER read fee_percent from the database; always use these.

const PLAN_FEE_PERCENT: Record<string, number> = {
  free: 0.06,   // 6%
  growth: 0.03, // 3%
  pro: 0.015,   // 1.5%
}

// $0.25 flat fixed fee — applied on EVERY transaction
const FIXED_FEE_CENTS = 25

function resolveSellerPlan(planId: string | null | undefined): string {
  if (!planId) return "free"
  const normalized = planId.toLowerCase().trim()
  if (normalized === "growth") return "growth"
  if (normalized === "pro" || normalized === "professional") return "pro"
  return "free"
}

/**
 * Calculate platform application fee for a given order.
 * Uses the seller's CURRENT plan from Supabase at time of charge.
 *
 * Fee rules (hardcoded, not from DB):
 *   Free:         6%   + $0.25 flat
 *   Growth:       3%   + $0.25 flat
 *   Professional: 1.5% + $0.25 flat
 *
 * If not active on paid tier, defaults to Free fees.
 */
export async function calculatePlatformFee(
  creatorId: string,
  orderAmountCents: number
): Promise<FeeCalculation> {
  let effectivePlan = "free"

  try {
    // Get the seller's current subscription info
    const { data: creator } = await supabaseAdmin
      .from("creators")
      .select("subscription_plan_id, subscription_status")
      .eq("id", creatorId)
      .single()

    if (creator) {
      const rawPlanId = creator.subscription_plan_id || "free"
      const status = creator.subscription_status

      // Only apply paid plan fees if subscription is active
      if (status === "active" && rawPlanId !== "free") {
        effectivePlan = resolveSellerPlan(rawPlanId)
      }

      console.log("[fees] Plan resolution:", {
        creatorId,
        rawPlanId,
        subscriptionStatus: status,
        effectivePlan,
      })
    }
  } catch (error) {
    console.error("[fees] Error fetching seller plan, defaulting to free:", error)
  }

  // Use hardcoded fee percent based on resolved plan ID
  const feePercent = PLAN_FEE_PERCENT[effectivePlan] ?? PLAN_FEE_PERCENT.free
  const percentFee = Math.round(orderAmountCents * feePercent)
  const feeFixedCents = FIXED_FEE_CENTS
  const feeTotalCents = Math.max(0, Math.min(percentFee + feeFixedCents, orderAmountCents))
  const sellerNetCents = orderAmountCents - feeTotalCents

  console.log("[fees] Fee computation:", {
    plan: effectivePlan,
    orderAmountCents,
    feePercent: `${(feePercent * 100).toFixed(2)}%`,
    percentFee,
    feeFixedCents,
    feeTotalCents,
    sellerNetCents,
  })

  return {
    fee_percent: feePercent,
    fee_fixed_cents: feeFixedCents,
    fee_total_cents: feeTotalCents,
    seller_net_cents: Math.max(0, sellerNetCents),
    plan_used: effectivePlan,
  }
}
