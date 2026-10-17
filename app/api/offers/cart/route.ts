import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid } from "@/lib/physical/auth"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { baseFor } from "@/lib/checkout/pricing"
import { readItems } from "@/lib/physical/checkout-pricing-server"
import { applyOffers, bundleCompletions, bundlePrice, offerUnitPrice, suggestionsFor } from "@/lib/offers/offers"
import { loadOffers, offerLabeler, offerLinesFor, offerProducts } from "@/lib/offers/offers-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * WHAT A CART GETS FROM THE STORE'S OFFERS, FOR THE CART TO SHOW
 * (lib/offers): POST { shopId, items: [{ productId, variantId, quantity,
 * customPriceCents }] }, from the cart drawer and the cart page.
 *
 *   offers        each upsell and bundle the cart gets now, with what it saves
 *   offerCents    all of that together
 *   suggestions   checkout offers shown in the cart that this cart qualifies
 *                 for, their product not in it yet, with the price it adds at
 *   completions   bundles shown in the cart that it holds part of, with the
 *                 products still missing
 *
 * Prices are the database's for the shop's own published products, a pay
 * what you want amount held to its minimum. This only draws the cart: the
 * checkout prices every line again on the server, offers and code included.
 */
export async function POST(request: Request) {
  const limited = await rateLimit({ bucket: "offers-cart", subjects: [addressSubject(request)], windows: [{ limit: 240, seconds: 600 }], message: "Too many requests. Wait a moment and try again." })
  if (limited) return limited
  const none = { offers: [], offerCents: 0, lines: [], suggestions: [], completions: [] }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(none)
  }
  const shopId = body?.shopId
  if (!isUuid(shopId)) return NextResponse.json(none)
  const items = readItems(body.items)
  if (items.length === 0) return NextResponse.json(none)
  const db = createAdminClient()
  const { offers } = await loadOffers(db, shopId, { activeOnly: true })
  if (offers.length === 0) return NextResponse.json(none)

  /* The shop's own published products only: another shop's id in the cart is not priced, and nothing about it is said. */
  const { data: rows } = await db.from("products").select("id, type, price_cents, pay_what_you_want, pwyw_min_price_cents").eq("creator_id", shopId).eq("status", "published").in("id", [...new Set(items.map((i) => i.productId))])
  const products = new Map(((rows ?? []) as { id: string; type: string; price_cents: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }[]).map((p) => [p.id, p]))
  const { data: vs } = products.size ? await db.from("product_variants").select("id, product_id, price_cents, pay_what_you_want, pwyw_min_price_cents, active").in("product_id", [...products.keys()]) : { data: [] }
  const variants = ((vs ?? []) as { id: string; product_id: string; price_cents: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null; active?: boolean | null }[]).filter((v) => v.active !== false)

  const priced = items.flatMap((i) => {
    const p = products.get(i.productId)
    if (!p) return []
    const own = variants.filter((v) => v.product_id === p.id)
    const v = i.variantId ? own.find((x) => x.id === i.variantId) : own.length === 1 && p.type === "physical" ? own[0] : undefined
    if (i.variantId && !v) return []
    const base = baseFor(v ?? p, i.customPriceCents)
    const unitCents = base.ok === false ? 0 : (base as { cents: number }).cents
    return [{ productId: p.id, variantId: v?.id ?? null, unitCents, quantity: p.type === "physical" ? i.quantity : 1, payWhatYouWant: !!(v ?? p).pay_what_you_want }]
  })
  if (priced.length === 0) return NextResponse.json(none)

  const now = new Date()
  const lines = await offerLinesFor(db, shopId, offers, priced.map((l) => ({ productId: l.productId, unitCents: l.unitCents, quantity: l.quantity, payWhatYouWant: l.payWhatYouWant })))
  const got = applyOffers(lines, offers, { now })
  const suggestions = suggestionsFor(lines, offers, { placement: "cart", now })
  const completions = bundleCompletions(lines, offers, { now })
  const label = await offerLabeler(db, shopId)
  const cards = await offerProducts(db, shopId, [...new Set([...suggestions.map((s) => s.productIds[0]), ...completions.flatMap((c) => c.offer.productIds)])])

  return NextResponse.json({
    offers: got.applied.map((a) => ({ offerId: a.offerId, title: a.title, savedCents: a.savedCents, freeShipping: a.freeShipping === true })),
    offerCents: got.discounts.reduce((n, d) => n + d, 0),
    lines: priced.map((l, i) => ({ productId: l.productId, variantId: l.variantId, discountCents: got.discounts[i] })),
    suggestions: suggestions.flatMap((s) => {
      const p = cards.get(s.productIds[0])
      return p ? [{ offerId: s.id, title: s.title, label: label(s), product: p, offerPriceCents: offerUnitPrice(s, p.priceCents) }] : []
    }),
    completions: completions.flatMap(({ offer, missing }) => {
      const all = offer.productIds.map((id) => cards.get(id))
      const items = missing.map((id) => cards.get(id))
      if (all.some((x) => !x) || items.some((x) => !x)) return []
      const { fullCents, priceCents } = bundlePrice(offer, all.map((x) => x!.priceCents))
      return [{ offerId: offer.id, title: offer.title, label: label(offer), missing: items, savingCents: Math.max(0, fullCents - priceCents) }]
    }),
  })
}
