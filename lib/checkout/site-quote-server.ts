import "server-only"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

/**
 * ===========================================================================
 *  A WEBSITE'S CART, PRICED BY THE SERVER, FOR ITS OWN CHECKOUT
 * ===========================================================================
 * What the checkout at https://<site host>/checkout shows (app/checkout/site)
 * and what its route charges (app/api/checkout/site) come from here, so the
 * page and the payment can never disagree:
 *
 *   downloads only     lib/checkout/pricing priceCart, the basket's own
 *                      pricing: the database's prices, a pay what you want
 *                      amount held to its minimum, the code per line
 *   something ships    lib/physical/checkout-pricing-server, the physical
 *                      checkout's: stock, the delivery options for the
 *                      address, local pickup, offers and tax
 *
 * Both answer in one shape (the physical checkout's quote), so the page has
 * one summary to draw. The shop is the site's (`creatorId`, from the host);
 * a product of another shop is refused here (basketDecision's seller guard).
 *
 * ALREADY YOURS. A buyer signed in to the website's own account proved their
 * email with a code, so what that email already owns (a download, a course;
 * never a physical product) is left out of the payment and listed in
 * `owned`, for the page to say "already yours" with the way to the
 * website's own downloads (lib/checkout/owned). A cart of nothing else is
 * not an error: it is a quote with no lines and its `owned`, and the page
 * draws "You already own this". A guest's typed email is never used for
 * this (it would tell anyone what somebody else bought).
 */
import { priceCart, type PricedCart } from "./pricing"
import { basketDecision } from "./basket-decision"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { lineTotalCents } from "./cart-items"
import { countryCode } from "./countries"
import { loadTaxForCheckout } from "@/lib/tax/server"
import { basketTax, type BasketTax } from "@/lib/tax/rules"
import { variantChoices } from "./variant-choices-server"
import type { ChoicesByProduct } from "./variant-choices"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Body = Record<string, unknown>

export interface SiteQuoteLine {
  productId: string
  variantId: string | null
  title: string
  variantName: string | null
  imageUrl: string | null
  type: string
  quantity: number
  unitCents: number
  discountCents: number
  requiresShipping: boolean
  /** The most this line may be changed to on the checkout: its stock where it ships from, held to the product's per order limit. 1 for a download. */
  maxQuantity: number
}

/** A line the stock can't meet as asked: shown in the order with how many are left, to lower or remove there. */
export interface SiteShortLine {
  productId: string
  variantId: string | null
  title: string
  imageUrl: string | null
  quantity: number
  available: number
}

export interface SiteOwnedLine {
  productId: string
  variantId: string | null
  title: string
  imageUrl: string | null
}

export interface SiteQuote {
  kind: "digital" | "ships"
  creatorId: string
  lines: SiteQuoteLine[]
  dropped: string[]
  /** Lines the signed in customer already owns: left out of the payment, never in `dropped`. */
  owned?: SiteOwnedLine[]
  stockIssues: { productId: string; variantId: string | null; title: string; available: number }[]
  requiresShipping: boolean
  coupon: { code: string; label: string | null; freeShipping: boolean } | null
  couponError: string | null
  /** `needsRegion`: the shop ships by state or province here, and none is chosen yet (lib/physical/rates). */
  delivery: { ok: boolean; error?: string; options: { id: string; name: string; priceCents: number; estimate: string }[]; selectedId: string | null; needsCountry: boolean; needsRegion?: boolean }
  pickups: { id: string; name: string; address: string[]; instructions: string | null; ready: string | null; hours?: string | null }[]
  /** `taxLabel`: the tax line's words, "VAT 19%" (lib/tax/rules taxLabel). */
  totals: { itemsSubtotalCents: number; discountCents: number; shippingCents: number; shippingDiscountCents: number; taxCents: number; taxIncluded: boolean; totalCents: number; taxLabel?: string; codFeeCents?: number }
  offers?: { title: string; savedCents: number }[]
  /** The store's checkout offers this order qualifies for, to add in one press (lib/offers; components/offers/checkout-suggestions.tsx). */
  suggestions?: { offerId: string; title: string; label: string | null; offerPriceCents: number; product: { id: string; title: string; slug: string; imageUrl: string | null; type: string; priceCents: number; variants: { id: string; name: string; priceCents: number }[] } }[]
  /** Something in it is a physical product (Settings › Checkout's "physical orders" fields), whether or not it ships. */
  physical?: boolean
  /** The countries the shop ships this cart to (Settings › Shipping), or null for anywhere. Only when something ships. */
  shipsTo?: string[] | null
  /** The stock-short lines, with what was asked and what is left. */
  short?: SiteShortLine[]
  /** Each product in the order with more than one option on sale: what its line could be changed to (./variant-choices-server). */
  choices?: ChoicesByProduct
  /** Things in the cart with no option chosen yet: asked for on their line, and Pay waits for them. */
  needsOption?: { productId: string; title: string; imageUrl: string | null; quantity: number }[]
  /** Lines the server lowered to the product's per order limit: the page takes these quantities. */
  adjusted?: { productId: string; variantId: string | null; quantity: number; title: string; limit: number }[]
}

export type SiteQuoteAnswer = { ok: true; quote: SiteQuote } | { ok: false; status: number; error: string }

/** Who is buying, as far as owning goes: the website's signed in customer, whose address its sign in code proved. */
export interface SiteOwner {
  email: string
}

/** The cart priced as a basket; a code that does not fit is said, and the cart priced without it. */
export async function priceSiteCart(db: Db, creatorId: string, body: Body, owner: SiteOwner | null = null) {
  const handOff = await isPhysicalCommerceEnabled().catch(() => false)
  const ownerEmail = owner?.email ?? null
  let couponError: string | null = null
  let priced: PricedCart = await priceCart(db, { items: body.items, couponCode: body.couponCode, buyerId: null, ownerEmail, handOff, keepFree: true })
  if (priced.ok === false && typeof body.couponCode === "string" && body.couponCode.trim()) {
    couponError = priced.error
    priced = await priceCart(db, { items: body.items, couponCode: null, buyerId: null, ownerEmail, handOff, keepFree: true })
  }
  return { priced, couponError, decision: basketDecision(priced, { shopId: creatorId, currency: (await readStoreCurrency(db, creatorId)).currency }), handOff }
}

/** Every line of the cart is already the buyer's: nothing to pay, nothing else to say. */
export function allOwned(priced: PricedCart): boolean {
  return priced.ok === true && priced.lines.length === 0 && priced.ships.length === 0 && priced.owned.length > 0 && priced.dropped.length === priced.owned.length
}

function ownedOf(list: { productId: string; variantId: string | null; title: string; thumbnailUrl: string | null }[] | undefined): SiteOwnedLine[] {
  return (list ?? []).map((o) => ({ productId: o.productId, variantId: o.variantId, title: String(o.title ?? "Product"), imageUrl: o.thumbnailUrl ?? null }))
}

/** `dropped` without the owned lines, which the page says apart ("already yours", not "can't be bought"). */
function droppedBesidesOwned(dropped: string[], owned: { title: string }[] | undefined): string[] {
  const left = [...dropped]
  for (const o of owned ?? []) {
    const i = left.indexOf(o.title)
    if (i >= 0) left.splice(i, 1)
  }
  return left
}

async function variantNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  try {
    const { data } = await db.from("product_variants").select("id, name").in("id", ids)
    return new Map(((data ?? []) as { id: string; name: string | null }[]).map((v) => [v.id, v.name ?? ""]))
  } catch {
    return new Map()
  }
}

/**
 * Settings › Taxes on a cart of downloads (lib/tax/rules basketTax, as the
 * single product checkout taxes one): only when the store taxes digital
 * products, by the buyer's country (the one the page sends, else where the
 * request comes from), each line at its own rate there. The intent route
 * charges exactly this and puts each line's share on its order.
 */
export async function digitalCartTax(db: Db, creatorId: string, priced: Extract<PricedCart, { ok: true }>, body: Body, requestCountry: string | null): Promise<BasketTax> {
  const country = countryCode(body.country) ?? requestCountry
  return basketTax(await loadTaxForCheckout(db, creatorId), priced.lines.map((l) => ({ productId: l.item.productId, taxableCents: lineTotalCents(l.item) })), country)
}

/**
 * Whether the cart holds one of this shop's published products that ships,
 * while physical commerce is on (as priceSiteCart hands it over): one small
 * read, so a cart that ships starts its own pricing at once.
 */
async function mayShip(db: Db, creatorId: string, body: Body): Promise<boolean> {
  const ids = Array.isArray(body.items)
    ? [...new Set((body.items as { productId?: unknown }[]).map((i) => (i && typeof i.productId === "string" ? i.productId : "")).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 50)
    : []
  if (ids.length === 0) return false
  const [on, { data, error }] = await Promise.all([
    isPhysicalCommerceEnabled().catch(() => false),
    db.from("products").select("id").in("id", ids).eq("creator_id", creatorId).eq("type", "physical").eq("status", "published").limit(1),
  ])
  return on && !error && Array.isArray(data) && data.length > 0
}

export async function siteQuote(db: Db, creatorId: string, body: Body, requestCountry: string | null = null, owner: SiteOwner | null = null): Promise<SiteQuoteAnswer> {
  /*
    A CART THAT SHIPS IS PRICED BY THE PHYSICAL CHECKOUT (shippedQuote), and
    used to start only once the basket's own pricing below had read the whole
    cart to find that out: every read of one, then every read of the other,
    before the checkout's first frame. It starts beside it now, as soon as one
    small read says something in the cart ships; the answer is still the
    decision's, and a cart the decision does not send there lets it go.
  */
  let shipped: Promise<SiteQuoteAnswer> | null = null
  const shippedNow = (): Promise<SiteQuoteAnswer> => {
    if (!shipped) {
      shipped = shippedQuote(db, creatorId, body, owner)
      /* Heard here only so a quote nobody takes never rejects unheard; the one taken below rejects as it always did. */
      shipped.catch(() => undefined)
    }
    return shipped
  }
  void mayShip(db, creatorId, body).then((yes) => (yes ? void shippedNow() : undefined), () => undefined)
  const { priced, couponError, decision } = await priceSiteCart(db, creatorId, body, owner)
  if (decision.kind === "ships") return shippedNow()
  /* Everything in it is already theirs: a quote of nothing to pay, with what they own (the page says so, with the way to it). */
  if (priced.ok === true && allOwned(priced) && priced.creatorIds.length === 1 && priced.creatorIds[0] === creatorId) {
    return { ok: true, quote: { ...emptyQuote(creatorId), owned: ownedOf(priced.owned) } }
  }
  if (decision.kind === "refuse" || priced.ok === false) {
    return { ok: false, status: decision.kind === "refuse" ? decision.status : 400, error: decision.kind === "refuse" ? decision.error : "This cart can't be paid for right now." }
  }
  const [names, tax, choices, suggestions] = await Promise.all([
    variantNames(db, priced.lines.map((l) => l.item.variantId).filter((v): v is string => !!v)),
    digitalCartTax(db, creatorId, priced, body, requestCountry),
    /* A line named its own price (pay what you want) keeps it: nothing to change it to. */
    variantChoices(db, priced.lines.filter((l) => l.item.variantId && !namedOwnPrice(body).has(l.item.productId)).map((l) => l.item.productId)),
    /* The store's checkout offers this basket qualifies for, shown at the checkout (lib/offers): the same rule the physical checkout suggests by. */
    checkoutSuggestions(db, creatorId, priced.lines.map((l) => ({ productId: l.item.productId, quantity: l.item.quantity, unitCents: l.item.priceCents }))),
  ])
  return {
    ok: true,
    quote: {
      kind: "digital",
      creatorId: priced.creatorIds[0],
      lines: priced.lines.map((l) => ({
        productId: l.item.productId,
        variantId: l.item.variantId,
        title: String(l.product.title ?? "Product"),
        variantName: l.item.variantId ? names.get(l.item.variantId) || null : null,
        imageUrl: l.product.thumbnail_url ?? null,
        type: l.product.type,
        quantity: l.item.quantity,
        unitCents: l.item.priceCents,
        discountCents: l.item.discountCents,
        requiresShipping: false,
        maxQuantity: l.product.type === "digital" ? 1 : l.item.quantity,
      })),
      dropped: droppedBesidesOwned(priced.dropped, priced.owned).filter((d) => !/^[0-9a-f-]{36}$/i.test(d)),
      owned: ownedOf(priced.owned),
      stockIssues: [],
      requiresShipping: false,
      coupon: priced.coupon ? { code: priced.coupon.code, label: priced.couponLabel, freeShipping: false } : null,
      couponError,
      delivery: { ok: true, options: [], selectedId: null, needsCountry: false },
      pickups: [],
      totals: { itemsSubtotalCents: priced.subtotalCents, discountCents: priced.discountCents, shippingCents: 0, shippingDiscountCents: 0, taxCents: tax.taxCents, taxIncluded: tax.included, totalCents: priced.totalCents + (tax.included ? 0 : tax.taxCents), taxLabel: tax.label },
      offers: priced.offers.filter((o) => o.savedCents > 0).map((o) => ({ title: o.title, savedCents: o.savedCents })),
      suggestions,
      choices,
    },
  }
}

/** The checkout offers a basket qualifies for at the checkout, as cards to add (lib/offers suggestionsFor). */
async function checkoutSuggestions(db: Db, creatorId: string, lines: { productId: string; quantity: number; unitCents: number }[]) {
  const [{ loadOffers, offerLinesFor, suggestionCards }, { suggestionsFor }] = await Promise.all([import("@/lib/offers/offers-server"), import("@/lib/offers/offers")])
  const { offers } = await loadOffers(db, creatorId, { activeOnly: true })
  if (offers.length === 0 || lines.length === 0) return []
  const withCollections = await offerLinesFor(db, creatorId, offers, lines)
  return suggestionCards(db, creatorId, suggestionsFor(withCollections, offers, { placement: "checkout" }))
}

/** Products whose line in the request names its own price (pay what you want): those keep their option. */
function namedOwnPrice(body: Body): Set<string> {
  const out = new Set<string>()
  if (!Array.isArray(body.items)) return out
  for (const i of body.items as Record<string, unknown>[]) if (i && typeof i === "object" && typeof i.productId === "string" && typeof i.customPriceCents === "number") out.add(i.productId)
  return out
}

/** A quote with nothing in it to pay for. */
function emptyQuote(creatorId: string): SiteQuote {
  return {
    kind: "digital",
    creatorId,
    lines: [],
    dropped: [],
    owned: [],
    stockIssues: [],
    requiresShipping: false,
    coupon: null,
    couponError: null,
    delivery: { ok: true, options: [], selectedId: null, needsCountry: false },
    pickups: [],
    totals: { itemsSubtotalCents: 0, discountCents: 0, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, totalCents: 0 },
  }
}

/**
 * LIMIT SALES, BEFORE PRICING (lib/physical/order-limit). A cart over a
 * product's "up to N per order" is brought down to it, the last lines of
 * that product first, and the change is named so the page shows it and
 * keeps the lowered cart. Paying prices it again and refuses anything over.
 */
export function clampToLimits<T extends { productId: string; variantId: string | null; quantity: number }>(items: T[], limits: Map<string, number>): { items: T[]; adjusted: { productId: string; variantId: string | null; quantity: number; limit: number }[] } {
  const total = new Map<string, number>()
  for (const i of items) total.set(i.productId, (total.get(i.productId) ?? 0) + i.quantity)
  const adjusted: { productId: string; variantId: string | null; quantity: number; limit: number }[] = []
  let out = items
  for (const [productId, qty] of total) {
    const limit = limits.get(productId)
    if (limit === undefined || qty <= limit) continue
    let over = qty - limit
    const next = [...out]
    for (let n = next.length - 1; n >= 0 && over > 0; n--) {
      if (next[n].productId !== productId) continue
      const take = Math.min(over, next[n].quantity)
      over -= take
      const quantity = next[n].quantity - take
      adjusted.push({ productId, variantId: next[n].variantId, quantity, limit })
      next[n] = { ...next[n], quantity }
    }
    out = next.filter((i) => i.quantity > 0)
  }
  return { items: out, adjusted }
}

/** A cart that ships, priced by the physical checkout with the address and the delivery. */
export async function shippedQuote(db: Db, creatorId: string, body: Body, owner: SiteOwner | null): Promise<SiteQuoteAnswer> {
  const [{ priceCheckout, quoteCheckout, readItems, MAX_LINE_QUANTITY }, { deliveryEstimate }, { PICKUP_READY_LABEL }, { COUNTRY_CODES }, { orderLimits }, { loadProfiles }, { shipsToCountries }] = await Promise.all([
    import("@/lib/physical/checkout-pricing-server"),
    import("@/lib/physical/rates"),
    import("@/lib/physical/pickup"),
    import("./countries"),
    import("@/lib/physical/order-limit"),
    import("@/lib/physical/config-server"),
    import("./site-checkout"),
  ])
  const asked = readItems(body.items)
  /* Over a product's per order limit: lowered to it here and named, never refused for the whole page (the stepper stops there too). */
  const limits = await orderLimits(db, [...new Set(asked.map((i) => i.productId))])
  const clamped = clampToLimits(asked, limits)
  const items = clamped.items
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null
  let couponError: string | null = null
  const ownerEmail = owner?.email ?? null
  let priced = await priceCheckout(db, { items, couponCode: body.couponCode, buyerId: null, buyerEmail: email, ownerEmail, shopId: creatorId })
  if (priced.ok === false && body.couponCode) {
    couponError = priced.error
    priced = await priceCheckout(db, { items, couponCode: null, buyerId: null, buyerEmail: email, ownerEmail, shopId: creatorId })
  }
  if (priced.ok === false) return { ok: false, status: priced.status, error: priced.error }
  if (priced.creatorId !== creatorId) return { ok: false, status: 400, error: "A cart can only hold one shop's products" }
  const pc = priced
  const country = typeof body.country === "string" && COUNTRY_CODES.has(body.country.toUpperCase()) ? body.country.toUpperCase() : null
  const region = typeof body.region === "string" ? body.region.slice(0, 120) : null
  /* The postal code only decides local delivery (lib/physical/local-delivery.ts). */
  const postalCode = typeof body.postalCode === "string" ? body.postalCode.slice(0, 20) : null
  /* The city, once typed: carrier calculated rates in most of Europe need it (lib/integrations/shipping/checkout-rates-server.ts). */
  const city = typeof body.city === "string" && body.city.trim() ? body.city.trim().slice(0, 120) : null
  const codFeeCents = await codFeeFor(db, creatorId, body, country)
  /* The short lines' pictures and the checkout's offers need only the priced cart: read beside the delivery, not after it. */
  const shortImagesRead = async (): Promise<Map<string, string | null>> => {
    const out = new Map<string, string | null>()
    if (!pc.stockIssues.length) return out
    const { data } = await db.from("products").select("id, thumbnail_url").in("id", [...new Set(pc.stockIssues.map((s) => s.productId))]).eq("status", "published")
    for (const r of (data ?? []) as { id: string; thumbnail_url: string | null }[]) out.set(r.id, r.thumbnail_url)
    return out
  }
  const [q, profiles, choices, shortImages, suggestions] = await Promise.all([
    quoteCheckout(db, priced, country ? { country, region, postalCode, city } : null, body.deliveryOptionId, { codFeeCents }),
    priced.requiresShipping ? loadProfiles(db, creatorId).catch(() => []) : Promise.resolve([]),
    /* Short lines too: a size that sold out is changed to one in stock right there. A line at its own price keeps it. */
    variantChoices(db, items.filter((i) => typeof (i as { customPriceCents?: unknown }).customPriceCents !== "number").map((i) => i.productId)),
    shortImagesRead(),
    import("@/lib/offers/offers-server").then((m) => m.suggestionCards(db, creatorId, pc.suggestions)),
  ])
  /* A line still to choose an option for, whose product has none left to choose: dropped and named, as before. */
  const needsOption = (pc.needsOption ?? []).filter((n) => (choices[n.productId]?.variants.length ?? 0) > 1)
  for (const n of pc.needsOption ?? []) if (!needsOption.includes(n)) pc.dropped.push(n.title)
  /* How far each line may go: the most any location that fulfils holds of it (unless it sells past zero or isn't counted), held to the per order limit shared by its options. */
  const fulfilling = pc.locations.filter((l) => l.active && l.fulfillsOrders).map((l) => l.id)
  const maxOf = (l: (typeof pc.lines)[number]): number => {
    if (l.type !== "physical") return 1
    const stock = l.trackInventory && l.inventoryPolicy === "deny" && l.variantId ? Math.max(0, ...fulfilling.map((loc) => pc.available(l.variantId!, loc))) : MAX_LINE_QUANTITY
    const limit = limits.get(l.productId)
    const others = pc.lines.filter((o) => o !== l && o.productId === l.productId).reduce((n, o) => n + o.quantity, 0)
    const room = limit === undefined ? MAX_LINE_QUANTITY : Math.max(0, limit - others)
    return Math.max(l.quantity, Math.min(MAX_LINE_QUANTITY, stock, room))
  }
  const shipsTo = pc.requiresShipping
    ? shipsToCountries(
        profiles,
        pc.lines.filter((l) => l.requiresShipping).map((l) => l.shippingProfileId),
        pc.locations.filter((l) => l.active && l.fulfillsOrders && l.localDelivery).map((l) => l.country ?? ""),
      )
    : null
  /* A short line keeps its place in the order, with its picture (read above), so it is lowered or removed right there. */
  const titleOf = (productId: string) => pc.lines.find((l) => l.productId === productId)?.title ?? pc.stockIssues.find((s) => s.productId === productId)?.title ?? "This product"
  return {
    ok: true,
    quote: {
      kind: "ships",
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
        maxQuantity: maxOf(l),
      })),
      dropped: droppedBesidesOwned(priced.dropped, priced.owned),
      needsOption,
      owned: ownedOf(priced.owned),
      stockIssues: priced.stockIssues,
      requiresShipping: priced.requiresShipping,
      coupon: priced.coupon ? { code: priced.coupon.code, label: priced.couponLabel, freeShipping: priced.freeShipping } : null,
      couponError,
      delivery: q.quote.ok
        ? {
            ok: true,
            options: q.quote.required ? q.quote.options.map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents, estimate: o.kind === "local" ? (o.local?.note ?? "") : deliveryEstimate(o) })) : [],
            selectedId: q.option?.id ?? null,
            needsCountry: priced.requiresShipping && !country,
          }
        : { ok: false, error: (q.quote as { error?: string }).error ?? "Shipping isn't available to this address.", options: [], selectedId: q.option?.kind === "pickup" ? q.option.id : null, needsCountry: false, needsRegion: (q.quote as { needsRegion?: boolean }).needsRegion === true },
      pickups: q.pickups.map((o) => ({
        id: o.id,
        name: o.pickup?.name ?? o.name,
        address: o.pickup?.address ?? [],
        instructions: o.pickup?.instructions ?? null,
        ready: o.pickup ? PICKUP_READY_LABEL[o.pickup.ready] : null,
        hours: o.pickup?.hours ?? null,
      })),
      totals: q.totals,
      offers: priced.offers.filter((o) => o.savedCents > 0).map((o) => ({ title: o.title, savedCents: o.savedCents })),
      suggestions,
      physical: priced.lines.some((l) => l.type === "physical") || priced.stockIssues.length > 0,
      shipsTo,
      short: priced.stockIssues.map((s) => ({
        productId: s.productId,
        variantId: s.variantId,
        title: s.title,
        imageUrl: shortImages.get(s.productId) ?? null,
        quantity: items.find((i) => i.productId === s.productId && (i.variantId === s.variantId || i.variantId === null))?.quantity ?? 1,
        available: s.available,
      })),
      adjusted: clamped.adjusted.map((a) => ({ ...a, title: titleOf(a.productId) })),
      choices,
    },
  }
}

/**
 * Cash on delivery's fee when the buyer has chosen it, for the shop's own
 * rules (Settings › Checkout): the total the page shows is then the one the
 * order keeps (lib/physical/checkout-server startCheckout adds the same).
 * 0 for a card, a shop without it, or a country it doesn't take cash in.
 */
export async function codFeeFor(db: Db, creatorId: string, body: { cashOnDelivery?: unknown; deliveryOptionId?: unknown }, country: string | null): Promise<number> {
  if (body.cashOnDelivery !== true) return 0
  /* Loaded as the shipped quote loads the physical modules, only for a cart that ships. */
  const [{ loadCheckoutConfig }, { codCountryAllowed }, { isPickupOptionId }] = await Promise.all([
    import("@/lib/store/settings-server"),
    import("@/lib/physical/cash-on-delivery"),
    import("@/lib/physical/pickup"),
  ])
  const config = await loadCheckoutConfig(db, creatorId)
  if (!config.cashOnDelivery || config.codFeeCents <= 0) return 0
  return codCountryAllowed(config.codCountries, isPickupOptionId(body.deliveryOptionId) ? null : country) ? config.codFeeCents : 0
}
