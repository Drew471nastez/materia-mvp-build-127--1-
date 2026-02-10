import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
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
  features: ["1.5% + $0.25 per transaction", "Premium analytics", "Dedicated support", "White-label options", "API access"],
  is_active: true,
}

const FALLBACK_PLANS = [FREE_PLAN, GROWTH_PLAN, PRO_PLAN]

// Map Stripe price IDs back to plan IDs
function getPlanIdFromPriceId(priceId: string): string | null {
  if (priceId === process.env.PRICE_GROWTH_MONTHLY) return "growth"
  if (priceId === process.env.PRICE_PRO_MONTHLY) return "pro"
  return null
}

export default async function BillingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

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

    // Fetch plans from DB
    const { data: dbPlans } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })

    if (dbPlans && dbPlans.length > 0) {
      plans = dbPlans
    }

    // --- FETCH LIVE DATA FROM STRIPE ---
    const stripeCustomerId = creator.stripe_customer_id

    if (stripeCustomerId) {
      // Validate customer exists on current keys
      let customerValid = false
      try {
        await stripe.customers.retrieve(stripeCustomerId)
        customerValid = true
      } catch {
        // Customer doesn't exist (stale test-mode ID)
        customerValid = false
      }

      if (customerValid) {
        // 1) Fetch active subscriptions from Stripe
        try {
          const stripeSubs = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "active",
            limit: 1,
          })

          // Also check trialing subscriptions
          const trialingSubs = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "trialing",
            limit: 1,
          })

          const activeSub = (stripeSubs.data[0] || trialingSubs.data[0]) as any

          if (activeSub) {
            // Determine plan from the subscription's price ID
            const priceId = activeSub.items.data[0]?.price?.id
            const planId = priceId ? getPlanIdFromPriceId(priceId) : (activeSub.metadata?.plan_id || null)

            const resolvedPlanId = planId || creator.subscription_plan_id || "free"
            const matchedPlan = plans.find((p: any) => p.id === resolvedPlanId)

            if (matchedPlan) {
              currentPlan = matchedPlan
            }

            subscription = {
              id: activeSub.id,
              stripe_subscription_id: activeSub.id,
              plan_id: resolvedPlanId,
              status: activeSub.status,
              current_period_start: new Date(activeSub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(activeSub.current_period_end * 1000).toISOString(),
              cancel_at_period_end: activeSub.cancel_at_period_end,
              subscription_plans: currentPlan,
            }
          } else {
            // Check for cancel_at_period_end subscriptions (still technically active until period ends)
            const allSubs = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              limit: 5,
            })
            // Look for a subscription that is active but set to cancel
            const cancelingSub = allSubs.data.find(s => s.status === "active" && s.cancel_at_period_end) as any
            if (cancelingSub) {
              const priceId = cancelingSub.items.data[0]?.price?.id
              const planId = priceId ? getPlanIdFromPriceId(priceId) : (cancelingSub.metadata?.plan_id || null)
              const resolvedPlanId = planId || creator.subscription_plan_id || "free"
              const matchedPlan = plans.find((p: any) => p.id === resolvedPlanId)
              if (matchedPlan) currentPlan = matchedPlan

              subscription = {
                id: cancelingSub.id,
                stripe_subscription_id: cancelingSub.id,
                plan_id: resolvedPlanId,
                status: cancelingSub.status,
                current_period_start: new Date(cancelingSub.current_period_start * 1000).toISOString(),
                current_period_end: new Date(cancelingSub.current_period_end * 1000).toISOString(),
                cancel_at_period_end: true,
                subscription_plans: currentPlan,
              }
            }
          }
        } catch (err) {
          console.error("Error fetching Stripe subscriptions:", err)
          // Fall back to Supabase data
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("creator_id", creator.id)
            .maybeSingle()

          if (sub?.plan_id) {
            subscription = sub
            const matchedPlan = plans.find((p: any) => p.id === sub.plan_id)
            if (matchedPlan) currentPlan = matchedPlan
            subscription.subscription_plans = currentPlan
          }
        }

        // 2) Fetch payment methods from Stripe
        try {
          const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: "card",
            limit: 1,
          })

          const pm = paymentMethods.data[0]
          if (pm) {
            paymentMethod = {
              stripe_payment_method_id: pm.id,
              card_brand: pm.card?.brand || "unknown",
              card_last4: pm.card?.last4 || "0000",
              card_exp_month: pm.card?.exp_month || 0,
              card_exp_year: pm.card?.exp_year || 0,
              is_default: true,
            }
          }
        } catch (err) {
          console.error("Error fetching Stripe payment methods:", err)
        }

        // 3) Fetch invoices from Stripe
        try {
          const stripeInvoices = await stripe.invoices.list({
            customer: stripeCustomerId,
            limit: 20,
          })

          invoices = stripeInvoices.data.map((inv) => ({
            id: inv.id,
            stripe_invoice_id: inv.id,
            amount_cents: inv.amount_paid || inv.total || 0,
            status: inv.status === "paid" ? "paid" : inv.status === "open" ? "open" : inv.status || "unknown",
            invoice_pdf_url: inv.invoice_pdf || null,
            hosted_invoice_url: inv.hosted_invoice_url || null,
            period_start: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
            period_end: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
            created_at: inv.created ? new Date(inv.created * 1000).toISOString() : new Date().toISOString(),
            description: inv.lines?.data?.[0]?.description || "Subscription",
          }))
        } catch (err) {
          console.error("Error fetching Stripe invoices:", err)
        }
      }
    }

    // If no Stripe data was fetched, fall back to Supabase
    if (!subscription) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("creator_id", creator.id)
        .maybeSingle()

      if (sub?.plan_id && sub.status === "active") {
        subscription = sub
        const matchedPlan = plans.find((p: any) => p.id === sub.plan_id)
        if (matchedPlan) currentPlan = matchedPlan
        subscription.subscription_plans = currentPlan
      } else if (creator.subscription_plan_id && creator.subscription_plan_id !== "free" && creator.subscription_status === "active") {
        // Creator has a plan set but no subscription record
        const matchedPlan = plans.find((p: any) => p.id === creator.subscription_plan_id)
        if (matchedPlan) currentPlan = matchedPlan
      }
    }

    // Fallback: fetch payment method from Supabase if not found from Stripe
    if (!paymentMethod) {
      const { data: pm } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("creator_id", creator.id)
        .eq("is_default", true)
        .maybeSingle()
      paymentMethod = pm
    }

    // Fallback: fetch invoices from Supabase if not found from Stripe
    if (invoices.length === 0) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })
        .limit(20)
      invoices = inv || []
    }
  } catch (error) {
    console.error("Billing page data loading error:", error)
  }

  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center bg-[#fafafa]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7c3aed]" />
      </div>
    }>
      <BillingPageClient
        initialData={{
          plans,
          subscription,
          currentPlan,
          invoices,
          paymentMethod,
        }}
      />
    </Suspense>
  )
}
