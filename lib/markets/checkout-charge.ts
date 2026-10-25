/**
 * ===========================================================================
 *  CHECKOUT IN THE MARKET'S OWN CURRENCY
 * ===========================================================================
 * A visitor in a market with its own currency (Settings › Languages, visitor
 * currencies) sees the website's prices converted (lib/markets/pricing). The
 * checkout then charges that same currency, the amounts they saw, rather than
 * the store's with a note: what the product page said is what the card pays.
 *
 * Every price a line has is converted exactly as its card was (the market's
 * rate, adjustment and rounding: pricing.convert), so a 49 lei mug is 49 lei
 * in the cart and at checkout. Shipping, a cash on delivery fee and offers
 * are converted at the rate without the price rounding. A line's discount and
 * the tax keep their share of what they were taken from, and the total is
 * added up again from the converted parts, the way physicalTotals adds it.
 *
 * Only a currency Storelib can charge (a fee rule for it, two decimals): a
 * market in any other currency shows its prices and charges the store's own,
 * and the checkout says so plainly (`chargeNote`).
 *
 * Pure: the page's quote and the route that makes the payment both convert
 * with this, so they can never disagree.
 */
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { convertMinor, formatMinor, minorUnits } from "./money"
import { shopMoneyIn } from "@/lib/store/shop-money"
import type { Pricing } from "./pricing"

/** Whether a checkout can charge this currency: Storelib takes its fee in it, and it has cents. */
export function chargeableCurrency(currency: string | null | undefined): boolean {
  const code = (currency ?? "").toUpperCase()
  return !!CURRENCY_FEE_RULES[code] && minorUnits(code) === 2
}

/** The market's conversion when the checkout charges in it; null when it charges the store's own currency. */
export function chargingPricing(pricing: Pricing | null | undefined): Pricing | null {
  return pricing && chargeableCurrency(pricing.currency) && minorUnits(pricing.base) === 2 ? pricing : null
}

/** What a visitor seeing `pricing` is charged in: the market's own currency when the checkout charges it, else the store's (`base`). */
export function chargeCurrencyFor(pricing: Pricing | null | undefined, base: string): string {
  return chargingPricing(pricing)?.currency ?? base
}

export interface MarketCharge {
  /** A price (a line's unit): rounded as the market's cards are. */
  price(cents: number): number
  /** Any other amount (shipping, a fee): at the rate, not rounded as a price. */
  amount(cents: number): number
  currency: string
  /** The store's own currency, which the amounts are converted from. */
  base: string
}

/** The two conversions for a market. A price the rates cannot convert stays as it was (the caller only charges a market `chargingPricing` allowed). */
export function marketCharge(pricing: Pricing): MarketCharge {
  return {
    currency: pricing.currency,
    base: pricing.base,
    price: (cents) => (cents > 0 ? (pricing.convert(Math.round(cents)) ?? cents) : 0),
    amount: (cents) => (cents > 0 ? (convertMinor(Math.round(cents), pricing.base, pricing.currency, pricing.fx, { adjustBps: pricing.market.adjustBps }) ?? cents) : 0),
  }
}

/**
 * The way a checkout writes its amounts: in the page's language when it
 * charges the market's currency, as the website wrote that market's prices
 * ("39,98 €" in German, lib/markets/cart-money); the store's own currency
 * the way every page writes it ("48.00 lei", lib/store/shop-money).
 */
export function checkoutMoneyLocale(charge: MarketCharge | null | undefined, language: string | null | undefined): string {
  return charge && language ? language : "en-US"
}

/**
 * The checkout's settings as its page says them in the market's currency:
 * the cash on delivery fee ("adds a fee of €2.01") converted as the quote
 * converts it, never the store's 10 lei written as €10.00.
 */
export function checkoutConfigInMarket<C extends { codFeeCents: number }>(config: C, charge: MarketCharge | null | undefined): C {
  return charge && config.codFeeCents > 0 ? { ...config, codFeeCents: charge.amount(config.codFeeCents) } : config
}

/**
 * Words with an amount in the store's currency, as the coupon rules write it
 * ("That code needs an order of at least 150.00 lei", "5.00 lei off"), with
 * each amount at the rate in the market's: a checkout in euros never says
 * lei. Text with no such amount comes back as it was.
 */
export function amountsInMarket(text: string, charge: MarketCharge): string {
  if (!text) return text
  const sample = shopMoneyIn(123456, charge.base)
  const at = sample.indexOf("1234.56")
  if (at < 0) return text
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const shape = new RegExp(`${escape(sample.slice(0, at))}(\\d+\\.\\d{2})${escape(sample.slice(at + 7))}`, "g")
  return text.replace(shape, (whole, n: string) => {
    const cents = Math.round(Number(n) * 100)
    return Number.isFinite(cents) ? formatMinor(charge.amount(cents), charge.currency, "en-US") : whole
  })
}

/** What a share of `whole` is in the converted whole: `part` of `whole` becomes the same part of `wholeNow`. */
function share(part: number, whole: number, wholeNow: number): number {
  if (part <= 0) return 0
  if (whole <= 0) return part
  return Math.min(wholeNow, Math.round((part * wholeNow) / whole))
}

export interface ChargeLine {
  unitCents: number
  quantity: number
  discountCents: number
}

export interface ChargeTotals {
  itemsSubtotalCents: number
  discountCents: number
  shippingCents: number
  shippingDiscountCents: number
  taxCents: number
  taxIncluded: boolean
  totalCents: number
  codFeeCents?: number
}

/**
 * A priced order in the market's currency: its lines (each unit price as its
 * card showed it, its discount the same share of it) and its totals, added
 * up again. `lines` and `totals` are the store currency's, as priced.
 */
export function convertOrder<L extends ChargeLine, T extends ChargeTotals>(lines: L[], totals: T, charge: MarketCharge): { lines: L[]; totals: T } {
  const out = lines.map((l) => {
    const unitCents = charge.price(l.unitCents)
    const gross = l.unitCents * l.quantity
    return { ...l, unitCents, discountCents: share(l.discountCents, gross, unitCents * l.quantity) }
  })
  const itemsSubtotalCents = out.reduce((n, l) => n + l.unitCents * l.quantity, 0)
  const discountCents = out.reduce((n, l) => n + Math.min(l.unitCents * l.quantity, l.discountCents), 0)
  const shippingCents = charge.amount(totals.shippingCents)
  const shippingDiscountCents = totals.shippingDiscountCents >= totals.shippingCents ? shippingCents : Math.min(shippingCents, charge.amount(totals.shippingDiscountCents))
  const codFeeCents = charge.amount(totals.codFeeCents ?? 0)
  const before = totals.itemsSubtotalCents - totals.discountCents + totals.shippingCents - totals.shippingDiscountCents + (totals.codFeeCents ?? 0)
  const after = itemsSubtotalCents - discountCents + shippingCents - shippingDiscountCents + codFeeCents
  /* The tax is the same share of what it is on: included, it stays inside the converted prices; added, it is added to them. */
  const taxCents = totals.taxCents > 0 ? (before > 0 ? Math.round((totals.taxCents * after) / before) : charge.amount(totals.taxCents)) : 0
  const totalCents = after + (totals.taxIncluded ? 0 : taxCents)
  return {
    lines: out,
    totals: { ...totals, itemsSubtotalCents, discountCents, shippingCents, shippingDiscountCents, taxCents, totalCents, ...(totals.codFeeCents !== undefined ? { codFeeCents } : {}) },
  }
}

/**
 * Each line's share of the tax, in the market's currency: the converted tax
 * split by each line's converted amount, the last line taking what rounding
 * leaves, so the shares add up to the tax exactly.
 */
export function lineTaxShares(lines: ChargeLine[], taxCents: number): number[] {
  const amounts = lines.map((l) => Math.max(0, l.unitCents * l.quantity - l.discountCents))
  const whole = amounts.reduce((n, a) => n + a, 0)
  if (taxCents <= 0 || whole <= 0) return lines.map(() => 0)
  let left = taxCents
  return amounts.map((a, i) => {
    if (i === amounts.length - 1) return left
    const t = Math.round((taxCents * a) / whole)
    left -= t
    return t
  })
}

/**
 * A line's offers (each its part of the line's discount, lib/offers
 * lineOffers) once the discount is converted: each keeps the same share of
 * the line's discount it had, the parts never more than the discount after.
 * The order's record of which offer saved what, in the money charged.
 */
export function offersInMarket<O extends { savedCents: number }>(offers: O[] | undefined, discountBefore: number, discountAfter: number): O[] | undefined {
  if (!offers?.length) return offers
  let left = Math.max(0, discountAfter)
  return offers.map((o) => {
    const saved = Math.min(left, share(o.savedCents, discountBefore, discountAfter))
    left -= saved
    return { ...o, savedCents: saved }
  })
}
