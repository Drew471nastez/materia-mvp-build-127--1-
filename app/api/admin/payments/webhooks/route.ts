import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const scope = request.nextUrl.searchParams.get("scope")
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1))
  const pageSize = 50
  const from = (page - 1) * pageSize
  try {
    let q = createAdminClient()
      .from("stripe_webhook_events")
      .select("event_id, type, account, received_at, processed_at, attempts, last_error", { count: "exact" })
      .order("received_at", { ascending: false })
    if (scope === "platform") q = q.is("account", null)
    if (scope === "connect") q = q.not("account", "is", null)
    const { data, error, count } = await q.range(from, from + pageSize - 1)
    if (error) return NextResponse.json({ unavailable: "Webhook ledger table is not available." }, { headers: NO_STORE })
    const rows =
      data?.map((e) => ({
        eventId: e.event_id,
        type: e.type,
        scope: e.account ? "connect" : "platform",
        connectedAccount: e.account,
        receivedAt: e.received_at,
        processingStatus: e.processed_at ? "processed" : e.last_error ? "failed" : "pending",
        attempts: e.attempts,
        error: e.last_error,
        processedAt: e.processed_at,
      })) ?? []
    return NextResponse.json({ rows, total: count ?? rows.length, page }, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments webhooks", e, "Webhooks could not be read.")
  }
}
