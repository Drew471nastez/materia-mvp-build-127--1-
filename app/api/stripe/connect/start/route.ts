import { NextResponse } from "next/server"

/**
 * Hosted Connect onboarding is not used. Creators start from Payouts,
 * which opens an Account Session inside Storelib.
 * This route does not call Stripe.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Set up payments from the Payouts page." },
    { status: 410 },
  )
}
