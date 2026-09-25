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
 *
 * A pay-what-you-want product was drawn "Free" (its price_cents is its
 * minimum, often 0), and a compare-at price left from before a product went
 * free or pay-what-you-want could put "100% OFF" on it. Neither now.
 *
 * Pure, so the tests run it directly.
 */

export interface ListedPrice {
  price_cents: number | null | undefined
  compare_at_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
}

export interface PriceLabel {
  /** What the card says in its price's place. */
  main: string
  /** The compare-at price, struck through, or null. */
  was: string | null
  /** The saving in whole percent, 1 to 99, or null. */
  off: number | null
}

export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100)
}

export function listPrice(p: ListedPrice, format: (cents: number) => string = usd): PriceLabel {
  if (p.pay_what_you_want) {
    const min = Math.max(0, p.pwyw_min_price_cents ?? p.price_cents ?? 0)
    return { main: min > 0 ? `${format(min)}+` : "Pay what you want", was: null, off: null }
  }
  const price = Math.max(0, p.price_cents ?? 0)
  if (price === 0) return { main: "Free", was: null, off: null }
  const compare = p.compare_at_cents ?? 0
  if (compare > price) {
    const off = Math.round((1 - price / compare) * 100)
    return { main: format(price), was: format(compare), off: off >= 1 && off <= 99 ? off : null }
  }
  return { main: format(price), was: null, off: null }
}
