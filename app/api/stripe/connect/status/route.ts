import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

function tryCreateAdminClient() {
  try {
    const { createAdminClient } = require("@/lib/supabase/admin")
    return createAdminClient()
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = tryCreateAdminClient()
    const dbClient = adminSupabase || supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    const stripeAccountId = (creator as any).stripe_account_id || null
    if (!stripeAccountId) {
      return NextResponse.json({
        connected: false,
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
      })
    }

    let account
    try {
      account = await stripe.accounts.retrieve(stripeAccountId)
    } catch {
      console.warn(`Stripe account ${stripeAccountId} not found. Clearing stale reference.`)
      try {
        await dbClient
          .from("creators")
          .update({
            stripe_account_id: null,
            stripe_onboarding_status: "pending",
          })
          .eq("id", creator.id)
      } catch (dbErr) {
        console.warn("Failed to clear stale account ref:", dbErr)
      }

      return NextResponse.json({
        connected: false,
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
      })
    }

    const chargesEnabled = account.charges_enabled || false
    const payoutsEnabled = account.payouts_enabled || false
    const isComplete = chargesEnabled && payoutsEnabled

    let newStatus = "not_connected"
    if (isComplete) {
      newStatus = "enabled"
    } else if (chargesEnabled || payoutsEnabled) {
      newStatus = "restricted"
    } else {
      newStatus = "pending"
    }

    // Update DB with latest status
    try {
      await dbClient
        .from("creators")
        .update({
          stripe_onboarding_status: newStatus,
          charges_enabled: chargesEnabled,
          payouts_enabled: payoutsEnabled,
        })
        .eq("id", creator.id)
    } catch (dbErr) {
      console.warn("Failed to update creator capabilities:", dbErr)
    }

    const maskedAccountId = `acct_****${stripeAccountId.slice(-4)}`

    return NextResponse.json({
      connected: isComplete,
      status: newStatus,
      accountId: maskedAccountId,
      fullAccountId: stripeAccountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted: account.details_submitted,
    })
  } catch (error) {
    console.error("[Stripe Connect Status Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Stripe Connect status" },
      { status: 500 },
    )
  }
}
