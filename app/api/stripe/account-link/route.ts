import { NextResponse } from "next/server"

/**
 * Hosted account links are not used. Setup, verification, bank and payout
 * management stay inside Storelib through an Account Session.
 * This route does not call Stripe.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Manage payouts from the Payouts page." },
    { status: 410 },
  )
}
