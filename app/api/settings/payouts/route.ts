import { moneyCaller } from "@/lib/team/money"
import { NextResponse } from "next/server"
import { recordTeamAction } from "@/lib/team/areas"
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
    const adminSupabase = createAdminClient()

    /* The owner, or a team member who may change the store's payouts (round 42, lib/team/money): the store's own Stripe account, never the member's. */
    const who = await moneyCaller("payouts", "manage")
    if (!who.ok) return who.response

    const { data: creator, error: creatorError } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("id", who.creatorId)
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

    await recordTeamAction(who, who.userId, "payouts_manage", "payout_schedule_changed", { payout_threshold: payoutThreshold || 0 })
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

    /* The owner, or a team member who may see the store's payouts (round 42, lib/team/money): the store's own Stripe account, never the member's. */
    const who = await moneyCaller("payouts", "view")
    if (!who.ok) return who.response

    const { data: creator, error: creatorError } = await createAdminClient()
      .from("creators")
      .select("payout_schedule, payout_threshold, instant_payouts_enabled")
      .eq("id", who.creatorId)
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
