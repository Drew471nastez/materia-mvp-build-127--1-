import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfRequest } from "@/lib/checkout/site-checkout-server"
import { openResponse } from "@/lib/cart-uploads/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cart/uploads/<id>.<sig>/<name>: a buyer's own picture on their
 * cart line, for the browser that uploaded it, on the store it was uploaded
 * to (lib/cart-uploads/http.ts openResponse). Anybody else is told "Not found".
 */
export async function GET(request: Request, { params }: { params: Promise<{ ref: string; name: string }> }) {
  const { ref } = await params
  const db = createAdminClient()
  const site = await siteOfRequest(db, request).catch(() => null)
  return openResponse(request, { db }, { creatorId: site?.creatorId ?? null, ref })
}
