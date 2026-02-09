import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

export async function POST() {
  try {
    const supabase = await createClient()

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
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
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
        { error: "No active subscription found" },
        { status: 400 }
      )
    }

    // Cancel subscription at period end in Stripe
    const canceledSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      }
    )

    // Update subscription in database
    await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id)

    return NextResponse.json({
      success: true,
      message: "Subscription will be canceled at the end of the current billing period",
      cancelAt: new Date(canceledSubscription.current_period_end * 1000).toISOString(),
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/cancel:", error)
    return NextResponse.json(
      { error: error.message || "Failed to cancel subscription" },
      { status: 500 }
    )
  }
}
