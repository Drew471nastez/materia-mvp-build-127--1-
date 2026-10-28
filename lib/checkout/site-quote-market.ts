/**
 * A website checkout's quote in the market's own currency (lib/markets/
 * checkout-charge.ts): the lines as their cards showed them, the delivery
 * choices, offers and totals converted the same way, and the currency it is
 * all in. The page's quote and the payment both come through here.
 *
 * Pure.
 */
import { amountsInMarket, convertOrder, offersInMarket, type MarketCharge } from "@/lib/markets/checkout-charge"
import type { SiteQuote } from "./site-quote-server"

/**
 * The summary's saving rows in the market's money, as the order keeps them:
 * each line's offers converted with the line's discount (offersInMarket, the
 * same call app/api/checkout/site and lib/physical/checkout-server make for
 * the order's record), then added up by name. Converting each row's whole
 * amount at the rate instead read 5.83 for an offer the line charged 5.99
 * off in a market that rounds its prices, and the code's row absorbed the
 * difference. A row no line names (or a name two rows share) is converted
 * at the rate, as before.
 */
export function offerRowsInMarket(quote: Pick<SiteQuote, "lines" | "offers">, converted: Pick<SiteQuote["lines"][number], "discountCents" | "offers">[], charge: MarketCharge): { title: string; savedCents: number }[] {
  const rows = quote.offers ?? []
  const byTitle = new Map<string, number>()
  quote.lines.forEach((l, i) => {
    const now = converted[i]
    if (!l.offers?.length || !now) return
    for (const o of offersInMarket(l.offers, l.discountCents, now.discountCents) ?? []) byTitle.set(o.title, (byTitle.get(o.title) ?? 0) + o.savedCents)
  })
  const count = new Map<string, number>()
  for (const r of rows) count.set(r.title, (count.get(r.title) ?? 0) + 1)
  return rows.map((r) => ({ ...r, savedCents: byTitle.has(r.title) && count.get(r.title) === 1 ? byTitle.get(r.title)! : charge.amount(r.savedCents) }))
}

export function quoteInMarket(quote: SiteQuote, charge: MarketCharge): SiteQuote & { currency: string } {
  const { lines, totals } = convertOrder(quote.lines, quote.totals, charge)
  return {
    ...quote,
    lines,
    totals,
    delivery: { ...quote.delivery, options: quote.delivery.options.map((o) => ({ ...o, priceCents: charge.amount(o.priceCents) })) },
    ...(quote.offers ? { offers: offerRowsInMarket(quote, lines, charge) } : {}),
    /* The other options a line can be changed to, priced as their cards are; the store's price kept beside it for the website's cart. */
    ...(quote.choices ? { choices: Object.fromEntries(Object.entries(quote.choices).map(([id, c]) => [id, { ...c, variants: c.variants.map((v) => ({ ...v, priceCents: charge.price(v.priceCents), storeCents: v.priceCents })) }])) } : {}),
    /* A code's words with their amounts in the market's currency too: "at least €30.14", never lei on a checkout in euros. */
    coupon: quote.coupon ? { ...quote.coupon, label: quote.coupon.label ? amountsInMarket(quote.coupon.label, charge) : quote.coupon.label } : quote.coupon,
    couponError: quote.couponError ? amountsInMarket(quote.couponError, charge) : quote.couponError,
    currency: charge.currency,
  }
}
