import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"
import { pageUser } from "@/lib/auth/page-user"
import { FREE_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"

const FREE_PLAN = {
  id: "free",
  name: "Free",
  price_cents: 0,
  billing_period: null,
  fee_percent: FREE_STANDARD_RATE,
  fee_fixed_cents: 25,
  features: [`${ratePercentLabel(FREE_STANDARD_RATE)} + $0.25 per transaction`, "Basic analytics", "Standard support"],
  is_active: true,
}

const GROWTH_PLAN = {
  id: "growth",
  // Sold as "Pro". The id stays "growth": it is the $29 Stripe price.
  name: "Pro",
  price_cents: 2900,
  billing_period: "month",
  fee_percent: 0.03,
  fee_fixed_cents: 25,
  features: ["3% + $0.25 per transaction", "Advanced analytics", "Priority support", "Custom domain"],
  is_active: true,
}

const PRO_PLAN = {
  id: "pro",
  // The earlier $99 plan. No longer offered; kept so its subscribers still resolve.
  name: "Pro",
  price_cents: 9900,
  billing_period: "month",
  fee_percent: 0.015,
  fee_fixed_cents: 25,
  features: ["1.5% + $0.25 per transaction", "Premium analytics", "Dedicated support", "White-label", "API access"],
  is_active: true,
}

const FALLBACK_PLANS = [FREE_PLAN, GROWTH_PLAN, PRO_PLAN]

// LIVE Stripe Price IDs (hardcoded fallbacks since env vars may not be set)
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function getPlanIdFromPriceId(priceId: string): string | null {
  if (!priceId) return null
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  // Partial match fallback
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return null
}

export default async function UpgradePage() {
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  let plans = FALLBACK_PLANS
  let currentPlanId = "free"
  let hasActiveSubscription = false
  let pendingPlanId: string | null = null
  let cancelAtPeriodEnd = false

  try {
    const { data: creator } = await createAdminClient()
      .from("creators")
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!creator) {
      redirect("/sell")
    }

    // Fetch plans
    const { data: dbPlans } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })

    if (dbPlans && dbPlans.length > 0) {
      plans = dbPlans
    }

    // Fetch live subscription status from Stripe
    if (creator.stripe_customer_id) {
      try {
        await stripe.customers.retrieve(creator.stripe_customer_id)

        const stripeSubs = await stripe.subscriptions.list({
          customer: creator.stripe_customer_id,
          status: "active",
          limit: 1,
        })

        const activeSub = stripeSubs.data[0]
        if (activeSub) {
          hasActiveSubscription = true
          const priceId = activeSub.items.data[0]?.price?.id
          const planId = priceId ? getPlanIdFromPriceId(priceId) : (activeSub.metadata?.plan_id || null)
          currentPlanId = planId || creator.subscription_plan_id || "free"
          // Check for pending downgrade or cancel
          pendingPlanId = activeSub.metadata?.pending_plan_id || null
          cancelAtPeriodEnd = activeSub.cancel_at_period_end === true
        } else {
          currentPlanId = creator.subscription_plan_id || "free"
        }
      } catch {
        // Fallback to DB data
        currentPlanId = creator.subscription_plan_id || "free"
      }
    } else {
      currentPlanId = creator.subscription_plan_id || "free"

      // Check subscription in DB as fallback
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("creator_id", creator.id)
        .maybeSingle()

      hasActiveSubscription = sub?.status === "active"
    }
  } catch (error) {
    console.error("Upgrade page data loading error:", error)
  }

  return (
    <UpgradePageClient
      plans={plans}
      currentPlanId={currentPlanId}
      hasActiveSubscription={hasActiveSubscription}
      pendingPlanId={pendingPlanId}
      cancelAtPeriodEnd={cancelAtPeriodEnd}
    />
  )
}
