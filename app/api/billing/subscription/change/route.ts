import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

const PLAN_ORDER: Record<string, number> = { free: 0, growth: 1, pro: 2 }

function getStripePriceId(planId: string): string | null {
  switch (planId) {
    case "growth":
      return process.env.PRICE_GROWTH_MONTHLY || null
    case "pro":
      return process.env.PRICE_PRO_MONTHLY || null
    default:
      return null
  }
}

function isUpgrade(currentPlanId: string, newPlanId: string): boolean {
  return (PLAN_ORDER[newPlanId] ?? 0) > (PLAN_ORDER[currentPlanId] ?? 0)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { newPlanId } = await request.json()

    if (!newPlanId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      )
    }

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator record
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id, subscription_plan_id")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // If changing to free plan, cancel the subscription instead
    if (newPlanId === "free") {
      return NextResponse.json(
        { error: "To downgrade to Free, please cancel your subscription" },
        { status: 400 }
      )
    }

    const stripePriceId = getStripePriceId(newPlanId)
    if (!stripePriceId) {
      return NextResponse.json(
        { error: "No Stripe price configured for this plan" },
        { status: 400 }
      )
    }

    // Get current subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (subscriptionError) {
      console.error("Error fetching subscription:", subscriptionError)
      return NextResponse.json(
        { error: "Failed to fetch subscription" },
        { status: 500 }
      )
    }

    if (!subscription || !subscription.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found. Please create a new subscription instead." },
        { status: 400 }
      )
    }

    // Get the Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    )

    if (!stripeSubscription) {
      return NextResponse.json(
        { error: "Stripe subscription not found" },
        { status: 404 }
      )
    }

    const currentPlanId = creator.subscription_plan_id || "free"
    const upgrading = isUpgrade(currentPlanId, newPlanId)

    if (upgrading) {
      // ---- UPGRADE: Immediate + prorated ----
      // Stripe will calculate prorated credit for unused time on current plan
      // and charge the prorated amount for the new, higher plan immediately
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
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

      // Update subscription in database
      await supabase
        .from("subscriptions")
        .update({
          plan_id: newPlanId,
          current_period_start: new Date((updatedSubscription as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((updatedSubscription as any).current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id)

      // Update creator's plan immediately
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
      // Use Stripe's subscription schedule to apply the change at period end
      // The user keeps their current plan until the billing period ends
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
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

      // Update subscription in database — plan changes immediately in Stripe
      // but with proration_behavior: "none", no credit/charge is issued
      await supabase
        .from("subscriptions")
        .update({
          plan_id: newPlanId,
          current_period_start: new Date((updatedSubscription as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((updatedSubscription as any).current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id)

      // Update creator's plan
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
