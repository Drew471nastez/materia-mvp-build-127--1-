import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

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
    const dbClient = tryCreateAdminClient() || supabase

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await createAdminClient().from("creators").select("id, stripe_account_id").eq("user_id", user.id).single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: "No Stripe account connected" }, { status: 400 })
    }

    await dbClient
      .from("creators")
      .update({
        stripe_account_id: null,
        stripe_onboarding_status: "not_connected",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        stripe_connected_at: null,
      })
      .eq("id", creator.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[Stripe Connect Disconnect Error]", error)
    return NextResponse.json({ error: error.message || "Failed to disconnect Stripe" }, { status: 500 })
  }
}
