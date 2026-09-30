import { NextResponse } from "next/server"

/**
 * POST /api/stripe/login-link
 *
 * REMOVED — the Express dashboard is not opened from Storelib.
 */
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Manage payouts from the Payouts page." },
    { status: 410 },
  )
}
