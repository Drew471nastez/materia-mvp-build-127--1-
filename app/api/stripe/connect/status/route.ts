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
    const dbClient = tryCreateAdminClient() || supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await dbClient.from("creators").select("*").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })

    const stripeAccountId = (creator as any).stripe_account_id || null
    if (!stripeAccountId) {
      return NextResponse.json({
        connected: false,
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      })
    }

    let account
    try {
      account = await stripe.accounts.retrieve(stripeAccountId)
    } catch {
      await dbClient
        .from("creators")
        .update({
          stripe_account_id: null,
          stripe_onboarding_status: "not_connected",
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          stripe_connected_at: null,
        })
        .eq("id", creator.id)

      return NextResponse.json({
        connected: false,
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      })
    }

    const chargesEnabled = !!account.charges_enabled
    const payoutsEnabled = !!account.payouts_enabled
    const detailsSubmitted = !!account.details_submitted
    const connected = chargesEnabled && payoutsEnabled && detailsSubmitted
    const status = connected ? "connected" : "pending"

    await dbClient
      .from("creators")
      .update({
        stripe_onboarding_status: status,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
        stripe_connected_at: connected ? new Date().toISOString() : null,
      })
      .eq("id", creator.id)

    return NextResponse.json({
      connected,
      status,
      accountId: `acct_****${stripeAccountId.slice(-4)}`,
      fullAccountId: stripeAccountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
    })
  } catch (error: any) {
    console.error("[Stripe Connect Status Error]", error)
    return NextResponse.json({ error: error.message || "Failed to fetch Stripe Connect status" }, { status: 500 })
  }
}
