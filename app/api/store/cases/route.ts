import { NextResponse } from "next/server"
import { isUuid, physicalJson, shopCaller } from "@/lib/physical/auth"
import { listCasesForStore } from "@/lib/support/cases-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The store's cases from its buyers (lib/support/cases.ts), newest first; one order's with ?checkout=<id> (a cart that ships) or ?order=<id> (a download). */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const q = new URL(request.url).searchParams
  const checkoutId = q.get("checkout")
  const orderId = q.get("order")
  const out = await listCasesForStore(c.db, c.creatorId, { checkoutId: isUuid(checkoutId) ? checkoutId : null, orderId: isUuid(orderId) ? orderId : null })
  if (!out.ok) return physicalJson({ error: out.error, notReady: out.status === 503 }, out.status)
  return physicalJson({ cases: out.cases })
}
