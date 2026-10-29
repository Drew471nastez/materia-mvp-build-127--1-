import { moneyCaller } from "@/lib/team/money"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * GET /api/stripe/payout-method
 *
 * Returns the seller's connected bank account info, payout schedule,
 * verification requirements, and account status.
 *
 * Also RE-ENFORCES manual payouts if Stripe somehow changed it.
 */
export async function GET() {
  try {
    const adminSupabase = createAdminClient()

    /* The owner, or a team member who may see the store's payouts (round 42, lib/team/money): the store's own Stripe account, never the member's. */
    const who = await moneyCaller("payouts", "view")
    if (!who.ok) return who.response

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id")
      .eq("id", who.creatorId)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({
        bankAccount: null,
        payoutSchedule: null,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsDue: [],
      })
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

    // RE-ENFORCE manual payouts — Storelib controls when sellers cash out
    const schedule = (account as any).settings?.payouts?.schedule || null
    if (schedule?.interval !== "manual") {
      try {
        await stripe.accounts.update(stripeAccountId, {
          settings: {
            payouts: {
              schedule: { interval: "manual" as const },
            },
          },
        })
        console.log("[Payout Method] Re-enforced manual payouts for:", stripeAccountId)
      } catch (enforceErr) {
        console.error("[Payout Method] Failed to enforce manual payouts:", enforceErr)
      }
    }

    // Extract requirements for verification banners
    const requirements = (account as any).requirements || {}
    const currentlyDue: string[] = requirements.currently_due || []
    const eventuallyDue: string[] = requirements.eventually_due || []
    const pastDue: string[] = requirements.past_due || []

    return NextResponse.json({
      bankAccount,
      // Always report manual — that's the Storelib model
      payoutSchedule: {
        interval: "manual",
        weeklyAnchor: null,
        monthlyAnchor: null,
        delayDays: null,
      },
      payoutsEnabled: account.payouts_enabled ?? false,
      chargesEnabled: account.charges_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      requirementsDue: currentlyDue,
      requirementsPastDue: pastDue,
      requirementsEventuallyDue: eventuallyDue,
    })
  } catch (error: any) {
    console.error("[Payout Method Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch payout method" },
      { status: 500 },
    )
  }
}
