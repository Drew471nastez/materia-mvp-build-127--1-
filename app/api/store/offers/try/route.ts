import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { readOffer, type Offer } from "@/lib/offers/offers"
import { loadOffers, offerLinesFor } from "@/lib/offers/offers-server"
import { DRAFT_ID, tryCart, type TryLine } from "@/lib/offers/try-cart"
import { defaultPrice } from "@/lib/offers/offers-public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * TRY AN OFFER ON A CART, from its editor (Products, Upsells and bundles):
 * POST { offer: <the editor's fields>, id?: <the saved offer's id>, items:
 * [{ productId, quantity }] }. The cart is priced the way the checkout
 * prices it: each product at its first option's price from the database,
 * the store's offers and this one (as if on now) through applyOffers
 * (lib/offers/try-cart.ts). Nothing is saved, nothing is charged.
 *
 * The caller's own store only (shopCaller: the owner, or a team member given
 * Marketing): every product is read under the caller's creator id,
 * and one that is not theirs is left out of the cart.
 */
export async function POST(request: Request) {
  const c = await shopCaller("marketing")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const read = readOffer((body.offer ?? null) as Record<string, unknown> | null)
  if (read.ok === false) return physicalJson({ error: (read as { error: string }).error }, 400)
  const draft: Offer = { ...(read as { offer: Omit<Offer, "id"> }).offer, id: isUuid(body.id) ? body.id : DRAFT_ID }
  const asked = (Array.isArray(body.items) ? body.items : [])
    .slice(0, 12)
    .flatMap((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>
      const quantity = Math.max(0, Math.min(99, Math.floor(Number(i.quantity)) || 0))
      return isUuid(i.productId) && quantity > 0 ? [{ productId: i.productId, quantity }] : []
    })
  if (asked.length === 0) return physicalJson({ error: "Add at least one item to the cart." }, 400)

  const ids = [...new Set(asked.map((a) => a.productId))]
  const { data: rows } = await c.db.from("products").select("id, title, type, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents").eq("creator_id", c.creatorId).in("id", ids)
  const products = new Map(((rows ?? []) as { id: string; title: string; type: string; price_cents: number | null; compare_at_cents?: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }[]).map((p) => [p.id, p]))
  const lines: TryLine[] = []
  for (const a of asked) {
    const p = products.get(a.productId)
    if (!p) continue
    const pwyw = p.pay_what_you_want === true
    const price = pwyw ? { priceCents: Math.max(0, Math.round(Number(p.pwyw_min_price_cents) || 0)) } : await defaultPrice(c.db, p)
    if (!price) continue
    /* A download is one copy per order at checkout. */
    lines.push({ productId: p.id, title: p.title, unitCents: price.priceCents, quantity: p.type === "physical" ? a.quantity : 1, payWhatYouWant: pwyw })
  }
  if (lines.length === 0) return physicalJson({ error: "Those products aren't in your store." }, 400)
  const { offers } = await loadOffers(c.db, c.creatorId)
  const withCollections = (await offerLinesFor(c.db, c.creatorId, [...offers, draft], lines)) as TryLine[]
  return physicalJson(tryCart(withCollections.map((l, i) => ({ ...l, title: lines[i].title })), offers, draft))
}
