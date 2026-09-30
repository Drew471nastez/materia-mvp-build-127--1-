import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { listPaymentAccounts } from "@/lib/admin/payments/accounts"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const sp = request.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get("page") || 1))
  const q = sp.get("q")
  try {
    const result = await listPaymentAccounts(createAdminClient(), q, page)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500, headers: NO_STORE })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments accounts", e, "Accounts could not be read.")
  }
}
