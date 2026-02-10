import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

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
        country: (profile as any)?.country || "RO",
        email: profile?.email || user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
      })

      accountId = account.id

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
