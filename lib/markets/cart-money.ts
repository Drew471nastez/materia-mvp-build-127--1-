/**
 * ===========================================================================
 *  A CART'S AMOUNTS IN THE VISITOR'S CURRENCY, AS CHECKOUT WILL ADD THEM UP
 * ===========================================================================
 * A cart line keeps its price in the store's currency and is shown in the
 * visitor's market's (lib/markets/live.ts display). It used to convert the
 * line's whole amount and the subtotal, each rounded as a price: two mugs at
 * €19.99 read €39.99, and a 10% code's €6.60 read €6.99, while checkout
 * charged €39.98 and €6.60. Here each unit is converted as its card was,
 * times the quantity, and a code's discount is the same share of the
 * converted subtotal, by checkout's own function (checkout-charge
 * convertOrder), so the cart says what checkout will charge.
 *
 * Pure: the storefront's cart, drawer and cart page and the tests use it.
 */
import { convertOrder, marketCharge, offersInMarket } from "./checkout-charge"
import { formatMinor } from "./money"
import { pricingFor, type StorefrontDisplay } from "./pricing"
import { shopMoneyIn } from "@/lib/store/shop-money"

export interface CartAmountLine {
  /** The unit price in the store's currency, hundredths of its unit. */
  priceCents: number
  quantity: number
}

export interface CartAmounts {
  /** Each line's amount (its unit times its quantity), written. */
  lines: string[]
  subtotal: string
  /** With a code: what it takes off, and what is left. Null without one. */
  discount: string | null
  total: string
}

/** A discount on the cart in the store's currency; `lineDiscounts[i]`, when known, is line i's part of it (the store's offers, lib/offers/contract `lines`). */
export interface CartDiscountCents {
  subtotalCents: number
  discountCents: number
  lineDiscounts?: number[]
}

/**
 * `code`: a discount the store's prices were given (POST /api/coupons/validate
 * answers it in the store's currency), shown as the same share of the
 * converted subtotal. With `lineDiscounts` (one per line), each line keeps its
 * own share of its own converted amount, exactly as checkout converts an
 * order line by line (convertOrder): in a market that rounds its prices the
 * share of the whole subtotal drifted from what checkout charged.
 */
export function cartAmounts(lines: CartAmountLine[], display: StorefrontDisplay | null | undefined, currency: string, code?: CartDiscountCents | null): CartAmounts {
  const pricing = display ? pricingFor(display.market, display.base, display.fx) : null
  const subtotalOwn = lines.reduce((n, l) => n + l.priceCents * l.quantity, 0)
  if (!pricing || !display) {
    const own = (c: number) => shopMoneyIn(c, currency)
    const sub = code ? code.subtotalCents : subtotalOwn
    return { lines: lines.map((l) => own(l.priceCents * l.quantity)), subtotal: own(sub), discount: code ? own(code.discountCents) : null, total: own(code ? Math.max(0, sub - code.discountCents) : sub) }
  }
  const write = (minor: number) => formatMinor(minor, pricing.currency, display.locale, { wholeAsWhole: pricing.market.rounding === "whole" })
  const charge = marketCharge(pricing)
  const sub = code ? code.subtotalCents : subtotalOwn
  const discount = code ? Math.min(code.discountCents, sub) : 0
  const converted = convertOrder(
    lines.map((l) => ({ unitCents: l.priceCents, quantity: l.quantity, discountCents: 0 })),
    { itemsSubtotalCents: subtotalOwn, discountCents: 0, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: subtotalOwn },
    charge,
  )
  const subNow = converted.totals.itemsSubtotalCents
  const perLine = code?.lineDiscounts && code.lineDiscounts.length === lines.length ? code.lineDiscounts : null
  const discountNow = perLine
    ? convertOrder(
        lines.map((l, i) => ({ unitCents: l.priceCents, quantity: l.quantity, discountCents: Math.max(0, Math.round(perLine[i] || 0)) })),
        { itemsSubtotalCents: subtotalOwn, discountCents: discount, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: subtotalOwn - discount },
        charge,
      ).totals.discountCents
    : discount > 0 && sub > 0
      ? Math.min(subNow, Math.round((discount * subNow) / sub))
      : 0
  return {
    lines: converted.lines.map((l) => write(l.unitCents * l.quantity)),
    subtotal: write(subNow),
    discount: code ? write(discountNow) : null,
    total: write(subNow - discountNow),
  }
}

/**
 * An amount that is not a price (what is left to spend for free shipping)
 * in the visitor's currency: at the rate, never rounded up as a price is,
 * as checkout converts shipping (checkout-charge marketCharge amount).
 */
export function amountMoney(display: StorefrontDisplay | null | undefined, currency: string): (cents: number) => string {
  const pricing = display ? pricingFor(display.market, display.base, display.fx) : null
  if (!pricing || !display) return (cents) => shopMoneyIn(cents, currency)
  const charge = marketCharge(pricing)
  return (cents) => formatMinor(charge.amount(cents), pricing.currency, display.locale)
}

/** One line of the server's answer for the cart (lib/offers/contract `lines`): its price, how many, its discount and each offer's part of it. */
export interface OfferAnswerLine {
  unitCents?: number
  quantity?: number
  discountCents: number
  offers?: { offerId: string; title: string; savedCents: number }[]
}

/** One saving row: an offer, or one tier of a quantity break (the same offer, its tier's own name). */
export const offerRowKey = (o: { offerId: string; title: string }) => `${o.offerId}\n${o.title}`

/**
 * Each offer's saving in the page's currency, as checkout will list it: each
 * line's discount converted as checkout converts it (its share of the line's
 * converted amount), each offer its share of that (offersInMarket, the order's
 * own record), added up by row (offerRowKey). Null when the answer has no per line parts
 * (an older server) or the page shows the store's own prices, and the caller
 * writes the saving as it is.
 */
export function offerSavingsShown(lines: OfferAnswerLine[], offers: { offerId: string; title: string; savedCents: number }[], display: StorefrontDisplay | null | undefined): Map<string, number> | null {
  const pricing = display ? pricingFor(display.market, display.base, display.fx) : null
  if (!pricing) return null
  if (!lines.every((l) => typeof l.unitCents === "number" && typeof l.quantity === "number")) return null
  const charge = marketCharge(pricing)
  const out = new Map<string, number>()
  for (const l of lines) {
    if (!l.offers?.length || l.discountCents <= 0) continue
    const unit = l.unitCents as number
    const qty = l.quantity as number
    const now = convertOrder([{ unitCents: unit, quantity: qty, discountCents: l.discountCents }], { itemsSubtotalCents: unit * qty, discountCents: l.discountCents, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: unit * qty - l.discountCents }, charge).lines[0].discountCents
    for (const o of offersInMarket(l.offers, l.discountCents, now) ?? []) out.set(offerRowKey(o), (out.get(offerRowKey(o)) ?? 0) + o.savedCents)
  }
  /* An offer no line names is converted at the rate. */
  for (const o of offers) if (!out.has(offerRowKey(o)) && o.savedCents > 0) out.set(offerRowKey(o), charge.amount(o.savedCents))
  return out
}

/** An amount already in the page's market currency, written as the cart writes its amounts. */
export function shownMoney(display: StorefrontDisplay | null | undefined, currency: string): (minor: number) => string {
  const pricing = display ? pricingFor(display.market, display.base, display.fx) : null
  if (!pricing || !display) return (cents) => shopMoneyIn(cents, currency)
  return (minor) => formatMinor(minor, pricing.currency, display.locale)
}

/** A market as a product page is handed it (lib/products/product-page-model ProductSectionData `display`). */
export type PageDisplay = Pick<StorefrontDisplay, "market" | "base" | "fx" | "locale">

/**
 * Lines priced in the store's currency (each unit, how many, its discount),
 * as checkout will charge them in the page's market: each unit converted as
 * its card is, each discount the same share of its converted line
 * (convertOrder). For a page that shows what an offer comes to before it is
 * in the cart (a quantity break's tier, a bundle's set, an upsell), so the
 * number is the one the cart and the checkout then say; converting the
 * offer's total as one price rounded it again (a 2 + 1 at 29 lei read
 * €11.99 where checkout charged €11.98). Null for the store's own prices.
 */
export function chargedInMarket(lines: { unitCents: number; quantity: number; discountCents: number }[], display: PageDisplay | null | undefined): { fullMinor: number; totalMinor: number; unitMinor: (cents: number) => number; write: (minor: number) => string } | null {
  const pricing = display ? pricingFor(display.market, display.base, display.fx) : null
  if (!pricing || !display) return null
  const charge = marketCharge(pricing)
  const full = lines.reduce((n, l) => n + l.unitCents * l.quantity, 0)
  const off = lines.reduce((n, l) => n + l.discountCents, 0)
  const out = convertOrder(lines, { itemsSubtotalCents: full, discountCents: off, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: full - off }, charge).totals
  return {
    fullMinor: out.itemsSubtotalCents,
    totalMinor: out.itemsSubtotalCents - out.discountCents,
    unitMinor: (cents) => charge.price(cents),
    write: (minor) => formatMinor(minor, pricing.currency, display.locale, { wholeAsWhole: pricing.market.rounding === "whole" }),
  }
}
