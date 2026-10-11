import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { storeIdFor } from "@/lib/team/server"
import { ownedOrderLines } from "@/lib/orders/owned"
import type { OrderActivity } from "@/lib/orders/timeline"

export const runtime = "nodejs"

const TYPES = ["receipt_resent", "email_changed_by_creator", "email_updated"] as const

/**
 * GET /api/app/orders/:id/activity
 *
 * What happened to an order after it was paid, for its timeline: a receipt
 * sent again, the email changed by the creator or by the buyer. Only kinds
 * and times go back to the page. The buyer's own change stores both
 * addresses in its record, and neither is sent.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  /* The store's, for its owner or a team member whose role has orders (lib/team). */
  const store = await storeIdFor("orders")
  if (store.ok === false) return NextResponse.json({ error: store.error }, { status: store.status })
  const creatorId = store.creatorId

  const { id } = await params
  const admin = createAdminClient()
  const lines = await ownedOrderLines(admin, creatorId, id)
  if (!lines) return NextResponse.json({ error: "This order was not found." }, { status: 404 })

  const { data, error } = await admin
    .from("security_events")
    .select("id, event_type, created_at, metadata")
    .in("order_id", lines.map((l) => l.id))
    .in("event_type", TYPES as unknown as string[])
    .order("created_at", { ascending: true })
    .limit(100)
  if (error) return NextResponse.json({ activity: [] })

  const activity: OrderActivity[] = (data ?? []).map((row: any) => ({
    id: String(row.id),
    type: row.event_type,
    at: row.created_at,
    by: row.metadata?.by === "creator" ? "creator" : "buyer",
    failed:
      row.metadata?.buyer_success === false ||
      (typeof row.metadata?.sent === "number" && row.metadata.sent === 0 && (row.metadata?.failed ?? 0) > 0),
  }))
  return NextResponse.json({ activity }, { headers: { "Cache-Control": "no-store" } })
}
