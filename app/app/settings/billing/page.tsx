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

  // Wrap all DB queries in try-catch so the page never crashes
  let creatorId: string | null = null
  let plans = FALLBACK_PLANS
  let subscription: any = null
  let currentPlan: any = FREE_PLAN
  let invoices: any[] = []
  let paymentMethod: any = null

  try {
    const { data: creator } = await supabase
      .from("creators")
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!creator) {
      redirect("/signup/success")
    }

    creatorId = creator.id

    // Fetch plans
    const { data: dbPlans } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })

    if (dbPlans && dbPlans.length > 0) {
      plans = dbPlans
    }

    // Fetch subscription (simple query, no FK join)
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (sub?.plan_id) {
      subscription = sub
      const matchedPlan = plans.find((p: any) => p.id === sub.plan_id)
      if (matchedPlan) {
        currentPlan = matchedPlan
      }
      subscription.subscription_plans = currentPlan
    } else {
      const freePlan = plans.find((p: any) => p.id === "free")
      currentPlan = freePlan || FREE_PLAN
    }

    // Fetch invoices
    const { data: inv } = await supabase
      .from("invoices")
      .select("*")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(20)

    invoices = inv || []

    // Fetch payment method
    const { data: pm } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("creator_id", creator.id)
      .eq("is_default", true)
      .maybeSingle()

    paymentMethod = pm
  } catch (error) {
    // If any query fails, render with defaults
    console.error("Billing page data loading error:", error)
  }

  return (
    <BillingPageClient
      initialData={{
        plans,
        subscription,
        currentPlan,
        invoices,
        paymentMethod,
      }}
    />
  )
}
