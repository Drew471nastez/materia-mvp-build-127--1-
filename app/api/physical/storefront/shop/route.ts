import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { isUuid, physicalCaller } from "@/lib/physical/auth"
import { loadProfiles } from "@/lib/physical/config-server"
import { freeShippingFrom } from "@/lib/physical/rates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * What a shop's website may say about delivery and returns, for the
 * banner, the cart and the refund policy page (components/website-builder/
 * theme/shop-commerce.tsx): whether returns are taken and for how long, and
 * the order value from which shipping is free at home. Nothing else: no
 * rates, no locations, no addresses.
 *
 *   ?shopId=<creator id>   a visitor on the live website
 *   ?mine=1                the owner, in the builder's canvas
 */
export async function GET(request: Request) {
  const off = await physicalApiGate()
  if (off) return off
  const url = new URL(request.url)
  let creatorId: string | null = null
  let owner = false
  if (url.searchParams.get("mine") === "1") {
    const c = await physicalCaller()
    if (c instanceof NextResponse) return c
    creatorId = c.creatorId
    owner = true
  } else {
    const shopId = url.searchParams.get("shopId")
    if (!isUuid(shopId)) return NextResponse.json({ error: "Not found." }, { status: 404 })
    creatorId = shopId
  }
  const db = createAdminClient()
  const [{ data: settings }, { data: store }, profiles] = await Promise.all([
    db.from("commerce_settings").select("returns_enabled, return_window_days, default_location_id").eq("creator_id", creatorId).maybeSingle(),
    db.from("store_settings").select("default_country").eq("creator_id", creatorId).maybeSingle(),
    loadProfiles(db as never, creatorId).catch(() => []),
  ])
  let country: string | null = (store as { default_country?: string | null } | null)?.default_country ?? null
  if (!country && settings?.default_location_id) {
    const { data: loc } = await db.from("inventory_locations").select("country").eq("id", settings.default_location_id).eq("creator_id", creatorId).maybeSingle()
    country = (loc as { country?: string | null } | null)?.country ?? null
  }
  const general = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null
  return NextResponse.json(
    {
      /* Null until the shop has set up physical selling: nothing is said about returns it never chose. */
      returns: settings ? { enabled: settings.returns_enabled !== false, windowDays: Number(settings.return_window_days ?? 30) } : null,
      freeShippingFromCents: freeShippingFrom(general, country),
    },
    { headers: { "Cache-Control": owner ? "private, no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
  )
}
