/**
 * ===========================================================================
 *  WHICH ORDER LINES A STRIPE REFUND BELONGS TO
 * ===========================================================================
 * One payment can be several `orders` rows: a basket writes a row per
 * product, all under the same PaymentIntent. A refund names the payment, not
 * the row, so before anything is recorded it has to be decided which rows
 * the money came back for, and how much of it each.
 *
 *   named      the refund carries metadata.order_id (a refund started from
 *              the Orders page does): all of it is that row's.
 *   only one   a payment with one row: all of it is that row's.
 *   basket     a refund made in the Stripe dashboard on a basket: shared
 *              across the rows that still have money to give back, in
 *              proportion to what each has left, the last row taking the
 *              rounding so the parts add up to the refund exactly.
 *
 * Pure, so it is tested without Stripe or a database
 * (tests/refund-sync.test.ts).
 */

export interface RefundLine {
  id: string
  /** What was charged for this row, the tip already inside it. */
  amount_cents: number | null
  status: string | null
  refund_amount_cents?: number | null
}

export interface RefundShare {
  id: string
  cents: number
}

/** Money this row has already given back. A refunded row with no amount recorded gave back all of it. */
export function refundedSoFar(line: RefundLine): number {
  const amount = Math.max(0, line.amount_cents || 0)
  if (line.status !== "refunded") return 0
  const recorded = Number(line.refund_amount_cents)
  return Number.isFinite(recorded) && recorded > 0 ? Math.min(recorded, amount) : amount
}

/** Money this row could still give back. */
export function refundableOf(line: RefundLine): number {
  return Math.max(0, (line.amount_cents || 0) - refundedSoFar(line))
}

export function allocateRefund(lines: RefundLine[], refundCents: number, namedOrderId?: string | null): RefundShare[] {
  const cents = Math.max(0, Math.round(refundCents))
  if (cents === 0 || lines.length === 0) return []

  if (namedOrderId) {
    const named = lines.find((l) => l.id === namedOrderId)
    if (named) return [{ id: named.id, cents }]
  }
  if (lines.length === 1) return [{ id: lines[0].id, cents }]

  const open = lines.filter((l) => refundableOf(l) > 0)
  /* Every row is already refunded as far as the table knows: the refund is
     still real money, so it is put on the first row rather than dropped. */
  if (open.length === 0) return [{ id: lines[0].id, cents }]

  const room = open.reduce((n, l) => n + refundableOf(l), 0)
  const shares: RefundShare[] = []
  let given = 0
  open.forEach((line, i) => {
    const part = i === open.length - 1 ? cents - given : Math.floor((cents * refundableOf(line)) / room)
    given += part
    if (part > 0) shares.push({ id: line.id, cents: part })
  })
  return shares
}

/**
 * The part of a line's fee that goes with a refund of `cents` of it: all of
 * it for a full refund, the same share of it for a partial one.
 */
export function feeShare(feeCents: number, lineAmountCents: number, cents: number): number {
  const fee = Math.max(0, Math.round(feeCents || 0))
  const amount = Math.max(0, lineAmountCents || 0)
  if (fee === 0 || amount === 0) return 0
  if (cents >= amount) return fee
  return Math.round((fee * cents) / amount)
}
