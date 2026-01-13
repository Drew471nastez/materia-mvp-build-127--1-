import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator profile
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    if (!creator.stripe_account_id) {
      return NextResponse.json({ error: "No Stripe account connected" }, { status: 400 })
    }

    const oldAccountId = creator.stripe_account_id

    // Clear Stripe Connect data (but keep historical orders)
    await adminSupabase
      .from("creators")
      .update({
        stripe_account_id: null,
        stripe_onboarding_status: "pending",
      })
      .eq("id", creator.id)

    // Log disconnection event
    await adminSupabase.from("payment_connection_events").insert({
      creator_id: creator.id,
      provider: "stripe",
      event_type: "disconnected",
      metadata: { previous_account_id: oldAccountId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Stripe Connect Disconnect Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect Stripe" },
      { status: 500 },
    )
  }
}
