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

function getPlanIdFromPriceId(priceId: string | undefined): "growth" | "pro" | "free" {
  if (!priceId) return "free"
  if (priceId === process.env.PRICE_GROWTH_MONTHLY) return "growth"
  if (priceId === process.env.PRICE_PRO_MONTHLY) return "pro"
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
      const stripeSubs = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 10 })
      const preferredSubscription = stripeSubs.data.find((s) => SUBSCRIBED_STATUSES.has(s.status)) ?? stripeSubs.data[0]

      if (preferredSubscription && SUBSCRIBED_STATUSES.has(preferredSubscription.status)) {
        const sub = preferredSubscription as any
        const currentPriceId = sub.items.data[0]?.price?.id
        const livePlanId = getPlanIdFromPriceId(currentPriceId)
        const currentPlan = getPlanObject(livePlanId)

        const subscription = {
          id: sub.id,
          stripe_subscription_id: sub.id,
          plan_id: livePlanId,
          pending_plan_id: (sub.metadata?.pending_plan_id as string) || null,
          status: sub.status,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
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
              plan_id: livePlanId,
              pending_plan_id: null,
              status: sub.status,
              current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
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
