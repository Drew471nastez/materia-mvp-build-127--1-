import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe"

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("id, stripe_customer_id, slug, username")
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

    // Use Stripe Customer Portal for payment method management
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/app/settings/billing?setup_success=1`,
    })

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
