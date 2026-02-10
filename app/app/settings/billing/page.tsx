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
  features: ["3% + $0.25 per transaction", "Advanced analytics & reports", "Priority email support", "Custom domain support"],
  is_active: true,
}

const PRO_PLAN = {
  id: "pro",
  name: "Professional",
  price_cents: 9900,
  billing_period: "month",
  fee_percent: 0.015,
  fee_fixed_cents: 25,
  features: ["1.5% + $0.25 per transaction", "Premium analytics & reports", "Dedicated support", "White-label options", "API access"],
  is_active: true,
}

const FALLBACK_PLANS = [FREE_PLAN, GROWTH_PLAN, PRO_PLAN]

// Map Stripe price IDs back to plan IDs — LIVE price IDs hardcoded as fallback
const LIVE_PRICE_GROWTH = "price_1SzBWaBYevnBVyznNCTOXDoS"
const LIVE_PRICE_PRO = "price_1SzBXSBYevnBVyznYjXfOOXX"

function getPlanIdFromPriceId(priceId: string): string | null {
  if (priceId === process.env.PRICE_GROWTH_MONTHLY || priceId === LIVE_PRICE_GROWTH) return "growth"
  if (priceId === process.env.PRICE_PRO_MONTHLY || priceId === LIVE_PRICE_PRO) return "pro"
  return null
}

// Priority for picking the best subscription when multiple exist
const STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  trialing: 1,
  past_due: 2,
  incomplete: 3,
  canceled: 4,
  incomplete_expired: 5,
  unpaid: 6,
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
      .select("*")
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

    // --- STRATEGY 1: Fetch ALL data from Stripe via customer ID ---
    const stripeCustomerId = creator.stripe_customer_id
    let customerValid = false

    if (stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(stripeCustomerId)
        if (!(customer as any).deleted) {
          customerValid = true
        }
      } catch {
        customerValid = false
      }
    }

    if (customerValid && stripeCustomerId) {
      // Fetch ALL subscriptions (any status) and pick the best one
      try {
        const allSubs = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 10,
        })

        if (allSubs.data.length > 0) {
          // Sort by status priority: active first, then trialing, etc.
          const sorted = allSubs.data.sort((a, b) => {
            return (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)
          })
          const bestSub = sorted[0] as any

          const priceId = bestSub.items.data[0]?.price?.id
          const planId = priceId ? getPlanIdFromPriceId(priceId) : (bestSub.metadata?.plan_id || null)
          const resolvedPlanId = planId || creator.subscription_plan_id || "free"
          const matchedPlan = plans.find((p: any) => p.id === resolvedPlanId)

          if (matchedPlan) {
            currentPlan = matchedPlan
          }

          subscription = {
            id: bestSub.id,
            stripe_subscription_id: bestSub.id,
            plan_id: resolvedPlanId,
            status: bestSub.status,
            current_period_start: new Date(bestSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(bestSub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: bestSub.cancel_at_period_end,
            subscription_plans: currentPlan,
          }
        }
      } catch (err) {
        console.error("Error fetching Stripe subscriptions:", err)
      }

      // Fetch payment methods from Stripe
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

      // Fetch invoices from Stripe
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

    // --- STRATEGY 2: If no subscription from Stripe, try Supabase subscriptions table ---
    if (!subscription) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("creator_id", creator.id)
        .maybeSingle()

      if (sub) {
        // If we have a stripe_subscription_id, try to retrieve it directly from Stripe
        if (sub.stripe_subscription_id) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as any
            const priceId = stripeSub.items.data[0]?.price?.id
            const planId = priceId ? getPlanIdFromPriceId(priceId) : (stripeSub.metadata?.plan_id || sub.plan_id)
            const resolvedPlanId = planId || sub.plan_id || "free"
            const matchedPlan = plans.find((p: any) => p.id === resolvedPlanId)

            if (matchedPlan) currentPlan = matchedPlan

            subscription = {
              id: stripeSub.id,
              stripe_subscription_id: stripeSub.id,
              plan_id: resolvedPlanId,
              status: stripeSub.status,
              current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
              cancel_at_period_end: stripeSub.cancel_at_period_end,
              subscription_plans: currentPlan,
            }
          } catch {
            // Stripe subscription not found — use Supabase record as-is
            if (sub.plan_id && (sub.status === "active" || sub.status === "trialing")) {
              subscription = sub
              const matchedPlan = plans.find((p: any) => p.id === sub.plan_id)
              if (matchedPlan) currentPlan = matchedPlan
              subscription.subscription_plans = currentPlan
            }
          }
        } else if (sub.plan_id && (sub.status === "active" || sub.status === "trialing")) {
          subscription = sub
          const matchedPlan = plans.find((p: any) => p.id === sub.plan_id)
          if (matchedPlan) currentPlan = matchedPlan
          subscription.subscription_plans = currentPlan
        }
      }
    }

    // --- STRATEGY 3: If STILL no subscription, use creator record ---
    if (!subscription && creator.subscription_plan_id && creator.subscription_plan_id !== "free") {
      const matchedPlan = plans.find((p: any) => p.id === creator.subscription_plan_id)
      if (matchedPlan) {
        currentPlan = matchedPlan
        subscription = {
          id: "db-fallback",
          stripe_subscription_id: null,
          plan_id: creator.subscription_plan_id,
          status: "active",
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
          subscription_plans: matchedPlan,
        }
      }
    }

    // --- SYNC: Write Stripe truth back to Supabase ---
    if (subscription && subscription.plan_id && subscription.plan_id !== "free") {
      try {
        await supabase
          .from("creators")
          .update({ subscription_plan_id: subscription.plan_id })
          .eq("user_id", user.id)
      } catch {
        // Non-critical — just sync
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
