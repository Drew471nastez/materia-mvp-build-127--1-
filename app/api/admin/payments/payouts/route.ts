import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { PAYOUT_COLUMNS, toPayoutRow, type PayoutDb } from "@/lib/admin/views/creators"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1))
  const pageSize = 25
  const from = (page - 1) * pageSize
  try {
    const { data, error, count } = await createAdminClient()
      .from("payouts")
      .select(PAYOUT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) return adminFailure("payments payouts", error, "Payouts could not be read.")
    const rows = (data as PayoutDb[] | null)?.map(toPayoutRow) ?? []
    return NextResponse.json({ rows, total: count ?? rows.length, page }, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments payouts", e, "Payouts could not be read.")
  }
}
