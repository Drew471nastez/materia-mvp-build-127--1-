import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { countryCode } from "@/lib/checkout/countries"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { logStripeRefusal, stripeRefusal } from "@/lib/stripe/refusal"

function tryCreateAdminClient() {
  try {
    const { createAdminClient } = require("@/lib/supabase/admin")
    return createAdminClient()
  } catch {
    return null
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const adminSupabase = tryCreateAdminClient()
    const dbClient = adminSupabase || supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await supabase.from("creators").select("*").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })

    const { data: profile } = await supabase.from("profiles").select("email, country").eq("id", user.id).maybeSingle()

    let accountId = (creator as any).stripe_account_id || null

    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId)
      } catch {
        accountId = null
      }
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        /* The profile may hold a name ("United States"); Stripe takes the code. */
        country: countryCode((profile as any)?.country) ?? "RO",
        email: ownerAddress(profile?.email || user.email) || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
      })

      accountId = account.id

      // Force manual payouts — Storelib controls when sellers cash out
      await stripe.accounts.update(accountId, {
        settings: {
          payouts: {
            schedule: { interval: "manual" as const },
          },
        },
      })

      await dbClient
        .from("creators")
        .update({
          stripe_account_id: accountId,
          stripe_onboarding_status: "pending",
          stripe_connected_at: null,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        })
        .eq("id", creator.id)

      // Initialize seller ledger
      await dbClient
        .from("seller_ledger")
        .upsert({ creator_id: creator.id }, { onConflict: "creator_id" })
    }

    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/app/settings?tab=payments&stripe=refresh`,
      return_url: `${baseUrl}/app/settings?tab=payments&stripe=return`,
      type: "account_onboarding",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error: any) {
    /* An account Stripe rejected, Storelib's or this creator's: said plainly, once in the log (lib/stripe/refusal). */
    const refusal = stripeRefusal(error)
    if (refusal) {
      logStripeRefusal("connect/start", refusal)
      return NextResponse.json({ error: refusal.error, code: refusal.code }, { status: refusal.status })
    }
    console.error("[Stripe Connect Start Error]", error)
    const msg = error?.message || ""
    if (msg.includes("platform-profile") || msg.includes("responsibilities") || msg.includes("managing losses")) {
      return NextResponse.json({
        error: "Before connecting creators, you must accept the platform responsibilities in your Stripe Dashboard. Go to Settings → Connect → Platform profile and review the 'Managing losses' section, then try again.",
        code: "platform_not_configured",
        helpUrl: "https://dashboard.stripe.com/settings/connect/platform-profile",
      }, { status: 503 })
    }
    return NextResponse.json({ error: msg || "Failed to start Stripe Connect onboarding" }, { status: 500 })
  }
}
