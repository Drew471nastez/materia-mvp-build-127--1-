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
import type { CartDiscount } from "./objects"
import { siteQuote, type SiteQuote, type SiteQuoteAnswer } from "@/lib/checkout/site-quote-server"
import { findCoupon, normaliseCode, type CouponRow } from "@/lib/checkout/coupons"
import { sameLine } from "@/lib/checkout/site-checkout"
import { marketPricing } from "@/lib/markets/live"
import { marketCharge, amountsInMarket, type MarketCharge } from "@/lib/markets/checkout-charge"
import { minorUnits } from "@/lib/markets/money"
import { createAdminClient } from "@/lib/supabase/admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type Quote = (db: Db, creatorId: string, body: Record<string, unknown>) => Promise<SiteQuoteAnswer>

const itemsOf = (cart: CartEntry[]) => cart.map((e) => ({ productId: e.p, variantId: e.v, quantity: e.q }))

/** Cents of the store's money as the page writes amounts (Shopify's: always hundredths of the currency). */
function toPageCents(minor: number, currency: string): number {
  return Math.round(minor * 10 ** (2 - minorUnits(currency)))
}

/** The code's part of each quoted line: with the code, less without it. */
function codeParts(withCode: SiteQuote, without: SiteQuote | null): number[] {
  return withCode.lines.map((l) => {
    const before = without?.lines.find((b) => b.productId === l.productId && (b.variantId ?? null) === (l.variantId ?? null))?.discountCents ?? 0
    return Math.max(0, l.discountCents - before)
  })
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
      /* The page's line prices are the store's when there is no market to convert to: the code's cents as they are. */
      const exact = !money && minorUnits(base) === 2
      const lines: Record<string, number> = {}
      q.lines.forEach((l, i) => {
        const part = parts[i]
        if (part <= 0) return
        /* The cookie's lines this quoted line is: the same option (a line with properties is its own entry), or the product's only one. */
        const mine = cart.filter((e) => sameLine({ productId: e.p, variantId: e.v }, l))
        const qty = mine.reduce((n, e) => n + e.q, 0)
        if (!qty) return
        const lineStore = l.unitCents * l.quantity
        let left = exact ? part : 0
        mine.forEach((e, n) => {
          const page = shown[e.k] ?? 0
          let off: number
          if (exact) off = n === mine.length - 1 ? left : Math.round((part * e.q) / qty)
          else off = lineStore > 0 ? Math.round((page * part) / lineStore) : 0
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
