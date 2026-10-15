/**
 * A website checkout's quote in the market's own currency (lib/markets/
 * checkout-charge.ts): the lines as their cards showed them, the delivery
 * choices, offers and totals converted the same way, and the currency it is
 * all in. The page's quote and the payment both come through here.
 *
 * Pure.
 */
import { amountsInMarket, convertOrder, type MarketCharge } from "@/lib/markets/checkout-charge"
import type { SiteQuote } from "./site-quote-server"

export function quoteInMarket(quote: SiteQuote, charge: MarketCharge): SiteQuote & { currency: string } {
  const { lines, totals } = convertOrder(quote.lines, quote.totals, charge)
  return {
    ...quote,
    lines,
    totals,
    delivery: { ...quote.delivery, options: quote.delivery.options.map((o) => ({ ...o, priceCents: charge.amount(o.priceCents) })) },
    ...(quote.offers ? { offers: quote.offers.map((o) => ({ ...o, savedCents: charge.amount(o.savedCents) })) } : {}),
    /* The other options a line can be changed to, priced as their cards are; the store's price kept beside it for the website's cart. */
    ...(quote.choices ? { choices: Object.fromEntries(Object.entries(quote.choices).map(([id, c]) => [id, { ...c, variants: c.variants.map((v) => ({ ...v, priceCents: charge.price(v.priceCents), storeCents: v.priceCents })) }])) } : {}),
    /* A code's words with their amounts in the market's currency too: "at least €30.14", never lei on a checkout in euros. */
    coupon: quote.coupon ? { ...quote.coupon, label: quote.coupon.label ? amountsInMarket(quote.coupon.label, charge) : quote.coupon.label } : quote.coupon,
    couponError: quote.couponError ? amountsInMarket(quote.couponError, charge) : quote.couponError,
    currency: charge.currency,
  }
}
