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

import { validateCoupon, type CouponRow } from "./coupons"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

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
}

export type Priced =
  | {
      ok: true
      product: PricedProduct
      variant: PricedVariant | null
      totals: OrderTotals
      coupon: CouponRow | null
      couponLabel: string | null
    }
  | { ok: false; status: number; error: string }

export interface PriceRequest {
  productId: unknown
  variantId?: unknown
  customPriceCents?: unknown
  tipCents?: unknown
  couponCode?: unknown
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

  let variant: PricedVariant | null = null
  if (req.variantId !== undefined && req.variantId !== null && req.variantId !== "") {
    if (typeof req.variantId !== "string") return { ok: false, status: 400, error: "Unknown option." }
    const { data } = await db
      .from("product_variants")
      .select("id, name, price_cents, pay_what_you_want, pwyw_min_price_cents")
      .eq("id", req.variantId)
      .eq("product_id", productId)
      .maybeSingle()
    if (!data) return { ok: false, status: 400, error: "That option is no longer available." }
    variant = data as PricedVariant
  }

  const owner = variant ?? (product as PricedProduct)
  const base = baseFor(owner, req.customPriceCents)
  if (base.ok === false) return { ok: false, status: 400, error: base.error }
  const baseCents = base.cents

  const tip = req.tipCents === undefined || req.tipCents === null || req.tipCents === "" ? 0 : wholeCents(req.tipCents, 0, MAX_TIP_CENTS)
  if (tip === null) return { ok: false, status: 400, error: "A tip is between $0 and $1,000." }

  let coupon: CouponRow | null = null
  let couponLabel: string | null = null
  let discountCents = 0
  if (typeof req.couponCode === "string" && req.couponCode.trim()) {
    const checked = await validateCoupon(db, {
      creatorId: (product as PricedProduct).creator_id,
      productId,
      code: req.couponCode,
      priceCents: baseCents,
    })
    if (checked.ok === false) return { ok: false, status: 400, error: checked.error }
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
  }
}
