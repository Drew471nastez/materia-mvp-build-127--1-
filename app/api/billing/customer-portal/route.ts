import { moneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"

export async function POST() {
  try {

    // Get current user
    /* The owner, or a team member who may change the store's billing (round 42, lib/team/money): the store's own plan and Stripe customer, never the member's. */
    const who = await moneyCaller("billing", "manage")
    if (!who.ok) return who.response

    // Get creator record
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
      email: who.ownerEmail,
      userId: who.ownerUserId,
      username: creator.username || creator.slug,
    })

    // Create Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"}/app/settings/billing`,
    })

    /* A team member's change to the owner's plan is on the record with their name (lib/team/areas). */
    await recordTeamAction(who, who.userId, "billing_manage", "billing_portal_opened", {})
    return NextResponse.json({
      url: portalSession.url,
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/customer-portal:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create portal session" },
      { status: 500 }
    )
  }
}
