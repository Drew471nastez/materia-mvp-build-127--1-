import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { isUuid } from "@/lib/physical/auth"
import { liveVariant, physicalStock, type StockProduct, type StockVariant } from "@/lib/physical/storefront-stock"
import { loadLocations, loadProfiles } from "@/lib/physical/config-server"
import { deliveryPromise, deliveryPromiseLines } from "@/lib/physical/delivery-promise"
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { loadStoreSettings } from "@/lib/store/settings-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * What a buyer's product page needs to sell a physical product: its options,
 * each variant's price and whether it can be bought, and how many are left
 * when that is few, and what delivery costs and takes to the buyer's
 * country (?country=, from their browser; else the shop's own), from the
 * shop's rates (lib/physical/delivery-promise.ts). Published products only.
 * Costs, SKUs, location addresses and exact stock levels are never sent.
 */
export async function GET(request: Request) {
  const off = await physicalApiGate()
  if (off) return off
  const url = new URL(request.url)
  const productId = url.searchParams.get("productId")
  const asked = (url.searchParams.get("country") ?? "").toUpperCase()
  if (!isUuid(productId)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const db = createAdminClient()
  const { data: p } = await db
    .from("products")
    .select("id, creator_id, title, slug, type, status, price_cents, thumbnail_url, track_inventory, continue_selling, requires_shipping, weight_grams, shipping_profile_id, fulfillment_method")
    .eq("id", productId)
    .eq("status", "published")
    .eq("type", "physical")
    .maybeSingle()
  if (!p) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const [{ data: options }, { data: variants }, profiles, locations, store] = await Promise.all([
    db.from("product_options").select("position, name, values").eq("product_id", p.id).order("position"),
    db.from("product_variants").select("id, name, option1, option2, option3, price_cents, compare_at_price_cents, image_url, track_inventory, inventory_policy, active, position, weight_grams").eq("product_id", p.id).order("position"),
    loadProfiles(db, p.creator_id).catch(() => []),
    loadLocations(db, p.creator_id).catch(() => []),
    loadStoreSettings(db, p.creator_id).catch(() => null),
  ])
  const live = ((variants ?? []) as Record<string, any>[]).filter((v) => liveVariant(v as StockVariant))
  /* Stock per variant, by the one rule the website's product section reads too (lib/physical/storefront-stock.ts). */
  const stock = await physicalStock(db, p as StockProduct, live as StockVariant[])
  /* Delivery, for one of the cheapest option: the buyer's country when their browser named one, else where the shop is. */
  const cheapest = [...live].sort((a, b) => Number(a.price_cents ?? 0) - Number(b.price_cents ?? 0))[0] as Record<string, any> | undefined
  const country = COUNTRY_CODES.has(asked) ? asked : (store?.defaultCountry ?? locations.find((l) => l.active)?.country ?? null)
  const promise = p.requires_shipping === false ? null : deliveryPromise({
    profiles,
    profileId: p.shipping_profile_id ?? null,
    country,
    priceCents: Number(cheapest?.price_cents ?? p.price_cents ?? 0),
    weightGrams: Number(cheapest?.weight_grams ?? p.weight_grams ?? 0),
    locations,
    shipsItself: (p.fulfillment_method ?? "self") === "self",
  })
  return NextResponse.json(
    {
      product: { id: p.id, creatorId: p.creator_id, title: p.title, slug: p.slug, imageUrl: p.thumbnail_url },
      delivery: promise ? { ...promise, lines: deliveryPromiseLines(promise) } : null,
      options: ((options ?? []) as { position: number; name: string; values: string[] }[]).map((o) => ({ name: o.name, values: o.values })),
      variants: live.map((v) => {
        const { soldOut, left, maxQuantity } = stock.get(v.id) ?? { soldOut: true, left: null, maxQuantity: 0 }
        return {
          id: v.id,
          name: v.name,
          options: [v.option1, v.option2, v.option3],
          priceCents: v.price_cents,
          compareAtCents: v.compare_at_price_cents && v.compare_at_price_cents > v.price_cents ? v.compare_at_price_cents : null,
          imageUrl: v.image_url,
          soldOut,
          left,
          maxQuantity,
        }
      }),
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" } },
  )
}
