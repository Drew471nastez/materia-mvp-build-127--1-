import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

/**
 * POST /api/stripe/connect/login-link
 *
 * DEPRECATED — Now generates Stripe Account Link instead of Express dashboard login.
 * Use /api/stripe/account-link instead.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await supabase
      .from("creators")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: "Stripe account not connected" }, { status: 400 })
    }

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://storelib.com"

    const accountLink = await stripe.accountLinks.create({
      account: creator.stripe_account_id,
      refresh_url: `${baseUrl}/app/settings?tab=payments&stripe=refresh`,
      return_url: `${baseUrl}/app/settings?tab=payments&stripe=return`,
      type: "account_update",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create account link" }, { status: 500 })
  }
}
