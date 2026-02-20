import { NextResponse } from "next/server"

/**
 * POST /api/stripe/connect/login-link
 *
 * REMOVED — Stripe Express dashboard access is no longer available.
 * Use /api/stripe/account-link instead for account management.
 */
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Use /api/stripe/account-link instead." },
    { status: 410 },
  )
}
