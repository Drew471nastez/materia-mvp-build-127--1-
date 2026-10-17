import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/app/orders/seen { ids }: the order with these lines was opened on
 * the Orders page, so it is no longer new (SQL part 224, orders.seller_seen_at;
 * app/app/orders/orders-client.tsx). Only the store's own lines, and only the
 * first time: a line already seen keeps the time it was first opened. The
 * owner, or a teammate whose role has Orders: the store shares one "seen".
 * Before part 224 has run the column is not there; nothing is written and the
 * answer says so, and the list shows no dot to clear.
 */
export async function POST(request: Request) {
  const c = await shopCaller("orders")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const raw = body?.ids
  const ids = Array.isArray(raw) ? [...new Set(raw.filter(isUuid))].slice(0, 100) : []
  if (ids.length === 0) return physicalJson({ error: "Bad request." }, 400)
  const { error } = await c.db.from("orders").update({ seller_seen_at: new Date().toISOString() }).in("id", ids).eq("creator_id", c.creatorId).is("seller_seen_at", null)
  if (error) return physicalJson({ ok: false, waiting: /seller_seen_at|column|42703|PGRST204/i.test(error.message ?? "") })
  return physicalJson({ ok: true })
}
