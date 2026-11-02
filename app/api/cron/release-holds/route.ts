import { ledgerCurrency } from "@/lib/payments/ledger-currency"
import { formatMinor } from "@/lib/markets/money"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { pushPayoutsAvailable, type PayoutPush } from "@/lib/payments/payout-push"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { releaseDueHolds } from "@/lib/payments/ledger"
import { recordCronRun } from "@/lib/observability/report"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/*
  Said here, not left to the platform's default (r48-obs): recordCronRun's
  one-run-at-a-time lease is this long plus 30s, so a run the platform ends
  early never holds the job longer than one run could take.
*/
export const maxDuration = 300

/**
 * GET /api/cron/release-holds
 *
 * Daily cron job that moves funds from "pending" to "available" after
 * Stripe's settlement period completes. Each sale's hold_until is set to
 * Stripe's actual available_on date (from the balance transaction), so
 * settlement varies by country/risk:
 *   - US sellers: ~2 business days
 *   - International: up to ~7 business days
 *   - First payout: may be longer (extra verification)
 *
 * If a seller has a negative balance (from refunds after payout),
 * released funds absorb the negative balance first.
 *
 * Protected by CRON_SECRET bearer token.
 * Schedule: daily at 6:00 AM UTC (configured in vercel.json)
 */
async function runJob(request: Request) {
  try {
    // Verify cron secret
    /* Was compared against `Bearer ${process.env.CRON_SECRET}`, which with
       the variable unset is the literal password "Bearer undefined". */
    const denied = requireBearerSecret(request, "CRON_SECRET")
    if (denied) return denied

    const adminSupabase = createAdminClient()
    const now = new Date()

    /* In the database, creator by creator, each under a lock and each once
       (public.ledger_release_due, run-now part 64). Two runs at once, or a
       run while a sale lands, can no longer lose or double a release. The
       code below it is the path before part 64. */
    const done = await releaseDueHolds(adminSupabase)
    if (done) {
      /* To each seller's user id (not the creator id), awaited inside the run (lib/payments/payout-push.ts). */
      await pushPayoutsAvailable(
        adminSupabase,
        done.map((r) => ({ creatorId: r.creator_id, cents: Number(r.to_available) })),
      )
      const total = done.reduce((n, r) => n + Number(r.released || 0), 0)
      const events = done.reduce((n, r) => n + Number(r.events || 0), 0)
      console.log(`[Release Holds] Released ${total} cents for ${done.length} creators (${events} events)`)
      return NextResponse.json({ released: events, creators: done.length, total_cents: total })
    }

    // Find all unreleased sale events where hold has expired
    const { data: releasable, error: queryError } = await adminSupabase
      .from("ledger_events")
      .select("id, creator_id, net_seller_cents, order_id")
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

    /*
      A SALE REFUNDED WHILE ON HOLD HAS ALREADY GIVEN BACK PART OF WHAT IS
      PENDING. The refund took it out of pending (lib/stripe/refund-sync.ts),
      so releasing the sale's whole net here would move money into available
      that is no longer there. Each sale releases what its refunds left.
    */
    const orderIds = [...new Set(releasable.map((e: any) => e.order_id).filter(Boolean))] as string[]
    const takenFromPending = new Map<string, number>()
    if (orderIds.length > 0) {
      const { data: refunds } = await adminSupabase
        .from("ledger_events")
        .select("order_id, pending_delta")
        .eq("event_type", "refund")
        .in("order_id", orderIds)
      for (const r of (refunds ?? []) as Array<{ order_id: string; pending_delta: number | null }>) {
        takenFromPending.set(r.order_id, (takenFromPending.get(r.order_id) ?? 0) + Math.max(0, -(r.pending_delta || 0)))
      }
    }

    // Group by creator for batch updates
    const byCreator = new Map<string, { total: number; eventIds: string[] }>()
    for (const event of releasable) {
      const existing = byCreator.get(event.creator_id) || { total: 0, eventIds: [] }
      const refunded = event.order_id ? takenFromPending.get(event.order_id) ?? 0 : 0
      existing.total += Math.max(0, (event.net_seller_cents || 0) - refunded)
      existing.eventIds.push(event.id)
      byCreator.set(event.creator_id, existing)
    }

    let totalReleased = 0
    let creatorsProcessed = 0
    const pushes: PayoutPush[] = []

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
          /* The wallet's one currency (lib/payments/ledger-currency), never a guessed one. */
          currency: ledgerCurrency(),
          pending_delta: -releaseAmount,
          available_delta: toAvailable,
          description: `Hold released: ${formatMinor(releaseAmount, ledgerCurrency())} cleared`,
        })

        // Mark events as released
        await adminSupabase
          .from("ledger_events")
          .update({ released_at: now.toISOString() })
          .in("id", eventIds)

        // Notify seller that funds are available for cashout (sent after the loop, awaited)
        if (toAvailable > 0) pushes.push({ creatorId, cents: toAvailable })

        totalReleased += releaseAmount
        creatorsProcessed++
      } catch (err) {
        console.error(`[Release Holds] Error for creator ${creatorId}:`, err)
      }
    }

    await pushPayoutsAvailable(adminSupabase, pushes)

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

/* Every run written down, and a failure reported (lib/observability/report, run-now part 68). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/release-holds", request, () => runJob(request), { maxDurationS: maxDuration })
}
