import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"

const FREE_PLAN = {
  id: "free",
  name: "Free",
  price_cents: 0,
  billing_period: null,
  fee_percent: 0.06,
  fee_fixed_cents: 25,
  features: ["6% + $0.25 per transaction", "Basic analytics", "Standard support"],
  is_active: true,
}

const GROWTH_PLAN = {
  id: "growth",
  name: "Growth",
  price_cents: 2990,
  billing_period: "month",
  fee_percent: 0.03,
  fee_fixed_cents: 25,
  features: ["3% + $0.25 per transaction", "Advanced analytics", "Priority support", "Custom domain"],
  is_active: true,
}

const PRO_PLAN = {
  id: "pro",
  name: "Professional",
  price_cents: 9900,
  billing_period: "month",
  fee_percent: 0.015,
  fee_fixed_cents: 25,
  features: ["1.5% + $0.25 per transaction", "Premium analytics", "Dedicated support", "White-label", "API access"],
  is_active: true,
}

const FALLBACK_PLANS = [FREE_PLAN, GROWTH_PLAN, PRO_PLAN]

const LIVE_PRICE_GROWTH = "price_1SzBWaBYevnBVyznNCTOXDoS"
const LIVE_PRICE_PRO = "price_1SzBXSBYevnBVyznYjXfOOXX"

function getPlanIdFromPriceId(priceId: string): string | null {
  if (priceId === process.env.PRICE_GROWTH_MONTHLY || priceId === LIVE_PRICE_GROWTH) return "growth"
  if (priceId === process.env.PRICE_PRO_MONTHLY || priceId === LIVE_PRICE_PRO) return "pro"
  return null
}

export default async function UpgradePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  let plans = FALLBACK_PLANS
  let currentPlanId = "free"
  let hasActiveSubscription = false

  try {
    const { data: creator } = await supabase
      .from("creators")
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!creator) {
      redirect("/signup/success")
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
    />
  )
}
