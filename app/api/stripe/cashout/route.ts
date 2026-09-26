import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { emit } from "@/lib/notify/outbox"
import { getMarketExchangeRate } from "@/lib/exchange-rate"

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

    // Validate: has available funds and no negative balance
    // Stan-style: negative balance (from refunds/disputes) must be covered by
    // future sales before cashout is allowed. Stripe already deducted these funds.
    if (ledger.negative_balance > 0) {
      return NextResponse.json(
        { error: "Your balance is negative due to a refund or dispute. Future sales will cover this automatically." },
        { status: 400 },
      )
    }

    if (ledger.available_amount <= 0) {
      // Ledger shows $0 available — check if Stripe has settled funds that
      // the hold-release cron hasn't processed yet.  Stripe is the source
      // of truth for actual settlement.
      const checkBalance = await stripe.balance.retrieve(
        {},
        { stripeAccount: stripeAccountId },
      )

      const availableEntry = checkBalance.available.find((b) => b.amount > 0)

      if (!availableEntry) {
        // Both ledger and Stripe agree: no funds available
        return NextResponse.json(
          { error: "No funds available for cashout" },
          { status: 400 },
        )
      }

      // Stripe has settled funds — sync the ledger so cashout can proceed.
      // Convert native currency to USD using the real ECB market rate.
      let syncAmountUsd = availableEntry.amount

      if (availableEntry.currency !== "usd") {
        // Try market rate first (ECB/Google rate), fall back to Stripe's rate
        let exchangeRate: number | null = await getMarketExchangeRate(availableEntry.currency, null)

        if (!exchangeRate || exchangeRate <= 0) {
          const balanceTx = await stripe.balanceTransactions.list(
            { limit: 10 },
            { stripeAccount: stripeAccountId },
          )
          exchangeRate = (balanceTx.data as any[]).find(
            (tx: any) => tx.exchange_rate,
          )?.exchange_rate ?? null
        }

        if (exchangeRate && exchangeRate > 0) {
          syncAmountUsd = Math.floor(availableEntry.amount / exchangeRate)
        }
      }

      // Move settled funds from pending → available in the ledger
      const pendingReduction = Math.min(ledger.pending_amount, syncAmountUsd)
      await adminSupabase
        .from("seller_ledger")
        .update({
          available_amount: syncAmountUsd,
          pending_amount: Math.max(0, ledger.pending_amount - pendingReduction),
        })
        .eq("creator_id", creator.id)

      // Release matching pending ledger events so they're not double-released by cron
      await adminSupabase
        .from("ledger_events")
        .update({ released_at: new Date().toISOString() })
        .eq("creator_id", creator.id)
        .eq("event_type", "sale")
        .is("released_at", null)
        .lte("hold_until", new Date().toISOString())

      // Refresh local ledger values for the rest of the flow
      ledger.available_amount = syncAmountUsd
      ledger.pending_amount = Math.max(0, ledger.pending_amount - pendingReduction)
    }

    // Validate: min cashout
    const { data: holdConfig } = await adminSupabase
      .from("payout_hold_config")
      .select("min_cashout_cents")
      .single()

    const minCashout = holdConfig?.min_cashout_cents ?? 100
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

    // ATOMIC LOCK: Conditionally update ledger only if in_transit is still 0
    // and available funds haven't changed. This prevents double-cashout from
    // concurrent requests — only one request can match the WHERE clause.
    const cashoutUsdCents = ledger.available_amount
    const { data: lockedLedger, error: lockErr } = await adminSupabase
      .from("seller_ledger")
      .update({
        available_amount: 0,
        in_transit_amount: ledger.in_transit_amount + cashoutUsdCents,
      })
      .eq("creator_id", creator.id)
      .eq("in_transit_amount", 0)
      .gte("available_amount", minCashout)
      .select()
      .single()

    if (lockErr || !lockedLedger) {
      return NextResponse.json(
        { error: "Cashout already in progress or balance changed. Please refresh and try again." },
        { status: 409 },
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
      // Rollback ledger: Stripe has no available funds despite our ledger saying so
      await adminSupabase
        .from("seller_ledger")
        .update({
          available_amount: cashoutUsdCents,
          in_transit_amount: Math.max(0, (lockedLedger.in_transit_amount || 0) - cashoutUsdCents),
        })
        .eq("creator_id", creator.id)
      return NextResponse.json(
        { error: "Stripe balance not ready. Try again in a few minutes." },
        { status: 400 },
      )
    }

    const payoutCurrency = selectedEntry.currency
    const payoutAmountNative = selectedEntry.amount

    // Create Stripe payout with idempotency
    const idempotencyKey = `cashout_${creator.id}_${Date.now()}`

    let stripePayout
    try {
      stripePayout = await stripe.payouts.create(
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
    } catch (stripeErr: any) {
      // Rollback ledger: move funds back from in_transit to available
      await adminSupabase
        .from("seller_ledger")
        .update({
          available_amount: cashoutUsdCents,
          in_transit_amount: Math.max(0, (lockedLedger.in_transit_amount || 0) - cashoutUsdCents),
        })
        .eq("creator_id", creator.id)
      console.error("[Cashout] Stripe payout failed, ledger rolled back:", stripeErr)
      throw stripeErr
    }

    // Ledger already updated atomically above (available → in_transit)

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

    /* PAYOUT_SCHEDULED through the notification engine, under the key
       payout.created raises too (app/api/stripe/webhook), so it is told
       once. The email sent here read profiles by a column it does not have
       and was never sent. */
    const bank = stripePayout.destination && typeof stripePayout.destination === "object" ? (stripePayout.destination as any) : null
    await emit({
      name: "payout.scheduled",
      key: `payout:${stripePayout.id}:scheduled`,
      userId: user.id,
      creatorId: creator.id,
      entityType: "payout",
      entityId: stripePayout.id,
      correlationId: stripePayout.id,
      payload: {
        payoutId: stripePayout.id,
        amountCents: payoutAmountNative,
        currency: payoutCurrency,
        amountUsdCents: cashoutUsdCents,
        arrivalDate,
        method: stripePayout.method,
        bankName: bank?.bank_name || null,
        last4: bank?.last4 || null,
      },
    })

    return NextResponse.json({
      success: true,
      payout: {
        id: stripePayout.id,
        amount: payoutAmountNative,
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
