import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid } from "@/lib/receipts/rules"
import { guestAccessFromCookieHeader } from "@/lib/receipts/guest-access"
import { heldGrants } from "@/lib/receipts/guest-access-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/receipt/open?order=<order id>
 *
 * "Open" on a product page this browser bought as a guest. The page knows
 * the order from the httpOnly `sl_owned` cookie (lib/receipts/guest-access.ts)
 * and never puts the receipt token in its HTML; this checks the cookie's
 * grant for that order again and sends the browser to the receipt, which is
 * where the files, the course and the way into an account are. Without a
 * grant that holds it is the same 404 as an order that does not exist.
 */
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order")
  if (!isUuid(orderId)) return new NextResponse("Receipt not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  const raw = guestAccessFromCookieHeader(request.headers.get("cookie"))
  const held = await heldGrants(createAdminClient(), raw)
  const order = held.open.find((o) => String(o.id).toLowerCase() === orderId.toLowerCase())
  if (!order) return new NextResponse("Receipt not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  const res = NextResponse.redirect(new URL(`/receipt/${order.receipt_token}`, request.url), 303)
  res.headers.set("Cache-Control", "no-store")
  return res
}
