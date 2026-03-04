import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/coupons/[id]/use
 *
 * Increments the usage_count for a coupon after a successful purchase.
 * Called client-side as fire-and-forget after checkout completion.
 * Uses admin client to bypass RLS (no user auth needed here).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { error } = await admin.rpc("increment_coupon_usage", { coupon_id: id })

  if (error) {
    // Fallback: direct update if RPC not available
    const { data: coupon } = await admin
      .from("coupons")
      .select("usage_count")
      .eq("id", id)
      .maybeSingle()

    if (coupon) {
      await admin
        .from("coupons")
        .update({ usage_count: (coupon.usage_count || 0) + 1 })
        .eq("id", id)
    }
  }

  return NextResponse.json({ ok: true })
}
