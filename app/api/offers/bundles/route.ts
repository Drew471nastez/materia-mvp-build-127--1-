import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid } from "@/lib/physical/auth"
import { bundlePrice, bundlesWith, offerUnitPrice, upsellsFor } from "@/lib/offers/offers"
import { collectionsOf, loadOffers, offerLabeler, offerProducts } from "@/lib/offers/offers-server"

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
 * sells, so this is not behind the physical commerce switch.
 */
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("product")
  const empty = NextResponse.json({ bundles: [], upsells: [] })
  if (!isUuid(productId)) return empty
  const db = createAdminClient()
  const { data: product } = await db.from("products").select("creator_id, status").eq("id", productId).maybeSingle()
  if (!product || product.status !== "published") return empty
  const creatorId = product.creator_id as string
  const { offers } = await loadOffers(db, creatorId, { activeOnly: true })
  const now = new Date()
  const bundles = bundlesWith(productId, offers, { now })
  const wantedCollections = [...new Set(offers.flatMap((o) => o.triggerCollectionIds ?? []))]
  const mine = wantedCollections.length ? ((await collectionsOf(db, creatorId, wantedCollections, [productId])).get(productId) ?? []) : []
  const upsells = upsellsFor(productId, mine, offers, { now })
  /* A short cache: a schedule's start or end shows within a minute. */
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=60" }
  if (bundles.length === 0 && upsells.length === 0) return NextResponse.json({ bundles: [], upsells: [] }, { headers })
  const label = await offerLabeler(db, creatorId)
  const products = await offerProducts(db, creatorId, [...new Set([...bundles.flatMap((b) => b.productIds), ...upsells.map((u) => u.productIds[0])])])
  const bundleCards = bundles.flatMap((b) => {
    const items = b.productIds.map((id) => products.get(id))
    if (items.some((i) => !i)) return []
    const list = items as NonNullable<(typeof items)[number]>[]
    /* This product first, as Shopify's "Frequently bought together" does. */
    list.sort((a, c) => (a.id === productId ? -1 : c.id === productId ? 1 : 0))
    const { fullCents, priceCents } = bundlePrice(b, list.map((i) => i.priceCents))
    return [{ offerId: b.id, title: b.title, label: label(b), discountType: b.discountType, discountValue: b.discountValue, items: list, fullCents, priceCents }]
  })
  const upsellCards = upsells.flatMap((u) => {
    const p = products.get(u.productIds[0])
    if (!p) return []
    return [{ offerId: u.id, title: u.title, label: label(u), discountType: u.discountType, discountValue: u.discountValue, product: p, offerPriceCents: offerUnitPrice(u, p.priceCents) }]
  })
  return NextResponse.json({ bundles: bundleCards, upsells: upsellCards }, { headers })
}
