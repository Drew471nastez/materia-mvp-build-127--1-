import { NextResponse } from "next/server"
import { createPublicReadClient } from "@/lib/supabase/public-read"
import { createAdminClient } from "@/lib/supabase/admin"
import { withVariantPrices } from "@/lib/pricing/variant-price"
import { marketplacePricer } from "@/lib/money/marketplace-server"
import { storeCurrencies } from "@/lib/store/store-currencies"
type PublicPriceRow = {
  id: string
  creator_id: string
  price_cents: number | null
  compare_at_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  type?: string | null
}
export const dynamic = "force-dynamic"
/** Public, bounded catalogue facts only. Private products and orders never
 * leave the server. Store and marketplace currency caches stay separate. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const ids = [
    ...new Set(
      (params.get("ids") || "")
        .split(",")
        .filter((id) =>
          /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id),
        ),
    ),
  ].slice(0, 75)
  if (!ids.length)
    return NextResponse.json(
      { prices: [] },
      { headers: { "Cache-Control": "no-store" } },
    )
  const db = createPublicReadClient()
  const { data, error } = await db
    .from("products")
    .select(
      "id,creator_id,price_cents,compare_at_cents,pay_what_you_want,pwyw_min_price_cents,type",
    )
    .in("id", ids)
    .eq("status", "published")
  if (error)
    return NextResponse.json(
      { error: "Prices could not be read" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  const products = await withVariantPrices(db, (data || []) as PublicPriceRow[])
  const creators = products.map((p) => p.creator_id)
  let prices
  if (params.get("context") === "marketplace") {
    const priceOf = await marketplacePricer(createAdminClient(), creators, ids)
    prices = products.map((p) => ({ ...p, ...priceOf(p) }))
  } else {
    const currencies = await storeCurrencies(createAdminClient(), creators)
    prices = products.map((p) => ({
      ...p,
      currency: currencies.get(p.creator_id) || null,
    }))
  }
  return NextResponse.json(
    { prices },
    { headers: { "Cache-Control": "no-store" } },
  )
}
