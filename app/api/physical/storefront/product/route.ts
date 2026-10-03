import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { isUuid } from "@/lib/physical/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** "Only N left" is said from this many down; above it a buyer just sees In stock. */
const SAY_LEFT_FROM = 10

/**
 * What a buyer's product page needs to sell a physical product: its options,
 * each variant's price and whether it can be bought, and how many are left
 * when that is few. Published products only. Costs, SKUs, locations and
 * exact stock levels are never sent.
 */
export async function GET(request: Request) {
  const off = await physicalApiGate()
  if (off) return off
  const productId = new URL(request.url).searchParams.get("productId")
  if (!isUuid(productId)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const db = createAdminClient()
  const { data: p } = await db
    .from("products")
    .select("id, creator_id, title, slug, type, status, price_cents, thumbnail_url, track_inventory, continue_selling, requires_shipping")
    .eq("id", productId)
    .eq("status", "published")
    .eq("type", "physical")
    .maybeSingle()
  if (!p) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const [{ data: options }, { data: variants }, { data: locations }] = await Promise.all([
    db.from("product_options").select("position, name, values").eq("product_id", p.id).order("position"),
    db.from("product_variants").select("id, name, option1, option2, option3, price_cents, compare_at_price_cents, image_url, track_inventory, inventory_policy, active, position").eq("product_id", p.id).order("position"),
    db.from("inventory_locations").select("id").eq("creator_id", p.creator_id).eq("active", true).eq("fulfills_orders", true),
  ])
  const live = ((variants ?? []) as Record<string, any>[]).filter((v) => v.active !== false && !/^Archived /.test(v.name))
  const locIds = ((locations ?? []) as { id: string }[]).map((l) => l.id)
  const available = new Map<string, number>()
  if (live.length && locIds.length) {
    const { data: levels } = await db.from("inventory_levels").select("variant_id, available").in("variant_id", live.map((v) => v.id)).in("location_id", locIds)
    for (const l of (levels ?? []) as { variant_id: string; available: number }[]) available.set(l.variant_id, (available.get(l.variant_id) ?? 0) + Math.max(0, l.available))
  }
  return NextResponse.json(
    {
      product: { id: p.id, creatorId: p.creator_id, title: p.title, slug: p.slug, imageUrl: p.thumbnail_url },
      options: ((options ?? []) as { position: number; name: string; values: string[] }[]).map((o) => ({ name: o.name, values: o.values })),
      variants: live.map((v) => {
        const tracked = v.track_inventory ?? p.track_inventory ?? true
        const keepSelling = v.inventory_policy === "continue" || p.continue_selling === true
        const left = tracked ? (available.get(v.id) ?? 0) : null
        const soldOut = tracked && !keepSelling && (left ?? 0) <= 0
        return {
          id: v.id,
          name: v.name,
          options: [v.option1, v.option2, v.option3],
          priceCents: v.price_cents,
          compareAtCents: v.compare_at_price_cents && v.compare_at_price_cents > v.price_cents ? v.compare_at_price_cents : null,
          imageUrl: v.image_url,
          soldOut,
          left: tracked && !keepSelling && left !== null && left > 0 && left <= SAY_LEFT_FROM ? left : null,
          maxQuantity: tracked && !keepSelling ? Math.max(0, Math.min(999, left ?? 0)) : 999,
        }
      }),
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" } },
  )
}
