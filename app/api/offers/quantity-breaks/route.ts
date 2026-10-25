import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OFFERS_CACHE, productOffers } from "@/lib/offers/offers-public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A product's quantity breaks (lib/offers/pricing.ts): GET ?product=<id>.
 *
 *   { "offers": [ { "offerId", "productId", "title", "tiers": [ { "quantity",
 *     "freeQuantity", "discountType", "discountValue", "label", "badge",
 *     "unitPriceCents", "totalCents", "compareCents" } ] } ] }
 *
 * Only quantity breaks on now, shown on product pages, for a published
 * product (its own, or a collection's it is in). Each tier is priced at the
 * product's default variant; a theme works out another variant's numbers
 * with the same formula, which is the one the checkout charges by.
 */
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("product")
  const found = await productOffers(createAdminClient(), productId, { only: ["quantityBreaks"] })
  return NextResponse.json({ offers: found.quantityBreaks }, { headers: OFFERS_CACHE })
}
