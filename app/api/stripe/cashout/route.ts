import { moneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { emit } from "@/lib/notify/outbox"
import { ledgerCurrency, toLedger } from "@/lib/payments/ledger-currency"
import { formatMinor } from "@/lib/markets/money"
import { cashoutIdempotencyKey } from "@/lib/stripe/resilience"

/**
 * POST /api/stripe/cashout
 *
 * Stan-style cashout: seller clicks "Cash out" and Storelib triggers
 * a payout on their connected Stripe account. Full available balance only.
 *
 * - Enforces min cashout
 * - Prevents double cashout (no concurrent in-transit)
 * - Keys the payout by what it is (account, last cashout, amount), never the time
 * - Updates platform ledger: available → in_transit
 *
 * TWO KINDS OF NUMBER, NEVER MIXED. The wallet (seller_ledger, ledger_events)
 * is kept in one currency, the platform's (lib/payments/ledger-currency), and
 * every amount written to it is in that currency's minor units. The payout
 * itself is Stripe's: the creator's whole available balance, in the currency
 * Stripe holds it in, and the `payouts` row records exactly that. A balance
 * is turned into the wallet's currency at the ECB rate of the day, the same
 * rates every other wallet line uses; with no rate, nothing is guessed.
 */
export async function POST(request: Request) {
  try {
    const adminSupabase = createAdminClient()

    /* The owner, or a team member who may change the store's payouts (round 42, lib/team/money): the store's own Stripe account, never the member's. */
    const who = await moneyCaller("payouts", "manage")
    if (!who.ok) return who.response

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id, default_currency, payouts_enabled")
      .eq("id", who.creatorId)
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

      // Stripe has settled funds — sync the ledger so cashout can proceed,
      // in the wallet's own currency at the day's ECB rate (never a guess).
      const synced = await toLedger([availableEntry.amount], availableEntry.currency)
      if (synced.currency !== ledgerCurrency()) {
        return NextResponse.json(
          { error: "Your balance is being updated. Try again in a few minutes." },
          { status: 503 },
        )
      }
      const syncWalletMinor = synced.amounts[0] ?? 0

      // Move settled funds from pending → available in the ledger
      const pendingReduction = Math.min(ledger.pending_amount, syncWalletMinor)
      await adminSupabase
        .from("seller_ledger")
        .update({
          available_amount: syncWalletMinor,
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
      ledger.available_amount = syncWalletMinor
      ledger.pending_amount = Math.max(0, ledger.pending_amount - pendingReduction)
    }

    // Validate: min cashout
    const { data: holdConfig } = await adminSupabase
      .from("payout_hold_config")
      .select("min_cashout_cents")
      .single()

    const minCashout = holdConfig?.min_cashout_cents ?? 100
    if (ledger.available_amount < minCashout) {
      return NextResponse.json(
        { error: `Minimum cashout is ${formatMinor(minCashout, ledgerCurrency().toUpperCase(), "en")}` },
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
    const cashoutWalletMinor = ledger.available_amount
    const { data: lockedLedger, error: lockErr } = await adminSupabase
      .from("seller_ledger")
      .update({
        available_amount: 0,
        in_transit_amount: ledger.in_transit_amount + cashoutWalletMinor,
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

    const nativeCurrency = (creator.default_currency || "").toLowerCase()
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
          available_amount: cashoutWalletMinor,
          in_transit_amount: Math.max(0, (lockedLedger.in_transit_amount || 0) - cashoutWalletMinor),
        })
        .eq("creator_id", creator.id)
      return NextResponse.json(
        { error: "Stripe balance not ready. Try again in a few minutes." },
        { status: 400 },
      )
    }

    const payoutCurrency = selectedEntry.currency
    const payoutAmountNative = selectedEntry.amount

    const rollback = () =>
      adminSupabase
        .from("seller_ledger")
        .update({
          available_amount: cashoutWalletMinor,
          in_transit_amount: Math.max(0, (lockedLedger.in_transit_amount || 0) - cashoutWalletMinor),
        })
        .eq("creator_id", creator.id)

    /*
      The payout's key is the payout itself, never the clock (lib/stripe/resilience
      cashoutIdempotencyKey): this account, its last recorded cashout, and this
      amount. A press whose answer was lost (the payout made, the ledger rolled
      back below) and pressed again gets the same payout back instead of a
      second one. The last cashout is read here; unread, nothing is paid.
    */
    const { data: lastCashout, error: lastCashoutErr } = await adminSupabase
      .from("ledger_events")
      .select("id")
      .eq("creator_id", creator.id)
      .eq("event_type", "cashout_initiated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastCashoutErr) {
      await rollback()
      return NextResponse.json({ error: "Your balance is being updated. Try again in a few minutes." }, { status: 503 })
    }

    const payoutParams = {
      amount: payoutAmountNative,
      currency: payoutCurrency,
      description: "Storelib cashout",
      metadata: {
        creator_id: creator.id,
        platform: "storelib",
        /* What the wallet moved to in transit, in its own currency's minor units. */
        ledger_available_minor: String(cashoutWalletMinor),
        ledger_currency: ledgerCurrency(),
      },
    }
    const idempotencyKey = cashoutIdempotencyKey({
      creatorId: creator.id,
      accountId: stripeAccountId,
      lastCashoutEventId: (lastCashout as { id?: string } | null)?.id ?? null,
      walletMinor: cashoutWalletMinor,
      params: payoutParams,
    })

    let stripePayout
    try {
      stripePayout = await stripe.payouts.create(payoutParams, { stripeAccount: stripeAccountId, idempotencyKey })
    } catch (stripeErr: any) {
      // Rollback ledger: move funds back from in_transit to available. If Stripe
      // did make the payout and only the answer was lost, the next press sends
      // the same key and gets that payout back.
      await rollback()
      console.error("[Cashout] Stripe payout failed, ledger rolled back:", stripeErr)
      throw stripeErr
    }

    // Ledger already updated atomically above (available → in_transit)

    // Create ledger event
    await adminSupabase.from("ledger_events").insert({
      creator_id: creator.id,
      event_type: "cashout_initiated",
      amount_cents: cashoutWalletMinor,
      net_seller_cents: cashoutWalletMinor,
      currency: ledgerCurrency(),
      available_delta: -cashoutWalletMinor,
      in_transit_delta: cashoutWalletMinor,
      stripe_payout_id: stripePayout.id,
      description: `Cashout: ${formatMinor(payoutAmountNative, payoutCurrency.toUpperCase(), "en")} to bank`,
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
        /* Stripe's payout as it is: its amount in its own currency. */
        amount_cents: stripePayout.amount,
        currency: stripePayout.currency || payoutCurrency,
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
      /* The store owner is told, whoever pressed Cash out. */
      userId: who.ownerUserId,
      creatorId: creator.id,
      entityType: "payout",
      entityId: stripePayout.id,
      correlationId: stripePayout.id,
      payload: {
        payoutId: stripePayout.id,
        amountCents: payoutAmountNative,
        currency: payoutCurrency,
        walletAmountMinor: cashoutWalletMinor,
        walletCurrency: ledgerCurrency(),
        arrivalDate,
        method: stripePayout.method,
        bankName: bank?.bank_name || null,
        last4: bank?.last4 || null,
      },
    })

    /* A team member's cash out is on the record with their name (lib/team/areas). */
    await recordTeamAction(who, who.userId, "payouts_manage", "payout_cashed_out", { payout_id: stripePayout.id, amount: payoutAmountNative, currency: payoutCurrency })

    return NextResponse.json({
      success: true,
      payout: {
        id: stripePayout.id,
        amount: payoutAmountNative,
        wallet_amount_minor: cashoutWalletMinor,
        wallet_currency: ledgerCurrency(),
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
