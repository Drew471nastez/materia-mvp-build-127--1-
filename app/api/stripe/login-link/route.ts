import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * POST /api/stripe/login-link
 *
 * Creates a Stripe Express dashboard login link for the connected account.
 * For Standard accounts, falls back to stripe.com/dashboard.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, stripe_account_id")
      .eq("user_id", user.id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ url: "https://dashboard.stripe.com" })
    }

    // Try Express dashboard login link first
    try {
      const loginLink = await stripe.accounts.createLoginLink(
        creator.stripe_account_id,
      )
      return NextResponse.json({ url: loginLink.url })
    } catch {
      // Standard accounts don't support login links — send to main dashboard
      return NextResponse.json({ url: "https://dashboard.stripe.com" })
    }
  } catch (error: any) {
    console.error("[Login Link Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to create login link" },
      { status: 500 },
    )
  }
}
