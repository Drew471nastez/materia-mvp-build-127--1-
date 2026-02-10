import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

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

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id, stripe_customer_id, slug, username")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

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

      await supabase
        .from("creators")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", creator.id)
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL

    // Create a setup-mode Checkout Session (collects card without charging)
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "setup",
      payment_method_types: ["card"],
      ui_mode: "embedded",
      return_url: `${baseUrl}/app/settings/billing?setup_success=true`,
      metadata: {
        creator_id: creator.id,
      },
    })

    return NextResponse.json({
      clientSecret: checkoutSession.client_secret,
      sessionId: checkoutSession.id,
    })
  } catch (error: any) {
    console.error("Error in POST /api/billing/checkout/setup:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create setup session" },
      { status: 500 }
    )
  }
}
