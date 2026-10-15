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
import { convertOrder, marketCharge } from "./checkout-charge"
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

/**
 * `code`: a discount the store's prices were given (POST /api/coupons/validate
 * answers it in the store's currency), shown as the same share of the
 * converted subtotal.
 */
export function cartAmounts(lines: CartAmountLine[], display: StorefrontDisplay | null | undefined, currency: string, code?: { subtotalCents: number; discountCents: number } | null): CartAmounts {
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
  const discountNow = discount > 0 && sub > 0 ? Math.min(subNow, Math.round((discount * subNow) / sub)) : 0
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
