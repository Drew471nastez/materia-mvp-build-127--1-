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

    let accountId = (creator as any).stripe_account_id || null

    // Validate existing account if present (handles test→live key migration)
    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId)
      } catch {
        console.warn(`Stripe account ${accountId} not found (likely test-mode). Creating new live account.`)
        accountId = null
      }
    }

    // Create Stripe Connect account if needed
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

      // Update creator with new account ID (safe even if columns don't exist yet)
      try {
        await adminSupabase
          .from("creators")
          .update({
            stripe_account_id: accountId,
            stripe_onboarding_status: "pending",
          })
          .eq("id", creator.id)
      } catch (dbErr) {
        console.error("Failed to update creator with stripe_account_id (column may not exist):", dbErr)
      }

      // Log connection event (safe even if table doesn't exist)
      try {
        await adminSupabase.from("payment_connection_events").insert({
          creator_id: creator.id,
          provider: "stripe",
          event_type: "onboarding_started",
          metadata: { account_id: accountId },
        })
      } catch (logErr) {
        console.warn("Failed to log payment_connection_event (table may not exist):", logErr)
      }
    }

    // Create account link for onboarding
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
    const returnUrl = `${baseUrl}/app/settings?tab=payments&connect_success=true`
    const refreshUrl = `${baseUrl}/app/settings?tab=payments&refresh=true`

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
