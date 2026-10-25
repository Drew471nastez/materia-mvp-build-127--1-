import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OFFERS_CACHE, productOffers } from "@/lib/offers/offers-public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * What a product's page offers with it (lib/offers): GET ?product=<id>.
 *
 *   bundles   the store's bundles on now with this product in, shown on
 *             product pages, whose every product is still on sale
 *   upsells   its checkout offers on now, shown on product pages, that this
 *             product triggers (by itself, by a collection it's in, or for
 *             any order), each with the price it adds at
 *
 * Prices as a page shows them, from each product's own row; an option out
 * of stock is left out. The checkout prices the cart again on the server, so
 * nothing here decides what anyone pays. Offers are a store's whatever it
 * sells, so this is not behind the physical commerce switch. The same read
 * as GET /api/offers, which adds the quantity breaks (lib/offers/offers-public).
 */
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("product")
  const found = await productOffers(createAdminClient(), productId, { only: ["bundles", "checkoutOffers"] })
  /* A short cache: a schedule's start or end shows within a minute. */
  return NextResponse.json({ bundles: found.bundles, upsells: found.checkoutOffers }, { headers: OFFERS_CACHE })
}
