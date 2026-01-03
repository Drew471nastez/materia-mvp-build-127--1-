import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator profile
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    // Get profile for email
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

    const email = profile?.email || user.email || ""

    let accountId = creator.stripe_account_id

    // Create or retrieve Stripe Connect account
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
      })
      accountId = account.id

      // Update creator with new account ID
      await adminSupabase
        .from("creators")
        .update({
          stripe_account_id: accountId,
          stripe_onboarding_status: "pending",
        })
        .eq("id", creator.id)

      // Log connection event
      await adminSupabase.from("payment_connection_events").insert({
        creator_id: creator.id,
        provider: "stripe",
        event_type: "onboarding_started",
        metadata: { account_id: accountId },
      })
    }

    // Create account link for onboarding
    const returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/app/settings/payments?success=true`
    const refreshUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/app/settings/payments?refresh=true`

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error) {
    console.error("[Stripe Connect Start Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Stripe Connect onboarding" },
      { status: 500 },
    )
  }
}
