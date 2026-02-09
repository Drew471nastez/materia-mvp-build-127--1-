import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { planId } = await request.json()

    if (!planId || planId === "free") {
      return NextResponse.json(
        { error: "Invalid plan selected" },
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
      .select("id, stripe_customer_id, subscription_plan_id, slug, username")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Check if creator already has an active subscription
    const { data: existingSubscription } = await supabase
      .from("subscriptions")
      .select("id, status")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (existingSubscription && existingSubscription.status === "active") {
      return NextResponse.json(
        { error: "You already have an active subscription. Please cancel or change your current plan instead." },
        { status: 400 }
      )
    }

    // Get the plan details
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .single()

    if (planError || !plan || !plan.stripe_price_id) {
      return NextResponse.json(
        { error: "Invalid plan or plan not configured" },
        { status: 400 }
      )
    }

    // Create or get Stripe customer
    let stripeCustomerId = creator.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          creator_id: creator.id,
          user_id: user.id,
          username: creator.username || creator.slug,
        },
      })

      stripeCustomerId = customer.id

      // Update creator with Stripe customer ID
      await supabase
        .from("creators")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", creator.id)
    }

    // Create Stripe Checkout Session for subscription
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/billing?canceled=true`,
      metadata: {
        creator_id: creator.id,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          creator_id: creator.id,
          plan_id: planId,
        },
      },
    })

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/subscription/create:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create subscription" },
      { status: 500 }
    )
  }
}
