import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * POST /api/stripe/account-link
 *
 * Creates a Stripe Account Link for onboarding or updating bank details.
 * This REPLACES the Express dashboard login link — sellers never access the
 * Stripe dashboard directly.
 *
 * Body: { type?: "onboarding" | "update" }
 *   - "onboarding" (default): Initial KYC + bank setup
 *   - "update": Update bank details or resolve requirements
 */
export async function POST(request: Request) {
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
        { error: "No connected Stripe account. Complete onboarding first." },
        { status: 400 },
      )
    }

    // Parse optional type from body
    let linkType: "account_onboarding" | "account_update" = "account_onboarding"
    try {
      const body = await request.json()
      if (body.type === "update") {
        linkType = "account_update"
      }
    } catch {
      // No body — default to onboarding
    }

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://storelib.com"

    const accountLink = await stripe.accountLinks.create({
      account: creator.stripe_account_id,
      refresh_url: `${baseUrl}/app/payouts?stripe=refresh`,
      return_url: `${baseUrl}/app/payouts?stripe=return`,
      type: linkType,
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error: any) {
    console.error("[Account Link Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to create account link" },
      { status: 500 },
    )
  }
}
