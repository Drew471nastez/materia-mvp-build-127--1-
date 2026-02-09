import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BillingPageClient } from "@/components/app/billing/billing-page-client"

export default async function BillingPage() {
  const supabase = await createClient()

  // Get current user
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
    .single()

  if (!creator) {
    redirect("/signup/success")
  }

  // Fetch all subscription plans
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true })

  // Get current subscription details
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

  // Get current plan (either from subscription or default to free)
  let currentPlan
  if (subscription) {
    currentPlan = subscription.subscription_plans
  } else {
    // Get free plan details
    const { data: freePlan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", "free")
      .single()

    currentPlan = freePlan || {
      id: "free",
      name: "Free",
      price_cents: 0,
      billing_period: null,
      fee_percent: 0.06,
      fee_fixed_cents: 25,
      features: ["6% + $0.25 per transaction", "Basic analytics", "Standard support"],
    }
  }

  // Get invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Get payment method (first default one)
  const { data: paymentMethods } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("creator_id", creator.id)
    .eq("is_default", true)
    .maybeSingle()

  return (
    <BillingPageClient
      initialData={{
        plans: plans || [],
        subscription,
        currentPlan,
        invoices: invoices || [],
        paymentMethod: paymentMethods,
      }}
    />
  )
}
