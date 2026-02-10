import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

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

    // Get new plan details
    const { data: newPlan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", newPlanId)
      .eq("is_active", true)
      .single()

    if (planError || !newPlan) {
      return NextResponse.json(
        { error: "Invalid plan or plan not found" },
        { status: 400 }
      )
    }

    // Auto-create Stripe product and price if not configured
    let stripePriceId = newPlan.stripe_price_id
    if (!stripePriceId) {
      const product = await stripe.products.create({
        name: `Storelib ${newPlan.name} Plan`,
        description: `${newPlan.name} subscription plan`,
        metadata: { plan_id: newPlan.id },
      })
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: newPlan.price_cents,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { plan_id: newPlan.id },
      })
      stripePriceId = price.id
      await supabase
        .from("subscription_plans")
        .update({ stripe_price_id: stripePriceId })
        .eq("id", newPlan.id)
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

    // Update the subscription in Stripe
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: stripePriceId,
          },
        ],
        proration_behavior: "always_invoice", // Create invoice for proration
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
        current_period_start: new Date(updatedSubscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(updatedSubscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id)

    // Update creator's plan
    await supabase
      .from("creators")
      .update({ subscription_plan_id: newPlanId })
      .eq("id", creator.id)

    return NextResponse.json({
      success: true,
      subscription: updatedSubscription,
      message: `Successfully changed to ${newPlan.name} plan`,
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/change:", error)
    return NextResponse.json(
      { error: error.message || "Failed to change subscription" },
      { status: 500 }
    )
  }
}
