/**
 * ===========================================================================
 *  A SALE ON THE DAY IT WAS MADE, A REFUND ON THE DAY IT WAS MADE
 * ===========================================================================
 * The owner: "do what you think is best for the platform". Shopify's rule:
 * gross sales, discounts, shipping, taxes and tips are dated by the order;
 * returns are dated by the refund. A 50 lei order on 3 October refunded on
 * 24 October is +50 on the 3rd and -50 on the 24th, so October's first week
 * keeps the sale it really made, and the week of the refund shows the money
 * that went back. Every figure on Analytics follows it: Revenue on the tab,
 * Total sales in the breakdown, every chart, channel, product, kind and
 * country, and the export, so Total sales is still Revenue to the cent.
 *
 * Before this, a refund was dated by its order: refunding last month's order
 * today rewrote last month's revenue and left today's untouched.
 *
 * WHEN A LINE HAS NO REFUND DATE (refunds written before `refunded_at` was
 * kept, or by a path that only set the status), the refund is dated by the
 * order, the payment's first line. Not by `updated_at`: that moves whenever
 * anything about the row changes (the seller opening it, a note, a parcel),
 * so it would date a refund on the day somebody looked at the order.
 *
 * Pure: the reports (lib/analytics/reports) and the sales reports
 * (lib/analytics/commerce) read the same events.
 */

/** What a refund event needs of a line. */
export interface RefundLine {
  id: string
  product_id?: string | null
  refunded_at?: string | null
}

/** The instant a line's refund is dated by: its refunded_at, else the order's own date. */
export function refundTime(line: Pick<RefundLine, "refunded_at">, orderCreatedAt: string): number {
  const at = line.refunded_at ? Date.parse(line.refunded_at) : NaN
  return Number.isFinite(at) ? at : Date.parse(orderCreatedAt)
}

/** One refunded line, dated by its refund. */
export interface RefundEvent<O, L> {
  order: O
  line: L
  at: number
  cents: number
}

/**
 * Every refund dated inside `span`, of any of `orders` (sales already placed
 * and filtered by the caller), whatever day the order itself was placed.
 * `refunded` is the caller's own rule for a line's refunded money, so the
 * two report modules keep their arithmetic.
 */
export function refundsIn<O extends { createdAt: string; lines: ReadonlyArray<RefundLine> }>(
  orders: O[],
  span: { start: number; end: number },
  refunded: (line: O["lines"][number]) => number,
): Array<RefundEvent<O, O["lines"][number]>> {
  const out: Array<RefundEvent<O, O["lines"][number]>> = []
  if (!(span.end > span.start)) return out
  for (const order of orders) {
    for (const line of order.lines) {
      const cents = refunded(line)
      if (!(cents > 0)) continue
      const at = refundTime(line, order.createdAt)
      if (at >= span.start && at < span.end) out.push({ order, line, at, cents })
    }
  }
  return out
}
