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
      // Account doesn't exist on current keys (test→live migration)
      console.warn(`Stripe account ${stripeAccountId} not found. Clearing stale reference.`)
      try {
        await adminSupabase
          .from("creators")
          .update({
            stripe_account_id: null,
            stripe_onboarding_status: "pending",
            charges_enabled: false,
            payouts_enabled: false,
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
    } else if (stripeAccountId && (chargesEnabled || payoutsEnabled)) {
      newStatus = "restricted"
    } else if (stripeAccountId) {
      newStatus = "pending"
    }

    console.log("[v0] Stripe account status:", {
      accountId: stripeAccountId,
      chargesEnabled,
      payoutsEnabled,
      status: newStatus,
      detailsSubmitted: account.details_submitted,
    })

    // Update DB with latest status (safe even if columns don't exist)
    try {
      if (
        (creator as any).stripe_onboarding_status !== newStatus ||
        (creator as any).charges_enabled !== chargesEnabled ||
        (creator as any).payouts_enabled !== payoutsEnabled
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

        if (newStatus === "enabled" && (creator as any).stripe_onboarding_status !== "enabled") {
          try {
            await adminSupabase.from("payment_connection_events").insert({
              creator_id: creator.id,
              provider: "stripe",
              event_type: "onboarding_completed",
              metadata: {
                account_id: stripeAccountId,
                charges_enabled: chargesEnabled,
                payouts_enabled: payoutsEnabled,
              },
            })
          } catch (logErr) {
            console.warn("Failed to log connection event:", logErr)
          }
        }
      }
    } catch (dbErr) {
      console.warn("Failed to update creator capabilities (columns may not exist):", dbErr)
    }

    const maskedAccountId = stripeAccountId ? `acct_****${stripeAccountId.slice(-4)}` : null

    return NextResponse.json({
      connected: isComplete,
      status: newStatus,
      accountId: maskedAccountId,
      fullAccountId: stripeAccountId,
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
