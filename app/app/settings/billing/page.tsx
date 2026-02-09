import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BillingPageClient } from "@/components/app/billing/billing-page-client"

const DEFAULT_PLANS = [
  {
    id: "free",
    name: "Free",
    price_cents: 0,
    billing_period: null,
    fee_percent: 0.06,
    fee_fixed_cents: 25,
    features: ["6% + $0.25 per transaction", "Basic analytics", "Community support"],
  },
  {
    id: "growth",
    name: "Growth Plan",
    price_cents: 0,
    billing_period: "month",
    fee_percent: 0.03,
    fee_fixed_cents: 25,
    features: ["3% + $0.25 per transaction", "Advanced analytics", "Priority support"],
  },
  {
    id: "pro",
    name: "Professional Plan",
    price_cents: 10000,
    billing_period: "month",
    fee_percent: 0.015,
    fee_fixed_cents: 25,
    features: ["1.5% + $0.25 per transaction", "Lowest fees", "Priority + growth tools"],
  },
]

export default async function BillingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator } = await supabase
    .from("creators")
    .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
    .eq("user_id", user.id)
    .single()

  if (!creator) {
    redirect("/signup/success")
  }

  const { data: plansFromDb } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true })

  const mergedPlans = DEFAULT_PLANS.map((plan) => {
    const dbPlan = (plansFromDb || []).find((p) => p.id === plan.id)
    return dbPlan
      ? {
          ...plan,
          ...dbPlan,
          name: plan.name,
        }
      : plan
  })

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select(`
      *,
      subscription_plans (
        id,
        name,
        price_cents,
        billing_period,
        fee_percent,
        fee_fixed_cents,
        features
      )
    `)
    .eq("creator_id", creator.id)
    .maybeSingle()

  const currentPlanId = subscription?.plan_id || creator.subscription_plan_id || "free"
  const currentPlan = mergedPlans.find((plan) => plan.id === currentPlanId) || mergedPlans[0]

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: paymentMethods } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("creator_id", creator.id)
    .eq("is_default", true)
    .maybeSingle()

  return (
    <BillingPageClient
      initialData={{
        plans: mergedPlans,
        subscription,
        currentPlan,
        invoices: invoices || [],
        paymentMethod: paymentMethods,
      }}
    />
  )
}
