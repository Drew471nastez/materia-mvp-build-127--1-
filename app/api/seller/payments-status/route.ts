import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { readSessionAuth } from "@/lib/auth/current-user"

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
  // The settings page asks on every visit, and the answer is one row of the
  // caller's own creator record read through their own client — so RLS on
  // creators is the access check and the id is only the filter that finds the
  // row. Reading it from the session cookie keeps the auth server out of a
  // question that is already answered by the database.
  const auth = await readSessionAuth(supabase)
  if (auth.status === "indeterminate") {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 })
  }
  if (!auth.userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  const { data: creator, error } = await supabase
    .from("creators")
    .select("stripe_account_id, charges_enabled")
    .eq("user_id", auth.userId)
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
