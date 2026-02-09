import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
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
      .select("id, subscription_plan_id, subscription_status, stripe_customer_id")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Get subscription details with plan information
    const { data: subscription, error: subscriptionError } = await supabase
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

    if (subscriptionError) {
      console.error("Error fetching subscription:", subscriptionError)
      return NextResponse.json(
        { error: "Failed to fetch subscription" },
        { status: 500 }
      )
    }

    // If no subscription record exists, user is on free plan
    if (!subscription) {
      // Get free plan details
      const { data: freePlan } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", "free")
        .single()

      return NextResponse.json({
        subscription: null,
        currentPlan: freePlan || {
          id: "free",
          name: "Free",
          price_cents: 0,
          billing_period: null,
          fee_percent: 0.06,
          fee_fixed_cents: 25,
          features: ["6% + $0.25 per transaction"],
        },
        status: "active",
      })
    }

    return NextResponse.json({
      subscription,
      currentPlan: subscription.subscription_plans,
      status: subscription.status,
    })
  } catch (error) {
    console.error("Error in GET /api/billing/subscription:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
