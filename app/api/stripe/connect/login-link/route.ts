import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

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

    const loginLink = await stripe.accounts.createLoginLink(creator.stripe_account_id)
    return NextResponse.json({ url: loginLink.url })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create login link" }, { status: 500 })
  }
}
