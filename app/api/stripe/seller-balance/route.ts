import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/stripe/seller-balance
 *
 * Returns the seller's platform ledger balances (source of truth for UI).
 * Does NOT read from Stripe directly — reads from seller_ledger table.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id, payouts_enabled, charges_enabled, details_submitted, stripe_onboarding_status")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    // Get or create ledger
    let { data: ledger } = await adminSupabase
      .from("seller_ledger")
      .select("*")
      .eq("creator_id", creator.id)
      .single()

    if (!ledger) {
      // Auto-create ledger for this seller
      const { data: newLedger } = await adminSupabase
        .from("seller_ledger")
        .insert({ creator_id: creator.id })
        .select()
        .single()
      ledger = newLedger
    }

    // Get hold config
    const { data: holdConfig } = await adminSupabase
      .from("payout_hold_config")
      .select("hold_days, min_cashout_cents")
      .single()

    // Get next hold release date (earliest unreleased sale)
    const { data: nextRelease } = await adminSupabase
      .from("ledger_events")
      .select("hold_until")
      .eq("creator_id", creator.id)
      .eq("event_type", "sale")
      .is("released_at", null)
      .order("hold_until", { ascending: true })
      .limit(1)
      .maybeSingle()

    // Get recent ledger events for activity feed
    const { data: recentEvents } = await adminSupabase
      .from("ledger_events")
      .select("*")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(20)

    return NextResponse.json({
      ledger: ledger
        ? {
            pending_amount: ledger.pending_amount,
            available_amount: ledger.available_amount,
            in_transit_amount: ledger.in_transit_amount,
            lifetime_earnings: ledger.lifetime_earnings,
            lifetime_fees: ledger.lifetime_fees,
            lifetime_refunds: ledger.lifetime_refunds,
            lifetime_paid_out: ledger.lifetime_paid_out,
            negative_balance: ledger.negative_balance,
          }
        : null,
      account: {
        payouts_enabled: creator.payouts_enabled || false,
        charges_enabled: creator.charges_enabled || false,
        details_submitted: creator.details_submitted || false,
        onboarding_status: creator.stripe_onboarding_status,
        has_stripe: !!creator.stripe_account_id,
      },
      hold_days: holdConfig?.hold_days ?? 7,
      min_cashout_cents: holdConfig?.min_cashout_cents ?? 1000,
      next_release_date: nextRelease?.hold_until || null,
      recent_events: recentEvents || [],
    })
  } catch (error: any) {
    console.error("[Seller Balance Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch balance" },
      { status: 500 },
    )
  }
}
