import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    const stripeAccountId = (creator as any).stripe_account_id || null
    if (!stripeAccountId) {
      return NextResponse.json({ error: "No Stripe account connected" }, { status: 400 })
    }

    // Create a login link for the Express dashboard
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId)

    return NextResponse.json({ url: loginLink.url })
  } catch (error) {
    console.error("[Stripe Connect Login Link Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create login link" },
      { status: 500 },
    )
  }
}
