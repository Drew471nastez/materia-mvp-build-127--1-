import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"
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
const SUBSCRIBED_STATUSES = new Set(["active", "trialing", "past_due"])

function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
    // Stripe timestamps are Unix seconds; detect if already in ms
    const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  return new Date().toISOString()
}

// LIVE Stripe Price IDs
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function getPlanIdFromPriceId(priceId: string | undefined): "growth" | "pro" | "free" {
  if (!priceId) return "free"
  if (priceId === PRICE_GROWTH) return "growth"
  if (priceId === PRICE_PRO) return "pro"
  // Also check by partial match (in case of price ID variants)
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}

export default async function BillingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  let plans = FALLBACK_PLANS
  let subscription: any = null
  let currentPlan: any = FREE_PLAN
  let invoices: any[] = []
  let paymentMethod: any = null

  const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).maybeSingle()

  if (!creator) redirect("/signup/success")

  try {
    const { data: dbPlans } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })

    if (dbPlans?.length) plans = dbPlans
  } catch (error) {
    console.error("[Billing] Error loading plans from DB:", error)
  }

  let stripeCustomerId: string | null = null

  // Step 1: Get or create Stripe customer
  try {
    stripeCustomerId = await getOrCreateStripeCustomer({
      creatorId: creator.id,
      existingCustomerId: creator.stripe_customer_id,
      email: user.email,
      userId: user.id,
      username: creator.username || creator.slug || "creator",
    })
  } catch (error) {
    console.error("[Billing] Error getting Stripe customer:", error)
  }

  if (stripeCustomerId) {
    // Step 2: Fetch subscription from Stripe (independent)
    // Expand latest_invoice to get period dates (SDK v20 removed current_period_start/end)
    try {
      const stripeSubs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 10,
        expand: ["data.latest_invoice"],
      })
      const preferredSubscription = stripeSubs.data.find((s) => SUBSCRIBED_STATUSES.has(s.status)) ?? stripeSubs.data[0]

      if (preferredSubscription && SUBSCRIBED_STATUSES.has(preferredSubscription.status)) {
        const currentPriceId = preferredSubscription.items.data[0]?.price?.id
        const livePlanId = getPlanIdFromPriceId(currentPriceId)
        currentPlan = plans.find((p: any) => p.id === livePlanId) ?? FREE_PLAN

        // Extract period dates: try legacy fields, then current_period object, then latest_invoice
        const sub = preferredSubscription as any
        let periodStartTs: any = sub.current_period_start || sub.current_period?.start_date || null
        let periodEndTs: any = sub.current_period_end || sub.current_period?.end_date || null

        // Fallback to latest_invoice period dates
        if (!periodStartTs || !periodEndTs) {
          const inv = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null
          if (inv?.period_start) periodStartTs = periodStartTs || inv.period_start
          if (inv?.period_end) periodEndTs = periodEndTs || inv.period_end
        }

        subscription = {
          id: preferredSubscription.id,
          stripe_subscription_id: preferredSubscription.id,
          plan_id: livePlanId,
          pending_plan_id: (preferredSubscription.metadata?.pending_plan_id as string) || null,
          status: preferredSubscription.status,
          current_period_start: safeTimestamp(periodStartTs),
          current_period_end: safeTimestamp(periodEndTs),
          cancel_at_period_end: preferredSubscription.cancel_at_period_end,
          subscription_plans: currentPlan,
        }

        // Sync to DB (non-blocking, don't let DB errors break billing page)
        try {
          await supabase
            .from("creators")
            .update({
              stripe_customer_id: stripeCustomerId,
              subscription_plan_id: livePlanId,
              subscription_status: preferredSubscription.status,
            })
            .eq("id", creator.id)

          await supabase
            .from("subscriptions")
            .upsert({
              creator_id: creator.id,
              stripe_subscription_id: preferredSubscription.id,
              stripe_customer_id: stripeCustomerId,
              plan_id: livePlanId,
              pending_plan_id: null,
              status: preferredSubscription.status,
              current_period_start: safeTimestamp(periodStartTs),
              current_period_end: safeTimestamp(periodEndTs),
              updated_at: new Date().toISOString(),
            }, { onConflict: "creator_id" })
        } catch (syncError) {
          console.error("[Billing] Error syncing subscription to DB:", syncError)
        }
      }
    } catch (error) {
      console.error("[Billing] Error fetching subscriptions from Stripe:", error)
    }

    // Step 3: Fetch payment methods from Stripe (independent of subscription)
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      if (!(customer as any).deleted) {
        const defaultPaymentMethodId = typeof customer.invoice_settings.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings.default_payment_method?.id || null

        const stripePaymentMethods = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card", limit: 10 })
        const defaultPaymentMethod = stripePaymentMethods.data.find((pm) => pm.id === defaultPaymentMethodId) || stripePaymentMethods.data[0]

        if (defaultPaymentMethod) {
          paymentMethod = {
            stripe_payment_method_id: defaultPaymentMethod.id,
            card_brand: defaultPaymentMethod.card?.brand || "unknown",
            card_last4: defaultPaymentMethod.card?.last4 || "0000",
            card_exp_month: defaultPaymentMethod.card?.exp_month || 0,
            card_exp_year: defaultPaymentMethod.card?.exp_year || 0,
            is_default: defaultPaymentMethod.id === defaultPaymentMethodId,
          }
        }
      }
    } catch (error) {
      console.error("[Billing] Error fetching payment methods from Stripe:", error)
    }

    // Step 4: Fetch invoices from Stripe (independent of subscription and payment methods)
    try {
      const stripeInvoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 20 })
      invoices = stripeInvoices.data.map((inv) => ({
        id: inv.id,
        stripe_invoice_id: inv.id,
        amount_cents: inv.amount_paid || inv.total || 0,
        status: inv.status === "paid" ? "paid" : inv.status === "open" ? "open" : inv.status || "unknown",
        invoice_pdf_url: inv.invoice_pdf || null,
        hosted_invoice_url: inv.hosted_invoice_url || null,
        period_start: inv.period_start ? safeTimestamp(inv.period_start) : null,
        period_end: inv.period_end ? safeTimestamp(inv.period_end) : null,
        created_at: inv.created ? safeTimestamp(inv.created) : new Date().toISOString(),
        description: inv.lines?.data?.[0]?.description || "Subscription",
      }))
    } catch (error) {
      console.error("[Billing] Error fetching invoices from Stripe:", error)
    }

    // Step 5: If no subscription found, sync free plan to DB
    if (!subscription) {
      currentPlan = FREE_PLAN
      try {
        await supabase
          .from("creators")
          .update({ subscription_plan_id: "free", subscription_status: "inactive" })
          .eq("id", creator.id)
      } catch (error) {
        console.error("[Billing] Error syncing free plan to DB:", error)
      }
    }
  }

  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center bg-[#fafafa]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7c3aed]" />
        </div>
      }
    >
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
