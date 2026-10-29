import { moneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"

export async function POST() {
  try {

    /* The owner, or a team member who may change the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "manage")
    if (!who.ok) return who.response

    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("id, stripe_customer_id, slug, username")
      .eq("id", who.creatorId)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
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

    // Use Stripe Customer Portal for payment method management
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/app/settings/billing?setup_success=1`,
    })

    /* A team member's change to the owner's plan is on the record with their name (lib/team/areas). */
    await recordTeamAction(who, who.userId, "billing_manage", "billing_payment_method_changed", {})
    return NextResponse.json({
      url: portalSession.url,
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/checkout/setup:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create session" },
      { status: 500 }
    )
  }
}
