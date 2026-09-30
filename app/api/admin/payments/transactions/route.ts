import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { listPaymentTransactions } from "@/lib/admin/payments/transactions"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1))
  try {
    const result = await listPaymentTransactions(createAdminClient(), request.nextUrl.searchParams, page)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500, headers: NO_STORE })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments transactions", e, "Transactions could not be read.")
  }
}
