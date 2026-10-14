/**
 * ===========================================================================
 *  WHAT A PRODUCT CARD SAYS ITS PRICE IS
 * ===========================================================================
 * One rule for every card (components/explore/product-card, which Explore,
 * the category pages and the creator page all draw), so a product reads the
 * same wherever it is listed:
 *
 *   pay what you want   "$5+" from its minimum, "Pay what you want" with none
 *   free                "Free"
 *   a fixed price       the price, and the compare-at price struck through
 *                       with the saving, only when it is higher than the price
 *   a membership        its price per month or per year: "$9/month". The
 *                       product row carries the monthly price (the yearly one
 *                       when there is no monthly, lib/memberships/creator.ts),
 *                       so a card that was handed the plan's interval
 *                       (lib/memberships/intervals.ts) says which, and one
 *                       that was not says "/month", which is right unless the
 *                       plan is yearly only. A bare "$9" read as a one-off.
 *
 * A pay-what-you-want product was drawn "Free" (its price_cents is its
 * minimum, often 0), and a compare-at price left from before a product went
 * free or pay-what-you-want could put "100% OFF" on it. Neither now.
 *
 * Pure, so the tests run it directly.
 */
import { shopMoney } from "@/lib/store/shop-money"

export interface ListedPrice {
  price_cents: number | null | undefined
  compare_at_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  /** The product's type: a "membership" is priced per month or year. */
  type?: string | null
  /** A membership's billing interval, when the plan was read. */
  price_interval?: PriceInterval | null
}

export type PriceInterval = "month" | "year"

/** The interval a price is per, or null for a one-off price. */
export function intervalOf(p: { type?: string | null; price_interval?: PriceInterval | null }): PriceInterval | null {
  if (p.price_interval === "month" || p.price_interval === "year") return p.price_interval
  return p.type === "membership" ? "month" : null
}

/** "$9" to "$9/month" for a membership; anything else as it was. */
export function perInterval(text: string, interval: PriceInterval | null | undefined): string {
  return interval ? `${text}/${interval}` : text
}

export interface PriceLabel {
  /** What the card says in its price's place. */
  main: string
  /** The compare-at price, struck through, or null. */
  was: string | null
  /** The saving in whole percent, 1 to 99, or null. */
  off: number | null
}

/** A price in the shop's currency (lib/store/shop-money.ts): "$1,250.00" on
 *  a dollar deployment, "RON 1,250.00" on a lei one. Named before that. */
export function usd(cents: number): string {
  return shopMoney(cents || 0, { grouping: true })
}

export function listPrice(p: ListedPrice, format: (cents: number) => string = usd): PriceLabel {
  if (p.pay_what_you_want) {
    const min = Math.max(0, p.pwyw_min_price_cents ?? p.price_cents ?? 0)
    return { main: min > 0 ? `${format(min)}+` : "Pay what you want", was: null, off: null }
  }
  const price = Math.max(0, p.price_cents ?? 0)
  if (price === 0) return { main: "Free", was: null, off: null }
  const per = intervalOf(p)
  const compare = p.compare_at_cents ?? 0
  if (compare > price) {
    const off = Math.round((1 - price / compare) * 100)
    return { main: perInterval(format(price), per), was: format(compare), off: off >= 1 && off <= 99 ? off : null }
  }
  return { main: perInterval(format(price), per), was: null, off: null }
}
