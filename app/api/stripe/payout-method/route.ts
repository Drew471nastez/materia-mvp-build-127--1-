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
        bankUnknown: false,
        payoutSchedule: null,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsDue: [],
      })
    }

    /*
      Account info and the bank, in parallel. A bank list Stripe did not
      give is not "no bank" (PAY-5): the account's own copy of its external
      accounts is used when it has one, and otherwise the answer says
      bankUnknown, so the page says it could not check rather than asking
      the creator to add a bank in the middle of an outage.
    */
    const [account, externalAccounts] = await Promise.all([
      stripe.accounts.retrieve(stripeAccountId),
      stripe.accounts
        .listExternalAccounts(stripeAccountId, {
          object: "bank_account",
          limit: 1,
        })
        .catch((e: unknown) => {
          console.warn("[Payout Method] bank list unavailable:", e instanceof Error ? e.message : e)
          return null
        }),
    ])

    const embedded = ((account as any).external_accounts?.data ?? []).find((x: any) => x?.object === "bank_account")
    const bankRaw = (externalAccounts ? externalAccounts.data[0] : embedded) as any | undefined
    const bankUnknown = !externalAccounts && !embedded

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
      /* True only when Stripe could not say whether there is a bank: bankAccount null then means "unknown", not "none". */
      bankUnknown,
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
