import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { emit } from "@/lib/notify/outbox"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Load creator — strict isolation: only the authenticated user's creator row
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

    // Check payouts enabled
    if (!creator.payouts_enabled) {
      return NextResponse.json(
        { error: "Payouts not yet enabled on your Stripe account. Complete onboarding first." },
        { status: 400 }
      )
    }

    // Parse optional body (amount override for partial payout)
    let requestedAmountCents: number | null = null
    let requestedCurrency: string | null = null
    try {
      const body = await request.json()
      if (body.amount_cents && typeof body.amount_cents === "number" && body.amount_cents > 0) {
        requestedAmountCents = Math.floor(body.amount_cents)
      }
      if (body.currency && typeof body.currency === "string") {
        requestedCurrency = body.currency.toLowerCase()
      }
    } catch {
      // No body provided — full withdrawal
    }

    // Validate: no concurrent in-transit payout (prevent double withdrawal)
    const { data: ledger } = await adminSupabase
      .from("seller_ledger")
      .select("in_transit_amount, available_amount, negative_balance")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (ledger && ledger.in_transit_amount > 0) {
      return NextResponse.json(
        { error: "A payout is already in transit. Please wait until it arrives before withdrawing again." },
        { status: 409 },
      )
    }

    // Block withdrawal when balance is negative (Stan-style)
    if (ledger && (ledger.negative_balance || 0) > 0) {
      return NextResponse.json(
        { error: "Your balance is negative due to a refund or dispute. Future sales will cover this automatically." },
        { status: 400 },
      )
    }

    // Validate: requested amount is positive
    if (requestedAmountCents !== null && requestedAmountCents <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 })
    }

    // Fetch current balance from the connected account
    const balance = await stripe.balance.retrieve(
      { stripeAccount: stripeAccountId }
    )

    const currency = (requestedCurrency || creator.default_currency || "usd").toLowerCase()

    const availableEntry = balance.available.find((b) => b.currency === currency)
    const availableAmount = availableEntry?.amount ?? 0

    if (availableAmount <= 0) {
      return NextResponse.json(
        { error: "No funds available to withdraw in " + currency.toUpperCase() },
        { status: 400 }
      )
    }

    const payoutAmount = requestedAmountCents
      ? Math.min(requestedAmountCents, availableAmount)
      : availableAmount

    if (payoutAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 })
    }

    // Create Stripe payout on the connected account
    const stripePayout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency,
        description: "Storelib seller withdrawal",
        metadata: {
          creator_id: creator.id,
        },
      },
      { stripeAccount: stripeAccountId }
    )

    // Log payout in DB (upsert for idempotency)
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
        amount_cents: stripePayout.amount,
        currency: stripePayout.currency,
        status: stripePayout.status,
        arrival_date: arrivalDate,
        description: stripePayout.description,
        destination,
        method: stripePayout.method,
        stripe_created: new Date(stripePayout.created * 1000).toISOString(),
      },
      { onConflict: "stripe_payout_id" }
    )

    /* PAYOUT_SCHEDULED through the notification engine, under the key
       payout.created raises too (app/api/stripe/webhook), so it is told once. */
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
        amountCents: stripePayout.amount,
        currency: stripePayout.currency,
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
        amount: stripePayout.amount,
        currency: stripePayout.currency,
        status: stripePayout.status,
        arrival_date: stripePayout.arrival_date,
        created: stripePayout.created,
        method: stripePayout.method,
        destination,
      },
    })
  } catch (error: any) {
    console.error("[Withdraw Error]", error)

    // Surface Stripe-specific error messages clearly
    const message =
      error?.raw?.message ||
      error?.message ||
      "Failed to create payout"

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
