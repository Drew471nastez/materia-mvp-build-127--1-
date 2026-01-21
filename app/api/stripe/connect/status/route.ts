import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

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

    if (!creator.stripe_account_id) {
      return NextResponse.json({
        connected: false,
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
      })
    }

    const account = await stripe.accounts.retrieve(creator.stripe_account_id)

    const chargesEnabled = account.charges_enabled || false
    const payoutsEnabled = account.payouts_enabled || false
    const isComplete = chargesEnabled && payoutsEnabled

    let newStatus = "not_connected"
    if (isComplete) {
      newStatus = "enabled"
    } else if (creator.stripe_account_id && (chargesEnabled || payoutsEnabled)) {
      newStatus = "restricted"
    } else if (creator.stripe_account_id) {
      newStatus = "pending"
    }

    console.log("[v0] Stripe account status:", {
      accountId: creator.stripe_account_id,
      chargesEnabled,
      payoutsEnabled,
      status: newStatus,
      detailsSubmitted: account.details_submitted,
    })

    if (
      creator.stripe_onboarding_status !== newStatus ||
      creator.charges_enabled !== chargesEnabled ||
      creator.payouts_enabled !== payoutsEnabled
    ) {
      await adminSupabase
        .from("creators")
        .update({
          stripe_onboarding_status: newStatus,
          charges_enabled: chargesEnabled,
          payouts_enabled: payoutsEnabled,
        })
        .eq("id", creator.id)

      console.log("[v0] Updated creator capabilities:", { chargesEnabled, payoutsEnabled, status: newStatus })

      if (newStatus === "enabled" && creator.stripe_onboarding_status !== "enabled") {
        await adminSupabase.from("payment_connection_events").insert({
          creator_id: creator.id,
          provider: "stripe",
          event_type: "onboarding_completed",
          metadata: {
            account_id: creator.stripe_account_id,
            charges_enabled: chargesEnabled,
            payouts_enabled: payoutsEnabled,
          },
        })
      }
    }

    const maskedAccountId = creator.stripe_account_id ? `acct_****${creator.stripe_account_id.slice(-4)}` : null

    return NextResponse.json({
      connected: isComplete,
      status: newStatus,
      accountId: maskedAccountId,
      fullAccountId: creator.stripe_account_id,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted: account.details_submitted,
      externalAccount: account.external_accounts?.data?.[0] || null,
    })
  } catch (error) {
    console.error("[v0] Stripe Connect Status Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Stripe Connect status" },
      { status: 500 },
    )
  }
}
