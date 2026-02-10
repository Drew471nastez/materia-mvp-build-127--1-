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
      .select("id, stripe_customer_id, slug, username")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
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

    // Create Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"}/app/settings/billing`,
    })

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
