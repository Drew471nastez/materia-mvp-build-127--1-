import { NextResponse } from "next/server"

import { requireAdmin, adminFailure } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/physical-diagnostics: is physical commerce healthy across
 * Storelib? Counts only, never a buyer's address or an order's contents:
 * shops using it, orders waiting to ship, stock held past its time (the
 * cron is late), jobs failing or given up on, and stock below zero.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const db = createAdminClient()
    const now = new Date().toISOString()
    const count = async (table: string, build: (q: any) => any): Promise<number | null> => {
      const { count: n, error } = await build(db.from(table).select("*", { count: "exact", head: true }))
      return error ? null : (n ?? 0)
    }
    const [shops, products, paid, unshipped, staleHolds, queued, failed, dead, negative] = await Promise.all([
      count("commerce_settings", (q) => q.not("onboarded_at", "is", null)),
      count("products", (q) => q.eq("type", "physical")),
      count("commerce_checkouts", (q) => q.in("status", ["paid", "partially_refunded"])),
      count("commerce_checkouts", (q) => q.eq("status", "paid").in("fulfillment_status", ["unfulfilled", "partially_fulfilled"]).is("cancelled_at", null)),
      count("inventory_reservations", (q) => q.eq("status", "held").lt("expires_at", new Date(Date.now() - 30 * 60_000).toISOString())),
      count("commerce_jobs", (q) => q.eq("status", "queued").lt("run_after", new Date(Date.now() - 30 * 60_000).toISOString())),
      count("commerce_jobs", (q) => q.eq("status", "failed")),
      count("commerce_jobs", (q) => q.eq("status", "dead")),
      count("inventory_levels", (q) => q.lt("on_hand", 0)),
    ])
    const { data: lastDead } = await db.from("commerce_jobs").select("kind, last_error, finished_at").eq("status", "dead").order("finished_at", { ascending: false }).limit(5)
    return NextResponse.json(
      {
        available: shops !== null,
        checkedAt: now,
        shops,
        products,
        paidOrders: paid,
        waitingToShip: unshipped,
        staleHolds,
        lateJobs: queued,
        failingJobs: failed,
        deadJobs: dead,
        negativeStock: negative,
        recentDead: (lastDead ?? []).map((j: { kind: string; last_error: string | null; finished_at: string | null }) => ({ kind: j.kind, error: (j.last_error ?? "").slice(0, 200), at: j.finished_at })),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    return adminFailure("physical diagnostics", e, "Could not read physical commerce.")
  }
}
