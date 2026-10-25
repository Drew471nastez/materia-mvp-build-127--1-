import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfRequest } from "@/lib/checkout/site-checkout-server"
import { openResponse } from "@/lib/cart-uploads/http"
import { readRef } from "@/lib/cart-uploads/rules"
import { uuidOf } from "@/lib/cart-uploads/sign"
import { isPlatformHost } from "@/lib/physical/store-link"
import { getMainDomain } from "@/lib/url-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cart/uploads/<id>.<sig>/<name>: a buyer's own picture on their
 * cart line, for the browser that uploaded it, on the store it was uploaded
 * to (lib/cart-uploads/http.ts openResponse). Anybody else is told "Not found".
 * On storelib.com itself (a photo sent from a product's own page) the store
 * is the upload's own; the signature over that store, the id and this
 * browser's cookie must still hold.
 */
export async function GET(request: Request, { params }: { params: Promise<{ ref: string; name: string }> }) {
  const { ref } = await params
  const db = createAdminClient()
  const site = await siteOfRequest(db, request).catch(() => null)
  let creatorId = site?.creatorId ?? null
  const host = (request.headers.get("host") || "").trim().toLowerCase()
  const r = readRef(ref)
  if (!creatorId && r && isPlatformHost(host, getMainDomain())) {
    const { data } = await db.from("cart_uploads").select("creator_id").eq("id", uuidOf(r.id)).maybeSingle()
    creatorId = data?.creator_id ? String(data.creator_id) : null
  }
  return openResponse(request, { db }, { creatorId, ref })
}
