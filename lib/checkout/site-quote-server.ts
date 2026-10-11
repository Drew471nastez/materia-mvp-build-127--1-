import "server-only"

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
  pickups: { id: string; name: string; address: string[]; instructions: string | null; ready: string | null }[]
  totals: { itemsSubtotalCents: number; discountCents: number; shippingCents: number; shippingDiscountCents: number; taxCents: number; taxIncluded: boolean; totalCents: number }
  offers?: { title: string; savedCents: number }[]
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
  return { priced, couponError, decision: basketDecision(priced, { shopId: creatorId }), handOff }
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

export async function siteQuote(db: Db, creatorId: string, body: Body, requestCountry: string | null = null, owner: SiteOwner | null = null): Promise<SiteQuoteAnswer> {
  const { priced, couponError, decision } = await priceSiteCart(db, creatorId, body, owner)
  if (decision.kind === "ships") return shippedQuote(db, creatorId, body, owner)
  /* Everything in it is already theirs: a quote of nothing to pay, with what they own (the page says so, with the way to it). */
  if (priced.ok === true && allOwned(priced) && priced.creatorIds.length === 1 && priced.creatorIds[0] === creatorId) {
    return { ok: true, quote: { ...emptyQuote(creatorId), owned: ownedOf(priced.owned) } }
  }
  if (decision.kind === "refuse" || priced.ok === false) {
    return { ok: false, status: decision.kind === "refuse" ? decision.status : 400, error: decision.kind === "refuse" ? decision.error : "This cart can't be paid for right now." }
  }
  const [names, tax] = await Promise.all([variantNames(db, priced.lines.map((l) => l.item.variantId).filter((v): v is string => !!v)), digitalCartTax(db, creatorId, priced, body, requestCountry)])
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
      })),
      dropped: droppedBesidesOwned(priced.dropped, priced.owned).filter((d) => !/^[0-9a-f-]{36}$/i.test(d)),
      owned: ownedOf(priced.owned),
      stockIssues: [],
      requiresShipping: false,
      coupon: priced.coupon ? { code: priced.coupon.code, label: priced.couponLabel, freeShipping: false } : null,
      couponError,
      delivery: { ok: true, options: [], selectedId: null, needsCountry: false },
      pickups: [],
      totals: { itemsSubtotalCents: priced.subtotalCents, discountCents: priced.discountCents, shippingCents: 0, shippingDiscountCents: 0, taxCents: tax.taxCents, taxIncluded: tax.included, totalCents: priced.totalCents + (tax.included ? 0 : tax.taxCents) },
    },
  }
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

/** A cart that ships, priced by the physical checkout with the address and the delivery. */
async function shippedQuote(db: Db, creatorId: string, body: Body, owner: SiteOwner | null): Promise<SiteQuoteAnswer> {
  const [{ priceCheckout, quoteCheckout, readItems }, { deliveryEstimate }, { PICKUP_READY_LABEL }, { COUNTRY_CODES }] = await Promise.all([
    import("@/lib/physical/checkout-pricing-server"),
    import("@/lib/physical/rates"),
    import("@/lib/physical/pickup"),
    import("./countries"),
  ])
  const items = readItems(body.items)
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
  const country = typeof body.country === "string" && COUNTRY_CODES.has(body.country.toUpperCase()) ? body.country.toUpperCase() : null
  const region = typeof body.region === "string" ? body.region.slice(0, 120) : null
  const q = await quoteCheckout(db, priced, country ? { country, region } : null, body.deliveryOptionId)
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
      })),
      dropped: droppedBesidesOwned(priced.dropped, priced.owned),
      owned: ownedOf(priced.owned),
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
        : { ok: false, error: (q.quote as { error?: string }).error ?? "Shipping isn't available to this address.", options: [], selectedId: q.option?.kind === "pickup" ? q.option.id : null, needsCountry: false, needsRegion: (q.quote as { needsRegion?: boolean }).needsRegion === true },
      pickups: q.pickups.map((o) => ({
        id: o.id,
        name: o.pickup?.name ?? o.name,
        address: o.pickup?.address ?? [],
        instructions: o.pickup?.instructions ?? null,
        ready: o.pickup ? PICKUP_READY_LABEL[o.pickup.ready] : null,
      })),
      totals: q.totals,
      offers: priced.offers.map((o) => ({ title: o.title, savedCents: o.savedCents })),
    },
  }
}
