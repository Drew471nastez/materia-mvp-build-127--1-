import "server-only"
/**
 * ===========================================================================
 *  AN IMPORTED THEME'S CART, PRICED BY THE WEBSITE'S OWN CHECKOUT
 * ===========================================================================
 * A Shopify theme's cart drawer has a discount box and an "Estimate
 * shipping" form. Both are answered here from the very pricing the
 * website's checkout charges by (lib/checkout/site-quote-server siteQuote),
 * so what the drawer takes off and what the card pays can never differ:
 *
 *   a discount code   the cart priced with the code and without it; what
 *                     the code takes off each line is the difference (the
 *                     store's upsells and bundles stay out of it). Its rules
 *                     are the checkout's: active, dates, use limit, minimum
 *                     order, products and collections, physical only.
 *   shipping rates    the delivery options the checkout offers that address:
 *                     Settings › Shipping's zones and rates, free over an
 *                     amount, local delivery by postal code, a free shipping
 *                     code.
 *
 * In the currency the page shows (the visitor's market's, as the product
 * cards are converted): a line's part of the code in proportion to the line
 * as shown, delivery at the market's rate as the checkout converts it.
 *
 * Each answer is held for the request it was asked in, so a drawer that asks
 * for the cart and its sections in one press prices the cart once.
 */
import type { CartPricing, CartEntry, ShippingAsk, ShippingEstimate } from "./site"
import type { CartDiscount, CartOffers } from "./objects"
import { siteQuote, type SiteQuote, type SiteQuoteAnswer, type SiteQuoteLine } from "@/lib/checkout/site-quote-server"
import { findCoupon, normaliseCode, type CouponRow } from "@/lib/checkout/coupons"
import { sameLine } from "@/lib/checkout/site-checkout"
import { marketPricing } from "@/lib/markets/live"
import { marketCharge, amountsInMarket, type MarketCharge } from "@/lib/markets/checkout-charge"
import { minorUnits } from "@/lib/markets/money"
import { createAdminClient } from "@/lib/supabase/admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type Quote = (db: Db, creatorId: string, body: Record<string, unknown>) => Promise<SiteQuoteAnswer>

/* With each line's properties, so a cart that ships is quoted line for line as the cookie holds it (one option with other properties is its own line). */
const itemsOf = (cart: CartEntry[]) => cart.map((e) => ({ productId: e.p, variantId: e.v, quantity: e.q, ...(e.props ? { properties: e.props } : {}) }))

/** Cents of the store's money as the page writes amounts (Shopify's: always hundredths of the currency). */
function toPageCents(minor: number, currency: string): number {
  return Math.round(minor * 10 ** (2 - minorUnits(currency)))
}

/** The same quoted line in another quote of the same cart: the same option and, on a cart that ships, the same properties. */
const sameQuoted = (a: SiteQuoteLine, b: SiteQuoteLine) => a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null) && (a.propertiesKey ?? "") === (b.propertiesKey ?? "")

/** The offers' part of each quoted line (the quote without a code): what the line's discount is before any code. */
function offerParts(withCode: SiteQuote, without: SiteQuote | null): number[] {
  return withCode.lines.map((l) => without?.lines.find((b) => sameQuoted(b, l))?.discountCents ?? 0)
}

/** The code's part of each quoted line: with the code, less without it. */
function codeParts(withCode: SiteQuote, without: SiteQuote | null): number[] {
  const before = offerParts(withCode, without)
  return withCode.lines.map((l, i) => Math.max(0, l.discountCents - before[i]))
}

/*
  WHETHER THE STORE HAS AN OFFER ON NOW THAT TAKES ANYTHING OFF, held half a
  minute per store, so a cart drawn on every page of a store with no offers
  asks the checkout nothing more than before. An offer switched on shows in
  the cart within that.
*/
const liveHeld = new Map<string, { until: number; live: boolean }>()
async function storeHasOffers(db: Db, creatorId: string): Promise<boolean> {
  const held = liveHeld.get(creatorId)
  if (held && held.until > Date.now()) return held.live
  const { loadOffers } = await import("@/lib/offers/offers-read")
  const { offerLive } = await import("@/lib/offers/offers")
  const { offers } = await loadOffers(db, creatorId, { activeOnly: true })
  const live = offers.some((o) => offerLive(o) && (o.kind === "quantity_break" ? (o.tiers?.length ?? 0) > 0 : o.discountType === "percent" || o.discountType === "fixed"))
  liveHeld.set(creatorId, { until: Date.now() + 30_000, live })
  if (liveHeld.size > 2000) liveHeld.delete(liveHeld.keys().next().value as string)
  return live
}

/** Which way a code is drawn: for the whole order, or for some products only (Shopify's cart level and line level). */
function scopeOf(c: CouponRow | null): CartDiscount["scope"] {
  const row = c as (CouponRow & { collection_ids?: string[] | null; physical_only?: boolean }) | null
  return row && ((row.product_ids?.length ?? 0) > 0 || (row.collection_ids?.length ?? 0) > 0 || row.physical_only === true) ? "lines" : "cart"
}

export interface CompatPricingInput {
  creatorId: string
  /** The store's own currency: what every price is typed in. */
  storeCurrency: string
  /** The visitor's market (the proxy's header), whose currency the page shows; null for the store's own prices. */
  market: string | null
  db?: Db
  /** What prices the cart: the website checkout's own quote (siteQuote); a test hands the physical one straight in. */
  quote?: Quote
}

export function compatCartPricing(input: CompatPricingInput): CartPricing {
  /* The database client only once something is priced: most requests carry no code. */
  let client: Db = input.db ?? null
  const db = (): Db => (client ??= createAdminClient())
  const base = input.storeCurrency
  const quote = input.quote ?? siteQuote
  const held = new Map<string, Promise<SiteQuoteAnswer>>()
  /* The checkout's quote for these lines, asked once per request whatever asks it. */
  const quoteOf = (body: Record<string, unknown>): Promise<SiteQuoteAnswer> => {
    const key = JSON.stringify(body)
    let value = held.get(key)
    if (!value) {
      value = quote(db(), input.creatorId, body).catch((): SiteQuoteAnswer => ({ ok: false, status: 503, error: "The cart could not be priced." }))
      held.set(key, value)
    }
    return value
  }
  let chargeAsked: Promise<MarketCharge | null> | null = null
  /* The market's conversion, asked once per request and only when something is priced. */
  const charge = () => (chargeAsked ??= input.market ? marketPricing(input.creatorId, input.market, base).then((p) => (p ? marketCharge(p) : null), () => null) : Promise.resolve(null))

  return {
    async discount(cart, typed, shown) {
      const none: CartDiscount = { code: typed, applicable: false, valueType: "percentage", value: 0, scope: "cart", lines: {}, total: 0, freeShipping: false }
      const code = normaliseCode(typed)
      if (!code) return { ...none, error: "That code is not valid." }
      const items = itemsOf(cart)
      const [withCode, without, coupon, money] = await Promise.all([
        quoteOf({ items, couponCode: code }),
        quoteOf({ items }),
        findCoupon(db(), input.creatorId, code).catch(() => null),
        charge(),
      ])
      if (withCode.ok === false) return { ...none, error: withCode.error }
      const q = withCode.quote
      if (q.couponError || !q.coupon) {
        const error = q.couponError ?? "That code is not valid."
        return { ...none, code: coupon?.code ?? code, error: money ? amountsInMarket(error, money) : error }
      }
      const parts = codeParts(q, without.ok ? without.quote : null)
      const beforeCode = offerParts(q, without.ok ? without.quote : null)
      /* The page's line prices are the store's when there is no market to convert to: the code's cents as they are. */
      const exact = !money && minorUnits(base) === 2
      const lines: Record<string, number> = {}
      q.lines.forEach((l, i) => {
        const part = parts[i]
        if (part <= 0) return
        /* The cookie's lines this quoted line is: the same option (a line with properties is its own entry), or the product's only one. */
        const mine = cart.filter((e) => sameLine({ productId: e.p, variantId: e.v, properties: e.props }, l))
        const qty = mine.reduce((n, e) => n + e.q, 0)
        if (!qty) return
        const lineStore = l.unitCents * l.quantity
        let left = exact ? part : 0
        mine.forEach((e, n) => {
          const page = shown[e.k] ?? 0
          let off: number
          if (exact) off = n === mine.length - 1 ? left : Math.round((part * e.q) / qty)
          /* In another money, the share the checkout's conversion gives the whole discount less the share it gives the offers' part (lib/markets/checkout-charge convertOrder), so the two parts add up to what the card pays. */
          else off = lineStore > 0 ? Math.round((page * l.discountCents) / lineStore) - Math.round((page * beforeCode[i]) / lineStore) : 0
          off = Math.max(0, Math.min(page, off))
          left -= off
          if (off > 0) lines[e.k] = (lines[e.k] ?? 0) + off
        })
      })
      const total = Object.values(lines).reduce((n, c) => n + c, 0)
      const percentage = coupon?.discount_type === "percentage"
      return {
        code: q.coupon.code || coupon?.code || code,
        applicable: true,
        valueType: percentage ? "percentage" : "fixed_amount",
        value: percentage ? Number(coupon?.discount_value) || 0 : total,
        scope: scopeOf(coupon),
        lines,
        total,
        freeShipping: q.coupon.freeShipping === true,
        error: null,
      }
    },

    /*
      THE STORE'S OFFERS ON THE CART, from the checkout's own quote without a
      code (the very quote the code's part is taken against): each quoted
      line's offers, each its part of the line, put on the cookie's lines it
      is. In the store's money (two decimals) the parts are the checkout's
      cents exactly. In another money each part is the share of the line the
      checkout's conversion gives it (convertOrder: a line's discount keeps
      its share of the line as the line's price is converted), the line's
      offers together exactly that share of the line's whole discount, the
      last taking the rounding.
    */
    async offers(cart, shown): Promise<CartOffers | null> {
      if (!cart.length || !(await storeHasOffers(db(), input.creatorId).catch(() => false))) return null
      const [answer, money] = await Promise.all([quoteOf({ items: itemsOf(cart) }), charge()])
      if (answer.ok === false) return null
      const exact = !money && minorUnits(base) === 2
      const lines: CartOffers["lines"] = {}
      for (const l of answer.quote.lines) {
        const offers = (l.offers ?? []).filter((o) => o.savedCents > 0)
        if (!offers.length || l.discountCents <= 0) continue
        const mine = cart.filter((e) => sameLine({ productId: e.p, variantId: e.v, properties: e.props }, l))
        const qty = mine.reduce((n, e) => n + e.q, 0)
        if (!qty) continue
        const whole = offers.reduce((s, o) => s + o.savedCents, 0)
        let given = 0
        mine.forEach((e, n) => {
          const page = shown[e.k] ?? 0
          /* This cookie line's part of the quoted line's offers (by its units, the last taking the rest), in the store's money, then in the page's. */
          const mineStore = n === mine.length - 1 ? whole - given : Math.round((whole * e.q) / qty)
          given += mineStore
          const total = exact ? mineStore : l.unitCents > 0 ? Math.min(page, Math.round((page * mineStore) / (l.unitCents * e.q))) : 0
          let left = total
          const out: CartOffers["lines"][string] = []
          offers.forEach((o, k) => {
            const amount = k === offers.length - 1 ? left : Math.min(left, Math.round((total * o.savedCents) / Math.max(1, whole)))
            left -= amount
            if (amount > 0) out.push({ offerId: o.offerId, title: o.title, kind: o.kind, ...(o.tier !== undefined ? { tier: o.tier } : {}), amount })
          })
          if (out.length) lines[e.k] = out
        })
      }
      return Object.keys(lines).length ? { lines } : null
    },

    async shipping(cart, code, address: ShippingAsk): Promise<ShippingEstimate> {
      const [answer, money] = await Promise.all([
        quoteOf({ items: itemsOf(cart), ...(code ? { couponCode: code } : {}), country: address.country, region: address.region, postalCode: address.zip }),
        charge(),
      ])
      if (!answer.ok) return { ok: true, rates: [] }
      const q = answer.quote
      if (q.kind !== "ships" || !q.requiresShipping) return { ok: true, rates: [] }
      if (!q.delivery.ok) {
        if (q.delivery.needsRegion) return { ok: false, field: "province", message: address.region ? "is not supported" : "can't be blank" }
        return { ok: false, field: "country", message: "is not supported" }
      }
      const free = q.coupon?.freeShipping === true
      const currency = money?.currency ?? base
      return {
        ok: true,
        rates: q.delivery.options.map((o) => ({
          name: o.name,
          cents: free ? 0 : toPageCents(money ? money.amount(o.priceCents) : o.priceCents, currency),
          description: o.estimate || null,
        })),
      }
    },
  }
}
