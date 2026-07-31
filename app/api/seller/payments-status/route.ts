import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * The settings hub's one question: can this seller get paid yet?
 *
 *   GET /api/seller/payments-status → { hasCreator, connected, chargesEnabled }
 *
 * Deliberately a database-only read of the caller's own creator row — no Stripe
 * round-trip. The settings page asks on every visit and only needs the cached
 * answer; /api/stripe/connect/status is the endpoint that reconciles these
 * columns against Stripe when the full payments tab opens. "Connected" here
 * means an account exists; chargesEnabled is whether onboarding got far enough
 * for that account to actually take money, which is the state the card acts on.
 */

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  const { data: creator, error } = await supabase
    .from("creators")
    .select("stripe_account_id, charges_enabled")
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) {
    console.error("[seller/payments-status] read failed:", error.message)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }

  if (!creator) {
    return NextResponse.json({ hasCreator: false, connected: false, chargesEnabled: false })
  }
  return NextResponse.json({
    hasCreator: true,
    connected: !!creator.stripe_account_id,
    chargesEnabled: !!creator.charges_enabled,
  })
}
