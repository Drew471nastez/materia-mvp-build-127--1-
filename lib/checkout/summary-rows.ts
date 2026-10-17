/**
 * ===========================================================================
 *  THE ORDER SUMMARY'S ROWS, ADDING UP TO THE TOTAL
 * ===========================================================================
 * What the website checkout's summary lists under the lines, from the
 * server's quote (the only source of the amounts):
 *
 *   Subtotal                      every line at its full price
 *   − each upsell or bundle       the store's offers (lib/offers)
 *   − Discount (CODE)             the code's part only
 *   + Shipping, cash fee, tax     tax only when it is added on top
 *   = Total due
 *
 * The quote's line discounts already hold the offers AND the code
 * (lib/physical/checkout-pricing-server: "already in the lines'
 * discounts"), and the page used to show the whole of it as "Discount"
 * and each offer again under it, so a cart with a bundle read as if it had
 * been discounted twice and the rows no longer added up to the total.
 * Here the code's row is what is left once the offers are taken out, and
 * rounding from a market's currency (offers are converted on their own)
 * is absorbed so the rows always add up exactly.
 *
 * Pure.
 */

export interface SummaryQuote {
  totals: {
    itemsSubtotalCents: number
    discountCents: number
    shippingCents: number
    shippingDiscountCents: number
    taxCents: number
    taxIncluded: boolean
    totalCents: number
    codFeeCents?: number
  }
  offers?: { title: string; savedCents: number }[] | null
  coupon?: { code: string } | null
}

export interface SummaryRows {
  subtotal: number
  offers: { title: string; cents: number }[]
  /** The code's discount (or, with no code and no offer, the lines' own discounts). */
  discount: number
  /** Shipping after a free shipping code. */
  shipping: number
  codFee: number
  /** Tax added on top; 0 when prices include it (said under the total instead). */
  taxAdded: number
  total: number
}

export function summaryRows(q: SummaryQuote): SummaryRows {
  const t = q.totals
  const whole = Math.max(0, t.discountCents)
  const asked = (q.offers ?? []).map((o) => ({ title: o.title, cents: Math.max(0, Math.round(o.savedCents)) })).filter((o) => o.cents > 0)
  const offerSum = asked.reduce((n, o) => n + o.cents, 0)
  let offers = asked
  let discount = whole - offerSum
  if (asked.length && (discount < 0 || !q.coupon)) {
    /* No code, or the offers came out a cent over after conversion: the offers are the whole discount, the last one taking the rounding. */
    const target = q.coupon ? Math.min(whole, offerSum) : whole
    let left = target
    offers = asked.map((o, i) => {
      const cents = i === asked.length - 1 ? left : Math.min(left, o.cents)
      left -= cents
      return { ...o, cents }
    })
    discount = whole - target
  }
  return {
    subtotal: t.itemsSubtotalCents,
    offers: offers.filter((o) => o.cents > 0),
    discount: Math.max(0, discount),
    shipping: Math.max(0, t.shippingCents - t.shippingDiscountCents),
    codFee: Math.max(0, t.codFeeCents ?? 0),
    taxAdded: t.taxIncluded ? 0 : Math.max(0, t.taxCents),
    total: t.totalCents,
  }
}

/** What the rows add up to; equal to `total` for any quote the server priced. */
export function rowsSum(r: SummaryRows): number {
  return r.subtotal - r.offers.reduce((n, o) => n + o.cents, 0) - r.discount + r.shipping + r.codFee + r.taxAdded
}
