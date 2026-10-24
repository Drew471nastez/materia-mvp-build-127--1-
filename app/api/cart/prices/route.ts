import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid } from "@/lib/physical/auth"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { MAX_LINES, type LinePrice } from "@/lib/website-builder/cart"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A SAVED CART, PRICED AGAIN
 * ===========================================================================
 * POST { shopId, items: [{ productId, variantId }] } answers each line's
 * price now and the store's currency (lib/website-builder/cart repricedLines).
 *
 * A website's cart is kept in the visitor's browser with the prices it was
 * filled at. After the store converts its currency those numbers are in the
 * old one; the cart asks here once rather than show them with the new
 * currency's mark. Published products of that store only, the same prices
 * every product page shows, so nothing here is private. Checkout prices the
 * order again from the database whatever this said.
 */
export async function POST(request: Request) {
  type Body = { shopId?: unknown; items?: unknown }
  const body: Body | null = await request.json().then((b: unknown) => (b && typeof b === "object" ? (b as Body) : null), () => null)
  const shopId = body?.shopId
  if (!isUuid(shopId)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const asked: unknown = body?.items
  const items = (Array.isArray(asked) ? (asked as unknown[]) : [])
    .slice(0, MAX_LINES)
    .map((i) => i as { productId?: unknown; variantId?: unknown })
    .filter((i) => isUuid(i.productId))
    .map((i) => ({ productId: i.productId as string, variantId: isUuid(i.variantId) ? (i.variantId as string) : null }))

  const db = createAdminClient()
  const productIds = [...new Set(items.map((i) => i.productId))]
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is string => !!v))]
  const [store, products, variants] = await Promise.all([
    readStoreCurrency(db, shopId as string),
    productIds.length
      ? db.from("products").select("id, price_cents, pay_what_you_want, pwyw_min_price_cents").in("id", productIds).eq("creator_id", shopId).eq("status", "published")
      : Promise.resolve({ data: [] }),
    variantIds.length ? db.from("product_variants").select("id, product_id, price_cents, active").in("id", variantIds) : Promise.resolve({ data: [] }),
  ])
  const byProduct = new Map(((products.data ?? []) as { id: string; price_cents: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }[]).map((p) => [p.id, p]))
  const byVariant = new Map(((variants.data ?? []) as { id: string; product_id: string; price_cents: number | null; active?: boolean | null }[]).map((v) => [v.id, v]))

  const lines: LinePrice[] = items.map(({ productId, variantId }) => {
    const p = byProduct.get(productId)
    if (!p) return { productId, variantId, priceCents: null }
    if (variantId) {
      const v = byVariant.get(variantId)
      if (!v || v.product_id !== productId || v.active === false) return { productId, variantId, priceCents: null }
      return { productId, variantId, priceCents: Math.max(0, Number(v.price_cents) || 0) }
    }
    const own = p.pay_what_you_want ? p.pwyw_min_price_cents ?? p.price_cents : p.price_cents
    return { productId, variantId, priceCents: Math.max(0, Number(own) || 0) }
  })
  return NextResponse.json({ currency: store.currency, lines }, { headers: { "Cache-Control": "no-store" } })
}
