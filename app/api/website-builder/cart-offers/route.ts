import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { compatCartPricing } from "@/lib/storelib-theme/compat/cart-pricing-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import type { CartEntry } from "@/lib/storelib-theme/compat/site"
import { lineProperties } from "@/lib/physical/cart-link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * THE BUILDER'S CART, PRICED WITH THE STORE'S OFFERS. The canvas keeps an
 * imported theme's cart in the builder's memory (lib/storelib-theme/compat/
 * canvas-cart.ts); its drawer and cart page ask here what the store's
 * quantity breaks, bundles and checkout offers take off each line, priced by
 * the website checkout's own quote, as the live site's /cart.js is
 * (lib/storelib-theme/compat/cart-pricing-server.ts offers). The signed in
 * creator's own store only: the creator is the session's, never the
 * request's, and every line is checked against their products by the quote.
 *
 *   POST { cart: [{ k, p, v, q, props? }], shown: { [k]: cents } }
 *     -> { offers: { lines: { [k]: [{ offerId, title, kind, tier?, amount }] } } | null }
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  /* The owner, or a team member with Website working in the store (lib/team/website). */
  const site = await websiteCaller()
  if (site.error !== null && site.status !== 404) return NextResponse.json({ error: site.error }, { status: site.status })
  if (site.error !== null) return NextResponse.json({ offers: null })
  const creator = site.creator
  let body: { cart?: unknown; shown?: unknown }
  try {
    body = (await request.json()) as { cart?: unknown; shown?: unknown }
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  const cart: CartEntry[] = (Array.isArray(body.cart) ? body.cart : [])
    .slice(0, 50)
    .flatMap((raw) => {
      const e = (raw ?? {}) as Record<string, unknown>
      if (typeof e.k !== "string" || e.k.length > 200 || typeof e.p !== "string" || !UUID.test(e.p)) return []
      const v = typeof e.v === "string" && UUID.test(e.v) ? e.v : null
      const q = Math.max(1, Math.min(99, Math.floor(Number(e.q)) || 1))
      const props = lineProperties(e.props)
      return [{ k: e.k, p: e.p, v, q, ...(props ? { props } : {}) }]
    })
  const shownRaw = body.shown && typeof body.shown === "object" ? (body.shown as Record<string, unknown>) : {}
  const shown: Record<string, number> = {}
  for (const e of cart) shown[e.k] = Math.max(0, Math.round(Number(shownRaw[e.k]) || 0))
  if (cart.length === 0) return NextResponse.json({ offers: null })
  const admin = createAdminClient()
  const { currency } = await readStoreCurrency(admin, creator.id)
  const offers = await compatCartPricing({ creatorId: creator.id, storeCurrency: currency, market: null, db: admin })
    .offers!(cart, shown)
    .catch(() => null)
  return NextResponse.json({ offers }, { headers: { "Cache-Control": "private, no-store" } })
}
