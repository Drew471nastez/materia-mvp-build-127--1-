import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"

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

const SUBSCRIBED_STATUSES = new Set(["active", "trialing", "past_due"])

function safeTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (ts instanceof Date) return ts.toISOString()
  if (typeof ts === "string") return ts
  if (typeof ts === "number" && !isNaN(ts)) {
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
  if (priceId.includes("SzBWa")) return "growth"
  if (priceId.includes("SzBXS")) return "pro"
  return "free"
}

function getPlanObject(planId: string) {
  if (planId === "growth") return GROWTH_PLAN
  if (planId === "pro") return PRO_PLAN
  return FREE_PLAN
}

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id, slug, username")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Fetch directly from Stripe (source of truth)
    let stripeCustomerId: string | null = null
    try {
      stripeCustomerId = await getOrCreateStripeCustomer({
        creatorId: creator.id,
        existingCustomerId: creator.stripe_customer_id,
        email: user.email,
        userId: user.id,
        username: creator.username || creator.slug || "creator",
      })
    } catch (err) {
      console.error("[Subscription API] Error getting Stripe customer:", err)
    }

    if (!stripeCustomerId) {
      return NextResponse.json({
        subscription: null,
        currentPlan: FREE_PLAN,
        status: "inactive",
      })
    }

    try {
      // Expand latest_invoice to get period dates (SDK v20 removed current_period_start/end)
      const stripeSubs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 10,
        expand: ["data.latest_invoice"],
      })
      const preferredSubscription = stripeSubs.data.find((s) => SUBSCRIBED_STATUSES.has(s.status)) ?? stripeSubs.data[0]

      if (preferredSubscription && SUBSCRIBED_STATUSES.has(preferredSubscription.status)) {
        const sub = preferredSubscription as any
        const currentPriceId = sub.items?.data?.[0]?.price?.id
        const livePlanId = getPlanIdFromPriceId(currentPriceId)
        const currentPlan = getPlanObject(livePlanId)

        // Extract period dates: try legacy fields, then current_period object, then latest_invoice
        let periodStart: any = sub.current_period_start || sub.current_period?.start_date || null
        let periodEnd: any = sub.current_period_end || sub.current_period?.end_date || null
        if (!periodStart || !periodEnd) {
          const inv = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null
          if (inv?.period_start) periodStart = periodStart || inv.period_start
          if (inv?.period_end) periodEnd = periodEnd || inv.period_end
        }

        const subscription = {
          id: sub.id,
          stripe_subscription_id: sub.id,
          plan_id: livePlanId,
          pending_plan_id: (sub.metadata?.pending_plan_id as string) || null,
          status: sub.status,
          current_period_start: safeTimestamp(periodStart),
          current_period_end: safeTimestamp(periodEnd),
          cancel_at_period_end: sub.cancel_at_period_end,
          subscription_plans: currentPlan,
        }

        // Sync to DB (non-blocking)
        try {
          await supabase
            .from("creators")
            .update({
              stripe_customer_id: stripeCustomerId,
              subscription_plan_id: livePlanId,
              subscription_status: sub.status,
            })
            .eq("id", creator.id)

          await supabase
            .from("subscriptions")
            .upsert({
              creator_id: creator.id,
              stripe_subscription_id: sub.id,
              stripe_customer_id: stripeCustomerId,
              plan_id: livePlanId,
              pending_plan_id: null,
              status: sub.status,
              current_period_start: safeTimestamp(periodStart),
              current_period_end: safeTimestamp(periodEnd),
              updated_at: new Date().toISOString(),
            }, { onConflict: "creator_id" })
        } catch (syncError) {
          console.error("[Subscription API] DB sync error:", syncError)
        }

        return NextResponse.json({
          subscription,
          currentPlan,
          status: sub.status,
        })
      }
    } catch (err) {
      console.error("[Subscription API] Stripe fetch error:", err)
    }

    // No active subscription found
    return NextResponse.json({
      subscription: null,
      currentPlan: FREE_PLAN,
      status: "inactive",
    })
  } catch (error) {
    console.error("Error in GET /api/billing/subscription:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
