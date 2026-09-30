import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { getMarketExchangeRate } from "@/lib/exchange-rate"
import { getStorelibPaymentsStatus, statusFactsOf } from "@/lib/payments/stripe/status"

export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Strict isolation — only this user's creator row
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id, default_currency, stripe_connected_at")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    let orderPendingUsd = 0
    try {
      const { data: products } = await adminSupabase
        .from("products")
        .select("id")
        .eq("creator_id", creator.id)

      const productIds = (products || []).map((p) => p.id)
      if (productIds.length > 0) {
        const { data: orders } = await adminSupabase
          .from("orders")
          .select("status, amount_cents, fee_cents, refund_amount_cents")
          .in("product_id", productIds)
          .in("status", ["completed", "refunded"])

        const completed = (orders || []).filter((o) => o.status === "completed")
        const gross = completed.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
        const fees = completed.reduce((sum, o) => sum + (o.fee_cents || 0), 0)
        orderPendingUsd = Math.max(0, gross - fees)
      }
    } catch {
      orderPendingUsd = 0
    }

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({ payouts: [], balance: null })
    }

    // Fetch payouts + balance + account + recent balance transactions in parallel
    const [payoutsResult, balanceResult, accountResult, balanceTxResult] = await Promise.all([
      stripe.payouts.list(
        { limit: 100, expand: ["data.destination"] },
        { stripeAccount: stripeAccountId }
      ).catch(() => ({ data: [] })),
      stripe.balance.retrieve(
        {},
        { stripeAccount: stripeAccountId }
      ).catch(() => null),
      stripe.accounts.retrieve(stripeAccountId).catch(() => null),
      stripe.balanceTransactions.list(
        { limit: 5 },
        { stripeAccount: stripeAccountId }
      ).catch(() => ({ data: [] })),
    ])

    // Detect payout schedule from Stripe account settings
    const schedule = (accountResult as any)?.settings?.payouts?.schedule
    const payoutScheduleInterval: string | null = schedule?.interval || null
    const payoutScheduleDelay: number | null = schedule?.delay_days ?? null

    // Extract the exchange_rate from the most recent transaction that has one.
    // Stripe defines: presentment_amount × exchange_rate = account_amount.
    // For USD → RON: USD × rate = RON. To convert RON → USD: RON / rate = USD.
    let exchangeRate: number | null =
      (balanceTxResult.data as any[]).find((tx: any) => tx.exchange_rate)
        ?.exchange_rate ?? null

    if ((!exchangeRate || exchangeRate <= 0) && balanceResult) {
      const preferredCurrency = (creator.default_currency || "usd").toLowerCase()
      const byCurrency = new Map<string, { available: number; pending: number }>()
      for (const b of balanceResult.available) {
        const row = byCurrency.get(b.currency) || { available: 0, pending: 0 }
        row.available += b.amount
        byCurrency.set(b.currency, row)
      }
      for (const b of balanceResult.pending) {
        const row = byCurrency.get(b.currency) || { available: 0, pending: 0 }
        row.pending += b.amount
        byCurrency.set(b.currency, row)
      }
      const dominant =
        [...byCurrency.entries()].sort(
          (a, b) => b[1].available + b[1].pending - (a[1].available + a[1].pending),
        )[0] || null
      const selected = byCurrency.get(preferredCurrency)
        ? ([preferredCurrency, byCurrency.get(preferredCurrency)!] as const)
        : dominant

      if (selected && selected[0] !== "usd" && selected[1].pending > 0 && orderPendingUsd > 0) {
        exchangeRate = selected[1].pending / orderPendingUsd
      }
    }

    // Override Stripe's internal rate with the real ECB market rate (same as Google).
    // Detect the account's native currency from the balance result.
    if (accountResult && balanceResult) {
      const nativeCurrency = (
        (accountResult as any).default_currency ||
        creator.default_currency ||
        "usd"
      ).toLowerCase()
      if (nativeCurrency !== "usd") {
        const marketRate = await getMarketExchangeRate(nativeCurrency, exchangeRate)
        if (marketRate && marketRate > 0) exchangeRate = marketRate
      }
    }

    const payouts = payoutsResult.data.map((p) => {
      // Extract readable destination string
      let destination: string | null = null
      const dest = p.destination as any
      if (dest) {
        if (typeof dest === "string") {
          destination = dest
        } else if (dest.last4) {
          // Build a readable label: "Chase ••••1234" or just "Bank ••••1234"
          const bankName = dest.bank_name || dest.institution_name || null
          const last4 = dest.last4
          const accountType = dest.account_type ? ` (${dest.account_type})` : ""
          destination = bankName
            ? `${bankName} ••••${last4}${accountType}`
            : `Bank account ••••${last4}${accountType}`
        }
      }

      return {
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        // arrival_date is a Unix timestamp (seconds)
        arrival_date: p.arrival_date ?? null,
        created: p.created,
        method: p.method,
        type: p.type,
        description: p.description ?? null,
        destination,
      }
    })

    let balance = balanceResult
      ? {
          available: balanceResult.available.map((b) => ({
            amount: b.amount,
            currency: b.currency,
          })),
          pending: balanceResult.pending.map((b) => ({
            amount: b.amount,
            currency: b.currency,
          })),
        }
      : null

    // Fallback: if Stripe returned empty balance arrays (e.g. new/reconnected
    // account with no transactions yet) but platform has recorded orders,
    // use the seller_ledger as fallback so the UI doesn't flash $0.
    const hasStripeBalance = balance &&
      (balance.available.some((b) => b.amount !== 0) || balance.pending.some((b) => b.amount !== 0))

    if (!hasStripeBalance && orderPendingUsd > 0) {
      try {
        const { data: ledger } = await adminSupabase
          .from("seller_ledger")
          .select("available_amount, pending_amount")
          .eq("creator_id", creator.id)
          .maybeSingle()

        if (ledger) {
          const ledgerAvail = ledger.available_amount || 0
          const ledgerPending = ledger.pending_amount || 0
          if (ledgerAvail > 0 || ledgerPending > 0) {
            balance = {
              available: [{ amount: ledgerAvail, currency: "usd" }],
              pending: [{ amount: ledgerPending, currency: "usd" }],
            }
          } else if (orderPendingUsd > 0) {
            // Ledger also empty — use order net as pending (funds settling)
            balance = {
              available: [{ amount: 0, currency: "usd" }],
              pending: [{ amount: orderPendingUsd, currency: "usd" }],
            }
          }
        }
      } catch { /* non-fatal */ }
    }

    // Include account status for the client state machine
    const accountStatus = accountResult ? {
      charges_enabled: (accountResult as any).charges_enabled || false,
      payouts_enabled: (accountResult as any).payouts_enabled || false,
      details_submitted: (accountResult as any).details_submitted || false,
      requirements: {
        currently_due: (accountResult as any).requirements?.currently_due || [],
        eventually_due: (accountResult as any).requirements?.eventually_due || [],
        past_due: (accountResult as any).requirements?.past_due || [],
        disabled_reason: (accountResult as any).requirements?.disabled_reason || null,
      },
    } : null

    /* The same status the payments card shows, from the same account read. */
    const banks = (accountResult as any)?.external_accounts?.data as Array<{ object?: string; status?: string | null }> | undefined
    const paymentsStatus = accountResult
      ? getStorelibPaymentsStatus(
          statusFactsOf(
            accountResult as any,
            banks ? banks.filter((b) => b.object === "bank_account") : (accountResult as any).payouts_enabled ? [{ status: "new" }] : [],
            {
              everActive: !!(creator as { stripe_connected_at?: string | null }).stripe_connected_at,
              lastPayoutFailed: (payoutsResult.data[0] as { status?: string } | undefined)?.status === "failed",
            },
          ),
        )
      : null

    // Fetch dispute data from ledger + active disputes from Stripe
    let disputeData: {
      negativeBalance: number
      activeDisputes: number
      totalDisputedAmount: number
      hasActiveDisputes: boolean
    } = { negativeBalance: 0, activeDisputes: 0, totalDisputedAmount: 0, hasActiveDisputes: false }

    try {
      const { data: ledger } = await adminSupabase
        .from("seller_ledger")
        .select("negative_balance")
        .eq("creator_id", creator.id)
        .maybeSingle()

      const negativeBalance = ledger?.negative_balance || 0

      // Count active (open) disputed orders
      const { data: products } = await adminSupabase
        .from("products")
        .select("id")
        .eq("creator_id", creator.id)
      const pIds = (products || []).map((p) => p.id)
      let activeDisputes = 0
      let totalDisputedAmount = 0

      if (pIds.length > 0) {
        const { data: disputedOrders } = await adminSupabase
          .from("orders")
          .select("amount_cents")
          .in("product_id", pIds)
          .eq("status", "disputed")
        activeDisputes = disputedOrders?.length || 0
        totalDisputedAmount = (disputedOrders || []).reduce((s, o) => s + (o.amount_cents || 0), 0)
      }

      disputeData = {
        negativeBalance,
        activeDisputes,
        totalDisputedAmount,
        hasActiveDisputes: activeDisputes > 0,
      }
    } catch { /* non-fatal */ }

    // ── 1099-K Tax Data ────────────────────────────────────────────────────────
    // Calculate gross earnings + transaction count for current and previous tax year
    // Federal threshold: $20,000 AND 200+ transactions
    let taxData: {
      currentYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean }
      previousYear: { year: number; grossCents: number; transactionCount: number; isEligible: boolean }
      stripeExpressDashboardUrl: string | null
    } = {
      currentYear: { year: new Date().getFullYear(), grossCents: 0, transactionCount: 0, isEligible: false },
      previousYear: { year: new Date().getFullYear() - 1, grossCents: 0, transactionCount: 0, isEligible: false },
      stripeExpressDashboardUrl: null,
    }

    try {
      const { data: allProducts } = await adminSupabase
        .from("products")
        .select("id")
        .eq("creator_id", creator.id)
      const allProdIds = (allProducts || []).map((p) => p.id)

      if (allProdIds.length > 0) {
        const currentYear = new Date().getFullYear()
        const previousYear = currentYear - 1

        // Fetch completed orders for both years (gross amount for 1099-K = total charged, not net)
        const { data: taxOrders } = await adminSupabase
          .from("orders")
          .select("amount_cents, created_at, status")
          .in("product_id", allProdIds)
          .in("status", ["completed", "refunded", "disputed"])
          .gte("created_at", `${previousYear}-01-01T00:00:00Z`)

        for (const order of taxOrders || []) {
          const orderYear = new Date(order.created_at).getFullYear()
          const bucket = orderYear === currentYear ? taxData.currentYear : orderYear === previousYear ? taxData.previousYear : null
          if (bucket) {
            bucket.grossCents += order.amount_cents || 0
            bucket.transactionCount += 1
          }
        }

        taxData.currentYear.isEligible = taxData.currentYear.grossCents >= 2000000 && taxData.currentYear.transactionCount >= 200
        taxData.previousYear.isEligible = taxData.previousYear.grossCents >= 2000000 && taxData.previousYear.transactionCount >= 200
      }

      /* Tax forms stay in email. The Express dashboard is not opened from here. */
    } catch { /* non-fatal */ }

    return NextResponse.json({ payouts, balance, exchangeRate, payoutScheduleInterval, payoutScheduleDelay, accountStatus, paymentsStatus, disputeData, taxData })
  } catch (error: any) {
    console.error("[Stripe Payouts Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch payouts" },
      { status: 500 }
    )
  }
}
