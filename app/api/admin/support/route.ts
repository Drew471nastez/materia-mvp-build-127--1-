import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { adminList } from "@/lib/support/tickets-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/** /admin/resolution: every store's support requests. GET ?status=open|waiting|resolved&q=… */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const out = await adminList(createAdminClient(), { status: request.nextUrl.searchParams.get("status"), q: request.nextUrl.searchParams.get("q") })
  /* Storelib is told what to do about it, not what a store is told. */
  if (!out.ok) return NextResponse.json({ error: out.status === 503 ? "The support tables aren't in the database yet. Run SQL part 114 (it's in supabase/sql/all-in-three, file 2), then reload." : out.error, notReady: out.status === 503 }, { status: out.status, headers: NO_STORE })
  return NextResponse.json({ tickets: out.tickets, counts: out.counts }, { headers: NO_STORE })
}
