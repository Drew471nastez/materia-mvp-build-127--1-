import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
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

    const body = await request.json()
    const { payoutSchedule, payoutThreshold, instantPayoutsEnabled } = body

    // Validate payout schedule
    const validSchedules = ["daily", "weekly", "monthly"]
    if (payoutSchedule && !validSchedules.includes(payoutSchedule)) {
      return NextResponse.json({ error: "Invalid payout schedule" }, { status: 400 })
    }

    // Validate payout threshold (must be non-negative)
    if (payoutThreshold !== undefined && payoutThreshold < 0) {
      return NextResponse.json({ error: "Payout threshold must be non-negative" }, { status: 400 })
    }

    // Update payout settings
    await adminSupabase
      .from("creators")
      .update({
        payout_schedule: payoutSchedule || "daily",
        payout_threshold: payoutThreshold || 0,
        instant_payouts_enabled: instantPayoutsEnabled || false,
      })
      .eq("id", creator.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Payout Settings Update Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payout settings" },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator profile with payout settings
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("payout_schedule, payout_threshold, instant_payouts_enabled")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    return NextResponse.json({
      payoutSchedule: creator.payout_schedule || "daily",
      payoutThreshold: creator.payout_threshold || 0,
      instantPayoutsEnabled: creator.instant_payouts_enabled || false,
    })
  } catch (error) {
    console.error("[Payout Settings Fetch Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payout settings" },
      { status: 500 },
    )
  }
}
