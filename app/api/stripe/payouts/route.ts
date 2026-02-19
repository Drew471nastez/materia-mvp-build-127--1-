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

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Strict isolation — only this user's creator row
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id, default_currency")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({ payouts: [], balance: null })
    }

    // Fetch payouts + balance + recent balance transactions (for exchange_rate) in parallel
    const [payoutsResult, balanceResult, balanceTxResult] = await Promise.all([
      stripe.payouts.list(
        { limit: 100, expand: ["data.destination"] },
        { stripeAccount: stripeAccountId }
      ).catch(() => ({ data: [] })),
      stripe.balance.retrieve(
        {},
        { stripeAccount: stripeAccountId }
      ).catch(() => null),
      stripe.balanceTransactions.list(
        { limit: 5 },
        { stripeAccount: stripeAccountId }
      ).catch(() => ({ data: [] })),
    ])

    // Extract the exchange_rate from the most recent transaction that has one.
    // Stripe defines: presentment_amount × exchange_rate = account_amount.
    // For USD → RON: USD × rate = RON. To convert RON → USD: RON / rate = USD.
    const exchangeRate: number | null =
      (balanceTxResult.data as any[]).find((tx: any) => tx.exchange_rate)
        ?.exchange_rate ?? null

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

    const balance = balanceResult
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

    return NextResponse.json({ payouts, balance, exchangeRate })
  } catch (error: any) {
    console.error("[Stripe Payouts Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch payouts" },
      { status: 500 }
    )
  }
}
