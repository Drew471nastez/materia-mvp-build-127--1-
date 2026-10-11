import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { listOrders } from "@/lib/physical/orders-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FULFILLMENT = new Set(["unfulfilled", "processing", "partially_fulfilled", "fulfilled", "delivered", "cancelled", "not_required"])

export async function GET(request: Request) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const url = new URL(request.url)
  const f = url.searchParams.get("fulfillment")
  const before = url.searchParams.get("before")
  return physicalJson({
    orders: await listOrders(c.db, c.creatorId, {
      fulfillment: f && FULFILLMENT.has(f) ? f : null,
      before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      limit: 50,
    }),
  })
}
