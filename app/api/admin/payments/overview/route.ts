import { NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { buildPaymentsOverview } from "@/lib/admin/payments/overview"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const data = await buildPaymentsOverview(createAdminClient())
    return NextResponse.json(data, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments overview", e, "Overview could not be read.")
  }
}
