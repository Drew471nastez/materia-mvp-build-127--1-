import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { commerceActionCounts } from "@/lib/physical/action-counts-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/app/orders/attention: what the store's orders need now, as
 * counts (lib/physical/action-counts-server.ts). Home reads it again when
 * the tab comes back into view, so a line goes as soon as its work is done.
 * The store's own, or the one a teammate works in when their role has
 * Orders; anyone else gets the refusal shopCaller gives.
 */
export async function GET() {
  const c = await shopCaller("orders", { read: true })
  if (c instanceof NextResponse) return c
  const counts = await commerceActionCounts(c.db, c.creatorId)
  return physicalJson({ counts })
}
