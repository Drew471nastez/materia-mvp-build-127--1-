import type Stripe from "stripe"
import { moneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"
import { logStripeRefusal, stripeRefusal } from "@/lib/stripe/refusal"
import { stripeIdempotencyKey } from "@/lib/stripe/resilience"
import { readSubscriptionRow, subscriptionReader } from "@/lib/billing/subscription-reader"
import { alreadyPayingVerdict } from "@/lib/billing/subscription-state"
import { trustedReturnUrl } from "@/lib/billing/return-url"
import { growthPriceId, proPriceId } from "@/lib/billing/stripe-prices"
import { GROW_PRICE_NOT_READY, growPriceMatchesShown } from "@/lib/billing/grow-price-guard"

// LIVE Stripe Price IDs (lib/billing/stripe-prices): Grow is the $14 price in PRICE_GROWTH_MONTHLY.
const PRICE_GROWTH = growthPriceId()
const PRICE_PRO = proPriceId()

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

    /*
      NEVER A SECOND SUBSCRIPTION. A creator already paying changes plan
      (/api/billing/subscription/change); a checkout here would bill them
      twice. The upgrade screens only offer this to someone not paying, but a
      screen drawn while Stripe was down, a second tab or a double tap can
      still send it. Stripe is asked fresh; when it cannot be asked and the
      stored row says they pay, nothing is started.
    */
    const storedRow = await readSubscriptionRow(createAdminClient(), creator.id)
    const customers = [creator.stripe_customer_id, storedRow?.stripe_customer_id]
    const hasCustomer = customers.some((c) => typeof c === "string" && c.startsWith("cus_"))
    const verdict = alreadyPayingVerdict(storedRow, hasCustomer ? await subscriptionReader.read(customers, { fresh: true }) : null)
    if (verdict === "paying") {
      return NextResponse.json({ error: "You already have a paid plan. Change it from Billing.", code: "already_subscribed" }, { status: 409 })
    }
    if (verdict === "unknown") {
      return NextResponse.json({ error: "We couldn't check your current plan with Stripe. Nothing was charged. Try again in a minute.", code: "billing_unavailable" }, { status: 503 })
    }

    /* Grow is sold at the price every card shows (lib/billing/grow-price-guard): while the Stripe price charges anything else, nothing is started. */
    if (planId === "growth" && !(await growPriceMatchesShown(stripe, stripePriceId))) {
      return NextResponse.json({ error: GROW_PRICE_NOT_READY, code: "price_not_ready" }, { status: 503 })
    }

    // Validate or create Stripe customer (handles test→live key migration)
    const stripeCustomerId = await getOrCreateStripeCustomer({
      creatorId: creator.id,
      existingCustomerId: creator.stripe_customer_id,
      email: who.ownerEmail ?? undefined,
      userId: who.ownerUserId,
      username: creator.username || creator.slug,
    })

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    /* Where Stripe sends them after paying or backing out: a page the request names only when it is on Storelib (lib/billing/return-url), never an open redirect. */
    const successUrl = trustedReturnUrl(customSuccessUrl) ?? `${appUrl}/app/settings/billing?success=1`
    const cancelUrl = trustedReturnUrl(customCancelUrl) ?? `${appUrl}/app/settings/billing?canceled=1`

    // Always create a Stripe Checkout Session directly — let Stripe handle plan selection
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
    }
    /* A double tap, or a retry of a request whose answer was lost, opens the same Checkout rather than a second one (10 minutes). */
    const checkoutSession = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: stripeIdempotencyKey("plan-checkout", [creator.id, planId], sessionParams, { windowMs: 10 * 60_000 }),
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

