import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { isUuid } from "@/lib/physical/auth"
import { bundlePrice, bundlesWith, discountLabel } from "@/lib/offers/offers"
import { loadOffers, offerProducts } from "@/lib/offers/offers-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The bundles a product's page shows (lib/offers): GET ?product=<id>. Only
 * a store's active bundles whose every product is still on sale; prices as
 * a page shows them, from each product's own row. The checkout prices the
 * cart again on the server, so nothing here decides what anyone pays.
 */
export async function GET(request: Request) {
  const off = await physicalApiGate()
  if (off) return off
  const productId = new URL(request.url).searchParams.get("product")
  if (!isUuid(productId)) return NextResponse.json({ bundles: [] })
  const db = createAdminClient()
  const { data: product } = await db.from("products").select("creator_id, status").eq("id", productId).maybeSingle()
  if (!product || product.status !== "published") return NextResponse.json({ bundles: [] })
  const { offers } = await loadOffers(db, product.creator_id as string, { activeOnly: true })
  const bundles = bundlesWith(productId, offers)
  if (bundles.length === 0) return NextResponse.json({ bundles: [] }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } })
  const products = await offerProducts(db, product.creator_id as string, [...new Set(bundles.flatMap((b) => b.productIds))])
  const out = bundles.flatMap((b) => {
    const items = b.productIds.map((id) => products.get(id))
    if (items.some((i) => !i)) return []
    const list = items as NonNullable<(typeof items)[number]>[]
    /* This product first, as Shopify's "Frequently bought together" does. */
    list.sort((a, c) => (a.id === productId ? -1 : c.id === productId ? 1 : 0))
    const { fullCents, priceCents } = bundlePrice(b, list.map((i) => i.priceCents))
    return [{ offerId: b.id, title: b.title, label: b.discountType === "none" ? null : discountLabel(b), discountType: b.discountType, discountValue: b.discountValue, items: list, fullCents, priceCents }]
  })
  return NextResponse.json({ bundles: out }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } })
}
