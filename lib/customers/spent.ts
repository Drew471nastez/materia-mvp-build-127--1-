/**
 * WHAT A CUSTOMER SPENT, LESS WHAT THEY GOT BACK.
 *
 * customers.total_spent_cents adds each payment as it came in
 * (lib/checkout/fulfil-payment) and nothing ever takes a refund off it, so a
 * customer refunded in full still read as having spent the whole amount.
 * Customers now shows the kept total less the refunds on that customer's
 * orders, or, when some order is in another currency, each paid order's
 * amount less its refund, converted (app/app/customers/page.tsx).
 *
 * A refund is counted the way Analytics counts one (lib/analytics/reports
 * lineMoney): the amount recorded, at most the payment; a refunded order
 * with no amount recorded was refunded in full.
 */

export interface SpentRow {
  buyer_email?: string | null
  status?: string | null
  amount_cents?: number | null
  refund_amount_cents?: number | null
}

const PAID = new Set(["completed", "refunded", "partially_refunded"])

const key = (email: unknown) => (typeof email === "string" ? email.trim().toLowerCase() : "")

/** What was paid and what went back on one order. */
export function orderSpent(o: SpentRow): { paid: number; refunded: number } {
  if (!PAID.has(String(o.status))) return { paid: 0, refunded: 0 }
  const paid = Math.max(0, Number(o.amount_cents) || 0)
  const recorded = Number(o.refund_amount_cents) || 0
  const refunded = recorded > 0 ? Math.min(recorded, paid) : o.status === "refunded" ? paid : 0
  return { paid, refunded }
}

/**
 * Each customer's spend, by email. `fromOrders`: added up from the orders
 * (some in another currency, converted first); otherwise the kept total less
 * the refunds.
 */
export function customerSpent(rows: SpentRow[], fromOrders: boolean): (customer: { email?: string | null; total_spent_cents?: number | null }) => number {
  const paid = new Map<string, number>()
  const refunded = new Map<string, number>()
  for (const o of rows) {
    const k = key(o.buyer_email)
    if (!k) continue
    const m = orderSpent(o)
    paid.set(k, (paid.get(k) ?? 0) + m.paid)
    refunded.set(k, (refunded.get(k) ?? 0) + m.refunded)
  }
  return (customer) => {
    const k = key(customer.email)
    const back = refunded.get(k) ?? 0
    const gross = fromOrders ? paid.get(k) ?? 0 : Math.max(0, Number(customer.total_spent_cents) || 0)
    return Math.max(0, gross - back)
  }
}
