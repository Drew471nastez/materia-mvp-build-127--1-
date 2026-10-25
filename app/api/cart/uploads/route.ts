import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfRequest } from "@/lib/checkout/site-checkout-server"
import { sameOriginForm } from "@/lib/site-accounts/respond"
import { uploadResponse } from "@/lib/cart-uploads/http"
import { UPLOAD_ERRORS } from "@/lib/cart-uploads/rules"
import { isPlatformHost } from "@/lib/physical/store-link"
import { getMainDomain } from "@/lib/url-helpers"
import { readPersonalization } from "@/lib/products/personalization"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/cart/uploads, on a store's own website host: a buyer's picture
 * for a cart line (the Storelib theme's Personalization block, or a theme's
 * script). The store is the host's; the answer's `upload.value` is what the
 * line's property holds (lib/cart-uploads/http.ts says the rest). Only from
 * a page of this same website.
 *
 * On storelib.com itself (a product's own page, components/physical/buy-box)
 * there is no website: the store is the product's, named by `?product=`, and
 * only when it is a published product that ships and asks for a photo
 * (Products › Personalization, lib/products/personalization).
 */
export async function POST(request: Request) {
  const host = (request.headers.get("host") || "").trim().toLowerCase()
  if (!sameOriginForm(request, host)) {
    return NextResponse.json({ status: 403, message: UPLOAD_ERRORS.wrong_place, description: UPLOAD_ERRORS.wrong_place }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
  }
  const db = createAdminClient()
  const site = await siteOfRequest(db, request).catch(() => null)
  const creatorId = site?.creatorId ?? (isPlatformHost(host, getMainDomain()) ? await storeOfPhotoProduct(db, new URL(request.url).searchParams.get("product")) : null)
  return uploadResponse(request, { db }, { creatorId })
}

/** The store of a published product that ships and asks for a photo, or null. */
async function storeOfPhotoProduct(db: ReturnType<typeof createAdminClient>, productId: string | null): Promise<string | null> {
  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) return null
  const { data, error } = await db.from("products").select("creator_id, status, type, personalization").eq("id", productId).maybeSingle()
  if (error || !data || data.status !== "published" || data.type !== "physical") return null
  return readPersonalization((data as { personalization?: unknown }).personalization).some((f) => f.type === "image") ? String(data.creator_id) : null
}
