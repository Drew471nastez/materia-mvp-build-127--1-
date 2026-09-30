import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { refreshPaymentAccount } from "@/lib/admin/payments/accounts"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  try {
    const result = await refreshPaymentAccount(createAdminClient(), id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404, headers: NO_STORE })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments account refresh", e, "Refresh failed.")
  }
}
