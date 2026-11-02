import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { isUuid, physicalCaller } from "@/lib/physical/auth"
import { shopFacts } from "@/lib/physical/storefront-facts"

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
    const c = await physicalCaller("store", { read: true })
    if (c instanceof NextResponse) return c
    creatorId = c.creatorId
    owner = true
  } else {
    const shopId = url.searchParams.get("shopId")
    if (!isUuid(shopId)) return NextResponse.json({ error: "Not found." }, { status: 404 })
    creatorId = shopId
  }
  /* The same facts an imported theme's banner and cart line read (lib/physical/storefront-facts.ts). */
  const facts = await shopFacts(createAdminClient(), creatorId)
  return NextResponse.json(
    facts,
    { headers: { "Cache-Control": owner ? "private, no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
  )
}
