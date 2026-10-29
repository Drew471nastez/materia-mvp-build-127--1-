import { NextResponse } from "next/server"
import { moneyCaller } from "@/lib/team/money"
import { readCreatorStripe, syncStripeAccountFull } from "@/lib/payments/stripe/connect"
import { forgetPaymentsReadiness } from "@/lib/payments/stripe/readiness-cache"

/**
 * ===========================================================================
 *  THE OLDER STATUS ROUTE, NOW THE SAME ANSWER AS THE PAYMENTS PAGE
 * ===========================================================================
 * Two older settings screens still ask here (components/app/payments-content,
 * components/app/settings-form-new). It had its own copy of the logic, and
 * that copy was dangerous in three ways:
 *
 *   IT WIPED THE ACCOUNT ON ANY ERROR. A timeout, a 500 or a rate limit from
 *   Stripe cleared stripe_account_id, so a network blip could disconnect a
 *   creator's real account, with its balance and history, and make the next
 *   setup create a second one. lib/payments/stripe/connect.ts has a narrow
 *   test for "this account is really gone" (accountIsGone) precisely to stop
 *   that; this route bypassed it.
 *
 *   IT SENT THE ACCOUNT ID TO THE BROWSER, and the raw error message.
 *
 *   IT REWROTE stripe_connected_at EVERY TIME, which is the field that says a
 *   creator once had payments working, so a paused account read as never set
 *   up and the status lost its "restore" wording.
 *
 * It is the canonical sync now (syncStripeAccountFull): an account the current
 * Stripe platform cannot reach is let go cleanly so the creator can reconnect,
 * a blip changes nothing and answers with what is already known, and nothing
 * here names an account or repeats Stripe's words.
 */
export async function GET() {
  /* The owner's own store, or the one a team member who may see its payouts works in (round 42, lib/team/money): never an account named by the browser. */
  const who = await moneyCaller("payouts", "view", { noStore: "Creator profile not found." })
  if (!who.ok) return who.response.status === 401 ? NextResponse.json({ error: "Sign in to see your payments." }, { status: 401 }) : who.response
  const creator = { id: who.creatorId }

  try {
    const synced = await syncStripeAccountFull(creator.id, "creator")
    /* Back from Stripe's setup: the store's cached readiness is read again, so "Connect payments" goes at once. */
    await forgetPaymentsReadiness(creator.id)
    const chargesEnabled = !!synced.account?.charges_enabled
    const payoutsEnabled = !!synced.account?.payouts_enabled
    const detailsSubmitted = !!synced.account?.details_submitted
    const connected = chargesEnabled && payoutsEnabled && detailsSubmitted
    return NextResponse.json({
      connected,
      status: synced.account ? (connected ? "connected" : "pending") : "not_connected",
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
    })
  } catch (error) {
    /* A blip: nothing is cleared. Answer with the last state Storelib knew. */
    console.error("[stripe connect status]", error instanceof Error ? error.message.slice(0, 160) : "unknown")
    const row = await readCreatorStripe(creator.id).catch(() => null)
    const connected = !!(row?.charges_enabled && row?.payouts_enabled && row?.details_submitted)
    return NextResponse.json({
      connected,
      status: row?.stripe_account_id ? (connected ? "connected" : "pending") : "not_connected",
      chargesEnabled: !!row?.charges_enabled,
      payoutsEnabled: !!row?.payouts_enabled,
      detailsSubmitted: !!row?.details_submitted,
      stale: true,
    })
  }
}
