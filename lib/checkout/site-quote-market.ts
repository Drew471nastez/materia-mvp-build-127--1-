/**
 * A website checkout's quote in the market's own currency (lib/markets/
 * checkout-charge.ts): the lines as their cards showed them, the delivery
 * choices, offers and totals converted the same way, and the currency it is
 * all in. The page's quote and the payment both come through here.
 *
 * Pure.
 */
import { convertOrder, type MarketCharge } from "@/lib/markets/checkout-charge"
import type { SiteQuote } from "./site-quote-server"

export function quoteInMarket(quote: SiteQuote, charge: MarketCharge): SiteQuote & { currency: string } {
  const { lines, totals } = convertOrder(quote.lines, quote.totals, charge)
  return {
    ...quote,
    lines,
    totals,
    delivery: { ...quote.delivery, options: quote.delivery.options.map((o) => ({ ...o, priceCents: charge.amount(o.priceCents) })) },
    ...(quote.offers ? { offers: quote.offers.map((o) => ({ ...o, savedCents: charge.amount(o.savedCents) })) } : {}),
    currency: charge.currency,
  }
}
