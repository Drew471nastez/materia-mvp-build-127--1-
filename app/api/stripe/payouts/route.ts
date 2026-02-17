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

    const { data: creator } = await adminSupabase.from("creators").select("*").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({ payouts: [], balance: null })
    }

    // Fetch recent payouts from Stripe for the connected account
    const [payoutsResult, balanceResult] = await Promise.all([
      stripe.payouts.list(
        { limit: 50 },
        { stripeAccount: stripeAccountId }
      ).catch(() => ({ data: [] })),
      stripe.balance.retrieve(
        { stripeAccount: stripeAccountId }
      ).catch(() => null),
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
      destination: typeof p.destination === "string"
        ? p.destination
        : (p.destination as any)?.last4
          ? `****${(p.destination as any).last4}`
          : null,
    }))

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

    return NextResponse.json({ payouts, balance })
  } catch (error: any) {
    console.error("[Stripe Payouts Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch payouts" },
      { status: 500 }
    )
  }
}
