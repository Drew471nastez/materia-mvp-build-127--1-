import "server-only"

/**
 * ===========================================================================
 *  WHAT A PRODUCT'S PAGE OFFERS WITH IT, AS ONE PUBLIC ANSWER
 * ===========================================================================
 * Read by GET /api/offers/bundles, GET /api/offers/quantity-breaks and
 * GET /api/offers (app/api/offers/**), and by an imported theme's product
 * page as product.metafields.storelib.offers (lib/website-builder/
 * compat-site.ts), so a theme drawing offers in the browser and one drawing
 * them in Liquid read the same thing:
 *
 *   bundles          the store's bundles on now with this product in, shown
 *                    on product pages, whose every product is still on sale
 *   quantityBreaks   its quantity breaks on now, shown on product pages,
 *                    for this product or a collection it is in, each tier
 *                    priced at the product's default variant by the formula
 *                    the checkout charges (lib/offers/pricing.ts tierTotals)
 *   checkoutOffers   its checkout offers on now, shown on product pages,
 *                    that this product triggers, each with the price it adds
 *                    at (the bundles endpoint calls these `upsells`)
 *
 * Public and safe to cache: only offers that are on now, only for a
 * published product, and only what a buyer is shown (names, tiers, prices,
 * the products' public cards). Never an offer's limits per order, minimums,
 * trigger lists, the store's id or anything else of the creator's own. The
 * checkout prices the cart again on the server from the database, so
 * nothing here decides what anyone pays.
 */
import { selectTolerant } from "@/lib/supabase/tolerant-select"
import { breakCovers, bundlePrice, bundlesWith, offerLive, offerUnitPrice, placementsOf, upsellsFor, type Offer } from "./offers"
import { tierDiscounts, tierTotals, type Tier } from "./pricing"
import { collectionsOf, loadOffers, offerLabeler, offerProducts, type OfferProduct } from "./offers-server"
import { personalizationOf } from "@/lib/products/personalization-read"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v)

export interface PublicTier extends Tier {
  unitPriceCents: number
  totalCents: number
  compareCents: number
}

export interface PublicBreak {
  offerId: string
  productId: string
  title: string
  tiers: PublicTier[]
  /** What the tiers are priced at: the product's default option (defaultPrice), so a section with no option picker of its own (Storelib's Featured products and Product spotlight) shows and adds exactly that. */
  priceCents?: number
  compareAtCents?: number | null
  variantId?: string | null
  variantName?: string | null
}

export interface PublicBundle {
  offerId: string
  title: string
  label: string | null
  discountType: Offer["discountType"]
  discountValue: number
  items: OfferProduct[]
  fullCents: number
  priceCents: number
}

export interface PublicCheckoutOffer {
  offerId: string
  title: string
  label: string | null
  discountType: Offer["discountType"]
  discountValue: number
  product: OfferProduct
  offerPriceCents: number
}

export interface ProductOffers {
  bundles: PublicBundle[]
  quantityBreaks: PublicBreak[]
  checkoutOffers: PublicCheckoutOffer[]
  /**
   * The product itself, for a section with no buy box (Storelib's Featured
   * products, Product spotlight, Product hero): whether it asks a required
   * personalization answer, and how many options it has to choose from.
   * Either sends its Add buttons to the product's page instead.
   */
  product?: { personalized: boolean; options: number }
}

export const NO_OFFERS: ProductOffers = { bundles: [], quantityBreaks: [], checkoutOffers: [] }

/** A minute: a schedule's start or end, or a change in the admin, shows within it. */
export const OFFERS_CACHE = { "Cache-Control": "public, max-age=60, s-maxage=60" }

/**
 * The price a product's tiers are shown at: its default variant's (the
 * first on sale, in the editor's order), else the product's own; with the
 * compare at price beside it. Null for a product that has no price to show.
 */
export async function defaultPrice(db: Db, product: { id: string; price_cents?: number | null; compare_at_cents?: number | null }): Promise<{ priceCents: number; compareAtCents: number | null; variantId: string | null; variantName: string | null } | null> {
  const { data } = await selectTolerant("offer default variant", "id, name, price_cents, active, position, compare_at_price_cents", ["position", "compare_at_price_cents"], (columns) =>
    db.from("product_variants").select(columns).eq("product_id", product.id),
  )
  const variants = ((data ?? []) as { id?: string; name?: string | null; price_cents: number | null; active: boolean | null; position?: number | null; compare_at_price_cents?: number | null }[]).filter((v) => v.active !== false)
  variants.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
  const first = variants[0]
  const price = Math.round(Number(first ? first.price_cents : product.price_cents))
  if (!Number.isFinite(price) || price < 0) return null
  const compare = Math.round(Number(first?.compare_at_price_cents ?? product.compare_at_cents))
  return { priceCents: price, compareAtCents: Number.isFinite(compare) && compare > price ? compare : null, variantId: typeof first?.id === "string" ? first.id : null, variantName: first && variants.length > 1 ? (first.name ?? "").trim() || null : null }
}

/** A quantity break's tiers at one price, as the theme shows them. */
export function publicTiers(tiers: Tier[], priceCents: number, compareAtCents: number | null): PublicTier[] {
  return tiers.map((t) => {
    const { unitPriceCents, totalCents, compareCents } = tierTotals(priceCents, t, compareAtCents)
    return { quantity: t.quantity, freeQuantity: t.freeQuantity, discountType: t.discountType, discountValue: t.discountValue, label: t.label, badge: t.badge, unitPriceCents, totalCents, compareCents }
  })
}

/** A product a buyer gets one of per order: anything that doesn't ship (lib/physical/checkout-pricing-server, lib/website-builder/cart). Unknown type reads as physical, as before. */
export const oneEach = (type: string | null | undefined) => typeof type === "string" && type !== "" && type !== "physical"

/** The tiers one unit can be bought at: a block of exactly one, and only when one of them takes something off. */
export function singleUnitTiers(tiers: Tier[]): Tier[] {
  const one = tiers.filter((t) => t.quantity + t.freeQuantity === 1)
  return one.some(tierDiscounts) ? one : []
}

/**
 * Everything a published product's page offers with it, or nothing. `only`
 * narrows what is read (the bundles endpoint reads no quantity breaks).
 */
export async function productOffers(db: Db, productId: unknown, opts: { only?: (keyof ProductOffers)[]; now?: Date } = {}): Promise<ProductOffers> {
  if (!isUuid(productId)) return NO_OFFERS
  const want = new Set(opts.only ?? ["bundles", "quantityBreaks", "checkoutOffers"])
  const { data: product } = await selectTolerant("offer product", "id, creator_id, status, type, price_cents, compare_at_cents", ["compare_at_cents"], (columns) => db.from("products").select(columns).eq("id", productId).maybeSingle())
  const p = product as { id: string; creator_id: string; status: string; type?: string | null; price_cents: number | null; compare_at_cents?: number | null } | null
  if (!p || p.status !== "published") return NO_OFFERS
  const creatorId = p.creator_id
  const { offers } = await loadOffers(db, creatorId, { activeOnly: true })
  if (offers.length === 0) return NO_OFFERS
  const now = opts.now ?? new Date()
  const wantedCollections = [...new Set(offers.flatMap((o) => o.triggerCollectionIds ?? []))]
  const mine = wantedCollections.length ? ((await collectionsOf(db, creatorId, wantedCollections, [p.id])).get(p.id) ?? []) : []
  const bundles = want.has("bundles") ? bundlesWith(p.id, offers, { now }) : []
  const upsells = want.has("checkoutOffers") ? upsellsFor(p.id, mine, offers, { now }) : []
  const breaks = want.has("quantityBreaks") ? offers.filter((o) => o.kind === "quantity_break" && offerLive(o, now) && placementsOf(o).includes("product") && (o.tiers?.length ?? 0) > 0 && breakCovers(o, p.id, mine)) : []
  if (bundles.length === 0 && upsells.length === 0 && breaks.length === 0) return NO_OFFERS

  const [label, products, price, self] = await Promise.all([
    bundles.length || upsells.length ? offerLabeler(db, creatorId) : Promise.resolve(() => null),
    bundles.length || upsells.length ? offerProducts(db, creatorId, [...new Set([...bundles.flatMap((b) => b.productIds), ...upsells.map((u) => u.productIds[0])])]) : Promise.resolve(new Map<string, OfferProduct>()),
    breaks.length ? defaultPrice(db, p) : Promise.resolve(null),
    productChoice(db, p.id),
  ])
  const bundleCards: PublicBundle[] = bundles.flatMap((b) => {
    const items = b.productIds.map((id) => products.get(id))
    if (items.some((i) => !i)) return []
    const list = items as OfferProduct[]
    /* This product first, as Shopify's "Frequently bought together" does. */
    list.sort((a, c) => (a.id === p.id ? -1 : c.id === p.id ? 1 : 0))
    const { fullCents, priceCents } = bundlePrice(b, list.map((i) => i.priceCents), list.map((i) => i.payWhatYouWant === true))
    return [{ offerId: b.id, title: b.title, label: label(b), discountType: b.discountType, discountValue: b.discountValue, items: list, fullCents, priceCents }]
  })
  const checkoutOffers: PublicCheckoutOffer[] = upsells.flatMap((u) => {
    const item = products.get(u.productIds[0])
    if (!item) return []
    return [{ offerId: u.id, title: u.title, label: label(u), discountType: u.discountType, discountValue: u.discountValue, product: item, offerPriceCents: offerUnitPrice(u, item.priceCents, item.payWhatYouWant === true) }]
  })
  /* Only what can go in the cart: something that doesn't ship is one per order (the cart and the checkout hold it to 1), so only its one-item tiers can apply. */
  const breakTiers = (tiers: Tier[]) => (oneEach(p.type) ? singleUnitTiers(tiers) : tiers)
  const quantityBreaks: PublicBreak[] = price ? breaks.flatMap((o) => {
    const tiers = breakTiers(o.tiers ?? [])
    return tiers.length ? [{ offerId: o.id, productId: p.id, title: o.title, tiers: publicTiers(tiers, price.priceCents, price.compareAtCents), priceCents: price.priceCents, compareAtCents: price.compareAtCents, variantId: price.variantId, variantName: price.variantName }] : []
  }) : []
  return { bundles: bundleCards, quantityBreaks, checkoutOffers, product: self }
}

/** Whether a product asks a required personalization answer, and how many options it has on sale (ProductOffers.product). */
async function productChoice(db: Db, productId: string): Promise<{ personalized: boolean; options: number }> {
  const [fields, variants] = await Promise.all([
    personalizationOf(db, [productId]),
    Promise.resolve(db.from("product_variants").select("id, name, active").eq("product_id", productId)).then((r: { data?: { name?: string | null; active?: boolean | null }[] | null }) => (r?.data ?? []).filter((v) => v.active !== false && !/^Archived /.test(v.name ?? "")).length).catch(() => 0),
  ])
  return { personalized: (fields.get(productId) ?? []).some((f) => f.required), options: variants }
}

/** The most products a catalogue reads offers for at once (catalogOffers): a store's offers name a handful; one shown on every product is capped here. */
export const CATALOG_OFFERS_MAX = 24

/**
 * What each of a catalogue's products offers with it, for an imported
 * theme's Featured product (its Bundles and upsells block and
 * product.metafields.storelib.offers, as on the product's own page). The
 * store's offers are read once; only a product an offer can show on is read
 * further (in a bundle, a quantity break's product or collection, a checkout
 * offer it triggers, or every product for one that names no trigger), at
 * most CATALOG_OFFERS_MAX of them. A product with nothing is left out.
 */
export async function catalogOffers(db: Db, creatorId: string, productIds: string[], opts: { now?: Date } = {}): Promise<Record<string, ProductOffers>> {
  const out: Record<string, ProductOffers> = {}
  const ids = [...new Set(productIds.filter(isUuid))]
  if (ids.length === 0) return out
  const now = opts.now ?? new Date()
  const { offers } = await loadOffers(db, creatorId, { activeOnly: true })
  const shown = offers.filter((o) => offerLive(o, now) && placementsOf(o).includes("product"))
  if (shown.length === 0) return out
  const everyone = shown.some((o) => o.kind === "checkout" && o.triggerIds.length === 0 && (o.triggerCollectionIds ?? []).length === 0)
  const collections = [...new Set(shown.flatMap((o) => (o.kind === "quantity_break" && o.productIds.length === 0 ? (o.triggerCollectionIds ?? []).slice(0, 1) : o.kind === "checkout" ? (o.triggerCollectionIds ?? []) : [])))]
  const inCollections = collections.length ? await collectionsOf(db, creatorId, collections, ids) : new Map<string, string[]>()
  const named = new Set(shown.flatMap((o) => (o.kind === "checkout" ? o.triggerIds : o.productIds)))
  const candidates = ids.filter((id) => everyone || named.has(id) || (inCollections.get(id)?.length ?? 0) > 0).slice(0, CATALOG_OFFERS_MAX)
  const found = await Promise.all(candidates.map((id) => productOffers(db, id, { now }).catch(() => NO_OFFERS)))
  candidates.forEach((id, i) => {
    const f = found[i]
    if (f.bundles.length || f.quantityBreaks.length || f.checkoutOffers.length) out[id] = f
  })
  return out
}
