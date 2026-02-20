import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/cron/release-holds
 *
 * Daily cron job that moves funds from "pending" to "available" after
 * the hold period expires (default 7 days).
 *
 * If a seller has a negative balance (from refunds after payout),
 * released funds absorb the negative balance first.
 *
 * Protected by CRON_SECRET bearer token.
 * Schedule: daily at 6:00 AM UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const now = new Date()

    // Find all unreleased sale events where hold has expired
    const { data: releasable, error: queryError } = await adminSupabase
      .from("ledger_events")
      .select("id, creator_id, net_seller_cents")
      .eq("event_type", "sale")
      .is("released_at", null)
      .lte("hold_until", now.toISOString())

    if (queryError) {
      console.error("[Release Holds] Query error:", queryError)
      return NextResponse.json({ error: "Query failed" }, { status: 500 })
    }

    if (!releasable?.length) {
      return NextResponse.json({ released: 0, creators: 0 })
    }

    // Group by creator for batch updates
    const byCreator = new Map<string, { total: number; eventIds: string[] }>()
    for (const event of releasable) {
      const existing = byCreator.get(event.creator_id) || { total: 0, eventIds: [] }
      existing.total += event.net_seller_cents || 0
      existing.eventIds.push(event.id)
      byCreator.set(event.creator_id, existing)
    }

    let totalReleased = 0
    let creatorsProcessed = 0

    for (const [creatorId, { total: releaseAmount, eventIds }] of byCreator) {
      try {
        // Load current ledger
        const { data: ledger } = await adminSupabase
          .from("seller_ledger")
          .select("*")
          .eq("creator_id", creatorId)
          .single()

        if (!ledger) {
          console.warn(`[Release Holds] No ledger for creator ${creatorId}, skipping`)
          continue
        }

        let toAvailable = releaseAmount
        let newNegative = ledger.negative_balance

        // Absorb negative balance first
        if (newNegative > 0 && toAvailable > 0) {
          const absorbed = Math.min(toAvailable, newNegative)
          toAvailable -= absorbed
          newNegative -= absorbed
        }

        // Update ledger
        await adminSupabase
          .from("seller_ledger")
          .update({
            pending_amount: Math.max(0, ledger.pending_amount - releaseAmount),
            available_amount: ledger.available_amount + toAvailable,
            negative_balance: newNegative,
          })
          .eq("creator_id", creatorId)

        // Create hold_release ledger event
        await adminSupabase.from("ledger_events").insert({
          creator_id: creatorId,
          event_type: "hold_release",
          amount_cents: releaseAmount,
          net_seller_cents: toAvailable,
          currency: "usd",
          pending_delta: -releaseAmount,
          available_delta: toAvailable,
          description: `Hold released: $${(releaseAmount / 100).toFixed(2)} cleared`,
        })

        // Mark events as released
        await adminSupabase
          .from("ledger_events")
          .update({ released_at: now.toISOString() })
          .in("id", eventIds)

        totalReleased += releaseAmount
        creatorsProcessed++
      } catch (err) {
        console.error(`[Release Holds] Error for creator ${creatorId}:`, err)
      }
    }

    console.log(
      `[Release Holds] Released ${totalReleased} cents for ${creatorsProcessed} creators (${releasable.length} events)`,
    )

    return NextResponse.json({
      released: releasable.length,
      creators: creatorsProcessed,
      total_cents: totalReleased,
    })
  } catch (error: any) {
    console.error("[Release Holds Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to release holds" },
      { status: 500 },
    )
  }
}
