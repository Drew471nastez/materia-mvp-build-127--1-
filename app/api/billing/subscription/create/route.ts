import { moneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
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
    /* The owner, or a team member who may change the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "manage")
    if (!who.ok) return who.response

    // Get creator record
    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("id, stripe_customer_id, subscription_plan_id, slug, username")
      .eq("id", who.creatorId)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Validate or create Stripe customer (handles test→live key migration)
    const stripeCustomerId = await getOrCreateStripeCustomer({
      creatorId: creator.id,
      existingCustomerId: creator.stripe_customer_id,
      email: who.ownerEmail,
      userId: who.ownerUserId,
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

    /* A team member's change to the owner's plan is on the record with their name (lib/team/areas). */
    await recordTeamAction(who, who.userId, "billing_manage", "billing_plan_changed", {})
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

