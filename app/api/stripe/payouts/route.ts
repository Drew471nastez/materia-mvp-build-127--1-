import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

async function getCreatorContext() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: creator } = await adminSupabase
    .from("creators")
    .select("id,user_id,stripe_account_id,payouts_enabled")
    .eq("user_id", user.id)
    .single()

  if (!creator) return { error: NextResponse.json({ error: "Creator not found" }, { status: 404 }) }
  return { user, creator, adminSupabase }
}

export async function GET() {
  try {
    const ctx = await getCreatorContext()
    if ("error" in ctx) return ctx.error

    const { creator } = ctx
    if (!creator.stripe_account_id) return NextResponse.json({ payouts: [], balance: null, paidOut: [] })

    const [payoutsResult, balanceResult] = await Promise.all([
      stripe.payouts.list({ limit: 50 }, { stripeAccount: creator.stripe_account_id }).catch(() => ({ data: [] as any[] })),
      stripe.balance.retrieve({}, { stripeAccount: creator.stripe_account_id }).catch(() => null),
    ])

    const payouts = payoutsResult.data.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      arrival_date: p.arrival_date,
      created: p.created,
      method: p.method,
      type: p.type,
      description: p.description,
      destination: typeof p.destination === "string" ? p.destination : null,
    }))

    const paidOutMap = new Map<string, number>()
    payouts.filter((p) => p.status === "paid").forEach((p) => paidOutMap.set(p.currency, (paidOutMap.get(p.currency) || 0) + p.amount))
    const paidOut = Array.from(paidOutMap.entries()).map(([currency, amount]) => ({ currency, amount }))

    const balance = balanceResult ? {
      available: balanceResult.available.map((b) => ({ amount: b.amount, currency: b.currency })),
      pending: balanceResult.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
    } : null

    return NextResponse.json({ payouts, balance, paidOut })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch payouts" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const ctx = await getCreatorContext()
    if ("error" in ctx) return ctx.error
    const { creator, user, adminSupabase } = ctx

    if (!creator.stripe_account_id) return NextResponse.json({ error: "Stripe account is not connected" }, { status: 400 })

    const balance = await stripe.balance.retrieve({}, { stripeAccount: creator.stripe_account_id })
    const firstAvailable = balance.available.find((b) => b.amount > 0)

    if (!firstAvailable) {
      return NextResponse.json({ error: "No funds available." }, { status: 400 })
    }

    try {
      const payout = await stripe.payouts.create(
        { amount: firstAvailable.amount, currency: firstAvailable.currency },
        { stripeAccount: creator.stripe_account_id }
      )

      await adminSupabase.from("stripe_payout_events").insert({
        creator_id: creator.id,
        user_id: user.id,
        stripe_account_id: creator.stripe_account_id,
        stripe_payout_id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        destination: typeof payout.destination === "string" ? payout.destination : null,
        arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
        event_type: "manual_withdrawal_created",
        metadata: { method: payout.method, type: payout.type },
      })

      return NextResponse.json({ payout })
    } catch (error: any) {
      const message = error?.raw?.message || error?.message || "Failed to create payout"
      if (message.toLowerCase().includes("payout")) {
        return NextResponse.json({ error: "Payouts are not enabled on your Stripe account." }, { status: 400 })
      }
      return NextResponse.json({ error: message }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create payout" }, { status: 500 })
  }
}
