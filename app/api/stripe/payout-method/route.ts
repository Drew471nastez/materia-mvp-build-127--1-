import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * GET /api/stripe/payout-method
 *
 * Returns the seller's connected bank account info and payout schedule.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({ bankAccount: null, payoutSchedule: null, payoutsEnabled: false })
    }

    // Fetch account info and external bank accounts in parallel
    const [account, externalAccounts] = await Promise.all([
      stripe.accounts.retrieve(stripeAccountId),
      stripe.accounts.listExternalAccounts(stripeAccountId, {
        object: "bank_account",
        limit: 1,
      }).catch(() => ({ data: [] })),
    ])

    const bankRaw = externalAccounts.data[0] as any | undefined

    const bankAccount = bankRaw
      ? {
          bankName: bankRaw.bank_name || null,
          last4: bankRaw.last4 || "••••",
          currency: bankRaw.currency || "usd",
          routingNumber: bankRaw.routing_number || null,
          accountHolderName: bankRaw.account_holder_name || null,
          status: bankRaw.status || null,
        }
      : null

    const schedule = (account as any).settings?.payouts?.schedule || null

    return NextResponse.json({
      bankAccount,
      payoutSchedule: schedule
        ? {
            interval: schedule.interval,
            weeklyAnchor: schedule.weekly_anchor || null,
            monthlyAnchor: schedule.monthly_anchor || null,
            delayDays: schedule.delay_days ?? null,
          }
        : null,
      payoutsEnabled: account.payouts_enabled ?? false,
    })
  } catch (error: any) {
    console.error("[Payout Method Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch payout method" },
      { status: 500 },
    )
  }
}
