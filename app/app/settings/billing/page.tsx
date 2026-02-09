import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BillingPageClient } from "@/components/app/billing/billing-page-client"

const FREE_PLAN = {
  id: "free",
  name: "Free",
  price_cents: 0,
  billing_period: null,
  fee_percent: 0.06,
  fee_fixed_cents: 25,
  features: ["6% + $0.25 per transaction", "Basic analytics", "Standard support"],
  is_active: true,
  stripe_price_id: null,
  created_at: new Date().toISOString(),
}

const GROWTH_PLAN = {
  id: "growth",
  name: "Growth",
  price_cents: 2900,
  billing_period: "month",
  fee_percent: 0.03,
  fee_fixed_cents: 25,
  features: ["$29/month", "3% + $0.25 per transaction", "Advanced analytics", "Priority support", "Custom domain"],
  is_active: true,
  stripe_price_id: null,
  created_at: new Date().toISOString(),
}

const PRO_PLAN = {
  id: "pro",
  name: "Pro",
  price_cents: 10000,
  billing_period: "month",
  fee_percent: 0.015,
  fee_fixed_cents: 25,
  features: ["$100/month", "1.5% + $0.25 per transaction", "Premium analytics", "Dedicated support", "White-label options", "API access"],
  is_active: true,
  stripe_price_id: null,
  created_at: new Date().toISOString(),
}

const FALLBACK_PLANS = [FREE_PLAN, GROWTH_PLAN, PRO_PLAN]

export default async function BillingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get creator record
  const { data: creator } = await supabase
    .from("creators")
    .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) {
    redirect("/signup/success")
  }

  // Fetch all subscription plans - with fallback
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true })

  const safePlans = plans && plans.length > 0 ? plans : FALLBACK_PLANS

  // Get current subscription details - simple query without FK join
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("creator_id", creator.id)
    .maybeSingle()

  // If there's a subscription, fetch its plan separately
  let currentPlan = FREE_PLAN
  if (subscription?.plan_id) {
    const matchedPlan = safePlans.find((p: any) => p.id === subscription.plan_id)
    if (matchedPlan) {
      currentPlan = matchedPlan
    }
    // Attach plan info to subscription object for the status component
    ;(subscription as any).subscription_plans = currentPlan
  } else {
    // No subscription - user is on free plan
    const freePlanFromDb = safePlans.find((p: any) => p.id === "free")
    currentPlan = freePlanFromDb || FREE_PLAN
  }

  // Get invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Get payment method
  const { data: paymentMethod } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("creator_id", creator.id)
    .eq("is_default", true)
    .maybeSingle()

  return (
    <BillingPageClient
      initialData={{
        plans: safePlans,
        subscription,
        currentPlan,
        invoices: invoices || [],
        paymentMethod: paymentMethod,
      }}
    />
  )
}
