import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { notifyPayoutAvailable } from "@/lib/push/notifications"

/**
 * POST /api/push/test-payout
 *
 * TEMPORARY DEV/ADMIN HELPER — triggers the payout-available push notification
 * for the currently logged-in user without touching the real ledger or waiting
 * for the cron job.
 *
 * Protection layers:
 *   1. Requires a valid Supabase session (authenticated user only).
 *   2. Only fires the notification for the authenticated user — no cross-user targeting.
 *   3. Does NOT read or write seller_ledger, ledger_events, or any balance data.
 *   4. Remove this file (or gate on NODE_ENV) before any public launch.
 *
 * Body (JSON, optional):
 *   { "amountCents": 1000 }   — defaults to $10.00 if omitted
 *
 * Example:
 *   curl -X POST https://<host>/api/push/test-payout \
 *        -H "Content-Type: application/json" \
 *        -H "Cookie: <session-cookie>" \
 *        -d '{"amountCents": 2500}'
 */
export async function POST(request: Request) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Parse optional amount ─────────────────────────────────────────────────
  let amountCents = 1000 // default: $10.00
  try {
    const body = await request.json()
    if (typeof body?.amountCents === "number" && body.amountCents > 0) {
      amountCents = Math.floor(body.amountCents)
    }
  } catch {
    // No body or invalid JSON — use default
  }

  // ── Fire notification only (no ledger changes) ────────────────────────────
  await notifyPayoutAvailable(user.id, amountCents)

  return NextResponse.json({
    ok: true,
    simulation: true,
    notified: {
      userId: user.id,
      amountCents,
      amountFormatted: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amountCents / 100),
    },
  })
}
