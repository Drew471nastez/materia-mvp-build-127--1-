import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { adminListCases } from "@/lib/support/cases-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Buyer cases for Storelib: the ones waiting on Storelib (default), every one it was asked into, resolved, or all. */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const url = new URL(request.url)
  const out = await adminListCases(createAdminClient(), { view: url.searchParams.get("view"), q: url.searchParams.get("q") })
  if (!out.ok) return NextResponse.json({ error: out.status === 503 ? "Buyer cases need SQL part 117 (it's in supabase/sql/all-in-three, file 2). Run it, then reload." : out.error, notReady: out.status === 503 }, { status: out.status, headers: { "Cache-Control": "no-store" } })
  return NextResponse.json({ cases: out.cases, counts: out.counts }, { headers: { "Cache-Control": "no-store" } })
}
