import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { physicalApiGate } from "@/lib/physical/gate"
import { physicalJson, readBody } from "@/lib/physical/auth"
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { priceCheckout, quoteCheckout, readItems } from "@/lib/physical/checkout-pricing-server"
import { deliveryEstimate } from "@/lib/physical/rates"
import { PICKUP_READY_LABEL } from "@/lib/physical/pickup"
import { suggestionCards } from "@/lib/offers/offers-server"
import { variantChoices } from "@/lib/checkout/variant-choices-server"
import { codFeeFor } from "@/lib/checkout/site-quote-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * What the physical checkout page shows: the cart priced by the server,
 * what was left out, what is short on stock, the shipping options for the
 * buyer's address, the local pickup points that can hand over this cart,
 * and the totals with the chosen one. A code that does not
 * apply is said, and the cart is priced without it. Nothing is held here.
 */
export async function POST(request: Request) {
  const off = await physicalApiGate()
  if (off) return off
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const limited = await rateLimit({ bucket: "coupon", subjects: [addressSubject(request)], windows: [{ limit: 120, seconds: 600 }], message: "Too many requests. Wait a moment and try again." })
  if (limited) return limited

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const db = createAdminClient()
  const items = readItems(body.items)
  const shopId = typeof body.shopId === "string" ? body.shopId : null
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null
  let couponError: string | null = null
  let priced = await priceCheckout(db, { items, couponCode: body.couponCode, buyerId: user?.id ?? null, buyerEmail: email, shopId })
  if (priced.ok === false && body.couponCode) {
    /* The code cost something to check: the attempt counts against the code limit. */
    const guard = await rateLimit({ bucket: "coupon", subjects: [addressSubject(request)], windows: LIMITS.coupon, message: "Too many codes tried. Wait a few minutes." })
    if (guard) return guard
    couponError = priced.error
    priced = await priceCheckout(db, { items, couponCode: null, buyerId: user?.id ?? null, buyerEmail: email, shopId })
  }
  if (priced.ok === false) return physicalJson({ error: priced.error }, priced.status)

  const country = typeof body.country === "string" && COUNTRY_CODES.has(body.country.toUpperCase()) ? body.country.toUpperCase() : null
  const region = typeof body.region === "string" ? body.region.slice(0, 120) : null
  /* The postal code only decides local delivery (lib/physical/local-delivery.ts). */
  const postalCode = typeof body.postalCode === "string" ? body.postalCode.slice(0, 20) : null
  /* The city, once typed: carrier calculated rates in most of Europe need it (lib/integrations/shipping/checkout-rates-server.ts). */
  const city = typeof body.city === "string" && body.city.trim() ? body.city.trim().slice(0, 120) : null
  /* What each line could be changed to (a size, an edition), read beside the delivery quote. A line at its own price keeps it. */
  /* Cash on delivery chosen: its fee is in the total shown, as the order will keep it (Settings › Checkout). */
  const codFeeCents = await codFeeFor(db, priced.creatorId, body, country)
  const [q, choices] = await Promise.all([
    quoteCheckout(db, priced, country ? { country, region, postalCode, city } : null, body.deliveryOptionId, { codFeeCents }),
    variantChoices(db, items.filter((i) => typeof i.customPriceCents !== "number").map((i) => i.productId)),
  ])
  return physicalJson({
    creatorId: priced.creatorId,
    lines: priced.lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      title: l.title,
      variantName: l.variantName,
      imageUrl: l.imageUrl,
      type: l.type,
      quantity: l.quantity,
      unitCents: l.unitCents,
      discountCents: l.discountCents,
      requiresShipping: l.requiresShipping,
    })),
    dropped: priced.dropped,
    choices,
    stockIssues: priced.stockIssues,
    requiresShipping: priced.requiresShipping,
    coupon: priced.coupon ? { code: priced.coupon.code, label: priced.couponLabel, freeShipping: priced.freeShipping } : null,
    couponError,
    delivery: q.quote.ok
      ? {
          ok: true,
          options: q.quote.required ? q.quote.options.map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents, estimate: deliveryEstimate(o) })) : [],
          selectedId: q.option?.id ?? null,
          needsCountry: priced.requiresShipping && !country,
        }
      : { ok: false, error: q.quote.error, options: [], selectedId: q.option?.kind === "pickup" ? q.option.id : null, needsCountry: false, needsRegion: q.quote.needsRegion === true },
    pickups: q.pickups.map((o) => ({
      id: o.id,
      name: o.pickup?.name ?? o.name,
      address: o.pickup?.address ?? [],
      instructions: o.pickup?.instructions ?? null,
      ready: o.pickup ? PICKUP_READY_LABEL[o.pickup.ready] : null,
    })),
    totals: q.totals,
    /* The store's upsells and bundles: what this cart got, and what to suggest adding (lib/offers). */
    offers: priced.offers.filter((o) => o.savedCents > 0).map((o) => ({ title: o.title, savedCents: o.savedCents })),
    suggestions: await suggestionCards(db, priced.creatorId, priced.suggestions),
  })
}
