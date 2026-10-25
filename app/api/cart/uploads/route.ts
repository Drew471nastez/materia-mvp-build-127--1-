import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfRequest } from "@/lib/checkout/site-checkout-server"
import { sameOriginForm } from "@/lib/site-accounts/respond"
import { uploadResponse } from "@/lib/cart-uploads/http"
import { UPLOAD_ERRORS } from "@/lib/cart-uploads/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/cart/uploads, on a store's own website host: a buyer's picture
 * for a cart line (the Storelib theme's Personalization block, or a theme's
 * script). The store is the host's; the answer's `upload.value` is what the
 * line's property holds (lib/cart-uploads/http.ts says the rest). Only from
 * a page of this same website.
 */
export async function POST(request: Request) {
  const host = (request.headers.get("host") || "").trim().toLowerCase()
  if (!sameOriginForm(request, host)) {
    return NextResponse.json({ status: 403, message: UPLOAD_ERRORS.wrong_place, description: UPLOAD_ERRORS.wrong_place }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
  }
  const db = createAdminClient()
  const site = await siteOfRequest(db, request).catch(() => null)
  return uploadResponse(request, { db }, { creatorId: site?.creatorId ?? null })
}
