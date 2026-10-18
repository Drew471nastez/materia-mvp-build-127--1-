/**
 * ===========================================================================
 *  WHAT AN ORDER COSTS, DECIDED ONCE, ON THE SERVER
 * ===========================================================================
 * Every route that takes money or grants a product asks here, with what the
 * page sent, and gets back the amounts it may use. Nothing the browser sends
 * is a price: it sends which product, which variant, what it would like to
 * pay for a pay-what-you-want product, a tip and a code, and each of those
 * is checked against the database and against limits.
 *
 * What this ended:
 *   - a tip was added as sent, so a tip of -500 took five dollars off, and on
 *     the free route a large enough one made a paid product free;
 *   - a tip sent as a string was concatenated, not added;
 *   - a discount code lowered the total the page showed and nothing else;
 *   - a pay-what-you-want product sent without an amount cost nothing.
 */

import { checkCoupon, checkCouponLines, findCoupon, normaliseCode, validateCoupon, type CouponRow } from "./coupons"
import { adminCodeCheck } from "./admin-code"
import type { PackedItem } from "./cart-items"
import { MAX_LINES, MAX_QUANTITY } from "@/lib/website-builder/cart"
import { salesStandings } from "@/lib/products/sales-standings"
import { ownedKey, ownedLines } from "./owned"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { MARKETPLACE_CURRENCY, RATES_PAUSED_MESSAGE, couponValueInUsd, gateOpenFor, toUsdMinor, marketplaceAmounts, parseMarketplaceGate, pricingContextOf, type PriceSource, type PricingContext } from "@/lib/money/marketplace"
import type { FxRates } from "@/lib/markets/money"
import { applyOffers, stackWithCode, type AppliedOffer, type Offer, type OfferLine } from "@/lib/offers/offers"
import { loadOffers, offerLinesFor } from "@/lib/offers/offers-read"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */

/** A thousand dollars. A tip above that is a typo, or not a tip. */
export const MAX_TIP_CENTS = 100_000
/** Ten thousand dollars for a pay-what-you-want price. */
export const MAX_PWYW_CENTS = 1_000_000
/** Stripe's smallest card charge in US dollars. */
export const MIN_CHARGE_CENTS = 50

/** An amount in cents, or null when it is not a whole number in range. */
export function wholeCents(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) return null
  if (n < min || n > max) return null
  return n
}

export interface OrderTotals {
  /** The product's price, or the buyer's pay-what-you-want amount. */
  baseCents: number
  discountCents: number
  tipCents: number
  totalCents: number
}

/** The arithmetic, apart from the lookups, so it can be tested alone. */
export function totalsOf(baseCents: number, discountCents: number, tipCents: number): OrderTotals {
  const discount = Math.max(0, Math.min(discountCents, baseCents))
  return { baseCents, discountCents: discount, tipCents, totalCents: baseCents - discount + tipCents }
}

/**
 * The price before a code or a tip. For pay what you want it is the buyer's
 * amount, and when they sent none it is the MINIMUM, never `price_cents`:
 * the product editor writes a pay-what-you-want price into
 * `pwyw_min_price_cents` and leaves `price_cents` at 0, so reading
 * `price_cents` made every such product free to anyone who left the amount
 * out of the request.
 */
export function baseFor(
  owner: { price_cents?: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null },
  customPriceCents: unknown,
): { ok: true; cents: number } | { ok: false; error: string } {
  if (!owner.pay_what_you_want) return { ok: true, cents: Math.max(0, Math.round(Number(owner.price_cents) || 0)) }
  const min = Math.max(0, Math.round(Number(owner.pwyw_min_price_cents) || 0))
  if (customPriceCents === undefined || customPriceCents === null || customPriceCents === "") return { ok: true, cents: min }
  const custom = wholeCents(customPriceCents, 0, MAX_PWYW_CENTS)
  if (custom === null) return { ok: false, error: "Enter a price in whole cents." }
  if (custom < min) return { ok: false, error: `The lowest price is $${(min / 100).toFixed(2)}.` }
  return { ok: true, cents: custom }
}

export interface PricedProduct {
  id: string
  title: string
  slug: string
  type: string
  status: string
  price_cents: number
  thumbnail_url: string | null
  creator_id: string
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  [key: string]: unknown
}

export interface PricedVariant {
  id: string
  name: string
  price_cents: number
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  max_purchases?: number | null
}

/*
  AN OPTION WITH A LIMIT SELLS UP TO IT. The editor has let a creator set
  "Max purchases" on each variant, and the product page read it, but nothing
  counted: the fiftieth of fifty sold the fifty first. Completed orders for
  the option are counted here, before anything is charged. A count that
  cannot be read sells rather than refuses, as it did before.
*/
export async function variantSoldOut(db: Db, variant: { id: string; max_purchases?: number | null }): Promise<boolean> {
  const max = Number(variant.max_purchases)
  if (!Number.isFinite(max) || max <= 0) return false
  const { count, error } = await db.from("orders").select("id", { count: "exact", head: true }).eq("variant_id", variant.id).eq("status", "completed")
  if (error || typeof count !== "number") return false
  return count >= max
}

/** Whether a code carries amounts in a currency (a fixed amount off, or a minimum order), as opposed to a percentage alone. */
function couponHasAmounts(c: CouponRow | null | undefined): boolean {
  if (!c) return false
  return c.discount_type === "fixed" || (Number((c as { min_purchase_cents?: number | null }).min_purchase_cents) || 0) > 0
}

export type Priced =
  | {
      ok: true
      product: PricedProduct
      variant: PricedVariant | null
      totals: OrderTotals
      coupon: CouponRow | null
      couponLabel: string | null
      /** The currency every amount above is in, upper case: the product's own (lib/money/product-currency), or US dollars on the marketplace (lib/money/marketplace). The checkout charges exactly this. */
      currency: string
      /** Which prices these are, and how a marketplace dollar price was made: for the order's record. */
      pricing: {
        context: PricingContext
        /** The store's own currency, upper case, which its prices are typed in. */
        listCurrency: string
        /** The product's (or option's) own price in it. */
        listAmountCents: number
        source: PriceSource
        /** The ECB day a converted price used, or null. */
        fxAsOf: string | null
        /** US dollars per one unit of the store's currency that day, or null. */
        fxRate: number | null
      }
    }
  | { ok: false; status: number; error: string; code?: string }

export interface PriceRequest {
  productId: unknown
  variantId?: unknown
  customPriceCents?: unknown
  tipCents?: unknown
  couponCode?: unknown
  /**
   * Where the buyer is buying: `context` "marketplace" (Explore, a creator
   * page, a product page on Storelib, a community) or anything else for the
   * store's own places; `fxAsOf` the rate day the page was priced at. Only
   * read while the marketplace switch is on for the store (MARKETPLACE_USD).
   */
  pricing?: { context?: unknown; fxAsOf?: unknown } | null
}

/** The page's word for where it is: "mp" (or a marketplace surface) is the marketplace, anything else the store's own. */
export function requestedContext(raw: unknown): PricingContext {
  return raw === "mp" || raw === "marketplace" ? "marketplace" : pricingContextOf(raw)
}

/**
 * The whole price of one product, from what the page sent. `productSelect`
 * lets a route fetch the extra columns it needs in the same read.
 */
export async function priceOrder(db: Db, req: PriceRequest, productSelect = "*"): Promise<Priced> {
  const productId = typeof req.productId === "string" ? req.productId : ""
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, status: 400, error: "Unknown product." }

  const { data: product } = await db.from("products").select(productSelect).eq("id", productId).eq("status", "published").maybeSingle()
  if (!product) return { ok: false, status: 404, error: "This product is not available." }
  /* A product that ships is bought through the shop's physical checkout
     (lib/physical), which takes an address and holds stock; this checkout
     would sell it as a download. */
  if ((product as PricedProduct).type === "physical") return { ok: false, status: 400, error: "This product ships, so it is bought from the shop's cart." }

  let variant: PricedVariant | null = null
  const noVariant = req.variantId === undefined || req.variantId === null || req.variantId === ""
  if (noVariant) {
    /* A product with options is bought as one of them. Without one the
       order has no variant, which the downloads read as the whole product,
       so the cheapest price (or none) bought every option's files. */
    const { data: anyOption } = await db.from("product_variants").select("id").eq("product_id", productId).limit(1).maybeSingle()
    if (anyOption) return { ok: false, status: 400, error: "Choose an option for this product." }
  } else {
    if (typeof req.variantId !== "string") return { ok: false, status: 400, error: "Unknown option." }
    const { data } = await db
      .from("product_variants")
      .select("id, name, price_cents, pay_what_you_want, pwyw_min_price_cents, max_purchases")
      .eq("id", req.variantId)
      .eq("product_id", productId)
      .maybeSingle()
    if (!data) return { ok: false, status: 400, error: "That option is no longer available." }
    variant = data as PricedVariant
    if (await variantSoldOut(db, variant)) return { ok: false, status: 400, error: "That option is sold out." }
  }

  const owner = variant ?? (product as PricedProduct)

  /* The currency this product's price is in: its store's, or dollars for a community or membership plan (lib/money/product-currency). */
  const storeCurrency = (await readStoreCurrency(db, (product as PricedProduct).creator_id)).currency
  const listCurrency = productPriceCurrency(product as PricedProduct, storeCurrency)
  let currency = listCurrency
  let charged: { price_cents?: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null } = owner
  let pricing: Extract<Priced, { ok: true }>["pricing"] = { context: "merchant", listCurrency, listAmountCents: Math.max(0, Math.round(Number(owner.price_cents) || 0)), source: "native", fxAsOf: null, fxRate: null }
  let couponFx: FxRates | null = null

  /*
    THE MARKETPLACE, IN US DOLLARS (lib/money/marketplace), only while the
    switch is on for this store: the price converted at the rate day the page
    showed (or the newest fresh one), or the creator's approved dollar price.
    No fresh rate: the purchase pauses. It is never charged in the store's
    currency instead, which the buyer was not shown.
  */
  const context = requestedContext(req.pricing?.context)
  if (context === "marketplace" && listCurrency !== MARKETPLACE_CURRENCY && gateOpenFor(parseMarketplaceGate(process.env.MARKETPLACE_USD), (product as PricedProduct).creator_id)) {
    const { marketplaceRates } = await import("@/lib/money/marketplace-server")
    const fx = await marketplaceRates(db, req.pricing?.fxAsOf)
    const m = marketplaceAmounts({ ...(owner as object), type: (product as PricedProduct).type } as Parameters<typeof marketplaceAmounts>[0], listCurrency, fx)
    if (!fx || m.ok === false) return { ok: false, status: 503, error: RATES_PAUSED_MESSAGE, code: "rates_paused" }
    charged = { price_cents: m.price_cents, pay_what_you_want: owner.pay_what_you_want, pwyw_min_price_cents: m.pwyw_min_price_cents }
    currency = MARKETPLACE_CURRENCY
    const perUnit = m.source === "converted" ? (fx.rates[MARKETPLACE_CURRENCY] ?? 0) / (listCurrency === "EUR" ? 1 : fx.rates[listCurrency] ?? 0) : null
    pricing = { ...pricing, context: "marketplace", source: m.source, fxAsOf: m.source === "converted" ? m.fxAsOf : null, fxRate: perUnit && Number.isFinite(perUnit) ? Math.round(perUnit * 1e8) / 1e8 : null }
    couponFx = fx
  }

  /* A pay-what-you-want amount is in the currency the buyer was shown, and held to the minimum in it. */
  const base = baseFor(charged, req.customPriceCents)
  if (base.ok === false) return { ok: false, status: 400, error: base.error }
  const baseCents = base.cents

  const tip = req.tipCents === undefined || req.tipCents === null || req.tipCents === "" ? 0 : wholeCents(req.tipCents, 0, MAX_TIP_CENTS)
  if (tip === null) return { ok: false, status: 400, error: "A tip is between $0 and $1,000." }

  let coupon: CouponRow | null = null
  let couponLabel: string | null = null
  let discountCents = 0
  if (typeof req.couponCode === "string" && req.couponCode.trim()) {
    const ask = { creatorId: (product as PricedProduct).creator_id, productId, code: req.couponCode, priceCents: baseCents }
    /* The platform admin's own code first (./admin-code), then the creator's codes. */
    const admin = await adminCodeCheck(ask)
    const checked = admin ?? (couponFx ? await marketplaceCoupon(db, ask, storeCurrency, couponFx) : await validateCoupon(db, ask))
    if (checked.ok === false) return { ok: false, status: 400, error: checked.error }
    /*
      A CODE'S AMOUNTS ARE IN THE STORE'S CURRENCY. On the marketplace they
      were turned into dollars at the price's own rate (marketplaceCoupon).
      On a product priced in another currency (a dollar plan in a lei
      store), a fixed amount off or a minimum order would be read in the
      wrong currency, so such a code is not taken there. A percentage is the
      same in any currency.
    */
    if (!couponFx && listCurrency !== storeCurrency && couponHasAmounts(checked.coupon)) return { ok: false, status: 400, error: "That code can't be used on this item." }
    coupon = checked.coupon
    couponLabel = checked.label
    discountCents = checked.discountCents
  }

  return {
    ok: true,
    product: product as PricedProduct,
    variant,
    totals: totalsOf(baseCents, discountCents, tip),
    coupon,
    couponLabel,
    currency,
    pricing,
  }
}

/**
 * A creator's code on a marketplace dollar price: its fixed amount and its
 * minimum order are in the store's currency, so both are turned into dollars
 * at the same rate as the price before the code is checked. A percentage is
 * as it is. No rate for them: the code is refused, never guessed.
 */
async function marketplaceCoupon(db: Db, ask: { creatorId: string; productId: string; code: unknown; priceCents: number }, storeCurrency: string, fx: FxRates) {
  const code = normaliseCode(ask.code)
  if (!code) return { ok: false as const, error: "That code is not valid." }
  const found = await findCoupon(db, ask.creatorId, code)
  if (!found) return checkCoupon(null, { productId: ask.productId, priceCents: ask.priceCents })
  const c = { ...found }
  if (c.discount_type === "fixed") {
    const usd = couponValueInUsd(Number(c.discount_value) || 0, storeCurrency, fx)
    if (usd === null) return { ok: false as const, error: "That code can't be used on this item." }
    c.discount_value = usd
  }
  const min = Number((c as { min_purchase_cents?: number | null }).min_purchase_cents) || 0
  if (min > 0) {
    /* Rounded up: a minimum is never lowered by the conversion. */
    const usd = toUsdMinor(min, storeCurrency, fx, { round: "up" })
    if (usd === null) return { ok: false as const, error: "That code can't be used on this item." }
    ;(c as { min_purchase_cents?: number | null }).min_purchase_cents = usd
  }
  return checkCoupon(c, { productId: ask.productId, priceCents: ask.priceCents })
}

/* ===========================================================================
 *  A BASKET, PRICED THE SAME WAY
 * ===========================================================================
 * The basket on a creator's website (app/api/checkout/cart) and its code
 * box (app/api/coupons/validate) both price here, from product ids and
 * quantities alone. Each line is the database's price for its product or
 * option (baseFor, as above: pay what you want is the amount the buyer named
 * on the product page, held to the minimum, or the minimum when none was
 * named), and the code comes off with the same rules and
 * the same rounding as a single product's (lib/checkout/coupons
 * checkCouponLines, which checkCoupon is one line of).
 *
 * Lines that cannot be bought are left out and named, never charged: a
 * product that is not published, an option of another product, something
 * the buyer already owns, and anything free (a download, not a payment).
 * What is left out for being owned is also listed on its own (`owned`), so
 * a checkout can say "already yours" with the way to it rather than "can't
 * be bought" (lib/checkout/owned: per option, physical goods never).
 */

export interface CartProduct {
  id: string
  title: string
  slug: string
  price_cents: number
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  thumbnail_url: string | null
  type: string
  status: string
  creator_id: string
}

export interface CartPricedLine {
  /** priceCents is the unit price before the code; discountCents what the code took off the line. */
  item: PackedItem & { discountCents: number }
  product: CartProduct
}

export type PricedCart =
  | {
      ok: true
      lines: CartPricedLine[]
      /** Titles (or ids) of what was left out. */
      dropped: string[]
      /** Something was left out because the buyer owns it. */
      ownedAny: boolean
      /** The lines left out because the buyer owns them (their titles are in `dropped` too). */
      owned: { productId: string; variantId: string | null; title: string; thumbnailUrl: string | null }[]
      /**
       * The whole cart, as asked for, when anything in it ships. It belongs
       * to the physical checkout, which takes digital lines beside shipped
       * ones; this one would drop the shipped lines and could refuse a cart
       * of nothing but them. Empty when nothing ships. A digital line keeps
       * the pay what you want amount the buyer named, checked below against
       * its minimum, and the physical checkout checks it again.
       */
      ships: { productId: string; variantId: string | null; quantity: number; customPriceCents?: number }[]
      /** Every creator whose published product was asked for. */
      creatorIds: string[]
      /** The lines' products that have a sales limit: each takes a held copy when the payment starts (lib/checkout/sales-limit). */
      limited: string[]
      subtotalCents: number
      /** Everything off: the offers' part and the code's. */
      discountCents: number
      /** The upsells' and bundles' part of discountCents (lib/offers). */
      offerCents: number
      /** The upsells and bundles this basket got. */
      offers: AppliedOffer[]
      totalCents: number
      coupon: CouponRow | null
      couponLabel: string | null
    }
  | { ok: false; status: number; error: string }

export interface CartRequest {
  items: unknown
  couponCode?: unknown
  /** The signed in buyer, whose products are left out. */
  buyerId?: string | null
  /**
   * An email the buyer PROVED (a website's customer account, signed in with
   * a code): its completed orders count as owned too. Never an email typed
   * into the checkout (lib/checkout/owned).
   */
  ownerEmail?: string | null
  /**
   * Physical commerce is on, so a cart that ships is handed to the physical
   * checkout (`ships`). False while it is off: the shipped lines are only
   * left out, like anything else that cannot be bought here. On by default.
   */
  handOff?: boolean
  /**
   * Keep a line whose price is $0 (a free product, or pay what you want
   * with a $0 minimum and no amount named) instead of leaving it out. The
   * website's own checkout (lib/checkout/site-quote-server) takes such a
   * cart as a free order, with no card (basketDecision "free"). Off for
   * the Stripe pages, which take no zero line.
   */
  keepFree?: boolean
}

export async function priceCart(db: Db, req: CartRequest): Promise<PricedCart> {
  const incoming = Array.isArray(req.items) ? (req.items as any[]).slice(0, MAX_LINES) : []
  const wanted = new Map<string, { variantId: string | null; quantity: number; customPriceCents: unknown }>()
  for (const raw of incoming) {
    if (typeof raw?.productId !== "string" || raw.productId === "") continue
    const variantId = typeof raw.variantId === "string" && raw.variantId !== "" ? raw.variantId : null
    const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(raw.quantity) || 1)))
    /* The amount a buyer named for a pay what you want product, as sent. It
       is checked against that product's own minimum below (baseFor), and
       means nothing for a product with a price of its own. */
    wanted.set(`${raw.productId}::${variantId ?? ""}`, { variantId, quantity, customPriceCents: raw.customPriceCents })
  }
  const productIds = [...new Set([...wanted.keys()].map((k) => k.split("::")[0]))]
  if (productIds.length === 0) return { ok: false, status: 400, error: "Your cart is empty" }

  const { data: products, error: productsError } = await db
    .from("products")
    .select("id, title, slug, price_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, type, status, creator_id")
    .in("id", productIds)
    .eq("status", "published")
  if (productsError) {
    console.error("[checkout/cart] product read failed:", productsError.message)
    return { ok: false, status: 500, error: "Could not read the cart" }
  }
  if (!products || products.length === 0) return { ok: false, status: 400, error: "Nothing in the cart is on sale any more" }

  /* Already owned is dropped rather than charged for. A digital product is
     one entitlement per buyer, so paying twice buys nothing. Per option:
     owning one option of a product does not stop buying another, and a
     physical product is never "owned" (lib/checkout/owned). */
  const typeOf = new Map<string, string>((products as CartProduct[]).map((p) => [p.id, p.type]))
  const owned = await ownedLines(
    db,
    { userId: req.buyerId ?? null, provenEmail: req.ownerEmail ?? null },
    [...wanted].map(([key, want]) => ({ productId: key.split("::")[0], variantId: want.variantId, type: typeOf.get(key.split("::")[0]) ?? "physical" })),
  )

  /* A line's option is the database's, checked against its product and
     priced from itself. The client's variantId used to be kept as sent and
     the line priced at the product's price: the cheapest option paid for
     the dearest one, and an unknown id failed the order's foreign key after
     the money was taken. */
  const variantIds = [...new Set([...wanted.values()].map((w) => w.variantId).filter((v): v is string => !!v))]
  const variantsById = new Map<string, any>()
  if (variantIds.length > 0) {
    const { data: variants } = await db
      .from("product_variants")
      .select("id, product_id, name, price_cents, pay_what_you_want, pwyw_min_price_cents, max_purchases")
      .in("id", variantIds)
    for (const v of variants ?? []) variantsById.set(v.id, v)
  }
  /* Options at their limit are left out and named, like anything else that cannot be bought (variantSoldOut). */
  const soldOut = new Set<string>()
  await Promise.all([...variantsById.values()].map(async (v) => { if (await variantSoldOut(db, v)) soldOut.add(v.id) }))

  /* A download with a sales limit whose copies have all been sold is left out and named, like a sold out option. Copies held by payments in progress are the hold's business, at the checkout, where this buyer's own held copy counts as theirs. */
  const standings = await salesStandings(db as Db & { rpc?: (fn: string, args: Record<string, unknown>) => any }, productIds)
  const limited = [...standings.keys()]

  const byId = new Map<string, CartProduct>((products as CartProduct[]).map((p) => [p.id, p]))
  const lines: CartPricedLine[] = []
  /* Whether each line's price is an amount the buyer named (pay what you want): never discounted by an offer. */
  const namedPrice: boolean[] = []
  const dropped: string[] = []
  const ownedList: { productId: string; variantId: string | null; title: string; thumbnailUrl: string | null }[] = []
  const shipsAny = (products as CartProduct[]).some((p) => p.type === "physical")
  const ships = shipsAny && req.handOff !== false
    ? [...wanted].map(([key, want]) => {
        const productId = key.split("::")[0]
        const custom = byId.get(productId)?.type === "physical" ? null : wholeCents(want.customPriceCents, 0, MAX_PWYW_CENTS)
        return { productId, variantId: want.variantId, quantity: want.quantity, ...(custom !== null ? { customPriceCents: custom } : {}) }
      })
    : []
  for (const [key, want] of wanted) {
    const productId = key.split("::")[0]
    const product = byId.get(productId)
    if (!product) { dropped.push(productId); continue }
    /* A physical product goes through the physical checkout (lib/physical), never this one. */
    if (product.type === "physical") { dropped.push(product.title); continue }
    if (owned.has(ownedKey(productId, want.variantId))) {
      dropped.push(product.title)
      ownedList.push({ productId, variantId: want.variantId, title: product.title, thumbnailUrl: product.thumbnail_url ?? null })
      continue
    }

    const variant = want.variantId ? variantsById.get(want.variantId) : null
    if (want.variantId && (!variant || variant.product_id !== productId)) { dropped.push(product.title); continue }
    if (variant && soldOut.has(variant.id)) { dropped.push(product.title); continue }
    const standing = standings.get(productId)
    if (standing && standing.sold >= standing.limit) { dropped.push(product.title); continue }
    /* Pay what you want is the amount the buyer named on the product page,
       held to the product's (or the option's) own minimum and to the
       ceiling; a line that named none is its minimum. An amount under the
       minimum refuses the basket with the reason, rather than charging
       something the buyer did not choose. */
    const priced = baseFor(variant ?? product, want.customPriceCents)
    if (priced.ok === false) return { ok: false, status: 400, error: `${product.title}: ${priced.error}` }
    const priceCents = priced.cents
    /* A free product is a download, not a payment. It has no place in a
       basket that is going to a card form, and Stripe will not take a zero
       line anyway. */
    if (priceCents <= 0 && !req.keepFree) { dropped.push(product.title); continue }

    const quantity = product.type === "digital" ? 1 : want.quantity
    lines.push({ item: { productId, variantId: want.variantId, quantity, priceCents, discountCents: 0 }, product })
    namedPrice.push(!!(variant ?? product).pay_what_you_want)
  }

  const creatorIds = [...new Set((products as CartProduct[]).map((p) => p.creator_id))]
  const subtotalCents = lines.reduce((n, l) => n + l.item.priceCents * l.item.quantity, 0)

  /*
    EACH STORE'S UPSELLS AND BUNDLES (lib/offers), on its own lines, from the
    prices just read, before any code: a complete bundle's discount, a
    checkout offer's product at its offer price. A cart that ships is priced
    by the physical checkout it goes on to, which applies them the same way.
  */
  const now = new Date()
  const offerGroups: { creatorId: string; idx: number[]; offers: Offer[]; lines: OfferLine[] }[] = []
  let appliedOffers: AppliedOffer[] = []
  if (ships.length === 0) {
    for (const creatorId of [...new Set(lines.map((l) => l.product.creator_id))]) {
      const idx = lines.map((l, i) => (l.product.creator_id === creatorId ? i : -1)).filter((i) => i >= 0)
      const { offers } = await loadOffers(db, creatorId, { activeOnly: true })
      if (offers.length === 0) continue
      const offerLines = await offerLinesFor(db, creatorId, offers, idx.map((i) => ({ productId: lines[i].item.productId, unitCents: lines[i].item.priceCents, quantity: lines[i].item.quantity, payWhatYouWant: namedPrice[i] })))
      const r = applyOffers(offerLines, offers, { now })
      r.discounts.forEach((d, k) => (lines[idx[k]].item.discountCents = d))
      appliedOffers.push(...r.applied)
      offerGroups.push({ creatorId, idx, offers, lines: offerLines })
    }
  }
  let offerCents = lines.reduce((n, l) => n + l.item.discountCents, 0)

  const priced = (coupon: CouponRow | null, couponLabel: string | null) => {
    const discountCents = lines.reduce((n, l) => n + l.item.discountCents, 0)
    return { ok: true as const, lines, dropped, ownedAny: ownedList.length > 0, owned: ownedList, ships, creatorIds, limited, subtotalCents, discountCents, offerCents, offers: appliedOffers, totalCents: subtotalCents - discountCents, coupon, couponLabel }
  }

  const typed = typeof req.couponCode === "string" && req.couponCode.trim() ? req.couponCode : null
  /* Nothing left to buy is said as that, not as a code that applies to nothing.
     A cart that ships is priced, code and all, by the physical checkout it
     goes on to: a code for the shipped product is not refused here for
     fitting nothing in the digital lines left. */
  if (!typed || lines.length === 0 || ships.length > 0) return priced(null, null)
  const code = normaliseCode(typed)
  if (!code) return { ok: false, status: 400, error: "That code is not valid." }

  /* A code is one creator's. It is looked for under each creator in the
     basket, in the order their lines come, and the first that has it is the
     one it belongs to; it then comes off that creator's lines only. */
  let coupon: CouponRow | null = null
  for (const creatorId of [...new Set(lines.map((l) => l.product.creator_id))]) {
    coupon = await findCoupon(db, creatorId, code)
    if (coupon) break
  }
  /* Its amounts said in the store's own currency, which its prices are in. */
  const currency = coupon ? (await readStoreCurrency(db, coupon.creator_id)).currency : undefined
  /* The code comes off what each line costs after its offers, so the two together never take a line below zero. */
  const check = (cents: number[]) => checkCouponLines(coupon, lines.map((l, i) => ({ productId: l.item.productId, creatorId: l.product.creator_id, cents: cents[i] })), { currency })
  const group = coupon ? offerGroups.find((g) => g.creatorId === coupon!.creator_id) : undefined
  if (!group) {
    const checked = check(lines.map((l) => Math.max(0, l.item.priceCents * l.item.quantity - l.item.discountCents)))
    if (checked.ok === false) return { ok: false, status: 400, error: checked.error }
    checked.discounts.forEach((d, i) => (lines[i].item.discountCents += d))
    return priced(checked.coupon, checked.label)
  }
  /* That store has offers: by each one's rule for codes, whichever saves more when one doesn't combine (lib/offers stackWithCode). */
  let label: string | null = null
  let found: CouponRow | null = null
  const stacked = stackWithCode(group.lines, group.offers, (remaining) => {
    const cents = lines.map((l) => Math.max(0, l.item.priceCents * l.item.quantity - l.item.discountCents))
    group.idx.forEach((i, k) => (cents[i] = remaining[k]))
    const r = check(cents)
    if (r.ok === false) return { error: (r as { error: string }).error }
    const ok = r as Extract<typeof r, { ok: true }>
    label = ok.label
    found = ok.coupon
    /* A code is one store's, so its discounts outside the group are nothing. */
    return { discounts: group.idx.map((i) => ok.discounts[i]) }
  }, { now })
  if (stacked.error) return { ok: false, status: 400, error: stacked.error }
  group.idx.forEach((i, k) => (lines[i].item.discountCents = Math.min(lines[i].item.priceCents * lines[i].item.quantity, stacked.discounts[k] + stacked.codeDiscounts[k])))
  const groupOffers = new Set(group.offers.map((o) => o.id))
  appliedOffers = [...appliedOffers.filter((a) => !groupOffers.has(a.offerId)), ...stacked.applied]
  /* The offers' part: the other stores' as they were, this store's as stacked. */
  offerCents = lines.reduce((n, l, i) => (group.idx.includes(i) ? n : n + l.item.discountCents), 0) + stacked.discounts.reduce((n, d) => n + d, 0)
  return priced(found, label)
}
