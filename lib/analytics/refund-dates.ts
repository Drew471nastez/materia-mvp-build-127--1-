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
 * EACH PART REFUND ON ITS OWN DAY. A line refunded in parts keeps only its
 * total and its LAST refund's date on the row (refunded_at is written again
 * by every refund), so a $10 part refund on the 3rd and another on the 20th
 * both landed on the 20th. The seller's ledger (ledger_events) has one
 * `refund` row per refund and line, each with its own time: read beside the
 * orders (./refund-history-server), they come here as `refund_history`, and
 * the line's refunded money is split over them. What the ledger does not
 * cover (a cash refund, a refund from before the ledger) stays on the row's
 * date. The pieces always add up to the line's refunded money, so Total
 * sales is still Revenue to the cent.
 *
 * Pure: the reports (lib/analytics/reports) and the sales reports
 * (lib/analytics/commerce) read the same events.
 */

/** What a refund event needs of a line. */
export interface RefundLine {
  id: string
  product_id?: string | null
  refunded_at?: string | null
  /** Each refund of the line with its own time, in the row's currency, adding up to its refunded money (refundHistoryOf). */
  refund_history?: ReadonlyArray<RefundPiece> | null
}

/** One refund of a line: when, and how much, in the row's own money. */
export interface RefundPiece {
  at: string
  cents: number
}

/** A `refund` row of the seller's ledger: in the wallet's currency, which is usually the row's. */
export interface LedgerRefund {
  amount_cents: number | null
  currency?: string | null
  created_at: string | null
}

/**
 * A line's refunds, one piece each, from its ledger rows, adding up to
 * `refundedCents` (the row's own refunded money). In the row's currency the
 * ledger's amounts are used as they are and anything they do not cover is
 * dated by the row (refunded_at); in another currency (a converted wallet)
 * only their shares are used. Null when the ledger has nothing for it.
 */
export function refundHistoryOf(
  line: { refunded_at?: string | null; currency?: string | null },
  refundedCents: number,
  ledger: ReadonlyArray<LedgerRefund>,
): RefundPiece[] | null {
  const total = Math.max(0, Math.round(refundedCents))
  if (total <= 0) return null
  const rows = ledger
    .map((r) => ({ at: r.created_at ?? "", cents: Math.max(0, Math.round(Number(r.amount_cents) || 0)), currency: (r.currency ?? "").trim().toLowerCase() }))
    .filter((r) => r.cents > 0 && Number.isFinite(Date.parse(r.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  if (rows.length === 0) return null
  const own = (line.currency ?? "").trim().toLowerCase()
  const sameMoney = own.length > 0 && rows.every((r) => !r.currency || r.currency === own)
  const covered = rows.reduce((n, r) => n + r.cents, 0)
  if (sameMoney && covered < total) {
    const latest = rows[rows.length - 1].at
    const rest = line.refunded_at && Number.isFinite(Date.parse(line.refunded_at)) ? line.refunded_at : latest
    return [...rows.map((r) => ({ at: r.at, cents: r.cents })), { at: rest, cents: total - covered }]
  }
  return shareOut(total, rows.map((r) => ({ at: r.at, weight: r.cents })))
}

/** `total` over pieces in proportion to their weights, rounded so they add up exactly (the last takes what rounding left). */
function shareOut(total: number, pieces: Array<{ at: string; weight: number }>): RefundPiece[] {
  const weight = pieces.reduce((n, p) => n + p.weight, 0)
  if (!(weight > 0)) return [{ at: pieces.length ? pieces[pieces.length - 1].at : "", cents: total }]
  let given = 0
  return pieces.map((p, i) => {
    const cents = i === pieces.length - 1 ? total - given : Math.floor((total * p.weight) / weight)
    given += cents
    return { at: p.at, cents }
  })
}

/**
 * The line's refunded money (`cents`, the caller's own figure, maybe already
 * in the store's currency) as dated pieces: split as its history is, or all
 * of it on refundTime when it has none.
 */
export function refundPieces(line: Pick<RefundLine, "refunded_at" | "refund_history">, orderCreatedAt: string, cents: number): Array<{ at: number; cents: number }> {
  const history = (line.refund_history ?? []).filter((p) => p.cents > 0 && Number.isFinite(Date.parse(p.at)))
  if (history.length === 0) return [{ at: refundTime(line, orderCreatedAt), cents }]
  return shareOut(cents, history.map((p) => ({ at: p.at, weight: p.cents }))).map((p) => ({ at: Date.parse(p.at), cents: p.cents }))
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
 * and filtered by the caller), whatever day the order itself was placed. A
 * line refunded in parts is one event per refund, each on its own day.
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
      for (const piece of refundPieces(line, order.createdAt, cents)) {
        if (piece.cents > 0 && piece.at >= span.start && piece.at < span.end) out.push({ order, line, at: piece.at, cents: piece.cents })
      }
    }
  }
  return out
}
