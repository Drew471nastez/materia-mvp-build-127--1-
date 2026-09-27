import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { logStripeRefusal, stripeRefusal } from "@/lib/stripe/refusal"

/**
 * POST /api/stripe/account-link
 *
 * Creates a Stripe Account Link for managing the connected account.
 * Sellers use this to add/update bank accounts, complete verification,
 * update identity/tax info, etc. — all through Stripe's hosted form.
 *
 * Body: { type?: "onboarding" | "update" }
 *
 * Strategy: If "update" is requested, we attempt account_update first.
 * If Stripe rejects it (many Express accounts only support account_onboarding),
 * we automatically fall back to account_onboarding which works universally
 * and still lets the user update their bank/identity/tax info.
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

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://storelib.com"

    const linkParams = {
      account: creator.stripe_account_id,
      refresh_url: `${baseUrl}/app/payouts?stripe=refresh`,
      return_url: `${baseUrl}/app/payouts?stripe=return`,
    }

    // Try account_update first if requested, fall back to account_onboarding
    // Many Express accounts only support account_onboarding — Stripe will reject
    // account_update with "Valid types for this account are [account_onboarding]"
    if (wantsUpdate) {
      try {
        const accountLink = await stripe.accountLinks.create({
          ...linkParams,
          type: "account_update",
        })
        return NextResponse.json({ url: accountLink.url })
      } catch (e) {
        /* A rejected account is rejected for either kind of link: not asked twice. */
        if (stripeRefusal(e)) throw e
        // account_update not supported — fall through to account_onboarding
      }
    }

    // Default / fallback: account_onboarding always works and still lets
    // the seller update bank, identity, tax info through Stripe's hosted form
    const accountLink = await stripe.accountLinks.create({
      ...linkParams,
      type: "account_onboarding",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error: any) {
    const refusal = stripeRefusal(error)
    if (refusal) {
      logStripeRefusal("account-link", refusal)
      return NextResponse.json({ error: refusal.error, code: refusal.code }, { status: refusal.status })
    }
    console.error("[Account Link Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to create account link" },
      { status: 500 },
    )
  }
}
