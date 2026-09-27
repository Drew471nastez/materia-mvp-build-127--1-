import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"
import { logStripeRefusal, stripeRefusal } from "@/lib/stripe/refusal"

// LIVE Stripe Price IDs
const PRICE_GROWTH = process.env.PRICE_GROWTH_MONTHLY || "price_1SzBWaBYevnBVyznNCTOXDoS"
const PRICE_PRO = process.env.PRICE_PRO_MONTHLY || "price_1SzBXSBYevnBVyznYjXfOOXX"

function getStripePriceId(planId: string): string | null {
  if (planId === "growth") return PRICE_GROWTH
  if (planId === "pro") return PRICE_PRO
  return null
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { planId, successUrl: customSuccessUrl, cancelUrl: customCancelUrl } = await request.json()

    if (!planId || planId === "free") {
      return NextResponse.json(
        { error: "Invalid plan selected" },
        { status: 400 }
      )
    }

    const stripePriceId = getStripePriceId(planId)
    if (!stripePriceId) {
      return NextResponse.json(
        { error: "No Stripe price configured for this plan" },
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

    // Validate or create Stripe customer (handles test→live key migration)
    const stripeCustomerId = await getOrCreateStripeCustomer({
      creatorId: creator.id,
      existingCustomerId: creator.stripe_customer_id,
      email: user.email,
      userId: user.id,
      username: creator.username || creator.slug,
    })

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    const successUrl = customSuccessUrl || `${appUrl}/app/settings/billing?success=1`
    const cancelUrl = customCancelUrl || `${appUrl}/app/settings/billing?canceled=1`

    // Always create a Stripe Checkout Session directly — let Stripe handle plan selection
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
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
    const refusal = stripeRefusal(error)
    if (refusal) {
      logStripeRefusal("billing/subscription/create", refusal)
      return NextResponse.json({ error: refusal.error, code: refusal.code }, { status: refusal.status })
    }
    console.error("Error in POST /api/billing/subscription/create:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create subscription" },
      { status: 500 }
    )
  }
}

