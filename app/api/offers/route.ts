import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OFFERS_CACHE, productOffers } from "@/lib/offers/offers-public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Everything a product's page offers with it, in one call
 * (lib/offers/offers-public.ts): GET ?product=<id> ->
 * { bundles, quantityBreaks, checkoutOffers }. The same JSON an imported
 * theme reads in Liquid as product.metafields.storelib.offers.value.
 */
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("product")
  return NextResponse.json(await productOffers(createAdminClient(), productId), { headers: OFFERS_CACHE })
}
