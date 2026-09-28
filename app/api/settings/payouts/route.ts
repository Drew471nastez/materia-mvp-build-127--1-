import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/settings/payouts
 *
 * Storelib model: ALL accounts are locked to manual payouts.
 * Sellers cash out via the "Cash out" button — no automatic schedules.
 * This endpoint only persists the payout_threshold (min cashout) preference.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    const body = await request.json()
    const { payoutThreshold } = body

    // Validate payout threshold (must be non-negative)
    if (payoutThreshold !== undefined && payoutThreshold < 0) {
      return NextResponse.json({ error: "Payout threshold must be non-negative" }, { status: 400 })
    }

    // Force manual schedule — sellers cannot change this
    await adminSupabase
      .from("creators")
      .update({
        payout_schedule: "manual",
        payout_threshold: payoutThreshold || 0,
        instant_payouts_enabled: false,
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("payout_schedule, payout_threshold, instant_payouts_enabled")
      .eq("user_id", user.id)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 })
    }

    // Always report manual — Storelib controls payout timing
    return NextResponse.json({
      payoutSchedule: "manual",
      payoutThreshold: creator.payout_threshold || 0,
      instantPayoutsEnabled: false,
    })
  } catch (error) {
    console.error("[Payout Settings Fetch Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payout settings" },
      { status: 500 },
    )
  }
}
