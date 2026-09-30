import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)))
  try {
    const { data, error } = await createAdminClient()
      .from("admin_payments_audit_log")
      .select("id, action, actor, before_state, after_state, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) return NextResponse.json({ unavailable: "Payments audit log is not migrated yet." }, { headers: NO_STORE })
    return NextResponse.json({ entries: data ?? [] }, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments audit", e, "Audit log could not be read.")
  }
}
