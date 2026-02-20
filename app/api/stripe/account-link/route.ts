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
 *
 * If "update" is requested but the account hasn't completed onboarding yet
 * (details_submitted is false), it falls back to "account_onboarding" since
 * Stripe only allows account_update links for fully onboarded accounts.
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
    let wantsUpdate = false
    try {
      const body = await request.json()
      if (body.type === "update") {
        wantsUpdate = true
      }
    } catch {
      // No body — default to onboarding
    }

    // Check if the account has completed onboarding before creating an update link
    let linkType: "account_onboarding" | "account_update" = "account_onboarding"
    if (wantsUpdate) {
      try {
        const account = await stripe.accounts.retrieve(creator.stripe_account_id)
        if (account.details_submitted) {
          linkType = "account_update"
        }
        // If details_submitted is false, fall back to account_onboarding
        // since Stripe doesn't allow account_update for incomplete accounts
      } catch {
        // If we can't retrieve the account, fall back to onboarding
      }
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
