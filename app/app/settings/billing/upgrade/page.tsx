import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"

// iOS App Store compliance (Guideline 3.1.1):
// The upgrade/plan-selection page exposes Stripe checkout flows which are not
// permitted in the iOS App Store. Detect Capacitor iOS builds via User-Agent
// and redirect to the general settings page instead.
async function isCapacitorIOS(): Promise<boolean> {
  const headersList = await headers()
  const ua = headersList.get("user-agent") || ""
  // StorelibApp is injected by the native iOS wrapper; Capacitor is present in
  // all Capacitor builds. Exclude Android (/wv/ + Android) because Android
  // does not have the same App Store restriction (Play Store allows external
  // payments for B2B / creator subscriptions).
  const isCapacitor = /StorelibApp|Capacitor/.test(ua)
  const isAndroid = /Android/.test(ua)
  return isCapacitor && !isAndroid
}

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
  // iOS App Store compliance: block this page on iOS native builds
  if (await isCapacitorIOS()) {
    redirect("/app/settings")
  }

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
  let pendingPlanId: string | null = null
  let cancelAtPeriodEnd = false

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
