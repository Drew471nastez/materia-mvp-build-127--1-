import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id, payouts_enabled, default_currency, user_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Ensure the authenticated user owns this creator record
    if (creator.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json(
        { error: "No Stripe account connected. Please connect Stripe first." },
        { status: 400 }
      )
    }

    if (!creator.payouts_enabled) {
      return NextResponse.json(
        { error: "Payouts are not enabled on your Stripe account. Please complete Stripe onboarding." },
        { status: 400 }
      )
    }

    // Parse optional amount from body
    let requestedAmount: number | undefined
    let requestedCurrency: string | undefined
    try {
      const body = await request.json()
      if (body.amount && typeof body.amount === "number" && body.amount > 0) {
        requestedAmount = body.amount // in cents
      }
      if (body.currency) {
        requestedCurrency = body.currency.toLowerCase()
      }
    } catch {
      // No body or invalid JSON — will use full available balance
    }

    // Fetch current balance for the connected account
    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeAccountId,
    })

    const currency = (requestedCurrency || creator.default_currency || "usd").toLowerCase()

    // Sum available balance for the target currency
    const availableEntries = balance.available.filter((b) => b.currency === currency)
    const totalAvailable = availableEntries.reduce((sum, b) => sum + b.amount, 0)

    if (totalAvailable <= 0) {
      return NextResponse.json(
        { error: "No funds available to withdraw." },
        { status: 400 }
      )
    }

    const payoutAmount = requestedAmount
      ? Math.min(requestedAmount, totalAvailable)
      : totalAvailable

    if (payoutAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid payout amount." },
        { status: 400 }
      )
    }

    // Create the payout on the connected account
    const payout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency: currency,
        description: "Storelib withdrawal",
      },
      { stripeAccount: stripeAccountId }
    )

    // Log in DB
    try {
      await adminSupabase.from("payout_events").insert({
        creator_id: creator.id,
        stripe_payout_id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        method: payout.method,
        destination:
          typeof payout.destination === "string"
            ? payout.destination
            : (payout.destination as any)?.last4
              ? `****${(payout.destination as any).last4}`
              : null,
        arrival_date: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString()
          : null,
      })
    } catch (dbErr) {
      console.error("[Withdraw] Failed to log payout in DB:", dbErr)
      // Non-fatal — payout was already created in Stripe
    }

    return NextResponse.json({
      success: true,
      payout: {
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        arrival_date: payout.arrival_date,
        created: payout.created,
      },
    })
  } catch (error: any) {
    console.error("[Withdraw Error]", error)

    // Stripe-specific error messages
    if (error.type === "StripeInvalidRequestError") {
      return NextResponse.json(
        { error: error.message || "Invalid payout request" },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Failed to create payout" },
      { status: 500 }
    )
  }
}
