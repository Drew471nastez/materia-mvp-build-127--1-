import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { sendPayoutCreatedEmail } from "@/lib/email"

/**
 * POST /api/stripe/cashout
 *
 * Stan-style cashout: seller clicks "Cash out" and Storelib triggers
 * a payout on their connected Stripe account. Full available balance only.
 *
 * - Enforces min cashout
 * - Prevents double cashout (no concurrent in-transit)
 * - Uses idempotency key
 * - Updates platform ledger: available → in_transit
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id, default_currency, payouts_enabled")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({ error: "No connected Stripe account" }, { status: 400 })
    }

    if (!creator.payouts_enabled) {
      return NextResponse.json(
        { error: "Payouts not yet enabled. Complete your account setup first." },
        { status: 400 },
      )
    }

    // Load seller ledger (auto-create if missing)
    let { data: ledger } = await adminSupabase
      .from("seller_ledger")
      .select("*")
      .eq("creator_id", creator.id)
      .single()

    if (!ledger) {
      const { data: newLedger } = await adminSupabase
        .from("seller_ledger")
        .upsert({ creator_id: creator.id }, { onConflict: "creator_id" })
        .select()
        .single()
      ledger = newLedger
    }

    if (!ledger) {
      return NextResponse.json({ error: "No balance found" }, { status: 400 })
    }

    // Validate: has available funds
    if (ledger.available_amount <= 0) {
      return NextResponse.json(
        { error: "No funds available for cashout" },
        { status: 400 },
      )
    }

    // Validate: min cashout
    const { data: holdConfig } = await adminSupabase
      .from("payout_hold_config")
      .select("min_cashout_cents")
      .single()

    const minCashout = holdConfig?.min_cashout_cents ?? 1000
    if (ledger.available_amount < minCashout) {
      const minDollars = (minCashout / 100).toFixed(2)
      return NextResponse.json(
        { error: `Minimum cashout is $${minDollars}` },
        { status: 400 },
      )
    }

    // Validate: no active in-transit payout (prevent double cashout)
    if (ledger.in_transit_amount > 0) {
      return NextResponse.json(
        { error: "A payout is already on the way to your bank. You can cash out again once it arrives." },
        { status: 400 },
      )
    }

    // Get Stripe balance in native currency
    const stripeBalance = await stripe.balance.retrieve(
      {},
      { stripeAccount: stripeAccountId },
    )

    const nativeCurrency = (creator.default_currency || "usd").toLowerCase()
    const nativeEntry = stripeBalance.available.find(
      (b) => b.currency === nativeCurrency && b.amount > 0,
    )
    const fallbackEntry = !nativeEntry
      ? stripeBalance.available.find((b) => b.amount > 0)
      : null

    const selectedEntry = nativeEntry || fallbackEntry
    if (!selectedEntry) {
      return NextResponse.json(
        { error: "Stripe balance not ready. Try again in a few minutes." },
        { status: 400 },
      )
    }

    const payoutCurrency = selectedEntry.currency
    const payoutAmountNative = selectedEntry.amount

    // Create Stripe payout with idempotency
    const idempotencyKey = `cashout_${creator.id}_${Date.now()}`

    const stripePayout = await stripe.payouts.create(
      {
        amount: payoutAmountNative,
        currency: payoutCurrency,
        description: "Storelib cashout",
        metadata: {
          creator_id: creator.id,
          platform: "storelib",
          ledger_available_usd_cents: String(ledger.available_amount),
        },
      },
      {
        stripeAccount: stripeAccountId,
        idempotencyKey,
      },
    )

    // Update ledger: available → in_transit
    const cashoutUsdCents = ledger.available_amount

    await adminSupabase
      .from("seller_ledger")
      .update({
        available_amount: 0,
        in_transit_amount: ledger.in_transit_amount + cashoutUsdCents,
      })
      .eq("creator_id", creator.id)

    // Create ledger event
    await adminSupabase.from("ledger_events").insert({
      creator_id: creator.id,
      event_type: "cashout_initiated",
      amount_cents: cashoutUsdCents,
      net_seller_cents: cashoutUsdCents,
      currency: "usd",
      available_delta: -cashoutUsdCents,
      in_transit_delta: cashoutUsdCents,
      stripe_payout_id: stripePayout.id,
      description: `Cashout: $${(cashoutUsdCents / 100).toFixed(2)} to bank`,
    })

    // Upsert payouts table (existing pattern for payout history)
    const arrivalDate = stripePayout.arrival_date
      ? new Date(stripePayout.arrival_date * 1000).toISOString()
      : null

    const destination =
      typeof stripePayout.destination === "string"
        ? stripePayout.destination
        : (stripePayout.destination as any)?.last4
          ? `****${(stripePayout.destination as any).last4}`
          : null

    await adminSupabase.from("payouts").upsert(
      {
        creator_id: creator.id,
        stripe_payout_id: stripePayout.id,
        amount_cents: cashoutUsdCents,
        currency: payoutCurrency,
        status: stripePayout.status,
        arrival_date: arrivalDate,
        description: stripePayout.description,
        destination,
        method: stripePayout.method,
        stripe_created: new Date(stripePayout.created * 1000).toISOString(),
      },
      { onConflict: "stripe_payout_id" },
    )

    // Send email (non-blocking)
    try {
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("email, display_name")
        .eq("user_id", user.id)
        .single()

      if (profile?.email) {
        await sendPayoutCreatedEmail({
          to: profile.email,
          sellerName: profile.display_name || "Seller",
          amountCents: cashoutUsdCents,
          currency: "usd",
          payoutId: stripePayout.id,
          status: stripePayout.status,
          arrivalDate,
        })
      }
    } catch (emailErr) {
      console.error("[Cashout] Email send failed (non-fatal):", emailErr)
    }

    return NextResponse.json({
      success: true,
      payout: {
        id: stripePayout.id,
        amount_usd_cents: cashoutUsdCents,
        amount_native: payoutAmountNative,
        currency: payoutCurrency,
        status: stripePayout.status,
        arrival_date: arrivalDate,
      },
    })
  } catch (error: any) {
    console.error("[Cashout Error]", error)

    const message =
      error?.raw?.message || error?.message || "Failed to create payout"

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
