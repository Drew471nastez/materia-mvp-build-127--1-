import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

const PLAN_ORDER: Record<string, number> = { free: 0, growth: 1, pro: 2 }

// LIVE price IDs — also check env for flexibility
const LIVE_PRICE_GROWTH = "price_1SzBWaBYevnBVyznNCTOXDoS"
const LIVE_PRICE_PRO = "price_1SzBXSBYevnBVyznYjXfOOXX"

function getStripePriceId(planId: string): string | null {
  switch (planId) {
    case "growth":
      return process.env.PRICE_GROWTH_MONTHLY || LIVE_PRICE_GROWTH
    case "pro":
      return process.env.PRICE_PRO_MONTHLY || LIVE_PRICE_PRO
    default:
      return null
  }
}

function isUpgrade(currentPlanId: string, newPlanId: string): boolean {
  return (PLAN_ORDER[newPlanId] ?? 0) > (PLAN_ORDER[currentPlanId] ?? 0)
}

function getPlanIdFromPriceId(priceId: string): string | null {
  if (priceId === (process.env.PRICE_GROWTH_MONTHLY || LIVE_PRICE_GROWTH)) return "growth"
  if (priceId === (process.env.PRICE_PRO_MONTHLY || LIVE_PRICE_PRO)) return "pro"
  return null
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { newPlanId } = await request.json()

    if (!newPlanId) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id, subscription_plan_id, stripe_customer_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    if (newPlanId === "free") {
      return NextResponse.json(
        { error: "To downgrade to Free, please cancel your subscription." },
        { status: 400 }
      )
    }

    const stripePriceId = getStripePriceId(newPlanId)
    if (!stripePriceId) {
      return NextResponse.json({ error: "No Stripe price configured for this plan" }, { status: 400 })
    }

    // Find active subscription from Stripe directly (source of truth)
    let stripeSubscription: any = null

    if (creator.stripe_customer_id) {
      try {
        const cust = await stripe.customers.retrieve(creator.stripe_customer_id)
        if (!(cust as any).deleted) {
          const subs = await stripe.subscriptions.list({
            customer: creator.stripe_customer_id,
            limit: 10,
          })
          // Pick the best one (active > trialing > past_due)
          const priority = ["active", "trialing", "past_due"]
          stripeSubscription = subs.data
            .filter(s => priority.includes(s.status))
            .sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))[0] || null
        }
      } catch (err) {
        console.error("Error finding Stripe subscription:", err)
      }
    }

    // Fallback: try Supabase subscriptions table
    if (!stripeSubscription) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("creator_id", creator.id)
        .maybeSingle()

      if (sub?.stripe_subscription_id) {
        try {
          stripeSubscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
        } catch {
          // Not found
        }
      }
    }

    if (!stripeSubscription) {
      return NextResponse.json(
        { error: "No active subscription found. Please create a new subscription instead." },
        { status: 400 }
      )
    }

    // Determine current plan from the subscription's price
    const currentPriceId = stripeSubscription.items.data[0]?.price?.id
    const currentPlanId = (currentPriceId ? getPlanIdFromPriceId(currentPriceId) : null) || creator.subscription_plan_id || "free"
    const upgrading = isUpgrade(currentPlanId, newPlanId)

    if (upgrading) {
      // ---- UPGRADE: Immediate + prorated ----
      const updatedSubscription = await stripe.subscriptions.update(
        stripeSubscription.id,
        {
          items: [
            {
              id: stripeSubscription.items.data[0].id,
              price: stripePriceId,
            },
          ],
          proration_behavior: "always_invoice",
          metadata: {
            creator_id: creator.id,
            plan_id: newPlanId,
          },
        }
      )

      // Sync Supabase: update both subscriptions and creators tables
      try {
        await supabase
          .from("subscriptions")
          .update({
            plan_id: newPlanId,
            current_period_start: new Date((updatedSubscription as any).current_period_start * 1000).toISOString(),
            current_period_end: new Date((updatedSubscription as any).current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubscription.id)
      } catch { /* non-critical */ }

      await supabase
        .from("creators")
        .update({ subscription_plan_id: newPlanId })
        .eq("id", creator.id)

      return NextResponse.json({
        success: true,
        type: "upgrade",
        message: "Upgrade applied immediately. You've been charged a prorated amount.",
      })
    } else {
      // ---- DOWNGRADE: Scheduled for end of current billing period ----
      const updatedSubscription = await stripe.subscriptions.update(
        stripeSubscription.id,
        {
          items: [
            {
              id: stripeSubscription.items.data[0].id,
              price: stripePriceId,
            },
          ],
          proration_behavior: "none",
          metadata: {
            creator_id: creator.id,
            plan_id: newPlanId,
            scheduled_downgrade: "true",
          },
        }
      )

      // Sync Supabase
      try {
        await supabase
          .from("subscriptions")
          .update({
            plan_id: newPlanId,
            current_period_start: new Date((updatedSubscription as any).current_period_start * 1000).toISOString(),
            current_period_end: new Date((updatedSubscription as any).current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubscription.id)
      } catch { /* non-critical */ }

      await supabase
        .from("creators")
        .update({ subscription_plan_id: newPlanId })
        .eq("id", creator.id)

      const periodEnd = new Date((updatedSubscription as any).current_period_end * 1000)

      return NextResponse.json({
        success: true,
        type: "downgrade",
        message: `Downgrade scheduled. Your new plan takes effect on ${periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
        effectiveDate: periodEnd.toISOString(),
      })
    }
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/change:", error)
    return NextResponse.json(
      { error: error.message || "Failed to change subscription" },
      { status: 500 }
    )
  }
}
