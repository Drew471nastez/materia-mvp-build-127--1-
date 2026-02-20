import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * POST /api/stripe/login-link
 *
 * DEPRECATED — Redirects to Stripe Account Link instead of Express dashboard.
 * Sellers no longer access the Stripe Express dashboard directly.
 * Use /api/stripe/account-link instead.
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
      return NextResponse.json(
        { error: "No connected Stripe account" },
        { status: 400 },
      )
    }

    // Generate an Account Link (update mode) instead of a dashboard login link
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://storelib.com"

    const accountLink = await stripe.accountLinks.create({
      account: creator.stripe_account_id,
      refresh_url: `${baseUrl}/app/payouts?stripe=refresh`,
      return_url: `${baseUrl}/app/payouts?stripe=return`,
      type: "account_update",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error: any) {
    console.error("[Login Link → Account Link Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to create account link" },
      { status: 500 },
    )
  }
}
