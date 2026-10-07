import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"
import { pickBalance, upcomingByDay } from "@/lib/payments/display-currency"
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

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({ payouts: [], balance: null, balanceCurrency: null, upcoming: [] })
    }

    /*
      STRIPE'S OWN FIGURES, IN STRIPE'S OWN CURRENCY. This used to convert
      the balance to dollars with a market rate and, when Stripe showed
      nothing, stand in Storelib's ledger or the creator's all time order
      totals for it. Every one of those was a number that was never going
      to reach the bank. Now the balance is Stripe's, in the currency Stripe
      holds it in (lib/payments/display-currency), and "Arriving soon" is
      Stripe's pending transactions with the day each becomes available.
    */
    /*
      STRIPE AND THE DATABASE AT ONCE. The dispute and tax figures need only
      the creator row, so they are read while Stripe answers instead of after
      it (lib below: storelibFigures). And no Stripe read holds the page past
      STRIPE_WAIT_MS: a slow one answers as if Stripe had nothing, and the
      page's next tick (30s, or the next visit) reads it again.
    */
    const figuresRead = storelibFigures(adminSupabase, creator.id)
    const [payoutsResult, balanceResult, accountResult, pendingResult] = await Promise.all([
      inTime(stripe.payouts.list(
        { limit: 100, expand: ["data.destination"] },
        { stripeAccount: stripeAccountId }
      ), { data: [] as Stripe.Payout[] }),
      inTime(stripe.balance.retrieve(
        {},
        { stripeAccount: stripeAccountId }
      ), null),
      inTime(stripe.accounts.retrieve(stripeAccountId), null),
      inTime(stripe.balanceTransactions.list(
        { limit: 100 },
        { stripeAccount: stripeAccountId }
      ), { data: [] as Stripe.BalanceTransaction[] }),
    ])

    // The payout schedule Stripe keeps for the account (payouts stay manual: Cash out)
    const schedule = (accountResult as any)?.settings?.payouts?.schedule
    const payoutScheduleInterval: string | null = schedule?.interval || null
    const payoutScheduleDelay: number | null = schedule?.delay_days ?? null

    const picked = pickBalance(balanceResult, (accountResult as any)?.default_currency ?? null)
    const balanceCurrency = picked?.currency ?? ((accountResult as any)?.default_currency || null)
    const upcoming = balanceCurrency ? upcomingByDay(pendingResult.data as any[], balanceCurrency) : []

    const payouts = payoutsResult.data.map((p) => {
      // Extract readable destination string
      let destination: string | null = null
      const dest = p.destination as any
      if (dest) {
        if (typeof dest === "string") {
          destination = null
        } else if (dest.last4) {
          const bankName = dest.bank_name || dest.institution_name || null
          destination = bankName ? `${bankName} ••••${dest.last4}` : `Bank account ••••${dest.last4}`
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

    const balance = balanceResult
      ? {
          available: balanceResult.available.map((b) => ({ amount: b.amount, currency: b.currency })),
          pending: balanceResult.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
        }
      : null

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

    const { disputeData, taxData } = await figuresRead

    return NextResponse.json({ payouts, balance, balanceCurrency, upcoming, payoutScheduleInterval, payoutScheduleDelay, accountStatus, paymentsStatus, disputeData, taxData })
  } catch (error: any) {
    console.error("[Stripe Payouts Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch payouts" },
      { status: 500 }
    )
  }
}

/** The longest one Stripe read may hold this answer. */
const STRIPE_WAIT_MS = 6_000

/** A Stripe read, or `fallback` if it fails or takes longer than STRIPE_WAIT_MS. */
function inTime<T, F>(read: Promise<T>, fallback: F): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    read.catch(() => fallback),
    new Promise<F>((resolve) => {
      timer = setTimeout(() => resolve(fallback), STRIPE_WAIT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

type TaxYear = { year: number; grossCents: number; transactionCount: number; isEligible: boolean }

/**
 * Storelib's own figures for the page: the negative balance and open
 * disputes, and the 1099-K totals for this year and last. One read of the
 * product ids, then the ledger and both order reads together. A failed read
 * leaves its figures at nothing rather than failing the answer.
 */
async function storelibFigures(admin: ReturnType<typeof createAdminClient>, creatorId: string) {
  const currentYear = new Date().getFullYear()
  const previousYear = currentYear - 1
  const disputeData = { negativeBalance: 0, activeDisputes: 0, totalDisputedAmount: 0, hasActiveDisputes: false }
  const taxData: { currentYear: TaxYear; previousYear: TaxYear; stripeExpressDashboardUrl: string | null } = {
    currentYear: { year: currentYear, grossCents: 0, transactionCount: 0, isEligible: false },
    previousYear: { year: previousYear, grossCents: 0, transactionCount: 0, isEligible: false },
    /* Tax forms stay in email. The Express dashboard is not opened from here. */
    stripeExpressDashboardUrl: null,
  }
  try {
    const [ledgerRead, productsRead] = await Promise.all([
      admin.from("seller_ledger").select("negative_balance").eq("creator_id", creatorId).maybeSingle(),
      admin.from("products").select("id").eq("creator_id", creatorId),
    ])
    disputeData.negativeBalance = (ledgerRead.data as { negative_balance?: number | null } | null)?.negative_balance || 0
    const ids = ((productsRead.data as { id: string }[] | null) || []).map((p) => p.id)
    if (ids.length > 0) {
      const [disputedRead, taxRead] = await Promise.all([
        admin.from("orders").select("amount_cents").in("product_id", ids).eq("status", "disputed"),
        admin
          .from("orders")
          .select("amount_cents, created_at, status")
          .in("product_id", ids)
          .in("status", ["completed", "refunded", "disputed"])
          .gte("created_at", `${previousYear}-01-01T00:00:00Z`),
      ])
      const disputed = (disputedRead.data as { amount_cents: number | null }[] | null) || []
      disputeData.activeDisputes = disputed.length
      disputeData.totalDisputedAmount = disputed.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
      for (const order of (taxRead.data as { amount_cents: number | null; created_at: string }[] | null) || []) {
        const orderYear = new Date(order.created_at).getFullYear()
        const bucket = orderYear === currentYear ? taxData.currentYear : orderYear === previousYear ? taxData.previousYear : null
        if (bucket) {
          bucket.grossCents += order.amount_cents || 0
          bucket.transactionCount += 1
        }
      }
      /* Federal threshold: $20,000 AND 200+ transactions. */
      taxData.currentYear.isEligible = taxData.currentYear.grossCents >= 2000000 && taxData.currentYear.transactionCount >= 200
      taxData.previousYear.isEligible = taxData.previousYear.grossCents >= 2000000 && taxData.previousYear.transactionCount >= 200
    }
    disputeData.hasActiveDisputes = disputeData.activeDisputes > 0
  } catch {
    /* non-fatal */
  }
  return { disputeData, taxData }
}
